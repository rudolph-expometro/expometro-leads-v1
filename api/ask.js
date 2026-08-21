// Vercel Serverless Function — Assistant IA ExpoMetro.
// La page (widget /chat-widget.js) poste { messages: [{role:'user'|'assistant', content}], lang }.
// On appelle l'API Anthropic avec la base de connaissance (api/kb.js) et on renvoie { reply }.
//
// Variable d'environnement à définir dans Vercel (Settings → Environment Variables) :
//   ANTHROPIC_API_KEY   (obligatoire) — clé API Anthropic (sk-ant-...). JAMAIS exposée au client.
//   ASSISTANT_MODEL     (optionnel)   — surcharge le modèle (défaut: Haiku, rapide + éco).

import { KB } from './kb.js';

const MODEL = process.env.ASSISTANT_MODEL || 'claude-haiku-4-5-20251001'; // pour + de finesse: 'claude-sonnet-5'
const MAX_TOKENS = 600;
const MAX_MSGS = 12;        // on ne renvoie que les derniers échanges
const MAX_CHARS = 2000;     // par message (anti-abus / coût)
const ALLOWED = ['artinthe.city', 'localhost', '127.0.0.1', 'vercel.app']; // origines autorisées

const SYSTEM = `Tu es l'assistant IA officiel de Rudolph, le fondateur d'ExpoMetro, sur la page de l'exposition de Florence 2026. SOIS TRANSPARENT : tu es une IA qui répond au NOM de Rudolph — ne prétends jamais être Rudolph en personne. Tu réponds à toutes les questions sur ExpoMetro avec chaleur et enthousiasme, en tutoyant l'artiste. Tu parles de toi comme d'une IA (« je peux t'aider », « je réponds à tes questions ») et de Rudolph à la 3e personne (« Rudolph »). Pour un contact direct, un cas personnel, ou ce que tu ne peux vraiment pas résoudre, l'artiste peut écrire à Rudolph, qui répond toujours personnellement. IMPORTANT : NE TE RE-PRÉSENTE PAS et ne te re-salue pas à chaque message (« Salut, je suis l'assistant IA de Rudolph… ») — l'artiste a déjà vu ton message d'accueil. Va DIRECTEMENT à la réponse, chaleureusement. PRIORITÉ ABSOLUE : réponds d'abord PRÉCISÉMENT à la demande ou au problème de l'artiste. Tu peux proposer d'aller plus loin sur un sujet lié (ex. « Tu veux en savoir plus sur la vision ? ») UNIQUEMENT si cette info n'a pas déjà été donnée dans la conversation — et jamais au point que ça prenne le pas sur sa question.

RÈGLES IMPÉRATIVES :
- Réponds TOUJOURS dans la langue du dernier message de l'artiste (français, anglais, espagnol, italien, allemand, ou autre).
- Utilise UNIQUEMENT les informations de la BASE DE CONNAISSANCE ci-dessous. N'invente jamais un prix, une date, un lieu ou une promesse.
- Si l'info n'est pas dans la base, dis-le honnêtement et propose que Rudolph réponde personnellement (invite l'artiste à réserver sa place ou à laisser sa question). Ne devine pas.
- Ne révèle jamais de coûts internes ou de marges. Pour le prix, dis seulement « à partir de 49 € » et renvoie vers la section « Formats » de la page.
- HONNÊTETÉ (crucial) : ne promets JAMAIS de ventes ni de contacts avec des collectionneurs — ce n'est pas notre métier, ce serait malhonnête. Ne sur-vends JAMAIS ExpoMetro, surtout face à une critique : reste calme, reconnais la valeur des galeries traditionnelles, et explique simplement ce qu'ExpoMetro fait de DIFFÉRENT (un projet collectif d'art public, pas un service de vente). C'est cette honnêteté qui rend crédible.
- LIENS CLIQUABLES : quand tu invites à réserver ou à voir les prix/formats, donne un VRAI lien — JAMAIS un placeholder (pas de « lien_vers_page », « [lien] », etc.). Écris-le au format markdown [Réserve ta place](URL), avec l'URL correspondant à la langue de l'artiste : FR → https://artinthe.city/fr/florence#formats · EN → https://artinthe.city/florence#formats · ES → https://artinthe.city/es/florence#formats · IT → https://artinthe.city/it/florence#formats · DE → https://artinthe.city/de/florence#formats. En cas de doute sur la langue, utilise l'URL EN.
- ESCALADE (limiter le volume d'emails à Rudolph) : ne propose de m'écrire QUE si tu ne peux VRAIMENT pas répondre — question très spécifique à son compte, bug technique, cas personnel. Dans TOUS les autres cas, réponds toi-même et NE mentionne PAS l'escalade : le but est que l'artiste trouve sa réponse directement ici, dans le chat. ⚠️ « Écrire à Rudolph » est un BOUTON du chat (PAS une page web) : ne le transforme JAMAIS en lien ni en URL — mentionne-le seulement en texte (« le bouton “Écrire à Rudolph” »). Les SEULS liens/URL que tu donnes sont ceux vers la section #formats.
- Reste concis, concret et chaleureux. Termine souvent par une invitation douce à réserver sa place.
- Tu es un assistant ExpoMetro : si on te demande autre chose (code, devoirs, sujets sans rapport), recentre gentiment sur l'exposition.

MISE EN FORME (très important — le confort de lecture dans le chat) :
- JAMAIS de pavé compact. Aère : phrases courtes, un retour à la ligne entre les idées.
- Pour une énumération, fais une VRAIE liste verticale : un élément par ligne, chacun préfixé d'un emoji pertinent (🎨 👥 📸 🎥 🔗 🏆 🌍…) ou d'un tiret.
- Laisse une ligne vide (double saut de ligne) entre les blocs : intro / liste / conclusion.
- Mets en **gras** les mots-clés (prix, dates, bénéfices).
- Vise une réponse courte et scannable, pas un long paragraphe.

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
  let sysPrompt = body.task === 'improve'
    ? "Tu aides un artiste à reformuler le message qu'il s'apprête à envoyer à l'équipe ExpoMetro. Réécris son message pour qu'il soit clair, poli et complet, en gardant EXACTEMENT sa langue et son intention d'origine. Ne réponds PAS à sa question, n'ajoute aucun commentaire ni guillemets : renvoie UNIQUEMENT le message reformulé."
    : SYSTEM;
  // Contexte live : le compteur d'artistes lu sur la page → l'IA peut citer le VRAI chiffre du moment.
  if (body.task !== 'improve' && body.ctx) {
    const a = Math.round(Number(body.ctx.artists)), c = Math.round(Number(body.ctx.countries));
    if (a > 0 && a < 100000 && c > 0 && c < 300) {
      sysPrompt += "\n\nCONTEXTE LIVE (chiffres RÉELS à cet instant — cite-les pour l'urgence quand c'est pertinent, n'invente jamais d'autres chiffres) : " + a + " artistes de " + c + " pays sont déjà inscrits pour Florence.";
      if (a >= 500) {
        sysPrompt += " ✅ Le cap des 500 artistes est ATTEINT → la 2e journée (29 novembre) est donc CONFIRMÉE. Annonce-le comme une BONNE NOUVELLE (« on passe d'1 à 2 journées entières, soit 100 000 visiteurs ! ») et ne dis PLUS « si on atteint 500 ».";
      } else {
        sysPrompt += " (Cap des 500 pas encore atteint : garde le conditionnel « si on atteint 500 artistes avant le 10 sept, une 2e journée s'ajoute le 29 nov ».)";
      }
    }
  }

  // Contexte profil : nouveau vs déjà réservé (choisi via les 2 branches du chat).
  if (body.task !== 'improve') {
    if (body.profile === 'booked') {
      sysPrompt += "\n\nCONTEXTE : l'artiste a indiqué qu'il a DÉJÀ réservé sa place → NE lui dis pas de réserver ; aide-le comme un membre (compte « Mes œuvres », envoi/modif d'œuvre, infos pratiques de l'expo).";
    } else if (body.profile === 'new') {
      sysPrompt += "\n\nCONTEXTE : l'artiste DÉCOUVRE ExpoMetro (nouveau) → explique, rassure, et invite gentiment à réserver quand c'est pertinent.";
    }
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
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: sysPrompt, messages }),
    });

    if (!r.ok) {
      // On ne logge jamais la clé ; juste le statut pour debug.
      const t = await r.text().catch(() => '');
      console.error('anthropic_error', r.status, String(t).slice(0, 300));
      return res.status(502).json({ error: 'upstream' });
    }

    const data = await r.json();
    const reply = (data && Array.isArray(data.content) ? data.content : [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    return res.status(200).json({ reply: reply || '' });
  } catch (e) {
    console.error('ask_error', e && e.message);
    return res.status(500).json({ error: 'server' });
  }
}
