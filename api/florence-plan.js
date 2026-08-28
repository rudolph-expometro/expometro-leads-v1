// Vercel Serverless Function — Plan interactif du tunnel de Florence.
//
// Lit la page d'inscriptions publique (Laravel + Inertia) et en extrait EN DIRECT :
//   - le vrai nombre d'artistes (count_artist) et de pays  <- source de verite, PAS la somme des places
//   - les oeuvres collectives avec places prises / total   <- posterList
//   - la date de cloture des inscriptions                  <- item.sale_end_date
//
// Pourquoi un appel serveur et pas un fetch depuis le navigateur : expometro.co n'envoie pas
// d'en-tetes CORS pour artinthe.city, donc un fetch cote page serait bloque.
//
// Env  : DASHBOARD_PASSWORD (meme mot de passe que /api/conversions)
// Auth : en-tete "x-dash-key" == DASHBOARD_PASSWORD. Sinon 401.

const SOURCE = 'https://expometro.co/fr/exhibition/2026-florence';

// Regle metier : les formats Small / Medium / Large sont sur les MURS,
// Large Ceiling et Extra Large sont au PLAFOND.
const CEILING_FORMATS = new Set(['Large Ceiling', 'Extra Large']);

// La page pese ~800 Ko. Le dashboard se rafraichit toutes les 60 s : on garde un cache
// court en memoire du lambda pour ne pas la retirer a chaque fois.
const TTL_MS = 120000;
let cache = null; // { at:number, payload:object }

function unescapeHtml(s) {
  // Passe unique : &amp; ne doit pas etre re-scanne, sinon "&amp;quot;" deviendrait un guillemet.
  return String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|quot|apos|lt|gt|amp);/g, (m, e) => {
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'amp') return '&';
    const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });
}

async function readPlan() {
  const r = await fetch(SOURCE, {
    headers: { 'user-agent': 'ExpoMetro-Dashboard/1.0', 'accept': 'text/html' }
  });
  if (!r.ok) throw new Error('source http ' + r.status);
  const html = await r.text();

  const m = html.match(/data-page="([^"]*)"/);
  if (!m) throw new Error('bloc data-page introuvable — la page d\'inscriptions a change de structure');

  let page;
  try { page = JSON.parse(unescapeHtml(m[1])); }
  catch (e) { throw new Error('data-page illisible : ' + e.message); }

  const props = page.props || {};
  const data = props.data || {};
  const item = props.item || {};
  const list = Array.isArray(props.posterList) ? props.posterList : [];
  if (!list.length) throw new Error('posterList vide — aucune oeuvre collective lue');

  const artworks = list.map(p => {
    const num = parseInt(String(p.public_name || '').match(/(\d+)/)?.[1] ?? '0', 10);
    const total = Number(p.artwork_count) || 0;
    // available_count fait foi : booking[] peut contenir une entree de trop (constate sur l'oeuvre 24).
    const avail = Number(p.booking_available_count) || 0;
    return {
      id: num,
      name: p.public_name || ('Artwork ' + num),
      format: p.label || '—',
      order: Number(p.position) || num,
      surface: CEILING_FORMATS.has(p.label) ? 'ceiling' : 'wall',
      total,
      filled: Math.max(0, total - avail),
      price: Number(p.artwork_price) || null
    };
  }).filter(a => a.id > 0 && a.total > 0)
    .sort((a, b) => a.id - b.id);

  return {
    artists: Number(data.count_artist) || null,          // vrai nombre d'artistes distincts
    countries: Number(data.count_country) || null,
    artworksValidated: Number(data.count_artworks_validated) || null,
    placesAvailable: Number(data.booking_available_count) ?? null,
    saleEndDate: item.sale_end_date || null,
    exhibitionDate: item.start_date || null,
    artworks,
    source: SOURCE,
    updated: new Date().toISOString()
  };
}

export default async function handler(req, res) {
  if (!process.env.DASHBOARD_PASSWORD || (req.headers['x-dash-key'] || '') !== process.env.DASHBOARD_PASSWORD) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  const fresh = String(req.query?.fresh || '') === '1';
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) {
    res.status(200).json({ ...cache.payload, cached: true });
    return;
  }
  try {
    const payload = await readPlan();
    cache = { at: Date.now(), payload };
    res.status(200).json({ ...payload, cached: false });
  } catch (e) {
    // Si la lecture echoue mais qu'on a un cache, mieux vaut servir des chiffres un peu vieux
    // que de casser l'onglet.
    if (cache) { res.status(200).json({ ...cache.payload, cached: true, staleError: String(e.message) }); return; }
    res.status(502).json({ error: String(e.message) });
  }
}
