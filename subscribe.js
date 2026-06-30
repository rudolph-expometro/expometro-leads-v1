// Vercel Serverless Function — enregistre l'email dans Brevo
//
// Variables d'environnement à définir dans Vercel (Settings → Environment Variables) :
//   BREVO_API_KEY          (obligatoire) — ta clé API v3 Brevo
//   BREVO_LIST_ID          (obligatoire) — l'ID numérique de ta liste Brevo
//   BREVO_DOI_TEMPLATE_ID  (optionnel)   — ID du template "double opt-in" = l'email de confirmation
//   BREVO_REDIRECT_URL     (optionnel)   — page d'arrivée après que la personne ait cliqué dans l'email
//
// Si BREVO_DOI_TEMPLATE_ID est défini → Brevo envoie automatiquement l'email de confirmation
// depuis hello@expometro.co (double opt-in, recommandé / RGPD).
// Sinon → le contact est simplement ajouté à la liste (configure alors un "welcome email" côté Brevo).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  const listId = parseInt(process.env.BREVO_LIST_ID, 10);
  if (!apiKey || !listId) {
    return res.status(500).json({ error: 'Configuration Brevo manquante' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const email = ((body && body.email) || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  const doiTemplate = process.env.BREVO_DOI_TEMPLATE_ID;
  const redirectUrl = process.env.BREVO_REDIRECT_URL;

  let url, payload;
  if (doiTemplate) {
    url = 'https://api.brevo.com/v3/contacts/doubleOptinConfirmation';
    payload = {
      email,
      includeListIds: [listId],
      templateId: parseInt(doiTemplate, 10),
      redirectionUrl: redirectUrl || 'https://expometro.co'
    };
  } else {
    url = 'https://api.brevo.com/v3/contacts';
    payload = { email, listIds: [listId], updateEnabled: true };
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (r.ok || r.status === 201 || r.status === 204) {
      return res.status(200).json({ ok: true });
    }

    const data = await r.json().catch(() => ({}));
    // contact déjà inscrit → on considère ça comme un succès
    if (data && (data.code === 'duplicate_parameter' || data.code === 'duplicate_contact')) {
      return res.status(200).json({ ok: true, duplicate: true });
    }
    return res.status(502).json({ error: 'Brevo a refusé la requête', detail: data });
  } catch (e) {
    return res.status(502).json({ error: 'Erreur réseau vers Brevo' });
  }
}
