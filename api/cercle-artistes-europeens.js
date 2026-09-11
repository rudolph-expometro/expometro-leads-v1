// Cercle des Artistes Européens — présentation Florence 2026.
// Proxy vers le site hébergé en amont (ChatGPT Sites). ACCÈS PUBLIC (plus de mot de passe).
// Nécessite la variable d'env Vercel CAE_FLORENCE_SITE_TOKEN (Bearer vers le site amont).
const ROUTE_PATH = '/florence/cercledesartisteseuropeens';
const UPSTREAM_ORIGIN = 'https://expometro-cae-firenze-2026.espace-de-tr-7258.chatgpt.site';
const PROXY_PREFIX = `${ROUTE_PATH}/_site`;
const PROXY_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

function transformText(text) {
  return text
    .split(UPSTREAM_ORIGIN).join(PROXY_PREFIX)
    .replace(/(["'`])\/_next\//g, `$1${PROXY_PREFIX}/_next/`)
    .replace(/(["'`])\/assets\//g, `$1${PROXY_PREFIX}/assets/`)
    .replace(/(["'`])\/api\//g, `$1${PROXY_PREFIX}/api/`)
    .replace(/url\(\/(?!\/)/g, `url(${PROXY_PREFIX}/`);
}

function proxyBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.body == null) return undefined;
  if (Buffer.isBuffer(req.body) || typeof req.body === 'string') return req.body;

  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return new URLSearchParams(req.body).toString();
  }

  return JSON.stringify(req.body);
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

  const headers = {
    accept: req.headers.accept || '*/*',
    'user-agent': req.headers['user-agent'] || 'artinthe.city',
    'OAI-Sites-Authorization': `Bearer ${process.env.CAE_FLORENCE_SITE_TOKEN || ''}`
  };
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];

  const response = await fetch(upstream, {
    method: req.method,
    headers,
    body: proxyBody(req),
    redirect: 'follow'
  });

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  res.status(response.status);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (req.method === 'HEAD' || response.status === 204 || response.status === 304) {
    res.end();
    return;
  }

  if (/text\/(html|css)|javascript|json/.test(contentType)) {
    res.send(transformText(await response.text()));
  } else {
    res.send(Buffer.from(await response.arrayBuffer()));
  }
}

export default async function handler(req, res) {
  if (!PROXY_METHODS.has(req.method)) {
    res.setHeader('Allow', [...PROXY_METHODS].join(', '));
    res.status(405).send('Méthode non autorisée');
    return;
  }

  try {
    await proxy(req, res);
  } catch (error) {
    console.error('CAE Florence proxy error', error);
    res.status(502).send('La présentation est momentanément indisponible. Veuillez réessayer.');
  }
}
