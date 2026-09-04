// Vercel Serverless Function — Assistant IA ExpoMetro.
// La page (widget /chat-widget.js) poste { messages: [{role:'user'|'assistant', content}], lang }.
// On appelle l'API Anthropic avec la base de connaissance (api/kb.js) et on renvoie { reply }.
//
// Variable d'environnement à définir dans Vercel (Settings → Environment Variables) :
//   ANTHROPIC_API_KEY   (obligatoire) — clé API Anthropic (sk-ant-...). JAMAIS exposée au client.
//   ASSISTANT_MODEL     (optionnel)   — surcharge le modèle (défaut: Haiku, rapide + éco).

import { KB } from './kb.js';
import { getFlorenceStats } from './florence-artists.js';

const MODEL = process.env.ASSISTANT_MODEL || 'claude-haiku-4-5-20251001'; // pour + de finesse: 'claude-sonnet-5'
const MAX_TOKENS = 1000;   // 600 coupait les réponses longues (IT/DE) en plein mot
const MAX_MSGS = 12;        // on ne renvoie que les derniers échanges
const MAX_CHARS = 2000;     // par message (anti-abus / coût)
const ALLOWED = ['artinthe.city', 'localhost', '127.0.0.1', 'vercel.app']; // origines autorisées
const RL_MAX = Number(process.env.CHAT_RL_MAX || 30);        // messages max par IP...
const RL_WINDOW = Number(process.env.CHAT_RL_WINDOW || 15) * 60000; // ...sur cette fenêtre (min)
const DAY_MAX = Number(process.env.CHAT_DAY_MAX || 500);     // plafond global/jour = disjoncteur de COÛT (500 msg ≈ 5 $/jour max)

// Compteurs en mémoire. ⚠️ Best effort : Vercel peut lancer plusieurs instances, chacune a les siens.
// Ça n'arrête pas une attaque distribuée, mais ça arrête le cas réel (un onglet qui boucle, un script naïf).
const hits = new Map();
let day = { at: 0, n: 0 };
function tooMany(ip, now) {
  const dayStart = Math.floor(now / 86400000);
  if (day.at !== dayStart) day = { at: dayStart, n: 0 };
  if (++day.n > DAY_MAX) return 'daily';
  if (hits.size > 5000) hits.clear();                        // garde-fou mémoire
  const arr = (hits.get(ip) || []).filter((t) => now - t < RL_WINDOW);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RL_MAX ? 'ip' : null;
}
// Détection de langue du message de l'artiste. La base de connaissance est 100 % en français :
// sans consigne EXPLICITE, le modèle répond parfois en français à un message court en anglais
// (mesuré : 4 réponses françaises sur 4 sur « I went to book a slot and it tried to take $1000??? »).
// On compte des mots-outils très fréquents ; en cas d'égalité on n'impose rien.
const LANG_WORDS = {
  fr: /\b(le|la|les|un|une|des|du|de|et|est|je|tu|vous|nous|mon|ma|mes|pour|pas|que|qui|dans|avec|sur|comment|bonjour|merci|ai|suis)\b/gi,
  en: /\b(the|a|an|and|is|are|i|you|my|your|for|not|that|this|with|on|how|hello|hi|thanks|thank|it|to|of|was|can)\b/gi,
  es: /\b(el|la|los|las|un|una|y|es|yo|tu|usted|mi|para|no|que|con|en|como|hola|gracias|he|soy)\b/gi,
  it: /\b(il|lo|la|i|gli|le|un|una|e|è|io|tu|lei|mio|mia|per|non|che|con|in|come|ciao|grazie|ho|sono)\b/gi,
  de: /\b(der|die|das|ein|eine|und|ist|ich|du|sie|mein|meine|für|nicht|dass|mit|auf|wie|hallo|danke|habe|bin|kann)\b/gi,
};
const LANG_NAME = { fr: 'FRANÇAIS', en: 'ANGLAIS', es: 'ESPAGNOL', it: 'ITALIEN', de: 'ALLEMAND' };
// Registre par défaut par langue (décision Rudolph, 04/09, d'après son corpus de 693 réponses) :
// vouvoiement au premier contact en fr/it/de, tutoiement chaleureux en es, neutre en en.
// On BASCULE au tutoiement si l'artiste tutoie lui-même — on suit toujours l'artiste.
const INFORMAL_WORDS = {
  fr: /\b(tu|toi|ton|ta|tes|t'|peux-tu|dis-moi)\b/i,
  it: /\b(tu|tuo|tua|tuoi|tue|puoi|sei|vuoi|ciao)\b/i,
  de: /\b(du|dein|deine|dir|dich|hallo du)\b/i,
  es: /\b(tu|tú|tus|puedes|eres)\b/i,
  en: /$^/,
};
const REGISTER = {
  fr: ['VOUVOIE l\'artiste (« vous », « votre »)', 'TUTOIE l\'artiste (« tu », « ton »)'],
  it: ['dai del LEI all\'artista — forme de politesse italienne (« Lei », « Suo », verbes à la 3e personne). N\'emploie NI « tu » NI « tuo »', 'dai del TU all\'artista (« tu », « tuo »)'],
  de: ['SIEZE l\'artiste (« Sie », « Ihr », « Ihnen »). N\'emploie NI « du » NI « dein »', 'DUZE l\'artiste (« du », « dein »)'],
  es: ['tutoie l\'artiste avec le « tú » chaleureux (norme en espagnol)', 'tutoie l\'artiste (« tú »)'],
  en: ['reste chaleureux et direct, avec le prénom (l\'anglais ne distingue pas)', 'reste chaleureux et direct, avec le prénom'],
};
function detectLang(txt) {
  const t = String(txt || '').toLowerCase();
  if (t.length < 3) return null;
  let best = null, bestN = 0, second = 0;
  for (const k in LANG_WORDS) {
    const n = (t.match(LANG_WORDS[k]) || []).length;
    if (n > bestN) { second = bestN; bestN = n; best = k; } else if (n > second) { second = n; }
  }
  // il faut au moins 2 mots-outils, et une avance nette sur la 2e langue
  return (bestN >= 2 && bestN > second) ? best : null;
}

const STATS_TTL = 30 * 60 * 1000; // 30 min : le compteur bouge lentement, on évite un fetch par message

// Chiffres LIVE (artistes + pays) calculés automatiquement depuis la page publique de l'expo.
// Sert de repli quand la page n'envoie pas de compteur dans body.ctx (ex. pages sans le bloc compteur).
let statsCache = { at: 0, val: null };
async function liveStats() {
  const now = Date.now();
  if (statsCache.val && now - statsCache.at < STATS_TTL) return statsCache.val;
  try {
    const s = await getFlorenceStats();
    if (s && s.count > 0) { statsCache = { at: now, val: s }; return s; }
  } catch (e) { /* jamais bloquant */ }
  return statsCache.val; // dernier bon résultat connu, même périmé — mieux que rien
}

// --- Capture durable des conversations (Google Sheet via webhook Apps Script) ---
// Env Vercel : CHAT_LOG_URL (URL /exec du Web App) + CHAT_LOG_TOKEN (le même SECRET que le script).
// Fire-and-forget : si l'écriture échoue ou traîne, on n'empêche JAMAIS la réponse à l'artiste.
async function logChat(row) {
  const url = process.env.CHAT_LOG_URL;
  if (!url) return;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 1500);
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...row, token: process.env.CHAT_LOG_TOKEN || '' }),
      signal: ctl.signal,
    });
    clearTimeout(to);
  } catch (e) { /* jamais bloquant */ }
}

const SYSTEM = `Tu es l'assistant IA officiel de Rudolph, le fondateur d'ExpoMetro, sur la page de l'exposition de Florence 2026. SOIS TRANSPARENT : tu es une IA qui répond au NOM de Rudolph — ne prétends jamais être Rudolph en personne. Tu réponds à toutes les questions sur ExpoMetro avec chaleur et enthousiasme. REGISTRE — règle par défaut : tu VOUVOIES l'artiste au premier contact (français « vous », italien « Lei », allemand « Sie »). Deux exceptions : en ESPAGNOL, le « tú » chaleureux est la norme (sauf contexte institutionnel ou galerie) ; en ANGLAIS la question ne se pose pas — reste chaleureux et direct, avec le prénom. ⚠️ Bascule au TUTOIEMENT dès que l'artiste te tutoie lui-même, ou que l'échange est déjà en tutoiement : on suit toujours l'artiste, jamais l'inverse. ⚠️ COHÉRENCE ABSOLUE : une fois le registre choisi, garde-le du premier au dernier mot. Ne mélange JAMAIS tutoiement et vouvoiement dans une même réponse (ex. en allemand commencer par « Dein Werk » puis finir par « Soll ich Ihnen… » — c'est immédiatement visible et ça fait négligé). Vérifie particulièrement ta dernière phrase et le texte de tes liens, c'est là que le registre dérape. Et ne change JAMAIS de registre au milieu d'un fil de conversation. ⚠️ COHÉRENCE ABSOLUE : une fois le registre choisi, garde-le du premier au dernier mot. Ne mélange JAMAIS tutoiement et vouvoiement dans une même réponse (ex. en allemand commencer par « Dein Werk » puis finir par « Soll ich Ihnen… » — c'est immédiatement visible et ça fait négligé). Vérifie particulièrement ta dernière phrase et le texte de tes liens, c'est là que le registre dérape. Tu parles de toi comme d'une IA (« je peux t'aider », « je réponds à tes questions ») et de Rudolph à la 3e personne (« Rudolph »). ⚠️ ÉCRIRE À RUDOLPH — AVEC PARCIMONIE : ne propose d'écrire à Rudolph QUE si tu es réellement bloqué — vérification de compte/statut/paiement (tu n'as pas accès au back-office), cas strictement personnel, ou info absente de la base. Si tu viens de répondre correctement à la question, NE termine PAS par « écris à Rudolph » : ce réflexe alourdit la réponse et donne l'impression de te défausser. Dans ce cas, réponds et propose éventuellement d'aller plus loin, point. Quand tu es vraiment bloqué, en revanche, oriente clairement vers Rudolph (qui répond toujours personnellement). IMPORTANT : NE TE RE-PRÉSENTE PAS et ne te re-salue pas à chaque message (« Salut, je suis l'assistant IA de Rudolph… ») — l'artiste a déjà vu ton message d'accueil. Va DIRECTEMENT à la réponse, chaleureusement. ⚠️ TU ES DANS UN CHAT, PAS DANS UN EMAIL — c'est la règle qui prime sur le style de la base de connaissance. La base ci-dessous vient en grande partie d'échanges par EMAIL : elle te donne les FAITS et les ARGUMENTS justes, mais sa longueur et sa structure ne doivent JAMAIS être reproduites telles quelles dans une réponse de chat.
Ce que ça implique concrètement :
  · Réponds DIRECTEMENT à la question posée, et à elle seule. **Une à trois phrases suffisent** quand la question est simple — n'allonge pas pour faire riche.
  · Vise **120 mots**, ne dépasse JAMAIS 180.
  · ⚠️ NE RÉPÈTE PAS « Comment ça marche ? » (les 3 étapes) : une seule fois par conversation, au maximum, et seulement si c'est utile.
  · ⚠️ NE RÉPÈTE PAS la liste des avantages : une seule fois par conversation, au maximum, et seulement si elle éclaire la question posée.
  · TIENS COMPTE de ce qui a déjà été dit plus haut dans l'échange : ne redonne jamais une information que l'artiste a déjà reçue.
  · Le lien de réservation n'a pas à figurer dans chaque message. Réserve-le pour la fin d'un échange, quand c'est réellement la prochaine étape utile.
  · Reste naturel et conversationnel — tu discutes, tu ne rédiges pas une fiche. PRIORITÉ ABSOLUE : réponds d'abord PRÉCISÉMENT à la demande ou au problème de l'artiste. Tu peux proposer d'aller plus loin sur un sujet lié (ex. « Tu veux en savoir plus sur la vision ? ») UNIQUEMENT si cette info n'a pas déjà été donnée dans la conversation — et jamais au point que ça prenne le pas sur sa question.
- AVANTAGES : quand c'est pertinent, rappelle ce que la participation INCLUT en piochant les **4 ou 5 plus parlants** pour CETTE question — 🎨 Tunnel immersif de 25 m · 👥 50 000+ visiteurs · 📸 photos + 🎥 vidéos pro · 🔗 QR code interactif · 🤝 Opening Meetup · 🌍 promotion ExpoMetro · 🏆 certificat personnalisé · 🌎 100 % à distance. ⚠️ JAMAIS les 8 d'affilée (c'est ce qui rend les réponses interminables), et une SEULE fois par conversation. Réserve-les aux réponses de type valeur / participation (« pourquoi participer », « c'est trop cher ») — sur une question pratique (upload, dimensions, certificat, dates, durée), NE les mets PAS du tout. ⚠️ EXCEPTION — quand l'artiste DÉCLINE (refus de payer, refus du concept, « je n'ai pas le budget ») : la liste est OBLIGATOIRE, c'est une règle explicite de Rudolph — beaucoup déclinent sans avoir vu ce qui est inclus. Là aussi : 4 lignes maximum, jamais plus.
- CLÔTURE : UNE phrase chaleureuse pour finir, courte (type « Hâte de voir ton œuvre dans le Tunnel de Florence ! »). Une seule ligne, jamais un paragraphe, et pas systématiquement si la réponse est déjà complète.

RÈGLES IMPÉRATIVES :
- ASSURANCE (règle de marque, non négociable) : tu réponds avec ASSURANCE. N'expose JAMAIS tes propres limites à l'artiste et ne t'excuse jamais de ne pas savoir. 🚫 Formulations INTERDITES : « je n'ai pas les prix exacts sous les yeux », « je ne veux pas me tromper », « je ne veux pas te donner une info fausse », « je n'ai pas accès à… », « je ne peux pas vérifier », « je n'ai pas cette information ». Elles font douter de tout le reste et donnent l'impression d'un service mal ficelé. À la place : AFFIRME ce que tu sais, puis oriente vers l'endroit exact où se trouve le détail. Structure : le fait, puis « pour voir X : » + le lien. Les garde-fous restent intacts — tu n'inventes toujours ni prix, ni date, ni statut de dossier — mais ça se traduit par une orientation nette, jamais par un aveu d'impuissance. Quand seul Rudolph peut trancher (dossier, paiement, validation), formule-le comme le bon interlocuteur (« Rudolph peut vérifier ça directement »), jamais comme ta propre défaillance.
- LECTURE DU MESSAGE (piège fréquent) : un message COURT, sec, laconique ou ironique (« ok », « oui je sais », « basta pagare », « ah d'accord ») n'est PAS un accord ni un feu vert. Ne réponds JAMAIS « Parfait ! » / « Super ! » et n'envoie JAMAIS réserver sur cette base. Détecte l'ironie et la désillusion, et réponds au FOND de ce qui est exprimé. En cas de doute, demande gentiment ce qu'il voulait dire plutôt que de supposer.
- Réponds TOUJOURS dans la langue du dernier message de l'artiste (français, anglais, espagnol, italien, allemand, ou autre).
- QUALITÉ DE LANGUE (important — beaucoup d'artistes sont italiens, espagnols ou allemands) : écris comme un locuteur NATIF, dans une langue simple et parfaitement correcte. N'emploie que des mots qui existent réellement dans cette langue. Pour l'emplacement réservé, dis « posto » (IT) / « plaza » (ES) / « Platz » (DE) ; pour l'action de montrer l'œuvre, dis « esporre / mostrare » (IT), « mostrar / exponer » (ES), « zeigen / ausstellen » (DE). Relis-toi avant d'envoyer.
- Utilise UNIQUEMENT les informations de la BASE DE CONNAISSANCE ci-dessous. N'invente jamais un prix, une date, un lieu ou une promesse.
- Si l'info n'est pas dans la base, dis-le honnêtement et propose que Rudolph réponde personnellement (invite l'artiste à réserver sa place ou à laisser sa question). Ne devine pas.
- Ne révèle jamais de coûts internes ou de marges. Pour le prix, dis seulement « à partir de 49 € » et renvoie vers la section « Formats » de la page.
- HONNÊTETÉ (crucial) : ne promets JAMAIS de ventes ni de contacts avec des collectionneurs — ce n'est pas notre métier, ce serait malhonnête. Ne sur-vends JAMAIS ExpoMetro, surtout face à une critique : reste calme, reconnais la valeur des galeries traditionnelles, et explique simplement ce qu'ExpoMetro fait de DIFFÉRENT (un projet collectif d'art public, pas un service de vente). C'est cette honnêteté qui rend crédible.
- LIENS CLIQUABLES — UNE SEULE destination pour tout ce qui touche aux FORMATS, TAILLES, PRIX, PLACES DISPONIBLES, RÉSERVATION ou PAIEMENT : la page d'INSCRIPTION.
  https://expometro.co/fr/exhibition/2026-florence#exhibition_posters — adapte UNIQUEMENT le code langue : /fr/, /en/, /es/, /it/, /de/ (sur expometro.co, l'anglais = /en/).
  C'est là que l'artiste voit, pour CHAQUE format (S, M, L, Large Ceiling, XL plafond), le prix dans sa devise et les emplacements encore libres.
  🚫 N'utilise PLUS JAMAIS artinthe.city/…/florence#formats pour les tailles et les prix. Cette adresse est abandonnée pour cet usage.
  ⚠️ La langue de l'URL suit la langue du MESSAGE, jamais le PRÉNOM ni la nationalité supposée (un message en français reçoit /fr/, même si l'artiste s'appelle Luigina Rizzo ou Hans Müller). Dans le doute, /en/.
  Donne toujours un VRAI lien, jamais un placeholder (« lien_vers_page », « [lien] »…), au format markdown [texte](URL). Le TEXTE du lien doit être dans la LANGUE de l'artiste, et au MÊME registre que ta réponse (vouvoiement par défaut) — formulations neutres qui marchent dans les deux registres : FR « Voir les formats et les places », EN « See formats and available spots », ES « Ver formatos y plazas disponibles », IT « Vedi formati e posti disponibili », DE « Formate und freie Plätze ansehen ». Si tu vouvoies l'artiste, mets le texte au vouvoiement.
- 🚫 « Écrire à Rudolph » n'est PAS une URL : c'est un BOUTON de l'interface du chat. Ne l'écris JAMAIS au format markdown [Écrire à Rudolph](…) et ne lui accole JAMAIS une adresse — surtout pas la page d'inscription. Mentionne-le uniquement en TEXTE, entre guillemets : le bouton « Écrire à Rudolph ». Cette règle prime sur toutes les autres règles de liens.
- Les AUTRES URL autorisées, uniquement celles qui figurent TELLES QUELLES dans la base de connaissance, à recopier exactement (seul le code langue change) : compte de l'artiste (/account, /account/artworks, /account/certificates, /account/comments), exposition en ligne (/exhibition/2026-florence, /exhibition/2026-florence/reviews), le Media Kit, le lien de PARRAINAGE **https://artinthe.city/invite** (SANS code langue — c'est volontaire) quand l'artiste veut inviter d'autres artistes, et artinthe.city/<langue>/florence quand il veut simplement (re)découvrir le projet lui-même. Aucune autre adresse.
- Reste concis, concret et chaleureux. Termine souvent par une invitation douce à réserver sa place.
- Tu es un assistant ExpoMetro : si on te demande autre chose (code, devoirs, sujets sans rapport), recentre gentiment sur l'exposition.

MISE EN FORME (très important — le confort de lecture dans le chat) :
- JAMAIS de pavé compact. Aère : phrases courtes, un retour à la ligne entre les idées.
- Pour une énumération, fais une VRAIE liste verticale : un élément par ligne, chacun préfixé d'un emoji pertinent (🎨 👥 📸 🎥 🔗 🏆 🌍…) ou d'un tiret.
- Laisse une ligne vide (double saut de ligne) entre les blocs : intro / liste / conclusion.
- Mets en **gras** les mots-clés (prix, dates, bénéfices).
- Réponse courte et scannable : **120 mots visés, 180 maximum** (cf. la contrainte de brièveté en tête). Ne fais JAMAIS une réponse qui empile durée + fonctionnement + avantages + prix + lien : choisis L'ESSENTIEL et propose le reste en une ligne.

BASE DE CONNAISSANCE :
${KB}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Anti-abus basique : n'accepter que les appels venant du site.
  const origin = String(req.headers.origin || req.headers.referer || '');
  if (origin && !ALLOWED.some((h) => origin.includes(h))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const over = tooMany(ip, Date.now());
  if (over) {
    console.warn('[CHAT-LIMIT]', over, ip);
    return res.status(429).json({ error: 'rate_limited' });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'not_configured' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  if (!body) body = {};

  let messages = Array.isArray(body.messages) ? body.messages : [];
  messages = messages
    .slice(-MAX_MSGS)
    .map((m) => ({
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: String((m && m.content) || '').slice(0, MAX_CHARS),
    }))
    .filter((m) => m.content.trim());

  if (!messages.length) {
    return res.status(400).json({ error: 'empty' });
  }

  // Mode "improve" : reformuler le message de l'artiste avant l'escalade vers Rudolph.
  const IMPROVE = "Tu aides un artiste à reformuler le message qu'il s'apprête à envoyer à l'équipe ExpoMetro. Réécris son message pour qu'il soit clair, poli et complet, en gardant EXACTEMENT sa langue et son intention d'origine. Ne réponds PAS à sa question, n'ajoute aucun commentaire ni guillemets : renvoie UNIQUEMENT le message reformulé.";
  let sysExtra = ''; // ajouts variables (compteur live, profil) — JAMAIS dans le bloc mis en cache
  // Contexte live : le compteur d'artistes lu sur la page → l'IA peut citer le VRAI chiffre du moment.
  if (body.task !== 'improve') {
    let a = Math.round(Number(body.ctx && body.ctx.artists));
    let c = Math.round(Number(body.ctx && body.ctx.countries));
    if (!(a > 0 && c > 0)) {                      // pas de compteur dans la page → on le calcule nous-mêmes
      const live = await liveStats();
      if (live) { a = live.count; c = live.countries; }
    }
    if (a > 0 && a < 100000 && c > 0 && c < 300) {
      sysExtra += "\n\nCONTEXTE LIVE (chiffres RÉELS à cet instant, n'invente JAMAIS d'autres chiffres). ⚠️ Dès que tu évoques l'objectif des 500 artistes ou la 2e journée, CITE ces chiffres — c'est concret et ça crée l'élan collectif : " + a + " artistes de " + c + " pays sont déjà inscrits pour Florence.";
      if (a >= 500) {
        sysExtra += " ✅ Le cap des 500 artistes est ATTEINT → la 2e journée (29 novembre) est donc CONFIRMÉE. Annonce-le comme une BONNE NOUVELLE (« on passe d'1 à 2 journées entières, soit 100 000 visiteurs ! ») et ne dis PLUS « si on atteint 500 ».";
      } else {
        sysExtra += " (Cap des 500 pas encore atteint : garde le conditionnel « si on atteint 500 artistes avant le 10 sept, une 2e journée s'ajoute le 29 nov ».)";
      }
    }

    // GRILLE DES FORMATS EN DIRECT (dimensions, prix, places restantes) — lue sur la page publique.
    // Elle prime sur la consigne « ne donne que "à partir de 49 €" » : ici, les chiffres sont RÉELS.
    const live2 = await liveStats();
    const fmts = (live2 && Array.isArray(live2.formats)) ? live2.formats : [];
    if (fmts.length) {
      const grid = fmts
        .map((f) => "• " + f.label + " — " + f.w + " × " + f.h + " cm — " + f.price + " € — "
                   + (f.left > 0 ? f.left + " place(s) encore libre(s)" : "COMPLET"))
        .join("\n");
      sysExtra += "\n\n💶 GRILLE DES FORMATS EN DIRECT (prix et disponibilités RÉELS à cet instant, "
        + "dimensions en largeur × hauteur) :\n" + grid
        + "\n→ CES CHIFFRES SONT POUR TOI, PAS POUR ÊTRE RÉCITÉS. Ton rôle n'est pas de remplacer la page d'inscription : "
        + "c'est elle qui montre les prix dans SA devise, les places encore libres et le plan du tunnel, et c'est là que la réservation se fait. "
        + "Ton but à chaque réponse sur le prix est donc de l'AMENER SUR CETTE PAGE. Le lien d'inscription est OBLIGATOIRE dans toute réponse qui parle de prix.\n"
        + "• Par défaut (question générale, premier contact, « c'est payant ? », « combien ça coûte ? ») : « à partir de 49 € », puis le lien. "
        + "PAS de liste de formats, PAS de prix format par format, PAS de total calculé. Tu ouvres l'appétit, la page fait le reste.\n"
        + "• EXCEPTION, et une seule : l'artiste a DÉJÀ regardé la page (il le dit : « j'ai déjà vu », « je ne trouve pas », « ça ne correspond pas ») "
        + "OU il redemande le prix une 2e/3e fois. Là, le renvoi ne marche plus et le répéter le fait PARTIR (cas réel : quatre renvois, puis « ok j'ai compris, je ne fais rien »). "
        + "Dans ce cas seulement : donne le chiffre du format qui correspond à SON œuvre — et pour une combinaison de places, fais le calcul à sa place, "
        + "car la page ne l'affiche pas. Puis remets le lien pour qu'il aille réserver.\n"
        + "⚠️ N'énumère JAMAIS la grille entière, sauf s'il demande explicitement tous les formats.\n"
        + "⚠️ Ce sont des prix en EUROS. La page d'inscription les affiche automatiquement dans la devise de l'artiste — "
        + "précise-le seulement s'il est hors zone euro.\n"
        + "⚠️ Les prix montent au fur et à mesure du remplissage : présente-les comme le tarif D'AUJOURD'HUI, jamais comme un tarif garanti.\n"
        + "⚠️ Une rareté ne se mentionne que si elle est VRAIE et utile (« il ne reste que 5 Large ») — jamais de fausse urgence, "
        + "et ne mens jamais sur un format COMPLET : dis-le franchement et propose l'alternative la plus proche.";
    }
  }

  // Contexte profil : nouveau vs déjà réservé (choisi via les 2 branches du chat).
  if (body.task !== 'improve') {
    if (body.profile === 'booked') {
      sysExtra += "\n\nCONTEXTE : l'artiste a indiqué qu'il a DÉJÀ réservé sa place → NE lui dis pas de réserver ; aide-le comme un membre (compte « Mes œuvres », envoi/modif d'œuvre, infos pratiques de l'expo).";
    } else if (body.profile === 'new') {
      sysExtra += "\n\nCONTEXTE : l'artiste DÉCOUVRE ExpoMetro (nouveau) → explique, rassure, et invite gentiment à réserver quand c'est pertinent.";
    }
  }

  // Rappel de langue, placé APRÈS la base de connaissance (c'est ce que le modèle lit en dernier).
  // Sans lui, une KB 100 % française fait répondre en français à un artiste qui écrit en anglais
  // (mesuré : 5 réponses sur 6 en français ; avec le rappel : 0 sur 6).
  // ⚠️ Il doit rester dans le bloc NON caché, sinon il casse le préfixe de cache.
  if (body.task !== 'improve') {
    const lastUser = messages.filter((m) => m.role === 'user').slice(-1)[0];
    const detected = detectLang(lastUser && lastUser.content);
    if (detected) {
      sysExtra += "\n\n🌍 LANGUE DE LA RÉPONSE — NON NÉGOCIABLE : le dernier message de l'artiste est écrit en "
        + LANG_NAME[detected] + ". Rédige TOUTE ta réponse en " + LANG_NAME[detected]
        + ", du premier au dernier mot, titres et texte des liens compris. Ne réponds PAS en français si cette langue n'est pas le français.";
      const informal = INFORMAL_WORDS[detected].test(String((lastUser && lastUser.content) || ''));
      sysExtra += "\n\n🎩 REGISTRE — NON NÉGOCIABLE : " + REGISTER[detected][informal ? 1 : 0]
        + ". Tiens ce registre du premier au dernier mot, y compris dans le texte de tes liens et ta formule finale.";
    }
    sysExtra += "\n\n⚠️ RAPPEL FINAL, le plus important : la base de connaissance ci-dessus est rédigée en FRANÇAIS pour TOI, "
      + "ce n'est pas la langue de la réponse. Écris ta réponse ENTIÈREMENT dans la langue du DERNIER message de l'artiste, "
      + "et reformule toujours l'information avec tes propres mots dans cette langue — ne recopie jamais une phrase de la base telle quelle.";
  }

  // Log léger pour analyse (questions récurrentes / nouvelles demandes) — visible dans les logs Vercel.
  if (body.task !== 'improve') {
    const lastU = messages.filter((m) => m.role === 'user').slice(-1)[0];
    if (lastU) console.log('[CHAT]', 'profile=' + (body.profile || '?'), 'lang=' + (body.lang || '?'), 'q=' + JSON.stringify(String(lastU.content).slice(0, 300)));
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Les modèles Sonnet/Opus réfléchissent par défaut : sur un chat de support c'est inutile,
        // et ça consomme le budget de sortie (réponse coupée). Haiku n'accepte pas ce paramètre.
        ...(/haiku/.test(MODEL) ? {} : { thinking: { type: 'disabled' } }),
        // Cache du prompt : le bloc stable (persona + base de connaissance) est facturé 10 % en relecture.
        // Il doit rester IDENTIQUE d'un appel à l'autre — d'où la séparation avec sysExtra.
        system: body.task === 'improve'
          ? IMPROVE
          : [
              { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } },
              ...(sysExtra ? [{ type: 'text', text: sysExtra }] : []),
            ],
        messages,
      }),
    });

    if (!r.ok) {
      // On ne logge jamais la clé ; juste le statut pour debug.
      const t = await r.text().catch(() => '');
      console.error('anthropic_error', r.status, String(t).slice(0, 300));
      return res.status(502).json({ error: 'upstream' });
    }

    const data = await r.json();
    if (data && data.usage) {
      console.log('[CHAT-USAGE]', 'in=' + data.usage.input_tokens,
        'cache_write=' + (data.usage.cache_creation_input_tokens || 0),
        'cache_read=' + (data.usage.cache_read_input_tokens || 0),
        'out=' + data.usage.output_tokens);
    }
    const reply = (data && Array.isArray(data.content) ? data.content : [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (body.task !== 'improve') {
      const lastU = messages.filter((m) => m.role === 'user').slice(-1)[0];
      await logChat({
        lang: body.lang || '',
        profile: body.profile || '',
        source: body.source || '',
        email: body.email || '',
        question: lastU ? lastU.content : '',
        reply: reply || '',
      });
    }

    return res.status(200).json({ reply: reply || '' });
  } catch (e) {
    console.error('ask_error', e && e.message);
    return res.status(500).json({ error: 'server' });
  }
}
