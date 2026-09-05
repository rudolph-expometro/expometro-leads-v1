// Vercel Serverless Function — LOOKUP STATUT ARTISTE (lecture seule).
//
// But : donner a un assistant (GPT personnalise) de quoi preparer une reponse email
//       juste, sans jamais lui donner acces a l'admin ni a une action d'ecriture.
//
// Env   : ARTIST_STATUS_KEY (token dedie) · STRIPE_API_KEY (Charges: Read) · BREVO_API_KEY
// Auth  : en-tete "x-status-key: <token>"  (ou "Authorization: Bearer <token>"). Sinon 401.
// Verbe : GET uniquement. Aucune ecriture nulle part, par construction.
//
// Usage : GET /api/artist-status?email=...        (cas normal)
//         GET /api/artist-status?name=Jean Dupont (quand l'email ne donne rien)
//         GET /api/artist-status?email=...&name=... (les deux : recommande)

import { createHash } from 'node:crypto';
import { COMMUNITY_HASHES, PARTICIPATION } from '../lib/community.js';

const COMMUNITY = new Set(COMMUNITY_HASHES);

// Listes Brevo (memes ids que /api/conversions)
const LEAD_LISTS      = { 152: 'FR', 153: 'EN', 154: 'ES', 155: 'IT', 156: 'DE' };
const CANDIDAT_LISTS  = { 157: 'FR', 158: 'EN', 159: 'ES', 160: 'IT', 161: 'DE' };
const PARTICIPANT_LISTS = { 167: 'FR', 168: 'EN', 169: 'ES', 170: 'IT', 171: 'DE' };

const ARTISTS_SRC = 'https://expometro.co/en/exhibition/2026-florence/artists';
const SNAPSHOT_DATE = '2026-08-06';   // date de l'export users derriere lib/community.js
const FLORENCE_START = '2026-07-15';

const sha256 = (v) => createHash('sha256').update(String(v || '').trim().toLowerCase()).digest('hex');

// --- normalisation de nom : minuscules, sans accents, sans ponctuation ---
function normName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------- Stripe
// Recherche par email sur TOUT l'historique Stripe (Search API).
// Repli : balayage des charges recentes si la Search API n'est pas dispo.
async function stripePayments(email) {
  const key = process.env.STRIPE_API_KEY;
  if (!key || !email) return { ok: false, reason: 'no_key_or_email', charges: [] };
  const H = { Authorization: 'Bearer ' + key };
  const esc = String(email).replace(/"/g, '');

  try {
    const q = encodeURIComponent(`billing_details.email:"${esc}"`);
    const r = await fetch(`https://api.stripe.com/v1/charges/search?limit=100&query=${q}`, { headers: H });
    if (r.ok) {
      const d = await r.json();
      return { ok: true, via: 'search', charges: d.data || [] };
    }
  } catch (e) { /* on tente le repli */ }

  // Repli 1 : retrouver le client par son email, puis ses charges (couvre tout l'historique).
  // Necessite "Customers: Read" sur la cle. Si refuse, on passe au repli 2.
  try {
    const rc = await fetch('https://api.stripe.com/v1/customers?limit=10&email=' + encodeURIComponent(email), { headers: H });
    if (rc.ok) {
      const dc = await rc.json();
      const ids = (dc.data || []).map((c) => c.id);
      if (ids.length) {
        let out = [];
        for (const cid of ids.slice(0, 5)) {
          const rr = await fetch(`https://api.stripe.com/v1/charges?limit=100&customer=${cid}`, { headers: H });
          if (rr.ok) { const dd = await rr.json(); out = out.concat(dd.data || []); }
        }
        if (out.length) return { ok: true, via: 'client_stripe', charges: out };
      }
    }
  } catch (e) { /* on passe au repli 2 */ }

  // Repli 2 : liste des charges depuis le debut de Florence (borne a 1000).
  try {
    const since = Math.floor(new Date(FLORENCE_START + 'T00:00:00Z').getTime() / 1000);
    let out = [], after = null, target = String(email).toLowerCase();
    for (let i = 0; i < 10; i++) {
      const url = `https://api.stripe.com/v1/charges?limit=100&created[gte]=${since}` + (after ? '&starting_after=' + after : '');
      const r = await fetch(url, { headers: H });
      if (!r.ok) return { ok: false, reason: 'stripe_' + r.status, charges: [] };
      const d = await r.json();
      for (const c of (d.data || [])) {
        const mails = [c.billing_details && c.billing_details.email, c.receipt_email, c.metadata && c.metadata.email]
          .filter(Boolean).map((m) => String(m).toLowerCase());
        if (mails.includes(target)) out.push(c);
      }
      if (!d.has_more || !d.data || !d.data.length) break;
      after = d.data[d.data.length - 1].id;
    }
    return { ok: true, via: 'scan_depuis_' + FLORENCE_START, charges: out };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e), charges: [] };
  }
}

// ---------------------------------------------------------------- Brevo
async function brevoContact(email) {
  const key = process.env.BREVO_API_KEY;
  if (!key || !email) return { ok: false, found: false };
  try {
    const r = await fetch('https://api.brevo.com/v3/contacts/' + encodeURIComponent(email),
      { headers: { 'api-key': key, accept: 'application/json' } });
    if (r.status === 404) return { ok: true, found: false };
    if (!r.ok) return { ok: false, found: false, reason: 'brevo_' + r.status };
    const c = await r.json();
    const ids = c.listIds || [];
    const pick = (map) => { for (const id of ids) if (map[id]) return map[id]; return null; };
    const at = c.attributes || {};
    return {
      ok: true, found: true,
      listes: ids,
      lead: pick(LEAD_LISTS),
      candidat: pick(CANDIDAT_LISTS),
      participant: pick(PARTICIPANT_LISTS),
      langue: pick(PARTICIPANT_LISTS) || pick(CANDIDAT_LISTS) || pick(LEAD_LISTS) || null,
      prenom: at.PRENOM || at.FIRSTNAME || null,
      nom: at.NOM || at.LASTNAME || null,
      pays: at.PAYS || null,
      cree_le: (c.createdAt || '').slice(0, 10) || null,
      desabonne: !!c.emailBlacklisted
    };
  } catch (e) {
    return { ok: false, found: false, reason: String((e && e.message) || e) };
  }
}

// ------------------------------------------- Liste publique des exposants
let _artistCache = { at: 0, data: null };
async function florenceArtists() {
  if (_artistCache.data && Date.now() - _artistCache.at < 10 * 60 * 1000) return _artistCache.data;
  const r = await fetch(ARTISTS_SRC, { headers: { 'User-Agent': 'Mozilla/5.0 (ExpoMetro status)' } });
  const html = await r.text();
  const m = html.match(/data-page="([^"]*)"/);
  if (!m) throw new Error('data-page introuvable');
  const json = m[1]
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#0?34;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const data = JSON.parse(json);
  const byCountry = data.props && data.props.modal && data.props.modal.props
    && data.props.modal.props.itemListByCountry;
  const list = [];
  for (const cc in (byCountry || {})) {
    for (const a of byCountry[cc]) {
      if (a && a.display_name) list.push({ id: a.id, nom: a.display_name, pays: a.country_code || cc });
    }
  }
  // Id de l'exposition en cours, lu dans la page (pas code en dur : survivra a Florence).
  const exhibitionId = (data.props && data.props.item && data.props.item.id) || null;
  const out = { list, exhibitionId };
  _artistCache = { at: Date.now(), data: out };
  return out;
}

// STATUT DE L'OEUVRE, via l'API publique que la page utilise pour sa popup artiste.
// items non vide  -> au moins une oeuvre validee et exposee publiquement
// items vide      -> rien de publie (pas encore envoyee OU en attente de validation : indiscernable ici)
async function artworkStatus(exhibitionId, artistId) {
  if (!exhibitionId || !artistId) return null;
  try {
    const r = await fetch(`https://expometro.co/api/exhibition/${exhibitionId}/artist/${artistId}/?locale=en`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (ExpoMetro status)', accept: 'application/json' } });
    if (!r.ok) return null;
    const d = await r.json();
    const items = (d && d.data && d.data.items) || [];
    return {
      nb: items.length,
      oeuvres: items.slice(0, 5).map((it) => ({
        titre: (it.data && it.data.artwork_title) || null,
        technique: (it.data && it.data.artwork_medium) || null,
        annee: (it.data && it.data.artwork_year) || null
      }))
    };
  } catch (e) { return null; }
}

// Cle de comparaison insensible a l'ORDRE des mots : "PASSEY Francois" == "Francois PASSEY".
function nameKey(s) { return normName(s).split(' ').filter(Boolean).sort().join(' '); }

// Correspondance de nom : exacte (ordre indifferent), puis "tous les mots cherches sont presents".
function matchNames(list, query) {
  const q = normName(query);
  if (!q || q.length < 3) return { exact: [], probables: [] };
  const qk = nameKey(query);
  const words = q.split(' ').filter((w) => w.length > 1);
  const exact = [], probables = [];
  for (const a of list) {
    const n = normName(a.nom);
    if (nameKey(a.nom) === qk) { exact.push(a); continue; }
    if (words.length && words.every((w) => n.includes(w))) probables.push(a);
  }
  return { exact, probables: probables.slice(0, 8) };
}

// ---------------------------------------------------- garde-fou de debit
const _hits = new Map();  // par instance : suffisant pour stopper une boucle
function rateLimited(id) {
  const now = Date.now(), win = 60 * 60 * 1000, max = 120;
  const e = _hits.get(id);
  if (!e || now > e.reset) { _hits.set(id, { n: 1, reset: now + win }); return false; }
  e.n += 1;
  return e.n > max;
}

// ------------------------------------------------------------- handler
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const token = process.env.ARTIST_STATUS_KEY;
  const given = req.headers['x-status-key']
    || String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || given !== token) return res.status(401).json({ error: 'unauthorized' });

  const ip = String(req.headers['x-forwarded-for'] || 'inconnue').split(',')[0].trim();
  if (rateLimited(ip)) return res.status(429).json({ error: 'trop_de_requetes' });

  const email = String((req.query && req.query.email) || '').trim().toLowerCase();
  const name  = String((req.query && req.query.name)  || '').trim();
  if (!email && !name) return res.status(400).json({ error: 'parametre_email_ou_name_requis' });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'email_invalide' });

  console.log(`[artist-status] lookup email=${email || '-'} name=${name || '-'} ip=${ip}`);

  try {
    const [pay, brevo, expo] = await Promise.all([
      email ? stripePayments(email) : Promise.resolve({ ok: true, charges: [] }),
      email ? brevoContact(email)   : Promise.resolve({ ok: true, found: false }),
      florenceArtists().catch(() => null)
    ]);
    const artistes = (expo && expo.list) || null;

    // --- paiements
    const reussis = (pay.charges || []).filter((c) => c.paid && c.status === 'succeeded');
    const paiements = reussis.map((c) => ({
      date: new Date(c.created * 1000).toISOString().slice(0, 10),
      montant: Math.round((c.amount || 0) / 100),
      devise: String(c.currency || '').toUpperCase(),
      rembourse: !!c.refunded,
      description: c.description || null,
      // Convention reprise de /api/conversions : tout paiement depuis le 15/07/2026 = Florence.
      florence: new Date(c.created * 1000).toISOString().slice(0, 10) >= FLORENCE_START
    })).sort((a, b) => (a.date < b.date ? 1 : -1));
    const paye = paiements.some((p) => !p.rembourse);
    const payeFlorence = paiements.some((p) => !p.rembourse && p.florence);

    // --- base ExpoMetro (snapshot hashe, zero email en clair stocke)
    const h = email ? sha256(email) : null;
    const dansBase = h ? COMMUNITY.has(h) : false;
    const exposLifetime = h ? (PARTICIPATION[h] || 0) : 0;

    // --- correspondance sur le nom (liste publique des exposants Florence)
    const rechercheNom = name || [brevo.prenom, brevo.nom].filter(Boolean).join(' ');
    let nomTrouve = null;
    if (artistes && rechercheNom) {
      const m = matchNames(artistes, rechercheNom);
      nomTrouve = {
        recherche: rechercheNom,
        exposant_exact: m.exact,
        exposants_probables: m.probables
      };
    }
    const nomMatche = !!(nomTrouve && (nomTrouve.exposant_exact.length || nomTrouve.exposants_probables.length));
    const nomExact = !!(nomTrouve && nomTrouve.exposant_exact.length);

    // On ne va chercher le statut de l'oeuvre que si UN SEUL artiste correspond sans ambiguite.
    let cible = null, baseCible = null;
    if (nomTrouve && nomTrouve.exposant_exact.length === 1) { cible = nomTrouve.exposant_exact[0]; baseCible = 'correspondance de nom exacte'; }
    else if (nomTrouve && !nomTrouve.exposant_exact.length && nomTrouve.exposants_probables.length === 1) { cible = nomTrouve.exposants_probables[0]; baseCible = 'nom approchant (un seul candidat)'; }
    const oeuvre = cible ? await artworkStatus(expo && expo.exhibitionId, cible.id) : null;

    // --- FLORENCE (expo en cours) : repondu en TEMPS REEL, jamais par le snapshot.
    let participeFlorence, sourceFlorence;
    if (payeFlorence)          { participeFlorence = 'oui';      sourceFlorence = 'paiement Stripe depuis le ' + FLORENCE_START; }
    else if (brevo.participant){ participeFlorence = 'oui';      sourceFlorence = 'liste Brevo Participants ' + brevo.participant; }
    else if (nomExact)         { participeFlorence = 'probable'; sourceFlorence = 'nom present dans la liste publique des exposants Florence'; }
    else if (nomMatche)        { participeFlorence = 'a_verifier'; sourceFlorence = 'nom proche d\'un exposant Florence (homonyme possible)'; }
    else                       { participeFlorence = 'non_trouve'; sourceFlorence = 'aucune trace pour Florence sur cette adresse ni sur ce nom'; }

    // --- verdict
    let verdict, resume;
    if (payeFlorence) {
      verdict = 'PAYE_CONFIRME';
      const p = paiements.find((x) => !x.rembourse && x.florence);
      resume = `Place FLORENCE confirmee : paiement du ${p.date} (${p.montant} ${p.devise}). L'artiste participe bien a l'exposition en cours.`;
    } else if (paye) {
      verdict = 'PAYE_EXPO_ANTERIEURE';
      const p = paiements.find((x) => !x.rembourse);
      resume = `Paiement trouve le ${p.date} (${p.montant} ${p.devise}), mais ANTERIEUR au lancement de Florence (${FLORENCE_START}). Il a expose avec nous par le passe ; rien n'indique qu'il ait reserve pour Florence. Ne pas confondre les deux.`;
    } else if (exposLifetime > 0) {
      verdict = 'CLIENT_HISTORIQUE_SANS_PAIEMENT_RECENT';
      resume = `Compte client existant dans la base ExpoMetro (${exposLifetime} exposition(s) a son actif au ${SNAPSHOT_DATE}), mais aucun paiement retrouve dans Stripe pour cette adresse. Il a peut-etre paye avec une autre adresse, ou pas encore reserve pour Florence.`;
    } else if (brevo.candidat) {
      verdict = 'CANDIDAT_NON_PAYE';
      resume = `Candidature enregistree (liste Candidats ${brevo.candidat}), mais aucun paiement retrouve. Il a postule, il n'a pas encore reserve sa place.`;
    } else if (brevo.lead || dansBase) {
      verdict = 'LEAD_SEULEMENT';
      resume = dansBase
        ? `Compte enregistre dans la base ExpoMetro, jamais de paiement retrouve. Inscrit, mais n'a jamais expose.`
        : `Inscrit a la liste (${brevo.lead}), aucune candidature ni paiement retrouve.`;
    } else if (nomMatche) {
      verdict = 'INCONNU_MAIS_NOM_TROUVE';
      resume = `Cette adresse email est introuvable partout, MAIS un artiste portant ce nom figure dans la liste publique des exposants de Florence. Tres probablement une seconde adresse email. NE PAS lui dire qu'il n'a pas reserve : lui demander avec quelle autre adresse il s'est inscrit.`;
    } else {
      verdict = 'INCONNU_TOTAL';
      resume = `Aucune trace de cette adresse (ni paiement, ni liste, ni compte), et aucun exposant Florence a ce nom. Soit une autre adresse a ete utilisee, soit la reservation n'a jamais ete finalisee. Demander confirmation avant toute conclusion.`;
    }

    // --- avertissements : ce que l'assistant NE doit PAS conclure
    const avertissements = [];
    if (!cible) avertissements.push("Statut de l'oeuvre indisponible (artiste non identifie par le nom dans la liste Florence). Ne jamais l'inventer.");
    else if (oeuvre && oeuvre.nb === 0) avertissements.push("Oeuvre NON publiee : ne pas dire 'vous n'avez pas envoye votre image' (elle peut etre envoyee et en attente). Formuler comme une question.");
    if (cible && baseCible && baseCible.indexOf('approchant') === 0) avertissements.push('Artiste identifie par un nom APPROCHANT : homonyme possible, le statut de l\'oeuvre peut concerner quelqu\'un d\'autre.');
    if (!pay.ok) avertissements.push('Stripe injoignable sur cette requete : le champ paiement est incomplet, ne pas conclure a une absence de paiement.');
    if (pay.via && pay.via.startsWith('scan_')) avertissements.push(`Recherche Stripe limitee aux paiements depuis le ${FLORENCE_START}. Un paiement plus ancien ne remonte pas.`);
    if (!brevo.ok) avertissements.push('Brevo injoignable sur cette requete : listes incompletes.');
    if (!artistes) avertissements.push('Liste publique des exposants injoignable : la recherche par nom n\'a pas pu etre faite.');
    if (paiements.some((p) => p.rembourse)) avertissements.push('Au moins un paiement a ete REMBOURSE : verifier avant de confirmer une place.');
    if (brevo.desabonne) avertissements.push('Contact desabonne des emails marketing Brevo.');
    if (participeFlorence === 'probable' || participeFlorence === 'a_verifier') avertissements.push("Participation a Florence deduite du NOM uniquement (liste publique) : homonyme possible, faire confirmer par l'artiste.");
    avertissements.push(`Base users = snapshot du ${SNAPSHOT_DATE}. Les comptes crees apres cette date n'y sont pas.`);

    return res.status(200).json({
      verdict,
      resume,
      participe_florence: { reponse: participeFlorence, source: sourceFlorence },
      langue: brevo.langue || null,
      email: email || null,
      identite: { prenom: brevo.prenom || null, nom: brevo.nom || null, pays: brevo.pays || null },
      paiement: { paye, paye_florence: payeFlorence, nombre: paiements.length, paiements, source: pay.via || null },
      brevo: {
        contact_existe: !!brevo.found,
        lead: brevo.lead, candidat: brevo.candidat, participant: brevo.participant,
        cree_le: brevo.cree_le || null, desabonne: !!brevo.desabonne
      },
      base_expometro: {
        compte_existant: dansBase,
        expositions_passees: exposLifetime,
        snapshot: SNAPSHOT_DATE
      },
      recherche_nom: nomTrouve,
      statut_oeuvre: !cible
        ? { valeur: 'INDETERMINE', note: "Aucun artiste Florence identifie sans ambiguite a partir du nom : statut de l'oeuvre inconnu. Ne pas l'inventer." }
        : !oeuvre
        ? { valeur: 'INDETERMINE', note: "L'artiste est identifie mais la verification de l'oeuvre a echoue (API injoignable). Ne pas conclure." }
        : oeuvre.nb > 0
        ? { valeur: 'VALIDEE', nb: oeuvre.nb, oeuvres: oeuvre.oeuvres, artiste: cible.nom, base: baseCible,
            note: `Oeuvre(s) validee(s) et visible(s) publiquement sur la page de l'exposition (${oeuvre.nb}).` }
        : { valeur: 'NON_VALIDEE', nb: 0, artiste: cible.nom, base: baseCible,
            note: "Aucune oeuvre publiee pour cet artiste. Attention : impossible de distinguer ici 'image pas encore envoyee' de 'envoyee, en attente de validation'. Demander a l'artiste ou verifier dans l'admin avant d'affirmer laquelle des deux." },
      avertissements,
      genere_le: new Date().toISOString()
    });
  } catch (e) {
    console.error('[artist-status] erreur', e);
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
