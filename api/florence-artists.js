// Live artist ticker feed for the Florence PDV.
// Fetches the public exhibition page (Inertia SSR), pulls the embedded
// artist list, and returns a compact [ [name, countryCode], ... ] array.
const SRC = 'https://expometro.co/en/exhibition/2026-florence/artists';

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
    const r = await fetch(SRC, { headers: { 'User-Agent': 'Mozilla/5.0 (ExpoMetro ticker)' } });
    const html = await r.text();
    const m = html.match(/data-page="([^"]*)"/);
    if (!m) throw new Error('data-page not found');
    const data = JSON.parse(unescapeHtml(m[1]));
    const byCountry = data.props && data.props.modal && data.props.modal.props
      && data.props.modal.props.itemListByCountry;
    if (!byCountry) throw new Error('itemListByCountry not found');

    const artists = [];
    for (const cc in byCountry) {
      for (const a of byCountry[cc]) {
        if (a && a.display_name) artists.push([a.display_name, a.country_code || cc]);
      }
    }
    const countries = new Set(artists.map((a) => a[1])).size;

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
    res.status(200).json({ artists, count: artists.length, countries });
  } catch (e) {
    // Never fail the page: the front-end keeps its baked fallback list.
    res.setHeader('Cache-Control', 's-maxage=120');
    res.status(200).json({ artists: [], count: 0, countries: 0, error: String(e && e.message || e) });
  }
}
