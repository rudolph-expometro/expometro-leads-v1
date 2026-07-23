// Vercel Serverless Function — enregistre l'email dans Brevo (multilingue)
//
// Variables d'environnement à définir dans Vercel (Settings → Environment Variables) :
//   BREVO_API_KEY          (obligatoire) — ta clé API v3 Brevo (xkeysib-...)
//   BREVO_LIST_ID          (obligatoire) — ID de liste PAR DÉFAUT (fallback)
//   BREVO_LISTS            (optionnel)   — map JSON langue→ID de liste, ex : {"fr":12,"en":13,"es":14}
//   BREVO_DOI_TEMPLATE_ID  (optionnel)   — ID du template "double opt-in" = l'email de confirmation
//   BREVO_REDIRECT_URL     (optionnel)   — page d'arrivée après que la personne ait cliqué dans l'email
//
// Routage langue : la page envoie { email, lang, src }. Si BREVO_LISTS contient cette langue,
// le contact va dans la liste correspondante ; sinon il va dans BREVO_LIST_ID.
//
// Attribution : la page envoie aussi src = { s, c, m, ct } (utm_source/campaign/medium/content).
// On tente de les stocker en attributs Brevo UTM_SOURCE / UTM_CAMPAIGN / UTM_MEDIUM / UTM_CONTENT
// (+ LANGUE). Fallback PROGRESSIF : si un attribut n'existe pas encore côté Brevo, on réessaie
// avec moins d'attributs, jusqu'à sans attribut du tout — la capture du contact est TOUJOURS garantie.
// (Pour que les UTM soient réellement stockés, créer ces attributs TEXTE dans Brevo → Contacts → Paramètres.)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveListId(lang) {
  const fallback = parseInt(process.env.BREVO_LIST_ID, 10);
  try {
    if (process.env.BREVO_LISTS) {
      const map = JSON.parse(process.env.BREVO_LISTS);
      if (lang && map[lang]) return parseInt(map[lang], 10);
    }
  } catch (e) { /* JSON invalide → on retombe sur le fallback */ }
  return fallback;
}

async function callBrevo(url, apiKey, payload) {
  return fetch(url, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload)
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || !process.env.BREVO_LIST_ID) {
    return res.status(500).json({ error: 'Configuration Brevo manquante' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const email = ((body && body.email) || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  const lang = ((body && body.lang) || 'fr').toLowerCase().slice(0, 2);
  const listId = resolveListId(lang);
  const doiTemplate = process.env.BREVO_DOI_TEMPLATE_ID;
  const redirectUrl = process.env.BREVO_REDIRECT_URL;

  // Attributs : LANGUE + UTM (si fournis). Chaque valeur est bornée en longueur.
  const src = (body && body.src) || {};
  const clip = (v) => String(v == null ? '' : v).slice(0, 150);
  const attrsFull = { LANGUE: lang };
  if (src.s)  attrsFull.UTM_SOURCE   = clip(src.s);
  if (src.c)  attrsFull.UTM_CAMPAIGN = clip(src.c);
  if (src.m)  attrsFull.UTM_MEDIUM   = clip(src.m);
  if (src.ct) attrsFull.UTM_CONTENT  = clip(src.ct);

  // Niveaux d'attributs, du plus riche au plus sûr (dernier = sans attribut).
  const levels = [attrsFull, { LANGUE: lang }, null];

  function buildPayload(attrs) {
    if (doiTemplate) {
      const p = {
        email,
        includeListIds: [listId],
        templateId: parseInt(doiTemplate, 10),
        redirectionUrl: redirectUrl || 'https://expometro.co'
      };
      if (attrs) p.attributes = attrs;
      return { url: 'https://api.brevo.com/v3/contacts/doubleOptinConfirmation', payload: p };
    }
    const p = { email, listIds: [listId], updateEnabled: true };
    if (attrs) p.attributes = attrs;
    return { url: 'https://api.brevo.com/v3/contacts', payload: p };
  }

  try {
    let lastData = {};
    for (let i = 0; i < levels.length; i++) {
      const { url, payload } = buildPayload(levels[i]);
      const r = await callBrevo(url, apiKey, payload);

      if (r.ok || r.status === 201 || r.status === 204) {
        return res.status(200).json({ ok: true });
      }
      lastData = await r.json().catch(() => ({}));
      // Contact déjà présent → succès (idempotent), pas besoin de réessayer.
      if (lastData && (lastData.code === 'duplicate_parameter' || lastData.code === 'duplicate_contact')) {
        return res.status(200).json({ ok: true, duplicate: true });
      }
      // Sinon (souvent : attribut inconnu côté Brevo) → on retente au niveau suivant, plus léger.
    }
    return res.status(502).json({ error: 'Brevo a refusé la requête', detail: lastData });
  } catch (e) {
    return res.status(502).json({ error: 'Erreur réseau vers Brevo' });
  }
}
