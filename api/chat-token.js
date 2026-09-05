// Vercel Serverless Function — GENERATEUR DE LIEN DE CHAT IDENTIFIE.
//
// Produit un lien vers le chat qui prouve que son porteur a acces a la boite email
// de l'artiste. A placer dans les emails Brevo (« poser une question sur ma participation »).
// Sans ce jeton, l'assistant du site n'a acces a AUCUNE donnee personnelle.
//
// Env  : ARTIST_STATUS_KEY (meme token que /api/artist-status) + CHAT_IDENTITY_SECRET
// Auth : en-tete "x-status-key". GET uniquement. Aucune ecriture.
//
// Usage : GET /api/chat-token?email=artiste@exemple.com&jours=30&url=https://artinthe.city/fr/florence

import { signIdentity } from './artist-status.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const token = process.env.ARTIST_STATUS_KEY;
  const given = req.headers['x-status-key']
    || String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || given !== token) return res.status(401).json({ error: 'unauthorized' });

  if (!process.env.CHAT_IDENTITY_SECRET) {
    return res.status(500).json({ error: 'CHAT_IDENTITY_SECRET absent des variables d\'environnement' });
  }

  const email = String((req.query && req.query.email) || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'email_invalide' });

  const jours = Math.min(180, Math.max(1, Number((req.query && req.query.jours) || 30)));
  const base = String((req.query && req.query.url) || 'https://artinthe.city/fr/florence');
  if (!/^https:\/\/(artinthe\.city|expometro\.co)\//.test(base)) {
    return res.status(400).json({ error: 'url_non_autorisee' });
  }

  const at = signIdentity(email, jours);
  if (!at) return res.status(500).json({ error: 'signature_impossible' });

  const lien = base + (base.indexOf('?') === -1 ? '?' : '&') + 'at=' + encodeURIComponent(at);
  console.log(`[chat-token] genere pour ${email} (${jours} j)`);

  return res.status(200).json({
    email,
    expire_dans_jours: jours,
    token: at,
    lien,
    note: "A placer dans les emails Brevo. Le porteur du lien peut consulter SON statut dans le chat. Ne pas publier ce lien."
  });
}
