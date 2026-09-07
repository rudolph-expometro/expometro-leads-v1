// Vercel Serverless Function — LISTE DES COLLECTIVE ARTWORKS (lecture seule, donnees publiques).
//
// Permet a l'assistant de repondre precisement a « quelle difference entre Artwork 32 et 37 ? »
// sans rien inventer. Les donnees viennent de la page publique de l'exposition : elles sont
// donc toujours a jour (prix et disponibilites changent en permanence).
//
// Env  : ARTIST_STATUS_KEY (meme token que /api/artist-status)
// Auth : en-tete "x-status-key". GET uniquement. Aucune donnee personnelle, aucune ecriture.
//
// Usage : GET /api/florence-artworks              -> toutes les Collective Artworks
//         GET /api/florence-artworks?numero=32    -> une seule
//         GET /api/florence-artworks?paires=1     -> seulement celles qui ont AU MOINS deux
//                                                    places libres ADJACENTES (fusionnables)
//         GET /api/florence-artworks?format=Large -> filtre par format
//
// Les positions sont des « ligne_colonne » (« 1_4 »), comme dans les images du plan.
// La grille se deduit de poster_width / artwork_width et (poster_height - banner_size) /
// artwork_height : verifie exact sur les 39 panneaux le 07/09/2026.

const SRC = 'https://expometro.co/en/exhibition/2026-florence';

function unescapeHtml(s) {
  return s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#0?34;/g, '"')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Nombre de cases en largeur et en hauteur d'un panneau. Le bandeau (banner_size) occupe
// une partie de la hauteur et ne contient aucune place.
function grilleDe(p) {
  const n = (v) => Number(v) || 0;
  const lg = n(p.poster_width), ht = n(p.poster_height), bd = n(p.banner_size);
  const cw = n(p.artwork_width), ch = n(p.artwork_height);
  if (!cw || !ch) return { lignes: 0, colonnes: 0 };
  return { lignes: Math.round((ht - bd) / ch), colonnes: Math.round(lg / cw) };
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
    const grille = grilleDe(p);
    const prises = new Set(p.booking || []);
    const libres = [];
    for (let l = 1; l <= grille.lignes; l++) {
      for (let c = 1; c <= grille.colonnes; c++) {
        const pos = l + '_' + c;
        if (!prises.has(pos)) libres.push(pos);
      }
    }
    // Deux places fusionnables = deux places libres qui se touchent.
    const libre = (l, c) => l >= 1 && c >= 1 && l <= grille.lignes && c <= grille.colonnes
      && !prises.has(l + '_' + c);
    const coteACote = [], superposees = [];
    for (let l = 1; l <= grille.lignes; l++) {
      for (let c = 1; c <= grille.colonnes; c++) {
        if (!libre(l, c)) continue;
        if (libre(l, c + 1)) coteACote.push([l + '_' + c, l + '_' + (c + 1)]);
        if (libre(l + 1, c)) superposees.push([l + '_' + c, (l + 1) + '_' + c]);
      }
    }
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
      complet: !(p.booking_available_count > 0),
      grille,
      positions_libres: libres,
      // Pour proposer une FUSION, il ne suffit pas qu'il reste deux places : il faut
      // qu'elles se touchent. Ces deux listes donnent les couples reellement fusionnables.
      paires_cote_a_cote: coteACote,
      paires_superposees: superposees
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
    const q = req.query || {};
    const n = Number(q.numero || 0);
    let data = n > 0 ? all.filter((x) => x.numero === n) : all;
    if (q.format) {
      const f = String(q.format).toLowerCase();
      data = data.filter((x) => String(x.format || '').toLowerCase() === f);
    }
    if (q.paires) {
      data = data.filter((x) => x.paires_cote_a_cote.length || x.paires_superposees.length);
    }

    return res.status(200).json({
      total: all.length,
      resultats: data,
      note: "Prix en EUR, indicatifs : ils montent au fur et a mesure du remplissage et la page d'inscription les affiche dans la devise de l'artiste. Les places libres changent en permanence. Deux Collective Artworks de meme format et meme emplacement sont strictement equivalentes. positions_libres et paires_* sont en « ligne_colonne » : une FUSION exige deux places qui se touchent, pas seulement deux places libres sur le meme panneau.",
      genere_le: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
