// Vercel Serverless Function — places disponibles PAR FORMAT (live), lues sur la page expo.
// Source : https://expometro.co/en/exhibition/2026-florence -> data-page -> props.data.poster_available_size_list
// (deja agrege par taille : {label, artwork_width, available_count}). Langue-independant.
// Cache CDN 5 min pour ne pas marteler expometro.

const EXPO_URL = 'https://expometro.co/en/exhibition/2026-florence';

function unescapeHtml(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#0?34;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// largeur d'oeuvre (cm) -> clef format de la page howitworks
const WIDTH_TO_KEY = { 25: 'S', 50: 'M', 100: 'L', 250: 'XL' };
const LABEL_TO_KEY = { 'Small': 'S', 'Medium': 'M', 'Large': 'L', 'Extra Large': 'XL' };

export default async function handler(req, res) {
  try {
    const r = await fetch(EXPO_URL, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; ExpoMetroBot/1.0)' } });
    if (!r.ok) return res.status(200).json({ ok: false, error: 'expo ' + r.status });
    const html = await r.text();
    const m = html.match(/data-page="([^"]+)"/);
    if (!m) return res.status(200).json({ ok: false, error: 'data-page introuvable' });

    const data = JSON.parse(unescapeHtml(m[1]));
    const list = (data && data.props && data.props.data && data.props.data.poster_available_size_list) || [];
    const slots = {};
    for (const it of list) {
      const key = WIDTH_TO_KEY[it.artwork_width] || LABEL_TO_KEY[it.label];
      if (key) slots[key] = Math.max(0, parseInt(it.available_count, 10) || 0);
    }
    if (!Object.keys(slots).length) return res.status(200).json({ ok: false, error: 'liste vide' });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ ok: true, slots, updated: new Date().toISOString() });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
