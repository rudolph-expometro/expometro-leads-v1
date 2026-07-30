// Vercel Serverless Function — Dashboard conversions LIVE (V3, centre de controle FLORENCE).
// Croise les PAIEMENTS Stripe (depuis J1) avec les LEADS Brevo + la communaute existante.
//
// Env : STRIPE_API_KEY (Charges: Read) · BREVO_API_KEY · DASHBOARD_PASSWORD
// Auth : en-tete "x-dash-key" == DASHBOARD_PASSWORD. Sinon 401.

import { createHash } from 'node:crypto';
import { COMMUNITY_HASHES, PARTICIPATION } from '../lib/community.js';

const J1 = '2026-07-15';                       // debut des inscriptions Florence
const J1_TS = Math.floor(new Date(J1 + 'T00:00:00Z').getTime() / 1000);
const LEAD_LISTS = { 152: 'FR', 153: 'EN', 154: 'ES', 155: 'IT', 156: 'DE' };
const LANGS = ['FR', 'EN', 'ES', 'IT', 'DE'];
const COMMUNITY = new Set(COMMUNITY_HASHES);
const PART = PARTICIPATION; // hash email -> nb d'expos lifetime (clients)

// Snapshot de la base ExpoMetro (fichier Users 2026-07-30). Total inscrits & total exposants
// (clients ayant paye au moins une fois). A mettre a jour si nouvel export users.
const BASE_INSCRITS = 8806;
const BASE_EXPOSANTS = 4505;

// Taux de change approximatifs vers EUR (statiques, pour un TOTAL indicatif). Crypto exclu.
const EUR_RATES = { EUR: 1, USD: 0.92, GBP: 1.17, CHF: 1.05, CAD: 0.67, AUD: 0.60,
  CNY: 0.127, HKD: 0.118, JPY: 0.0061, SEK: 0.088, NOK: 0.086, DKK: 0.134, SGD: 0.68, NZD: 0.56 };

// Objectifs de campagne qui comptent dans le ROAS (acquisition). Le reste (Traffic, Engagement,
// Follow, Notoriete, App...) est EXCLU automatiquement du denominateur du ROAS.
const ACQ_OBJECTIVES = new Set([
  'OUTCOME_LEADS', 'LEAD_GENERATION',
  'OUTCOME_SALES', 'CONVERSIONS', 'PRODUCT_CATALOG_SALES'
]);

function sha256(v) { return createHash('sha256').update(String(v || '').trim().toLowerCase()).digest('hex'); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
const zeroLang = () => ({ FR: 0, EN: 0, ES: 0, IT: 0, DE: 0 });

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

// Depenses Meta Ads via la Marketing API. Optionnel : si META_AD_ACCOUNT_ID absent ou token
// sans permission ads_read -> renvoie null (le front bascule sur saisie manuelle). Ne throw jamais.
// Env : META_AD_ACCOUNT_ID (act_xxx ou xxx) + META_ADS_TOKEN (sinon on tente META_CAPI_TOKEN).
async function metaSpend() {
  const acct = process.env.META_AD_ACCOUNT_ID;
  const token = process.env.META_ADS_TOKEN || process.env.META_CAPI_TOKEN;
  if (!acct || !token) return null;
  const ver = process.env.META_GRAPH_VERSION || 'v21.0';
  const id = String(acct).startsWith('act_') ? acct : 'act_' + acct;
  // On lit la depense PAR CAMPAGNE (avec objectif) pour ne compter que l'acquisition dans le ROAS.
  async function campaigns(dateQs) {
    let url = `https://graph.facebook.com/${ver}/${id}/insights?access_token=${encodeURIComponent(token)}`
      + `&level=campaign&fields=campaign_name,objective,spend&limit=300&${dateQs}`;
    let out = [];
    for (let i = 0; i < 10; i++) {
      let r;
      try { r = await fetch(url); } catch (e) { return null; }
      if (!r.ok) return null;
      const d = await r.json();
      out = out.concat(d.data || []);
      if (d.paging && d.paging.next) url = d.paging.next; else break;
    }
    return out;
  }
  function summarize(rows) {
    let total = 0, acq = 0; const breakdown = [];
    for (const c of (rows || [])) {
      const s = +(c.spend || 0); total += s;
      const counted = ACQ_OBJECTIVES.has(c.objective);
      if (counted) acq += s;
      if (s > 0) breakdown.push({ name: c.campaign_name || '(sans nom)', objective: c.objective || '', spend: Math.round(s), counted });
    }
    breakdown.sort((a, b) => b.spend - a.spend);
    return { total, acq, breakdown };
  }
  const todayRows = await campaigns('date_preset=today');
  const totalRows = await campaigns('time_range=' + encodeURIComponent(JSON.stringify({ since: J1, until: todayISO() })));
  if (todayRows === null && totalRows === null) return null; // pas d'acces -> feature off
  const t = summarize(todayRows), g = summarize(totalRows);
  return {
    currency: 'EUR',
    today: t.total, todayAcq: t.acq,
    total: g.total, totalAcq: g.acq,
    breakdown: g.breakdown  // detail cumul par campagne (transparence)
  };
}

export default async function handler(req, res) {
  if (!process.env.DASHBOARD_PASSWORD || (req.headers['x-dash-key'] || '') !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!process.env.STRIPE_API_KEY || !process.env.BREVO_API_KEY) {
    return res.status(500).json({ error: 'STRIPE_API_KEY / BREVO_API_KEY manquant(s)' });
  }
  try {
    const today = todayISO();
    const nowTs = Math.floor(Date.now() / 1000);
    const [charges, leads, spend] = await Promise.all([stripeCharges(), brevoLeads(), metaSpend()]);

    // Axe des jours J1 -> aujourd'hui (UTC)
    const days = [];
    for (let t = J1_TS; t <= nowTs; t += 86400) days.push(new Date(t * 1000).toISOString().slice(0, 10));
    if (days[days.length - 1] !== today) days.push(today);

    // Leads Brevo : total par langue + nouveaux aujourd'hui + par jour (depuis J1)
    const leadsByLang = zeroLang(), newLeadsToday = zeroLang(), leadsByDay = {};
    for (const e in leads) {
      const l = leads[e];
      leadsByLang[l.lang] = (leadsByLang[l.lang] || 0) + 1;
      if (l.created === today) newLeadsToday[l.lang] = (newLeadsToday[l.lang] || 0) + 1;
      if (l.created >= J1) leadsByDay[l.created] = (leadsByDay[l.created] || 0) + 1;
    }

    const paid = charges.filter(c => c.paid && !c.refunded && c.status === 'succeeded');
    const revByCur = {};
    const buckets = { lead: 0, existant: 0, nouveau: 0 };
    const bucketsToday = { lead: 0, existant: 0, nouveau: 0 };
    const inscritsByLang = zeroLang(), inscritsTodayByLang = zeroLang();
    const convByDay = {};                 // conversions (leads qui paient) par jour
    const salesByDay = {};                // TOTAL des ventes par jour (tous buckets)
    const firstDate = {};                 // email -> date du 1er paiement (pour cumul artistes)
    const artistAgg = {};                 // email -> { expos, amount, currency, bucket }
    const artists = { first: 0, recurring: 0 };
    const communityBuyers = new Set();    // emails de la communaute existante qui ont paye
    const seenLeadEmail = new Set(), seenArtist = new Set();
    const todayRevEUR = { lead: 0, existant: 0, nouveau: 0 };  // CA du jour par source (EUR)
    let todayRevEURtot = 0;
    const revEURtotByBucket = { lead: 0, existant: 0, nouveau: 0 };  // CA total par source (EUR) depuis J1
    const rows = [];

    for (const c of paid) {
      const email = ((c.billing_details && c.billing_details.email) || c.receipt_email || '').trim().toLowerCase();
      const cur = (c.currency || '').toUpperCase();
      const amt = (c.amount || 0) / 100;
      const date = new Date(c.created * 1000).toISOString().slice(0, 10);
      revByCur[cur] = (revByCur[cur] || 0) + amt;

      const h = email ? sha256(email) : '';
      const expos = (h && PART[h]) || 0;
      const lead = email && leads[email];
      let bucket;
      if (lead) bucket = 'lead';
      else if (h && COMMUNITY.has(h)) bucket = 'existant';
      else bucket = 'nouveau';

      const amtEUR = amt * (EUR_RATES[cur] || 0);
      buckets[bucket]++;
      revEURtotByBucket[bucket] += amtEUR;
      salesByDay[date] = (salesByDay[date] || 0) + 1;
      if (date === today) { bucketsToday[bucket]++; todayRevEUR[bucket] += amtEUR; todayRevEURtot += amtEUR; }

      if (lead) {
        if (!seenLeadEmail.has(email)) { inscritsByLang[lead.lang]++; seenLeadEmail.add(email); }
        if (date === today) inscritsTodayByLang[lead.lang]++;
        convByDay[date] = (convByDay[date] || 0) + 1;
      }
      if (h && COMMUNITY.has(h) && email) communityBuyers.add(email);

      if (email) {
        if (!firstDate[email] || date < firstDate[email]) firstDate[email] = date;
        if (!seenArtist.has(email)) {
          seenArtist.add(email);
          if (expos >= 2) artists.recurring++; else artists.first++;
        }
        const a = artistAgg[email] || (artistAgg[email] = { expos, amount: 0, currency: cur, bucket });
        a.amount += amt; a.expos = Math.max(a.expos, expos);
      }
      rows.push({ date, email, amount: amt, currency: cur, bucket, lang: lead ? lead.lang : '', expos });
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));

    // Artistes uniques par jour (1er paiement) -> le front fera le cumul
    const artByDay = {};
    for (const e in firstDate) { const d = firstDate[e]; artByDay[d] = (artByDay[d] || 0) + 1; }

    // Serie quotidienne depuis J1
    const daily = days.map(d => ({ date: d, leads: leadsByDay[d] || 0, conv: convByDay[d] || 0, sales: salesByDay[d] || 0, artists: artByDay[d] || 0 }));

    // CA converti en EUR (indicatif ; devises inconnues/crypto ignorees)
    let revenueEUR = 0; const revIgnored = [];
    for (const cur in revByCur) { const r = EUR_RATES[cur]; if (r) revenueEUR += revByCur[cur] * r; else if (revByCur[cur] > 0) revIgnored.push(cur); }

    // Meta Ads -> ROAS (si dispo)
    let ads = { available: false };
    if (spend) {
      ads = {
        available: true, currency: spend.currency,
        spendToday: Math.round(spend.today), spendTotal: Math.round(spend.total),
        spendTodayAcq: Math.round(spend.todayAcq), spendTotalAcq: Math.round(spend.totalAcq),
        // ROAS sur la depense ACQUISITION (Leads + Conversions) ; Traffic/Follow exclus
        roasToday: spend.todayAcq > 0 ? +(todayRevEURtot / spend.todayAcq).toFixed(2) : null,
        roasTotal: spend.totalAcq > 0 ? +(revenueEUR / spend.totalAcq).toFixed(2) : null,
        breakdown: spend.breakdown
      };
    }

    // Taux de conversion par langue (depuis J1)
    const conv = {}; let leadsTot = 0, inscritsTot = 0;
    for (const L of LANGS) {
      conv[L] = { leads: leadsByLang[L], inscrits: inscritsByLang[L], rate: leadsByLang[L] ? +(100 * inscritsByLang[L] / leadsByLang[L]).toFixed(1) : 0 };
      leadsTot += leadsByLang[L]; inscritsTot += inscritsByLang[L];
    }
    conv.TOTAL = { leads: leadsTot, inscrits: inscritsTot, rate: leadsTot ? +(100 * inscritsTot / leadsTot).toFixed(1) : 0 };

    // Top artistes par nb d'expos
    const topArtists = Object.keys(artistAgg).map(e => ({
      email: e, expos: artistAgg[e].expos, amount: Math.round(artistAgg[e].amount),
      currency: artistAgg[e].currency, bucket: artistAgg[e].bucket
    })).sort((a, b) => (b.expos - a.expos) || (b.amount - a.amount)).slice(0, 12);

    // Communaute ExpoMetro : total inscrits vs total exposants payants (snapshot)
    const communaute = {
      inscrits: BASE_INSCRITS,
      exposants: BASE_EXPOSANTS,
      rate: BASE_INSCRITS ? +(100 * BASE_EXPOSANTS / BASE_INSCRITS).toFixed(1) : 0,
      florenceBuyers: communityBuyers.size  // clients existants ayant repris une place pour Florence
    };

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      updated: new Date().toISOString(),
      since: J1, today,
      communaute,
      florence: {
        payments: paid.length,
        artistsTotal: seenArtist.size,
        revenueByCurrency: revByCur,
        revenueEUR: Math.round(revenueEUR),
        revEURByBucket: { lead: Math.round(revEURtotByBucket.lead), existant: Math.round(revEURtotByBucket.existant), nouveau: Math.round(revEURtotByBucket.nouveau) },
        revenueIgnored: revIgnored,
        buckets,
        artistsSplit: artists,
        conv
      },
      daily,
      topArtists,
      ads,
      todayStats: {
        payments: paid.filter(c => new Date(c.created * 1000).toISOString().slice(0, 10) === today).length,
        revenueEUR: Math.round(todayRevEURtot),
        revEURByBucket: { lead: Math.round(todayRevEUR.lead), existant: Math.round(todayRevEUR.existant), nouveau: Math.round(todayRevEUR.nouveau) },
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
