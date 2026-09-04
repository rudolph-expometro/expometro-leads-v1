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

// Helper réutilisable (aussi importé par api/ask.js pour donner les chiffres LIVE à l'assistant).
export async function getFlorenceStats() {
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
  // Grille des formats LIVE (dimensions, prix EUR, places restantes) — même payload, aucun appel de plus.
  const dd = (data.props && data.props.data) || {};
  const formats = Array.isArray(dd.poster_available_size_list)
    ? dd.poster_available_size_list
        .filter((f) => f && f.label && f.artwork_price > 0)
        .map((f) => ({
          label: String(f.label),
          w: Number(f.artwork_width) || 0,
          h: Number(f.artwork_height) || 0,
          price: Number(f.artwork_price) || 0,
          left: Number(f.available_count) || 0,
        }))
    : [];

  return {
    artists,
    count: Number(dd.count_artist) > 0 ? Number(dd.count_artist) : artists.length,
    countries: Number(dd.count_country) > 0
      ? Number(dd.count_country)
      : new Set(artists.map((a) => a[1])).size,
    formats,
    priceMin: Number(dd.booking_price_min) || 0,
  };
}

export default async function handler(req, res) {
  try {
    const { artists, count, countries } = await getFlorenceStats();
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
    res.status(200).json({ artists, count, countries });
  } catch (e) {
    // Never fail the page: the front-end keeps its baked fallback list.
    res.setHeader('Cache-Control', 's-maxage=120');
    res.status(200).json({ artists: [], count: 0, countries: 0, error: String(e && e.message || e) });
  }
}
