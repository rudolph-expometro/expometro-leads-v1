// Vercel Serverless Function — reçoit le webhook Stripe (paiement réussi) et envoie un event
// "Purchase" à la Conversions API de Meta. expometro.co N'EST JAMAIS touché : Stripe prévient
// artinthe.city, qui prévient Meta (server-to-server, immunisé aux bloqueurs).
//
// Variables d'environnement à définir dans Vercel :
//   STRIPE_API_KEY        (obligatoire) — clé Stripe RESTREINTE avec la seule permission "Events: Read"
//                                         (Stripe → Developers → API keys → Create restricted key).
//                                         Sert à RE-VÉRIFIER l'event auprès de Stripe = preuve qu'il est
//                                         authentique (impossible à falsifier sans accès à ton compte).
//   META_CAPI_TOKEN       (obligatoire) — token Conversions API (Events Manager → Settings → CAPI)
//   META_PIXEL_ID         (obligatoire) — 1647625338848662
//   META_GRAPH_VERSION    (optionnel)   — défaut v21.0
//   META_TEST_EVENT_CODE  (optionnel)   — pour voir l'event en direct dans Events Manager > Test events
//   BREVO_API_KEY         (obligatoire pour le mail) — clé API Brevo (transactionnel)
//
// Config Stripe : Developers → Webhooks → Add endpoint
//   URL      = https://artinthe.city/api/stripe-webhook
//   Events   = checkout.session.completed   (+ payment_intent.succeeded en secours si besoin)

import { createHash } from 'node:crypto';

function sha256(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return null;
  return createHash('sha256').update(s).digest('hex');
}

// Re-fetch l'event chez Stripe : s'il existe dans TON compte, il est authentique.
async function stripeGetEvent(eventId) {
  const key = process.env.STRIPE_API_KEY;
  const r = await fetch('https://api.stripe.com/v1/events/' + encodeURIComponent(eventId), {
    headers: { Authorization: 'Bearer ' + key }
  });
  if (!r.ok) throw new Error('stripe ' + r.status);
  return r.json();
}

async function sendPurchaseCapi(email, value, currency, eventId, ts) {
  const token = process.env.META_CAPI_TOKEN;
  const pixel = process.env.META_PIXEL_ID;
  if (!token || !pixel) return;
  const ver = process.env.META_GRAPH_VERSION || 'v21.0';
  const user_data = {};
  const em = sha256(email);
  if (em) user_data.em = [em];
  const ev = {
    event_name: 'Purchase',
    event_time: ts || Math.floor(Date.now() / 1000),
    action_source: 'website',
    user_data,
    custom_data: { value: Number(value), currency: String(currency || 'EUR').toUpperCase() }
  };
  if (eventId) ev.event_id = String(eventId); // dédup : même id que la transaction Stripe
  const payload = { data: [ev] };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  await fetch(`https://graph.facebook.com/${ver}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// Extrait email / valeur / devise + un id de dédup selon le type d'event Stripe.
// dedupId = l'id du PaymentIntent quand il existe → une même vente partage le MÊME event_id
// même si tu coches plusieurs types d'events (session + payment_intent + charge) → Meta dédup.
function extract(type, obj) {
  if (type === 'checkout.session.completed') {
    if (obj.payment_status && obj.payment_status !== 'paid') return null;
    return {
      email: (obj.customer_details && obj.customer_details.email) || obj.customer_email || '',
      value: (obj.amount_total || 0) / 100,
      currency: obj.currency || 'eur',
      dedupId: obj.payment_intent || obj.id
    };
  }
  if (type === 'payment_intent.succeeded') {
    return {
      email: obj.receipt_email || '',
      value: (obj.amount_received || obj.amount || 0) / 100,
      currency: obj.currency || 'eur',
      dedupId: obj.id
    };
  }
  if (type === 'charge.succeeded') {
    return {
      email: (obj.billing_details && obj.billing_details.email) || obj.receipt_email || '',
      value: (obj.amount || 0) / 100,
      currency: obj.currency || 'eur',
      dedupId: obj.payment_intent || obj.id
    };
  }
  return undefined; // type non géré
}

// ---------- Mail de confirmation de paiement (Brevo transactionnel) ----------
// Un template Brevo ACTIF par langue. zh-hk -> template EN (choix produit : artistes HK anglophones).
const BREVO_TEMPLATES = { fr: 960, en: 961, de: 962, es: 963, it: 965, 'zh-cn': 964, 'zh-hk': 961 };
const DEFAULT_TEMPLATE = 961; // EN si langue inconnue

// Repli approximatif pays -> langue (utilisé SEULEMENT si la session ne porte pas la locale).
// Ne distingue pas fiablement zh-cn/zh-hk ni les pays multilingues -> préférer metadata.lang.
const COUNTRY_LANG = {
  FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr',
  DE: 'de', AT: 'de', CH: 'de',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es',
  IT: 'it',
  CN: 'zh-cn', SG: 'zh-cn', HK: 'zh-hk', TW: 'zh-hk', MO: 'zh-hk',
  GB: 'en', US: 'en', IE: 'en', AU: 'en', NZ: 'en', CA: 'en'
};

// Fetch générique GET sur l'API Stripe (auth = STRIPE_API_KEY).
async function stripeGet(path) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    headers: { Authorization: 'Bearer ' + process.env.STRIPE_API_KEY }
  });
  if (!r.ok) throw new Error('stripe ' + r.status);
  return r.json();
}

// Normalise une locale brute (fr, en-US, zh-hk, zh_CN…) vers une de nos clés de template.
function localeToLang(raw) {
  raw = String(raw || '').trim().toLowerCase();
  if (!raw || raw === 'auto') return '';
  if (raw.startsWith('zh')) return /hk|tw|hant|mo/.test(raw) ? 'zh-hk' : 'zh-cn';
  const base = raw.split(/[-_]/)[0];
  return ['fr', 'en', 'de', 'es', 'it'].includes(base) ? base : '';
}

// Choisit le templateId. Ordre : metadata/locale de l'objet de l'event
// -> metadata.lang du PaymentIntent (cas charge.succeeded : la charge ne porte pas la metadata du PI)
// -> repli sur le pays de facturation -> EN.
async function resolveTemplateId(obj) {
  let lang = localeToLang(
    (obj.metadata && (obj.metadata.lang || obj.metadata.locale || obj.metadata.language)) ||
    (obj.locale)
  );
  if (!lang && obj.object === 'charge' && obj.payment_intent) {
    try {
      const pi = await stripeGet('payment_intents/' + encodeURIComponent(obj.payment_intent));
      lang = localeToLang(pi.metadata && (pi.metadata.lang || pi.metadata.locale));
    } catch (e) { /* on retombe sur le pays */ }
  }
  if (!lang) {
    const addr =
      (obj.customer_details && obj.customer_details.address) ||
      (obj.billing_details && obj.billing_details.address) ||
      (obj.charges && obj.charges.data && obj.charges.data[0] && obj.charges.data[0].billing_details && obj.charges.data[0].billing_details.address) ||
      null;
    const country = ((addr && addr.country) || '').toUpperCase();
    lang = COUNTRY_LANG[country] || 'en';
  }
  return BREVO_TEMPLATES[lang] || DEFAULT_TEMPLATE;
}

// Envoie le template transactionnel Brevo (statique, sans variable).
// Renvoie une chaîne de diagnostic (visible dans la réponse du webhook, côté Stripe) — jamais throw.
async function sendConfirmationEmail(email, templateId) {
  const key = process.env.BREVO_API_KEY;
  if (!key) return 'skip:no-key';
  if (!email) return 'skip:no-email';
  if (!templateId) return 'skip:no-template';
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ to: [{ email }], templateId: Number(templateId) })
    });
    if (r.ok) return 'sent:' + templateId;
    let body = '';
    try { body = (await r.text()).slice(0, 180); } catch (e) {}
    return 'err:' + r.status + ':' + body;
  } catch (e) {
    return 'exc:' + (e && e.message ? e.message : 'unknown');
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.STRIPE_API_KEY) return res.status(500).json({ error: 'STRIPE_API_KEY manquant' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const eventId = body && body.id;
  if (!eventId || !String(eventId).startsWith('evt_')) {
    return res.status(400).json({ error: 'pas un event Stripe' });
  }

  // Authentification : on re-fetch l'event chez Stripe (impossible à forger).
  let event;
  try {
    event = await stripeGetEvent(eventId);
  } catch (e) {
    return res.status(400).json({ error: 'event introuvable chez Stripe' });
  }

  try {
    const type = event.type;
    const obj = (event.data && event.data.object) || {};
    const data = extract(type, obj);

    if (data === undefined) return res.status(200).json({ ignored: type }); // event non pertinent
    if (data === null) return res.status(200).json({ ignored: 'unpaid' });

    if (data.value > 0) {
      // event_id = id du PaymentIntent → dédup stable côté Meta.
      await sendPurchaseCapi(data.email, data.value, data.currency, data.dedupId, event.created);
    }
    // Mail de confirmation. Cet endpoint n'est abonné qu'à UN SEUL event de succès
    // -> on envoie sur celui qui arrive, quel qu'il soit (checkout.session / payment_intent / charge).
    // ⚠️ Si un jour tu abonnes cet endpoint à PLUSIEURS events de succès, ajoute une dédup
    //    (ex. sur data.dedupId) pour ne pas envoyer 2 mails pour la même vente.
    let mail = 'not-run';
    if (data.email) {
      mail = await sendConfirmationEmail(data.email, await resolveTemplateId(obj));
    } else {
      mail = 'skip:no-email(' + type + ')';
    }
    return res.status(200).json({ ok: true, mail });
  } catch (e) {
    // On répond 200 pour éviter les retries Stripe en boucle (l'event_id dédup de toute façon).
    return res.status(200).json({ ok: true, note: 'processed with error' });
  }
}
