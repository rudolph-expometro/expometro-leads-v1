// Vercel Serverless Function — enregistre l'email dans Brevo (multilingue)
//
// Variables d'environnement à définir dans Vercel (Settings → Environment Variables) :
//   BREVO_API_KEY          (obligatoire) — ta clé API v3 Brevo (xkeysib-...)
//   BREVO_LIST_ID          (obligatoire) — ID de liste PAR DÉFAUT (fallback)
//   BREVO_LISTS            (optionnel)   — map JSON langue→ID de liste, ex : {"fr":12,"en":13,"es":14}
//   BREVO_DOI_TEMPLATE_ID  (optionnel)   — ID du template "double opt-in" = l'email de confirmation
//   BREVO_REDIRECT_URL     (optionnel)   — page d'arrivée après que la personne ait cliqué dans l'email
//
// Routage langue : la page envoie { email, lang }. Si BREVO_LISTS contient cette langue,
// le contact va dans la liste correspondante ; sinon il va dans BREVO_LIST_ID.
// La langue est aussi tentée comme attribut LANGUE (ignorée proprement si l'attribut n'existe pas côté Brevo).

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

  function buildPayload(withAttrs) {
    if (doiTemplate) {
      const p = {
        email,
        includeListIds: [listId],
        templateId: parseInt(doiTemplate, 10),
        redirectionUrl: redirectUrl || 'https://expometro.co'
      };
      if (withAttrs) p.attributes = { LANGUE: lang };
      return { url: 'https://api.brevo.com/v3/contacts/doubleOptinConfirmation', payload: p };
    }
    const p = { email, listIds: [listId], updateEnabled: true };
    if (withAttrs) p.attributes = { LANGUE: lang };
    return { url: 'https://api.brevo.com/v3/contacts', payload: p };
  }

  try {
    // 1er essai AVEC l'attribut LANGUE
    let { url, payload } = buildPayload(true);
    let r = await callBrevo(url, apiKey, payload);

    // Si l'attribut LANGUE n'existe pas encore côté Brevo → on réessaie sans attribut
    if (r.status === 400) {
      const data = await r.json().catch(() => ({}));
      if (data && data.code === 'duplicate_parameter') {
        return res.status(200).json({ ok: true, duplicate: true });
      }
      const retry = buildPayload(false);
      r = await callBrevo(retry.url, apiKey, retry.payload);
    }

    if (r.ok || r.status === 201 || r.status === 204) {
      return res.status(200).json({ ok: true });
    }

    const data = await r.json().catch(() => ({}));
    if (data && (data.code === 'duplicate_parameter' || data.code === 'duplicate_contact')) {
      return res.status(200).json({ ok: true, duplicate: true });
    }
    return res.status(502).json({ error: 'Brevo a refusé la requête', detail: data });
  } catch (e) {
    return res.status(502).json({ error: 'Erreur réseau vers Brevo' });
  }
}
