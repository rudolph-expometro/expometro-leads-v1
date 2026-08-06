// Vercel Serverless Function — enregistre une CANDIDATURE artiste dans Brevo (multilingue)
// + envoie l'event "Lead" à la Conversions API de Meta (server-side, immunisé aux bloqueurs).
//
// Flux : la page /apply-florence poste { profile, artist, country, portfolio, email, lang, src, eid, fbp, fbc, url }.
// Le contact est ajouté à une liste "Candidats Florence" DÉDIÉE → une automation Brevo s'y déclenche
// (Mail 1 "on analyse" immédiat, puis Mail 2 "Sélectionné" à +24h).
//
// Variables d'environnement à définir dans Vercel (Settings → Environment Variables) :
//   BREVO_API_KEY          (obligatoire) — ta clé API v3 Brevo (xkeysib-...)  [MÊME que subscribe.js]
//   BREVO_APPLY_LIST_ID    (obligatoire) — ID de la liste "Candidats Florence" (fallback / défaut)
//   BREVO_APPLY_LISTS      (optionnel)   — map JSON langue→ID, ex : {"fr":20,"en":21,"es":22,"it":23,"de":24}
//   META_CAPI_TOKEN        (optionnel)   — token Conversions API   [MÊMES que subscribe.js]
//   META_PIXEL_ID          (optionnel)   — 1647625338848662
//   META_GRAPH_VERSION     (optionnel)   — défaut v21.0
//   META_TEST_EVENT_CODE   (optionnel)
//
// Attributs Brevo à CRÉER au préalable (Contacts → Paramètres → Attributs de contact), type Texte :
//   NOM_ARTISTE · PAYS · PORTFOLIO · PROFIL
// (Si un attribut n'existe pas, on retombe proprement sur moins d'attributs pour ne jamais casser la
//  capture — MAIS la donnée serait perdue. Donc crée bien ces 4 attributs.)

import { createHash } from 'node:crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sha256(v) {
  return createHash('sha256').update(String(v == null ? '' : v).trim().toLowerCase()).digest('hex');
}

function resolveListId(lang) {
  const fallback = parseInt(process.env.BREVO_APPLY_LIST_ID, 10);
  try {
    if (process.env.BREVO_APPLY_LISTS) {
      const map = JSON.parse(process.env.BREVO_APPLY_LISTS);
      if (lang && map[lang]) return parseInt(map[lang], 10);
    }
  } catch (e) { /* JSON invalide → fallback */ }
  return fallback;
}

async function callBrevo(url, apiKey, payload) {
  return fetch(url, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload)
  });
}

// Envoie l'event Lead à Meta. Ne rejette JAMAIS (le tracking ne doit pas casser la capture).
async function sendLeadCapi(email, body, req) {
  const token = process.env.META_CAPI_TOKEN;
  const pixel = process.env.META_PIXEL_ID;
  if (!token || !pixel) return;
  try {
    const ver = process.env.META_GRAPH_VERSION || 'v21.0';
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ua = req.headers['user-agent'] || '';
    const user_data = { em: [sha256(email)] };
    if (body.fbp) user_data.fbp = String(body.fbp);
    if (body.fbc) user_data.fbc = String(body.fbc);
    if (ip) user_data.client_ip_address = ip;
    if (ua) user_data.client_user_agent = ua;
    const ev = {
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      user_data,
      custom_data: { content_name: 'apply-florence' }
    };
    if (body.eid) ev.event_id = String(body.eid);
    if (body.url) ev.event_source_url = String(body.url);
    const payload = { data: [ev] };
    if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;
    await fetch(`https://graph.facebook.com/${ver}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) { /* on avale toute erreur CAPI */ }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || !process.env.BREVO_APPLY_LIST_ID) {
    return res.status(500).json({ error: 'Configuration Brevo manquante' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  if (!body) body = {};
  const email = ((body && body.email) || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  // CAPI en parallèle (ne rejette jamais).
  const capiPromise = sendLeadCapi(email, body, req);

  const lang = ((body && body.lang) || 'fr').toLowerCase().slice(0, 2);
  const listId = resolveListId(lang);

  const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const attrsFull = { LANGUE: lang };
  if (body.artist)    attrsFull.NOM_ARTISTE = clip(body.artist, 100);
  if (body.country)   attrsFull.PAYS       = clip(body.country, 60);
  if (body.portfolio) attrsFull.PORTFOLIO  = clip(body.portfolio, 300);
  if (body.profile)   attrsFull.PROFIL     = clip(body.profile, 20);
  const src = (body && body.src) || {};
  if (src.s)  attrsFull.UTM_SOURCE   = clip(src.s, 150);
  if (src.c)  attrsFull.UTM_CAMPAIGN = clip(src.c, 150);
  if (src.m)  attrsFull.UTM_MEDIUM   = clip(src.m, 150);
  if (src.ct) attrsFull.UTM_CONTENT  = clip(src.ct, 150);

  // Du plus riche au plus sûr (dernier niveau = email seul, sans attribut).
  const levels = [attrsFull, { LANGUE: lang, PROFIL: attrsFull.PROFIL || '' }, { LANGUE: lang }, null];

  function buildPayload(attrs) {
    const p = { email, listIds: [listId], updateEnabled: true };
    if (attrs) p.attributes = attrs;
    return { url: 'https://api.brevo.com/v3/contacts', payload: p };
  }

  let resp = { status: 502, json: { error: 'Brevo a refusé la requête' } };
  try {
    let lastData = {};
    for (let i = 0; i < levels.length; i++) {
      const { url, payload } = buildPayload(levels[i]);
      const r = await callBrevo(url, apiKey, payload);
      if (r.ok || r.status === 201 || r.status === 204) {
        resp = { status: 200, json: { ok: true } };
        break;
      }
      lastData = await r.json().catch(() => ({}));
      if (lastData && (lastData.code === 'duplicate_parameter' || lastData.code === 'duplicate_contact')) {
        resp = { status: 200, json: { ok: true, duplicate: true } };
        break;
      }
      // Sinon (souvent : attribut inconnu côté Brevo) → on retente au niveau suivant, plus léger.
    }
    if (resp.status !== 200 && lastData && Object.keys(lastData).length) resp.json.detail = lastData;
  } catch (e) {
    resp = { status: 502, json: { error: 'Erreur réseau vers Brevo' } };
  }

  try { await capiPromise; } catch (e) { /* déjà avalé */ }

  return res.status(resp.status).json(resp.json);
}
