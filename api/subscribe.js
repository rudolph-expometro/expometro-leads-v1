// Vercel Serverless Function — enregistre l'email dans Brevo (multilingue)
// + envoie l'event "Lead" à la Conversions API de Meta (server-side, immunisé aux bloqueurs).
//
// Variables d'environnement à définir dans Vercel (Settings → Environment Variables) :
//   BREVO_API_KEY          (obligatoire) — ta clé API v3 Brevo (xkeysib-...)
//   BREVO_LIST_ID          (obligatoire) — ID de liste PAR DÉFAUT (fallback)
//   BREVO_LISTS            (optionnel)   — map JSON langue→ID de liste, ex : {"fr":12,"en":13,"es":14}
//   BREVO_DOI_TEMPLATE_ID  (optionnel)   — ID du template "double opt-in" = l'email de confirmation
//   BREVO_REDIRECT_URL     (optionnel)   — page d'arrivée après que la personne ait cliqué dans l'email
//   META_CAPI_TOKEN        (optionnel)   — token Conversions API (Events Manager → Settings → CAPI)
//   META_PIXEL_ID          (optionnel)   — 1647625338848662
//   META_GRAPH_VERSION     (optionnel)   — défaut v21.0
//   META_TEST_EVENT_CODE   (optionnel)   — pour voir l'event en direct dans Events Manager > Test events
//
// Routage langue : la page envoie { email, lang, src, eid, fbp, fbc, url }. Si BREVO_LISTS contient
// cette langue, le contact va dans la liste correspondante ; sinon il va dans BREVO_LIST_ID.
//
// CAPI : la page génère un `eid` (event_id) et le passe AUSSI au pixel navigateur (fbq eventID)
// → Meta dédoublonne parfaitement pixel + serveur. Si META_CAPI_TOKEN n'est pas défini, on skippe
// simplement l'envoi CAPI : la capture Brevo n'est JAMAIS bloquée par le tracking.

import { createHash } from 'node:crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sha256(v) {
  return createHash('sha256').update(String(v == null ? '' : v).trim().toLowerCase()).digest('hex');
}

function resolveListId(lang) {
  const fallback = parseInt(process.env.BREVO_LIST_ID, 10);
  try {
    if (process.env.BREVO_LISTS) {
      const map = JSON.parse(process.env.BREVO_LISTS);
      if (lang && map[lang]) return parseInt(map[lang], 10);
    }
  } catch (e) { /* JSON invalide → on retombe sur le fallback */ }
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
  if (!token || !pixel) return; // CAPI non configurée → on ignore proprement
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
      user_data
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
  if (!apiKey || !process.env.BREVO_LIST_ID) {
    return res.status(500).json({ error: 'Configuration Brevo manquante' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  if (!body) body = {};
  const email = ((body && body.email) || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  // On démarre l'envoi CAPI en parallèle du Brevo (ne rejette jamais).
  const capiPromise = sendLeadCapi(email, body, req);

  const lang = ((body && body.lang) || 'fr').toLowerCase().slice(0, 2);
  const listId = resolveListId(lang);
  const doiTemplate = process.env.BREVO_DOI_TEMPLATE_ID;
  const redirectUrl = process.env.BREVO_REDIRECT_URL;

  // Attributs : LANGUE + UTM (si fournis). Chaque valeur est bornée en longueur.
  const src = (body && body.src) || {};
  const clip = (v) => String(v == null ? '' : v).slice(0, 150);
  const attrsFull = { LANGUE: lang };
  if (src.s)  attrsFull.UTM_SOURCE   = clip(src.s);
  if (src.c)  attrsFull.UTM_CAMPAIGN = clip(src.c);
  if (src.m)  attrsFull.UTM_MEDIUM   = clip(src.m);
  if (src.ct) attrsFull.UTM_CONTENT  = clip(src.ct);

  // Niveaux d'attributs, du plus riche au plus sûr (dernier = sans attribut).
  const levels = [attrsFull, { LANGUE: lang }, null];

  function buildPayload(attrs) {
    if (doiTemplate) {
      const p = {
        email,
        includeListIds: [listId],
        templateId: parseInt(doiTemplate, 10),
        redirectionUrl: redirectUrl || 'https://expometro.co'
      };
      if (attrs) p.attributes = attrs;
      return { url: 'https://api.brevo.com/v3/contacts/doubleOptinConfirmation', payload: p };
    }
    const p = { email, listIds: [listId], updateEnabled: true };
    if (attrs) p.attributes = attrs;
    return { url: 'https://api.brevo.com/v3/contacts', payload: p };
  }

  // Résultat Brevo (on ne "return" plus tout de suite : on attend le départ de la CAPI avant de finir).
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
      // Contact déjà présent → succès (idempotent), pas besoin de réessayer.
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

  // On s'assure que l'event CAPI est parti avant que Vercel ne gèle la fonction.
  try { await capiPromise; } catch (e) { /* déjà avalé */ }

  return res.status(resp.status).json(resp.json);
}
