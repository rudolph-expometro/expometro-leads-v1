// Vercel Serverless Function — LISTE DES COLLECTIVE ARTWORKS (lecture seule, donnees publiques).
//
// Permet a l'assistant de repondre precisement a « quelle difference entre Artwork 32 et 37 ? »
// sans rien inventer. Les donnees viennent de la page publique de l'exposition : elles sont
// donc toujours a jour (prix et disponibilites changent en permanence).
//
// Env  : ARTIST_STATUS_KEY (meme token que /api/artist-status)
// Auth : en-tete "x-status-key". GET uniquement. Aucune donnee personnelle, aucune ecriture.
//
// Usage : GET /api/florence-artworks            -> toutes les Collective Artworks
//         GET /api/florence-artworks?numero=32  -> une seule

const SRC = 'https://expometro.co/en/exhibition/2026-florence';

function unescapeHtml(s) {
  return s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#0?34;/g, '"')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

let cache = { at: 0, data: null };

async function collectiveArtworks() {
  if (cache.data && Date.now() - cache.at < 5 * 60 * 1000) return cache.data;
  const r = await fetch(SRC, { headers: { 'User-Agent': 'Mozilla/5.0 (ExpoMetro artworks)' } });
  const html = await r.text();
  const m = html.match(/data-page="([^"]*)"/);
  if (!m) throw new Error('data-page introuvable');
  const d = JSON.parse(unescapeHtml(m[1]));
  const list = (d.props && d.props.posterList) || [];

  const out = list.map((p) => {
    const nom = String(p.public_name || '');
    const num = (nom.match(/(\d+)/) || [])[1];
    const plafond = /ceiling/i.test(nom) || /ceiling/i.test(String(p.label || ''));
    return {
      numero: num ? Number(num) : null,
      nom,
      emplacement: plafond ? 'plafond' : 'mur',
      format: p.label || null,
      largeur_cm: p.artwork_width || null,
      hauteur_cm: p.artwork_height || null,
      prix_eur: p.artwork_price || null,
      places_totales: p.artwork_count || null,
      places_libres: p.booking_available_count || 0,
      complet: !(p.booking_available_count > 0)
    };
  }).filter((x) => x.numero !== null)
    .sort((a, b) => a.numero - b.numero);

  cache = { at: Date.now(), data: out };
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const token = process.env.ARTIST_STATUS_KEY;
  const given = req.headers['x-status-key']
    || String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || given !== token) return res.status(401).json({ error: 'unauthorized' });

  try {
    const all = await collectiveArtworks();
    const n = Number((req.query && req.query.numero) || 0);
    const data = n > 0 ? all.filter((x) => x.numero === n) : all;

    return res.status(200).json({
      total: all.length,
      resultats: data,
      note: "Prix en EUR, indicatifs : ils montent au fur et a mesure du remplissage et la page d'inscription les affiche dans la devise de l'artiste. Les places libres changent en permanence. Deux Collective Artworks de meme format et meme emplacement sont strictement equivalentes.",
      genere_le: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
