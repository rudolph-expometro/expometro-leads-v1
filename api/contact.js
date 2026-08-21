// Vercel Serverless Function — Escalade d'une question artiste depuis le chat vers Rudolph par email.
// Le widget poste { email, message, history } → on envoie un email transactionnel (Brevo) à hello@expometro.co
// avec Reply-To = l'email de l'artiste (Rudolph clique "Répondre" → ça part direct à l'artiste).
//
// Variables d'environnement (déjà présentes / optionnelles) :
//   BREVO_API_KEY   (obligatoire) — MÊME clé que subscribe.js / apply.js
//   CONTACT_TO      (optionnel)   — destinataire, défaut hello@expometro.co
//   CONTACT_FROM    (optionnel)   — expéditeur vérifié Brevo, défaut hello@expometro.co

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED = ['artinthe.city', 'localhost', '127.0.0.1', 'vercel.app'];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const origin = String(req.headers.origin || req.headers.referer || '');
  if (origin && !ALLOWED.some((h) => origin.includes(h))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'not_configured' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  if (!body) body = {};

  const email = String(body.email || '').trim().toLowerCase();
  const message = String(body.message || '').trim().slice(0, 3000);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'email_invalide' });
  if (!message) return res.status(400).json({ error: 'message_vide' });

  // Contexte de conversation (facultatif) pour aider Rudolph à répondre.
  let ctx = '';
  if (Array.isArray(body.history)) {
    ctx = body.history
      .slice(-10)
      .map((m) => (m && m.role === 'assistant' ? 'Assistant : ' : 'Artiste : ') + esc(String((m && m.content) || '').slice(0, 500)))
      .join('<br>');
  }

  const to = process.env.CONTACT_TO || 'hello@expometro.co';
  const from = process.env.CONTACT_FROM || 'hello@expometro.co';

  const html =
    '<h2>🗨️ Question artiste via le chat</h2>' +
    '<p><b>Email de l\'artiste :</b> ' + esc(email) + '</p>' +
    '<p><b>Sa question :</b></p><p>' + esc(message).replace(/\n/g, '<br>') + '</p>' +
    (ctx ? '<hr><p><b>Contexte de la conversation :</b></p><p style="color:#555">' + ctx + '</p>' : '') +
    '<hr><p style="color:#888">Réponds directement à cet email : il repart vers l\'artiste (Reply-To réglé).</p>';

  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: from, name: 'Chat ExpoMetro' },
        to: [{ email: to, name: 'Rudolph' }],
        replyTo: { email: email },
        subject: '🗨️ Question artiste via le chat',
        htmlContent: html,
      }),
    });

    if (!r.ok) {
      const tx = await r.text().catch(() => '');
      console.error('brevo_contact_error', r.status, String(tx).slice(0, 300));
      return res.status(502).json({ error: 'send_failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('contact_error', e && e.message);
    return res.status(500).json({ error: 'server' });
  }
}
