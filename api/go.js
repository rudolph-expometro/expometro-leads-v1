// Vercel Serverless Function — Sous-lien « Live Chat » : compteur de clics + redirection.
//
// But : mesurer l'impact du chat de l'assistant sur les ventes. Les liens que l'assistant
// donne (page d'inscription, compte, etc. sur expometro.co) sont affichés tels quels à
// l'artiste, mais leur href passe EN COULISSES par ici : on compte le clic (dans le même
// Google Sheet que le chat) puis on redirige (302) vers expometro.co en ajoutant les UTM.
//
// ⚠️ Les ventes se font sur expometro.co (plateforme séparée, non modifiable ici) et le
// webhook Stripe n'enregistre pas la source → on ne peut PAS attribuer la vente finale.
// Ce compteur donne donc un PROXY 100 % mesurable de notre côté : « combien de clics le
// chat a poussés vers le checkout ». Les UTM sont posés au cas où expometro.co les lise un jour.
//
// Variables d'environnement (déjà posées dans Vercel, partagées avec api/ask.js) :
//   CHAT_LOG_URL    — URL /exec du Web App Apps Script (le même journal que le chat)
//   CHAT_LOG_TOKEN  — le secret partagé avec le script
//
// Anti open-redirect : on ne redirige QUE vers expometro.co. Toute autre destination → fallback.

const ALLOW = /(^|\.)expometro\.co$/i;
const FALLBACK = 'https://expometro.co/en/exhibition/2026-florence';

function cleanSrc(s) {
  s = String(s || 'livechat').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  return s || 'livechat';
}

function langFromPath(p) {
  const m = String(p || '').match(/^\/(fr|en|es|it|de)(\/|$)/);
  return m ? m[1] : '';
}

// Journal best-effort : réutilise EXACTEMENT le même webhook que logChat() dans ask.js.
// On ne laisse jamais l'écriture bloquer la redirection au-delà de 900 ms.
async function logClick(row) {
  const url = process.env.CHAT_LOG_URL;
  if (!url) return;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 900);
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...row, token: process.env.CHAT_LOG_TOKEN || '' }),
      signal: ctl.signal,
    });
    clearTimeout(to);
  } catch (e) { /* jamais bloquant */ }
}

export default async function handler(req, res) {
  // req.query est normalement fourni par Vercel ; repli via req.url par sécurité.
  let q = req.query;
  if (!q || (typeof q.to === 'undefined' && typeof q.src === 'undefined')) {
    try { q = Object.fromEntries(new URL(req.url, 'https://artinthe.city').searchParams); }
    catch (e) { q = q || {}; }
  }

  const src = cleanSrc(q.src);
  const raw = q.to || '';
  let dest = FALLBACK, ok = false, host = '', lang = '';

  try {
    const u = new URL(String(raw));
    if ((u.protocol === 'https:' || u.protocol === 'http:') && ALLOW.test(u.hostname)) {
      host = u.hostname;
      lang = langFromPath(u.pathname);
      u.protocol = 'https:';
      // UTM cohérents avec apply.js / subscribe.js. searchParams les pose AVANT le fragment #.
      u.searchParams.set('utm_source', src);
      u.searchParams.set('utm_medium', 'chat');
      u.searchParams.set('utm_campaign', 'florence-2026');
      dest = u.toString();
      ok = true;
    }
  } catch (e) { /* to invalide → fallback */ }

  // Une ligne par clic dans le Sheet du chat, reconnaissable (profil = CLICK).
  await logClick({
    lang,
    profile: 'CLICK',
    source: src,
    email: '',
    question: '➡️ CLIC ' + (ok ? host : 'BLOQUÉ'),
    reply: ok ? dest : ('to=' + String(raw).slice(0, 300)),
  });

  res.setHeader('Location', dest);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  return res.status(302).end();
}
