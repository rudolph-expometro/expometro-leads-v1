// Live reviews feed for the Florence PDV.
// Fetches the public reviews page (Inertia SSR) and returns a compact
// [ { c: comment, n: author, cc: countryCode }, ... ] array.
const SRC = 'https://expometro.co/en/exhibition/2026-florence/reviews';

function unescapeHtml(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#0?34;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export default async function handler(req, res) {
  try {
    const r = await fetch(SRC, { headers: { 'User-Agent': 'Mozilla/5.0 (ExpoMetro reviews)' } });
    const html = await r.text();
    const m = html.match(/data-page="([^"]*)"/);
    if (!m) throw new Error('data-page not found');
    const data = JSON.parse(unescapeHtml(m[1]));
    const list = data.props && data.props.modal && data.props.modal.props
      && data.props.modal.props.itemList;
    if (!Array.isArray(list)) throw new Error('itemList not found');

    const reviews = [];
    for (const it of list) {
      const c = (it && it.comment ? String(it.comment) : '').trim();
      if (!c) continue;
      const u = it.user || {};
      reviews.push({ c, n: u.display_name || '', cc: u.country_code || '' });
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
    res.status(200).json({ reviews, count: reviews.length });
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=120');
    res.status(200).json({ reviews: [], count: 0, error: String(e && e.message || e) });
  }
}
