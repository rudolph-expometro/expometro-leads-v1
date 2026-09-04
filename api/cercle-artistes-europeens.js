import crypto from 'node:crypto';

const COOKIE_NAME = 'cae_florence_session';
const ROUTE_PATH = '/florence/cercledesartisteseuropeens';
const COOKIE_PATH = '/';
const SESSION_MAX_AGE = 90 * 24 * 60 * 60;
const UPSTREAM_ORIGIN = 'https://expometro-cae-firenze-2026.espace-de-tr-7258.chatgpt.site';
const PROXY_PREFIX = `${ROUTE_PATH}/_site`;

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf('=');
      return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    })
  );
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sessionValue() {
  return crypto.createHmac('sha256', process.env.CAE_FLORENCE_SESSION_SECRET || '')
    .update('cercle-des-artistes-europeens:florence-2026')
    .digest('base64url');
}

function isAuthenticated(req) {
  const received = parseCookies(req.headers.cookie)[COOKIE_NAME] || '';
  return Boolean(process.env.CAE_FLORENCE_SESSION_SECRET) && safeEqual(received, sessionValue());
}

function loginPage(error = false) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Accès privé — Florence 2026</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#111;color:#f7f2e8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:min(100%,440px);padding:40px;border:1px solid #3d3932;border-radius:18px;background:#1b1a18;box-shadow:0 24px 70px #0008}.eyebrow{margin:0 0 12px;color:#d6aa62;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}h1{margin:0 0 12px;font-family:Georgia,serif;font-size:34px;line-height:1.08}p{margin:0 0 28px;color:#c9c2b7;line-height:1.55}label{display:block;margin-bottom:9px;font-size:14px;font-weight:650}input{width:100%;height:50px;padding:0 15px;border:1px solid #5d574d;border-radius:10px;background:#111;color:#fff;font:inherit;outline:none}input:focus{border-color:#d6aa62;box-shadow:0 0 0 3px #d6aa6233}button{width:100%;height:50px;margin-top:14px;border:0;border-radius:10px;background:#d6aa62;color:#17130d;font:700 15px inherit;cursor:pointer}button:hover{background:#e4bc79}.error{margin:12px 0 0;color:#ffb4a9;font-size:14px}.note{margin:20px 0 0;font-size:12px;color:#8f887e}
  </style>
</head>
<body>
  <main class="card">
    <p class="eyebrow">ExpoMetro × Cercle des Artistes Européens</p>
    <h1>Florence 2026</h1>
    <p>Cette présentation est réservée aux personnes invitées.</p>
    <form method="post" autocomplete="on">
      <label for="password">Mot de passe</label>
      <input id="password" name="password" type="password" required autofocus autocomplete="current-password">
      <button type="submit">Accéder à la présentation</button>
      ${error ? '<p class="error" role="alert">Mot de passe incorrect.</p>' : ''}
    </form>
    <p class="note">Votre accès restera actif pendant 90 jours sur cet appareil.</p>
  </main>
</body>
</html>`;
}

function transformText(text) {
  return text
    .split(UPSTREAM_ORIGIN).join(PROXY_PREFIX)
    .replace(/(["'`])\/_next\//g, `$1${PROXY_PREFIX}/_next/`)
    .replace(/(["'`])\/assets\//g, `$1${PROXY_PREFIX}/assets/`)
    .replace(/(["'`])\/api\//g, `$1${PROXY_PREFIX}/api/`)
    .replace(/url\(\/(?!\/)/g, `url(${PROXY_PREFIX}/`);
}

async function proxy(req, res) {
  const rawPath = Array.isArray(req.query.assetPath) ? req.query.assetPath.join('/') : (req.query.assetPath || '');
  if (rawPath.includes('..') || rawPath.includes('://')) {
    res.status(400).send('Requête invalide');
    return;
  }

  const upstream = new URL(`/${rawPath}`, `${UPSTREAM_ORIGIN}/`);
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === 'assetPath') continue;
    if (Array.isArray(value)) value.forEach((item) => upstream.searchParams.append(key, item));
    else if (value != null) upstream.searchParams.set(key, value);
  }

  const response = await fetch(upstream, {
    method: 'GET',
    headers: {
      accept: req.headers.accept || '*/*',
      'user-agent': req.headers['user-agent'] || 'artinthe.city',
      'OAI-Sites-Authorization': `Bearer ${process.env.CAE_FLORENCE_SITE_TOKEN || ''}`
    },
    redirect: 'follow'
  });

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  res.status(response.status);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (/text\/(html|css)|javascript|json/.test(contentType)) {
    res.send(transformText(await response.text()));
  } else {
    res.send(Buffer.from(await response.arrayBuffer()));
  }
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const supplied = typeof req.body === 'string'
      ? new URLSearchParams(req.body).get('password') || ''
      : req.body?.password || '';

    if (!process.env.CAE_FLORENCE_PASSWORD || !safeEqual(supplied, process.env.CAE_FLORENCE_PASSWORD)) {
      res.status(401).setHeader('Content-Type', 'text/html; charset=utf-8').send(loginPage(true));
      return;
    }

    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(sessionValue())}; Max-Age=${SESSION_MAX_AGE}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax`);
    res.status(303).setHeader('Location', ROUTE_PATH).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, POST');
    res.status(405).send('Méthode non autorisée');
    return;
  }

  if (!isAuthenticated(req)) {
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Frame-Options', 'DENY');
    res.send(loginPage(false));
    return;
  }

  try {
    await proxy(req, res);
  } catch (error) {
    console.error('CAE Florence proxy error', error);
    res.status(502).send('La présentation est momentanément indisponible. Veuillez réessayer.');
  }
}
