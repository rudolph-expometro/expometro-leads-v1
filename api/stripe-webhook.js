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
    return res.status(200).json({ ok: true });
  } catch (e) {
    // On répond 200 pour éviter les retries Stripe en boucle (l'event_id dédup de toute façon).
    return res.status(200).json({ ok: true, note: 'processed with error' });
  }
}
