// Vercel Serverless Function — Dashboard conversions LIVE (V2, focalisé FLORENCE).
// Croise les PAIEMENTS Stripe (depuis J1) avec les LEADS Brevo + la communauté existante.
//
// Env : STRIPE_API_KEY (Charges: Read + Events: Read) · BREVO_API_KEY · DASHBOARD_PASSWORD
// Auth : en-tête "x-dash-key" == DASHBOARD_PASSWORD. Sinon 401.

import { createHash } from 'node:crypto';
import { COMMUNITY_HASHES, PARTICIPATION } from '../lib/community.js';

const J1 = '2026-07-15';                       // début des inscriptions Florence
const J1_TS = Math.floor(new Date(J1 + 'T00:00:00Z').getTime() / 1000);
const LEAD_LISTS = { 152: 'FR', 153: 'EN', 154: 'ES', 155: 'IT', 156: 'DE' };
const LANGS = ['FR', 'EN', 'ES', 'IT', 'DE'];
const COMMUNITY = new Set(COMMUNITY_HASHES);
const PART = PARTICIPATION; // hash email -> nb d'expos lifetime (clients)

function sha256(v) { return createHash('sha256').update(String(v || '').trim().toLowerCase()).digest('hex'); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

async function stripeCharges() {
  const key = process.env.STRIPE_API_KEY;
  let out = [], after = null;
  for (let i = 0; i < 20; i++) { // max 2000 charges depuis J1
    const url = `https://api.stripe.com/v1/charges?limit=100&created[gte]=${J1_TS}` + (after ? '&starting_after=' + after : '');
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) throw new Error('Stripe ' + r.status + ' (la cle a-t-elle "Charges: Read" ?)');
    const d = await r.json();
    out = out.concat(d.data || []);
    if (!d.has_more || !d.data || !d.data.length) break;
    after = d.data[d.data.length - 1].id;
  }
  return out;
}

async function brevoLeads() {
  const key = process.env.BREVO_API_KEY;
  const map = {}; // email -> { lang, created }
  for (const lid of Object.keys(LEAD_LISTS)) {
    let off = 0;
    while (true) {
      const r = await fetch(`https://api.brevo.com/v3/contacts/lists/${lid}/contacts?limit=500&offset=${off}`,
        { headers: { 'api-key': key, accept: 'application/json' } });
      if (!r.ok) break;
      const d = await r.json();
      const cs = d.contacts || [];
      for (const c of cs) {
        const e = (c.email || '').trim().toLowerCase();
        if (e && !map[e]) map[e] = { lang: LEAD_LISTS[lid], created: (c.createdAt || '').slice(0, 10) };
      }
      if (cs.length < 500) break;
      off += 500;
    }
  }
  return map;
}

const zeroLang = () => ({ FR: 0, EN: 0, ES: 0, IT: 0, DE: 0 });

export default async function handler(req, res) {
  if (!process.env.DASHBOARD_PASSWORD || (req.headers['x-dash-key'] || '') !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!process.env.STRIPE_API_KEY || !process.env.BREVO_API_KEY) {
    return res.status(500).json({ error: 'STRIPE_API_KEY / BREVO_API_KEY manquant(s)' });
  }
  try {
    const today = todayISO();
    const [charges, leads] = await Promise.all([stripeCharges(), brevoLeads()]);

    // Leads Brevo : total par langue + nouveaux aujourd'hui
    const leadsByLang = zeroLang(), newLeadsToday = zeroLang();
    for (const e in leads) {
      const l = leads[e]; leadsByLang[l.lang] = (leadsByLang[l.lang] || 0) + 1;
      if (l.created === today) newLeadsToday[l.lang] = (newLeadsToday[l.lang] || 0) + 1;
    }

    const paid = charges.filter(c => c.paid && !c.refunded && c.status === 'succeeded');
    // agrégats
    const revByCur = {};
    const buckets = { lead: 0, existant: 0, nouveau: 0 };
    const bucketsToday = { lead: 0, existant: 0, nouveau: 0 };
    const inscritsByLang = zeroLang();          // leads convertis (depuis J1) par langue
    const inscritsTodayByLang = zeroLang();     // leads convertis aujourd'hui
    const seenLeadEmail = new Set();
    const seenArtist = new Set();               // artistes uniques (par email) depuis J1
    const artists = { first: 0, recurring: 0 };  // 1ere expo vs artiste recurrent
    const rows = [];

    for (const c of paid) {
      const email = ((c.billing_details && c.billing_details.email) || c.receipt_email || '').trim().toLowerCase();
      const cur = (c.currency || '').toUpperCase();
      const amt = (c.amount || 0) / 100;
      const date = new Date(c.created * 1000).toISOString().slice(0, 10);
      revByCur[cur] = (revByCur[cur] || 0) + amt;

      const h = email ? sha256(email) : '';
      const expos = (h && PART[h]) || 0;          // nb d'expos lifetime (inclut Florence)
      const lead = email && leads[email];
      let bucket;
      if (lead) bucket = 'lead';
      else if (h && COMMUNITY.has(h)) bucket = 'existant';
      else bucket = 'nouveau';

      buckets[bucket]++;
      if (date === today) bucketsToday[bucket]++;

      if (lead) {
        // inscrit unique par email (evite de compter 2x un lead qui paie 2 fois)
        if (!seenLeadEmail.has(email)) { inscritsByLang[lead.lang]++; seenLeadEmail.add(email); }
        if (date === today) inscritsTodayByLang[lead.lang]++;
      }
      // 1ere expo (<=1) vs artiste recurrent (>=2), une fois par artiste
      if (email && !seenArtist.has(email)) {
        seenArtist.add(email);
        if (expos >= 2) artists.recurring++; else artists.first++;
      }
      rows.push({ date, email, amount: amt, currency: cur, bucket, lang: lead ? lead.lang : '', expos });
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));

    // taux de conversion par langue (depuis J1)
    const conv = {};
    let leadsTot = 0, inscritsTot = 0;
    for (const L of LANGS) {
      conv[L] = { leads: leadsByLang[L], inscrits: inscritsByLang[L], rate: leadsByLang[L] ? +(100 * inscritsByLang[L] / leadsByLang[L]).toFixed(1) : 0 };
      leadsTot += leadsByLang[L]; inscritsTot += inscritsByLang[L];
    }
    conv.TOTAL = { leads: leadsTot, inscrits: inscritsTot, rate: leadsTot ? +(100 * inscritsTot / leadsTot).toFixed(1) : 0 };

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      updated: new Date().toISOString(),
      since: J1, today,
      community: COMMUNITY.size,
      florence: {
        payments: paid.length,
        revenueByCurrency: revByCur,
        buckets,          // lead / existant / nouveau (depuis J1)
        artists,          // { first: 1ere expo, recurring: artiste recurrent }
        conv              // par langue + TOTAL
      },
      todayStats: {
        payments: paid.filter(c => new Date(c.created * 1000).toISOString().slice(0, 10) === today).length,
        buckets: bucketsToday,
        newLeadsByLang: newLeadsToday,
        inscritsByLang: inscritsTodayByLang
      },
      recent: rows.slice(0, 50)
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
