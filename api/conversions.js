// Vercel Serverless Function — Dashboard conversions LIVE (V3, centre de controle FLORENCE).
// Croise les PAIEMENTS Stripe (depuis J1) avec les LEADS Brevo + la communaute existante.
//
// Env : STRIPE_API_KEY (Charges: Read) · BREVO_API_KEY · DASHBOARD_PASSWORD
// Auth : en-tete "x-dash-key" == DASHBOARD_PASSWORD. Sinon 401.

import { createHash } from 'node:crypto';
import { COMMUNITY_HASHES, PARTICIPATION } from '../lib/community.js';

const J1 = '2026-07-15';                       // debut des inscriptions Florence
const EN_SPLIT_SINCE = '2026-09-10';           // 1ère journée 100% taguée (tag posé le 09/09 10h50 CET → 09/09 est mixte, on démarre le 10). Split candidat EN 1% vs 1-2%. null = désactivé.
const J1_TS = Math.floor(new Date(J1 + 'T00:00:00Z').getTime() / 1000);
const LEAD_LISTS = { 152: 'FR', 153: 'EN', 154: 'ES', 155: 'IT', 156: 'DE' };
const CANDIDAT_LISTS = { 157: 'FR', 158: 'EN', 159: 'ES', 160: 'IT', 161: 'DE' }; // funnel apply-florence (pubs LAL)
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

async function brevoContacts(lists) {
  const key = process.env.BREVO_API_KEY;
  const map = {}; // email -> { lang, created }
  for (const lid of Object.keys(lists)) {
    let off = 0;
    while (true) {
      const r = await fetch(`https://api.brevo.com/v3/contacts/lists/${lid}/contacts?limit=500&offset=${off}`,
        { headers: { 'api-key': key, accept: 'application/json' } });
      if (!r.ok) break;
      const d = await r.json();
      const cs = d.contacts || [];
      for (const c of cs) {
        const e = (c.email || '').trim().toLowerCase();
        if (e && !map[e]) map[e] = { lang: lists[lid], created: (c.createdAt || '').slice(0, 10), pays: ((c.attributes && c.attributes.PAYS) || '').trim(), source: ((c.attributes && c.attributes.UTM_SOURCE) || '').toLowerCase().trim(), content: ((c.attributes && c.attributes.UTM_CONTENT) || '').trim() };
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
async function metaSpend(opts) {
  opts = opts || {};
  const acct = process.env.META_AD_ACCOUNT_ID;
  const token = process.env.META_ADS_TOKEN || process.env.META_CAPI_TOKEN;
  if (!acct || !token) return null;
  const ver = process.env.META_GRAPH_VERSION || 'v21.0';
  const id = String(acct).startsWith('act_') ? acct : 'act_' + acct;
  let _asBudgetsErr = '';
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
      const counted = ACQ_OBJECTIVES.has(c.objective) && !/retarget/i.test(c.campaign_name || '');
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
  // Devise du compte pub (léger) — nécessaire au ROAS EUR ; fetchée tôt pour le mode léger.
  let acctCur = 'EUR', curDbg = 'default-EUR';
  try {
    const rc = await fetch(`https://graph.facebook.com/${ver}/${id}?fields=currency&access_token=${encodeURIComponent(token)}`);
    if (rc.ok) { const dc = await rc.json(); if (dc.currency) { acctCur = dc.currency; curDbg = 'ok'; } else curDbg = 'no-field'; }
    else curDbg = 'http-' + rc.status;
  } catch (e) { curDbg = 'throw'; }
  const spendByDay = await dailySpend();
  // MODE LÉGER (onglet Dashboard) : on s'arrête ici -> AUCUN appel niveau ad set (évite le rate-limit /adsets sur le refresh fréquent).
  if (opts.adsets === false) {
    return { currency: acctCur, spendByDay, today: t.total, todayAcq: t.acq, total: g.total, totalAcq: g.acq, breakdown: g.breakdown, adsets: [], adDetail: [], spendCat: null, adsetDbg: { light: true, currency: curDbg + ':' + acctCur } };
  }
  // ===== PARTIE LOURDE (onglet Meta Ads uniquement) : lectures niveau AD SET =====
  const asBudgets = await adsetBudgets();
  const asCampBudgets = await campaignBudgets();

  // --- Depense PAR AD SET (pour le detail par pays / ROAS par ad set) ---
  async function adsetInsightsRaw(fields, dateQs) {
    let url = `https://graph.facebook.com/${ver}/${id}/insights?access_token=${encodeURIComponent(token)}`
      + `&level=adset&fields=${fields}&limit=500&${dateQs}`;
    let out = [];
    for (let i = 0; i < 10; i++) {
      let r; try { r = await fetch(url); } catch (e) { return null; }
      if (!r.ok) return null;
      const d = await r.json();
      out = out.concat(d.data || []);
      if (d.paging && d.paging.next) url = d.paging.next; else break;
    }
    return out;
  }
  // Certaines versions d'API refusent `objective` au niveau ad set -> on retente sans si echec.
  async function adsetInsights(dateQs) {
    let r = await adsetInsightsRaw('adset_id,adset_name,campaign_name,objective,spend,actions,frequency', dateQs);
    if (r === null) r = await adsetInsightsRaw('adset_id,adset_name,campaign_name,spend,actions,frequency', dateQs);
    if (r === null) r = await adsetInsightsRaw('adset_id,adset_name,campaign_name,objective,spend', dateQs);
    if (r === null) r = await adsetInsightsRaw('adset_id,adset_name,campaign_name,spend', dateQs);
    return r;
  }
  async function adsetBudgets() {
    // filtre = seulement les ad sets vivants (exclut ARCHIVED/DELETED, la masse) -> payload réduit, moins de timeout/rate-limit.
    const filt = encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'ADSET_PAUSED', 'CAMPAIGN_PAUSED', 'PENDING_REVIEW', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_BILLING_INFO'] }]));
    let url = `https://graph.facebook.com/${ver}/${id}/adsets?access_token=${encodeURIComponent(token)}`
      + `&fields=name,daily_budget,lifetime_budget,effective_status&limit=200&filtering=${filt}`;
    let out = [];
    for (let i = 0; i < 12; i++) {
      let r; try { r = await fetch(url); } catch (e) { _asBudgetsErr = 'throw'; return null; }
      if (!r.ok) { _asBudgetsErr = 'http-' + r.status + ':' + (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 140); return null; }
      const d = await r.json();
      out = out.concat(d.data || []);
      if (d.paging && d.paging.next) url = d.paging.next; else break;
    }
    return out;
  }
  // Budget au niveau CAMPAGNE (pour les campagnes en CBO/Advantage Campaign Budget : l'ad set n'a pas de daily_budget).
  async function campaignBudgets() {
    const filt = encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'ADSET_PAUSED', 'CAMPAIGN_PAUSED', 'PENDING_REVIEW', 'IN_PROCESS', 'WITH_ISSUES'] }]));
    let url = `https://graph.facebook.com/${ver}/${id}/campaigns?access_token=${encodeURIComponent(token)}`
      + `&fields=name,daily_budget,lifetime_budget,effective_status&limit=200&filtering=${filt}`;
    let out = [];
    for (let i = 0; i < 6; i++) {
      let r; try { r = await fetch(url); } catch (e) { return null; }
      if (!r.ok) return null;
      const d = await r.json();
      out = out.concat(d.data || []);
      if (d.paging && d.paging.next) url = d.paging.next; else break;
    }
    return out;
  }
  // Historique des HAUSSES de budget par ad set, lu directement dans Meta (Activity log) :
  // source de vérité pour le cooldown, indépendante du navigateur. Retourne { adset_id: 'YYYY-MM-DD' }.
  async function adsetBudgetRaises() {
    const sinceTs = Math.floor((Date.now() - 20 * 86400000) / 1000);   // 20 j : couvre large un cooldown de 3-4 j
    let url = `https://graph.facebook.com/${ver}/${id}/activities?access_token=${encodeURIComponent(token)}`
      + `&fields=event_type,event_time,object_id,object_type,extra_data&limit=500&since=${sinceTs}`;
    const raises = {}; let seen = 0, hits = 0;
    try {
      for (let i = 0; i < 10; i++) {
        let r; try { r = await fetch(url); } catch (e) { return { raises, dbg: 'throw' }; }
        if (!r.ok) return { raises, dbg: 'http-' + r.status };
        const d = await r.json();
        for (const e of (d.data || [])) {
          seen++;
          if (!/^update_ad_set_budget$/i.test(String(e.event_type || ''))) continue;       // changement de budget d'AD SET uniquement
          let ov = NaN, nv = NaN;
          try { const x = typeof e.extra_data === 'string' ? JSON.parse(e.extra_data) : (e.extra_data || {});
            // extra_data budget = objets imbriqués : { old_value: { old_value: 13000 }, new_value: { new_value: 7000 } } (en cents)
            const pick = (v) => (v && typeof v === 'object') ? (v.old_value != null ? v.old_value : (v.new_value != null ? v.new_value : v.value)) : v;
            ov = parseFloat(pick(x.old_value)); nv = parseFloat(pick(x.new_value)); } catch (_) { }
          if (!(nv > ov)) continue;                                                        // HAUSSE uniquement (new > old)
          hits++;
          const day = String(e.event_time || '').slice(0, 10), oid = e.object_id;
          if (oid && day && (!raises[oid] || day > raises[oid])) raises[oid] = day;         // la plus récente
        }
        if (d.paging && d.paging.next) url = d.paging.next; else break;
      }
    } catch (e) { return { raises, dbg: 'throw' }; }
    return { raises, dbg: 'ok:' + seen + 'act/' + hits + 'raise' };
  }
  const asTotal = await adsetInsights('time_range=' + encodeURIComponent(JSON.stringify({ since: J1, until: todayISO() })));
  const asToday = await adsetInsights('date_preset=today');
  const asFreq7 = null;   // (retiré) fréquence lue depuis asTotal -> 1 appel Meta de moins
  // Dépense par ad set DEPUIS la date de split (pour un ROAS par ring comparable : dépense et CA sur la même fenêtre).
  const asSplit = EN_SPLIT_SINCE ? await adsetInsights('time_range=' + encodeURIComponent(JSON.stringify({ since: EN_SPLIT_SINCE, until: todayISO() }))) : null;
  // --- Depense PAR AD (créa) : ROAS (Purchase ROAS Meta) + leads par créa ---
  async function adInsightsRaw(dateQs) {
    let url = `https://graph.facebook.com/${ver}/${id}/insights?access_token=${encodeURIComponent(token)}`
      + `&level=ad&fields=ad_name,adset_name,campaign_name,spend,actions,action_values,purchase_roas&limit=500&${dateQs}`;
    let out = [];
    for (let i = 0; i < 12; i++) {
      let r; try { r = await fetch(url); } catch (e) { return null; }
      if (!r.ok) return null;
      const d = await r.json();
      out = out.concat(d.data || []);
      if (d.paging && d.paging.next) url = d.paging.next; else break;
    }
    return out;
  }
  const adRows = null;   // détail par créa (adDetail) non affiché dans le dashboard -> on économise 1-2 appels Meta (rate-limit).
  function actSum(arr, re) { let s = 0; for (const a of (arr || [])) if (re.test(a.action_type || '')) s += +(a.value || 0); return s; }
  const adList = (adRows || []).map(function (r) {
    const leads = actSum(r.actions, /lead/i);
    const proas = (r.purchase_roas || []).reduce((m, x) => /purchase/i.test(x.action_type || '') ? Math.max(m, +x.value || 0) : m, 0);
    const pval = actSum(r.action_values, /purchase/i);
    return { name: r.ad_name || '', adset: r.adset_name || '', campaign: r.campaign_name || '', spend: Math.round(+(r.spend || 0)), leads: Math.round(leads), roas: proas ? +proas.toFixed(2) : null, pval: Math.round(pval) };
  }).filter(a => a.spend > 0 || a.leads > 0);
  const byId = {};
  function slot(k, name, campaign, objective) {
    return byId[k] || (byId[k] = { id: k, name: name || '', campaign: campaign || '', objective: objective || '', spendTotal: 0, spendToday: 0, dailyBudget: null, status: '' });
  }
  for (const r of (asTotal || [])) { const s = slot(r.adset_id, r.adset_name, r.campaign_name, r.objective); s.spendTotal += +(r.spend || 0); if (r.actions) s.actionsTotal = r.actions; if (r.frequency != null) s.freq7 = +r.frequency; }
  for (const r of (asToday || [])) { const s = slot(r.adset_id, r.adset_name, r.campaign_name, r.objective); s.spendToday += +(r.spend || 0); }
  for (const r of (asSplit || [])) { const s = slot(r.adset_id, r.adset_name, r.campaign_name, r.objective); s.spendSplit = (s.spendSplit || 0) + +(r.spend || 0); }
  for (const r of (asFreq7 || [])) { const s = byId[r.adset_id]; if (s && r.frequency != null) s.freq7 = +r.frequency; }
  for (const b of (asBudgets || [])) { const s = byId[b.id]; if (s) { s.dailyBudget = b.daily_budget ? +b.daily_budget / 100 : null; s.status = b.effective_status || ''; } }
  // CBO : rattache le budget campagne aux ad sets sans budget propre ; + repli statut campagne quand /adsets ne remonte pas le statut.
  const campBud = {};
  for (const c of (asCampBudgets || [])) {
    const dbb = c.daily_budget ? +c.daily_budget / 100 : null, lbb = c.lifetime_budget ? +c.lifetime_budget / 100 : null;
    if (c.name) campBud[c.name] = { daily: dbb, lifetime: lbb, cbo: !!(dbb || lbb), status: c.effective_status || '' };
  }
  for (const s of Object.values(byId)) {
    if (s.dailyBudget == null && campBud[s.campaign] && campBud[s.campaign].cbo) {
      s.dailyBudget = campBud[s.campaign].daily != null ? campBud[s.campaign].daily : campBud[s.campaign].lifetime;
      s.budgetCbo = true;
    }
    if (!s.status && campBud[s.campaign] && campBud[s.campaign].status) s.status = campBud[s.campaign].status;
  }
  // Filet de secours : Meta ne remonte pas toujours le budget par ad set (CBO, permission, champ vide).
  // On retombe alors sur le budget réel saisi ici (devise du compte pub, $). Ne remplit QUE les budgets
  // manquants -> la valeur LIVE de Meta reste prioritaire quand elle existe. À mettre à jour SEULEMENT
  // si tu changes un budget dans Meta pendant que Meta ne le remonte pas (sinon ça se met à jour tout seul).
  const BUDGET_FALLBACK = [
    // Snapshot manuel des budgets/jour (devise compte, $) — MAJ 2026-09-10 depuis l'Ads Manager.
    // Utilisé UNIQUEMENT quand Meta ne remonte pas le budget live (/adsets rate-limité) ; la valeur LIVE prime dès qu'elle revient.
    { re: /leads\s*italy/i,   budget: 94 },
    { re: /leads\s*german/i,  budget: 137 },
    { re: /leads\s*france/i,  budget: 130 },
    { re: /leads\s*spain/i,   budget: 60 },
    { re: /LAL\s*EN\s*1-2/i,  budget: 60 },   // Candidatures EN 1-2% (AVANT EN 1%)
    { re: /LAL\s*EN\b/i,      budget: 93 },   // Candidatures EN 1%
    { re: /LAL\s*FR\b/i,      budget: 44 },
    { re: /LAL\s*IT\b/i,      budget: 38 },
    { re: /LAL\s*ES\b/i,      budget: 44 },
    { re: /LAL\s*DE\b/i,      budget: 65 }
  ];
  for (const s of Object.values(byId)) {
    if (s.dailyBudget == null) { const fb = BUDGET_FALLBACK.find(f => f.re.test(s.name || '')); if (fb) s.dailyBudget = fb.budget; }
  }
  // Date de la dernière HAUSSE de budget par ad set (source Meta) -> cooldown fiable, cross-appareil.
  const _br = await adsetBudgetRaises();
  let _matched = 0;
  for (const s of Object.values(byId)) { s.raiseDay = _br.raises[s.id] || null; if (s.raiseDay) _matched++; }
  // Retrouve l'objectif de chaque ad set via sa campagne (la lecture campagne, elle, renvoie bien l'objectif)
  const campObj = {};
  for (const c of (totalRows || [])) { if (c.campaign_name) campObj[c.campaign_name] = c.objective || ''; }
  const adsets = Object.values(byId);
  for (const a of adsets) { if (!a.objective && a.campaign && campObj[a.campaign]) a.objective = campObj[a.campaign]; }
  // Type de campagne par ad set (pour séparer le ROAS Leads / Candidats / Follow).
  function adsetCat(a) {
    const n = a.campaign || '';
    // ⚠️ « follow » AVANT « LAL » : une campagne follow (ex. « Ads to follow - LAL WORLD », objectif
    // LINK_CLICKS) reste un follow même si son nom contient « LAL » — sinon elle pollue les Candidats.
    if (/follow/i.test(n) || !ACQ_OBJECTIVES.has(a.objective)) return 'follow';
    if (/retarget/i.test(n) || /retgt/i.test(a.name || '')) return 'retgt';
    if (/candidat|LAL/i.test(n)) return 'candidat';
    return 'lead';
  }
  const spendCat = { lead: { today: 0, total: 0 }, candidat: { today: 0, total: 0 }, follow: { today: 0, total: 0 }, retgt: { today: 0, total: 0 } };
  for (const a of adsets) { a.cat = adsetCat(a); spendCat[a.cat].today += a.spendToday; spendCat[a.cat].total += a.spendTotal; }
  const adsetDbg = {
    totalRows: asTotal === null ? 'ERR' : asTotal.length,
    todayRows: asToday === null ? 'ERR' : asToday.length,
    budgetRows: asBudgets === null ? ('ERR:' + (_asBudgetsErr || '?')) : (asBudgets ? asBudgets.length : 0),
    campBudgetRows: asCampBudgets === null ? 'ERR' : (asCampBudgets ? asCampBudgets.length : 0),
    raises: _br.dbg + '/' + _matched + 'matched'
  };

  adsetDbg.currency = curDbg + ':' + acctCur;   // ex "ok:USD" ou "http-400:default-EUR"

  // --- Depense PAR JOUR (devise compte) pour le graphe CA vs Pub : insights niveau compte, time_increment=1 ---
  async function dailySpend() {
    const qs = 'level=account&fields=spend&time_increment=1&limit=500&time_range='
      + encodeURIComponent(JSON.stringify({ since: J1, until: todayISO() }));
    let url = `https://graph.facebook.com/${ver}/${id}/insights?access_token=${encodeURIComponent(token)}&${qs}`;
    const by = {};
    for (let i = 0; i < 12; i++) {
      let r; try { r = await fetch(url); } catch (e) { return by; }
      if (!r.ok) return by;
      const d = await r.json();
      for (const row of (d.data || [])) { if (row.date_start) by[row.date_start] = (by[row.date_start] || 0) + (+row.spend || 0); }
      if (d.paging && d.paging.next) url = d.paging.next; else break;
    }
    return by;
  }
  return {
    currency: acctCur,
    spendByDay,              // depense (devise compte) par jour, pour le graphe CA vs Pub
    today: t.total, todayAcq: t.acq,
    total: g.total, totalAcq: g.acq,
    breakdown: g.breakdown,  // detail cumul par campagne (transparence)
    adsets,                  // detail par ad set (pour le ROAS par pays)
    adDetail: adList,        // detail par AD (créa) : ROAS + leads par créa
    spendCat,                // depense par type de campagne (lead/candidat/follow), today+total
    adsetDbg                 // diagnostic de la lecture par ad set
  };
}

// Clics « Live Chat » : lit le compteur agrégé du même Web App Apps Script que les logs du chat
// (CHAT_LOG_URL + CHAT_LOG_TOKEN). Nécessite un doGet(?stats=clicks) côté Apps Script (cf. dashboard).
// Non bloquant : si absent/lent, on renvoie null et la tuile s'affiche « — ».
async function chatClicks() {
  const url = process.env.CHAT_LOG_URL;
  if (!url) return null;
  try {
    const sep = url.indexOf('?') >= 0 ? '&' : '?';
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 6000);   // Apps Script /exec = 1,7–2,9 s (redirect + cold start) → marge large
    const r = await fetch(url + sep + 'stats=clicks&token=' + encodeURIComponent(process.env.CHAT_LOG_TOKEN || ''), { signal: ctl.signal });
    clearTimeout(to);
    if (!r.ok) return null;
    const j = await r.json();
    return (j && !j.error) ? j : null;
  } catch (e) { return null; }
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
    const wantMeta = (req.query && req.query.view) === 'meta';   // onglet Meta Ads -> détail ad-set (lourd) ; sinon léger (pas d'appel /adsets).
    const [charges, leads, candidats, spend, clicks] = await Promise.all([stripeCharges(), brevoContacts(LEAD_LISTS), brevoContacts(CANDIDAT_LISTS), metaSpend({ adsets: wantMeta }), chatClicks()]);

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

    // Candidats Brevo (funnel apply-florence / pubs LAL) : total par langue + nouveaux aujourd'hui
    const candidatsByLang = zeroLang(), newCandidatsToday = zeroLang(), candidatsByCountry = {}, candidatsByLangCountry = {}, candidatsByDay = {};
    let candidatsTotal = 0;
    // --- Split candidat EN en 2 rings (1% = créa en_vX, 1-2% = {{adset.id}}), attribué par UTM_CONTENT, uniquement depuis EN_SPLIT_SINCE ---
    let en12Id = null;
    if (EN_SPLIT_SINCE && spend && Array.isArray(spend.adsets)) {
      const _a12 = spend.adsets.find(a => /en\s*1-2/i.test(a.name || ''));
      if (_a12) en12Id = String(_a12.id);
    }
    const enRing = (cd) => {
      if (!EN_SPLIT_SINCE || !cd || cd.lang !== 'EN' || (cd.created || '') < EN_SPLIT_SINCE) return null;
      const ct = String(cd.content || '');
      if (en12Id && ct === en12Id) return '12';          // 1-2% = tagué avec l'ID de l'ad set
      if (/^en_v\d+/i.test(ct)) return '1';              // 1% = garde ses codes créa en_vX (seul EN LAL à les utiliser après le tag)
      return null;                                        // autre source EN (ManyChat/bio/organique) -> hors rings
    };
    const candidatsByRing = { '1': 0, '12': 0 }, revEURCandidatByRing = { '1': 0, '12': 0 }, candidatConvByRing = { '1': 0, '12': 0 };
    for (const e in candidats) {
      const cd = candidats[e];
      candidatsByLang[cd.lang] = (candidatsByLang[cd.lang] || 0) + 1;
      candidatsTotal++;
      { const _r = enRing(cd); if (_r) candidatsByRing[_r]++; }
      const co = cd.pays || '(inconnu)';
      candidatsByCountry[co] = (candidatsByCountry[co] || 0) + 1;
      const lc = candidatsByLangCountry[cd.lang] || (candidatsByLangCountry[cd.lang] = {});
      lc[co] = (lc[co] || 0) + 1;
      if (cd.created === today) newCandidatsToday[cd.lang] = (newCandidatsToday[cd.lang] || 0) + 1;
      if (cd.created >= J1) candidatsByDay[cd.created] = (candidatsByDay[cd.created] || 0) + 1;
    }

    const paid = charges.filter(c => c.paid && !c.refunded && c.status === 'succeeded');
    const revByCur = {};
    const buckets = { candidat: 0, lead: 0, existant: 0, nouveau: 0 };
    const bucketsToday = { candidat: 0, lead: 0, existant: 0, nouveau: 0 };
    const inscritsByLang = zeroLang(), inscritsTodayByLang = zeroLang();
    const convByDay = {};                 // conversions (leads qui paient) par jour
    const salesByDay = {};                // TOTAL des ventes par jour (tous buckets)
    const salesLeadByDay = {};            // ventes/jour via LEADS (bucket lead)
    const salesCandByDay = {};            // ventes/jour via CANDIDATS (bucket candidat)
    const salesCommByDay = {};            // ventes/jour de la communaute (bucket existant)
    const salesNewByDay = {};             // ventes/jour "nouveaux" (bucket nouveau)
    const revEURByDay = {};               // CA (EUR) par jour, pour le graphe CA vs Pub
    const revEURAdsByDay = {};            // CA (EUR) par jour venant des ads (buckets lead + candidat)
    const firstDate = {};                 // email -> date du 1er paiement (pour cumul artistes)
    const artistAgg = {};                 // email -> { expos, amount, currency, bucket }
    const artists = { first: 0, recurring: 0 };
    const communityBuyers = new Set();    // emails de la communaute existante qui ont paye
    const seenLeadEmail = new Set(), seenArtist = new Set();
    const seenCandidatEmail = new Set();  // candidats uniques ayant paye (pour le taux de transformation)
    const candidatConvByCountry = {};     // pays -> candidats uniques ayant paye
    const candidatConvByLang = zeroLang();     // candidats uniques ayant paye, par langue (table Candidats -> Inscrits)
    const revEURCandidatByLang = zeroLang();   // CA candidat par langue (EUR), pour le ROAS candidats par pays
    const candidatConvByLangCountry = {};      // lang -> pays -> nb convertis
    const revEURCandidatByLangCountry = {};    // lang -> pays -> CA EUR
    const todayRevEUR = { candidat: 0, lead: 0, existant: 0, nouveau: 0 };  // CA du jour par source (EUR)
    let todayRevEURtot = 0;
    const revEURtotByBucket = { candidat: 0, lead: 0, existant: 0, nouveau: 0 };  // CA total par source (EUR) depuis J1
    const revEURByLang = zeroLang();      // CA lead-bucket par langue (EUR), depuis J1 (pour le ROAS par pays)
    const salesBySource = {};             // utm_source du contact -> { paid: payeurs uniques, revEUR } (impact ventes par canal, ex. ManyChat)
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
      const candidat = email && candidats[email];
      let bucket;
      if (candidat) bucket = 'candidat';
      else if (lead) bucket = 'lead';
      else if (h && COMMUNITY.has(h)) bucket = 'existant';
      else bucket = 'nouveau';
      if (candidat && email && !seenCandidatEmail.has(email)) {
        seenCandidatEmail.add(email);
        const cco = candidat.pays || '(inconnu)';
        candidatConvByCountry[cco] = (candidatConvByCountry[cco] || 0) + 1;
        candidatConvByLang[candidat.lang] = (candidatConvByLang[candidat.lang] || 0) + 1;
        const lcv = candidatConvByLangCountry[candidat.lang] || (candidatConvByLangCountry[candidat.lang] = {});
        lcv[cco] = (lcv[cco] || 0) + 1;
        { const _r = enRing(candidat); if (_r) candidatConvByRing[_r]++; }
      }

      const amtEUR = amt * (EUR_RATES[cur] || 0);
      buckets[bucket]++;
      revEURtotByBucket[bucket] += amtEUR;
      salesByDay[date] = (salesByDay[date] || 0) + 1;
      if (bucket === 'lead') salesLeadByDay[date] = (salesLeadByDay[date] || 0) + 1;
      else if (bucket === 'candidat') salesCandByDay[date] = (salesCandByDay[date] || 0) + 1;
      else if (bucket === 'existant') salesCommByDay[date] = (salesCommByDay[date] || 0) + 1;
      else salesNewByDay[date] = (salesNewByDay[date] || 0) + 1;
      revEURByDay[date] = (revEURByDay[date] || 0) + amtEUR;
      if (bucket === 'lead' || bucket === 'candidat') revEURAdsByDay[date] = (revEURAdsByDay[date] || 0) + amtEUR;
      if (date === today) { bucketsToday[bucket]++; todayRevEUR[bucket] += amtEUR; todayRevEURtot += amtEUR; }

      // Attribution ventes par SOURCE (utm_source du contact, Candidat prioritaire puis Lead) -> impact ManyChat & co.
      const _srcC = candidat || lead;
      const _src = (_srcC && _srcC.source) || '';
      const _sb = salesBySource[_src] || (salesBySource[_src] = { paid: 0, revEUR: 0, paidToday: 0, revEURToday: 0, _seen: new Set(), _seenT: new Set() });
      _sb.revEUR += amtEUR;
      if (email && !_sb._seen.has(email)) { _sb._seen.add(email); _sb.paid++; }
      if (date === today) { _sb.revEURToday += amtEUR; if (email && !_sb._seenT.has(email)) { _sb._seenT.add(email); _sb.paidToday++; } }

      if (lead) {
        if (!seenLeadEmail.has(email)) { inscritsByLang[lead.lang]++; seenLeadEmail.add(email); }
        if (date === today) inscritsTodayByLang[lead.lang]++;
        convByDay[date] = (convByDay[date] || 0) + 1;
        revEURByLang[lead.lang] += amtEUR;
      }
      if (candidat) {
        revEURCandidatByLang[candidat.lang] += amtEUR;
        { const _r = enRing(candidat); if (_r) revEURCandidatByRing[_r] += amtEUR; }
        const cco2 = candidat.pays || '(inconnu)';
        const lcr = revEURCandidatByLangCountry[candidat.lang] || (revEURCandidatByLangCountry[candidat.lang] = {});
        lcr[cco2] = (lcr[cco2] || 0) + amtEUR;
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
      rows.push({ date, email, amount: amt, currency: cur, bucket, lang: candidat ? candidat.lang : (lead ? lead.lang : ''), expos });
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));

    // Artistes uniques par jour (1er paiement) -> le front fera le cumul
    const artByDay = {};
    for (const e in firstDate) { const d = firstDate[e]; artByDay[d] = (artByDay[d] || 0) + 1; }

    // Serie quotidienne depuis J1
    const _eurRateSpend = (spend && EUR_RATES[spend.currency]) || 1;   // depense (devise compte) -> EUR pour comparer au CA
    const _spendByDay = (spend && spend.spendByDay) || {};
    const daily = days.map(d => ({
      date: d, leads: leadsByDay[d] || 0, candidats: candidatsByDay[d] || 0,
      conv: convByDay[d] || 0, sales: salesByDay[d] || 0, artists: artByDay[d] || 0,
      salesLead: salesLeadByDay[d] || 0, salesCand: salesCandByDay[d] || 0, salesComm: salesCommByDay[d] || 0, salesNew: salesNewByDay[d] || 0,
      caEUR: Math.round(revEURByDay[d] || 0),                                  // CA du jour en €
      caAdsEUR: Math.round(revEURAdsByDay[d] || 0),                            // CA du jour venant des ads (leads+candidats)
      pubEUR: Math.round((_spendByDay[d] || 0) * _eurRateSpend)               // depense pub du jour en €
    }));

    // CA converti en EUR (indicatif ; devises inconnues/crypto ignorees)
    let revenueEUR = 0; const revIgnored = [];
    for (const cur in revByCur) { const r = EUR_RATES[cur]; if (r) revenueEUR += revByCur[cur] * r; else if (revByCur[cur] > 0) revIgnored.push(cur); }

    // Meta Ads -> ROAS (si dispo)
    let ads = { available: false };
    if (spend) {
      const eurRate = EUR_RATES[spend.currency] || 1;   // devise du compte pub -> EUR
      ads = {
        available: true, currency: spend.currency, eurRate,
        spendToday: Math.round(spend.today), spendTotal: Math.round(spend.total),
        spendTodayAcq: Math.round(spend.todayAcq), spendTotalAcq: Math.round(spend.totalAcq),
        // ROAS sur la depense ACQUISITION (Leads + Conversions) ; Traffic/Follow exclus.
        // Depense (devise compte) convertie en EUR car le CA est en EUR.
        roasToday: spend.todayAcq > 0 ? +(todayRevEURtot / (spend.todayAcq * eurRate)).toFixed(2) : null,
        roasTotal: spend.totalAcq > 0 ? +(revenueEUR / (spend.totalAcq * eurRate)).toFixed(2) : null,
        breakdown: spend.breakdown
      };
    }

    // --- Detail par PAYS (ad sets Leads) : ROAS + reco budget pour scaler ---
    // Attribution du CA par langue de lead Brevo -> pays de l'ad set (IT->Italy, ES->Spain,
    // DE->Germany, FR->France, EN->USA). Depense = somme des ad sets Leads dont le nom matche le pays.
    if (wantMeta && spend) {
      const allAdsets = Array.isArray(spend.adsets) ? spend.adsets : [];
      // Diagnostic (visible dans le dashboard) : ce que Meta renvoie vraiment, pour caler le nommage.
      ads.adsetsCount = allAdsets.length;
      ads.adsetsDbg = spend.adsetDbg || null;
      ads.adsetList = allAdsets
        .map(a => ({ name: a.name, objective: a.objective || '', spend: Math.round(a.spendTotal), budget: a.dailyBudget != null ? Math.round(a.dailyBudget) : null, status: a.status || '' }))
        .sort((x, y) => y.spend - x.spend).slice(0, 60);
      ads.adDetail = Array.isArray(spend.adDetail) ? spend.adDetail : [];

      const COUNTRIES = [
        { key: 'IT', name: 'Leads Italy',   flag: '🇮🇹', lang: 'IT', region: 'Europe',        match: /ital|(?:^|[^a-z])it(?:[^a-z]|$)/i },
        { key: 'ES', name: 'Leads Spain',   flag: '🇪🇸', lang: 'ES', region: 'Europe',        match: /spain|espa|espagn|(?:^|[^a-z])es(?:[^a-z]|$)/i },
        { key: 'DE', name: 'Leads Germany', flag: '🇩🇪', lang: 'DE', region: 'Europe',        match: /german|deutsch|allemagn|(?:^|[^a-z])de(?:[^a-z]|$)/i },
        { key: 'FR', name: 'Leads France',  flag: '🇫🇷', lang: 'FR', region: 'Europe',        match: /france|fran(?:c|ç)ais|frankreich|(?:^|[^a-z])fr(?:[^a-z]|$)/i },
        { key: 'US', name: 'Leads USA',     flag: '🇺🇸', lang: 'EN', region: 'North America', match: /\busa\b|united states|états-?unis|(?:^|[^a-z])us(?:[^a-z]|$)/i }
      ];
      // Pool = ad sets d'objectif Leads si l'objectif est connu ; sinon on prend tous les ad sets.
      // MAIS on exclut toujours les ad sets candidature LAL (campagne séparée) : sinon "Candidatures LAL IT"
      // serait rattaché au pays "IT" et gonflerait à tort le budget / la dépense / le ROAS des Leads.
      const notCand = a => !/candidat|LAL/i.test(a.campaign || '') && !/candidat|LAL/i.test(a.name || '');
      const notRetgt = a => !/retarget/i.test(a.campaign || '') && !/retgt/i.test(a.name || '');
      const anyObj = allAdsets.some(a => a.objective);
      const pool = (anyObj ? allAdsets.filter(a => /LEAD/i.test(a.objective || '')) : allAdsets).filter(notCand).filter(notRetgt);
      const roasRate = EUR_RATES[spend.currency] || 1;   // depense (devise compte) -> EUR pour le ROAS
      // Nb de jours depuis une date 'YYYY-MM-DD' (pour le cooldown, alimenté par l'Activity log Meta).
      const daysSince = (day) => { if (!day) return null; const n = Math.floor((Date.parse(today + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / 86400000); return (n >= 0 && n < 3650) ? n : null; };
      const used = new Set();
      // --- RETARGETING (bas de funnel, public chaud) : section ISOLÉE, exclue de l'acquisition ---
      const RETGT = [
        { key: 'RT_FR', lang: 'FR', flag: '🇫🇷', match: /(^|[^a-z])fr([^a-z]|$)/i, fbBudget: 20 },
        { key: 'RT_EN', lang: 'EN', flag: '🇬🇧', match: /(^|[^a-z])en([^a-z]|$)/i, fbBudget: 20 },
        { key: 'RT_IT', lang: 'IT', flag: '🇮🇹', match: /(^|[^a-z])it([^a-z]|$)/i, fbBudget: 15 },
        { key: 'RT_DE', lang: 'DE', flag: '🇩🇪', match: /(^|[^a-z])de([^a-z]|$)/i, fbBudget: 15 },
        { key: 'RT_ES', lang: 'ES', flag: '🇪🇸', match: /(^|[^a-z])es([^a-z]|$)/i, fbBudget: 15 }
      ];
      const isRetgt = a => /retarget/i.test(a.campaign || '') || /retgt/i.test(a.name || '');
      const retgtAdsets = allAdsets.filter(isRetgt);
      // Match ClicInscription (event d'optimisation, custom pixel) : best-effort v1, à figer via dbg.actionTypes.
      const clicRe = /offsite_conversion\.custom|fb_pixel_custom|clicinscription|complete_registration|submit_application/i;
      const _actAll = {};
      retgtAdsets.forEach(a => { for (const x of (a.actionsTotal || [])) { const k = x.action_type || '?'; _actAll[k] = (_actAll[k] || 0) + (+x.value || 0); } });
      const retgtRows = RETGT.map(rt => {
        const a = retgtAdsets.find(x => rt.match.test(x.name || ''));
        if (!a) return { key: rt.key, lang: rt.lang, flag: rt.flag, name: 'Retgt \u2013 Florence ' + rt.lang, missing: true, spendTotal: 0, spendToday: 0, dailyBudget: rt.fbBudget, clicInsc: 0, freq7: null, raisedDaysAgo: null, status: '' };
        const clicInsc = (a.actionsTotal || []).reduce((s, x) => clicRe.test(x.action_type || '') ? s + (+x.value || 0) : s, 0);
        return {
          key: rt.key, lang: rt.lang, flag: rt.flag, name: a.name,
          spendTotal: Math.round(a.spendTotal), spendToday: Math.round(a.spendToday),
          dailyBudget: a.dailyBudget != null ? Math.round(a.dailyBudget) : rt.fbBudget,
          clicInsc: Math.round(clicInsc),
          freq7: a.freq7 != null ? +(+a.freq7).toFixed(1) : null,
          raisedDaysAgo: daysSince(a.raiseDay),
          status: /ACTIVE/i.test(a.status || '') ? 'ACTIVE' : (a.status ? 'PAUSED' : '')
        };
      });
      ads.retargeting = {
        available: retgtAdsets.length > 0,
        spendTotal: Math.round(retgtAdsets.reduce((s, a) => s + a.spendTotal, 0)),
        spendToday: Math.round(retgtAdsets.reduce((s, a) => s + a.spendToday, 0)),
        clicInscTotal: retgtRows.reduce((s, r) => s + r.clicInsc, 0),
        rows: retgtRows,
        dbg: { count: retgtAdsets.length, actionTypes: _actAll }
      };
      ads.byCountry = COUNTRIES.map(co => {
        const ms = pool.filter(a => co.match.test(a.name || ''));
        ms.forEach(a => used.add(a.id));
        const spT = ms.reduce((s, a) => s + a.spendTotal, 0);
        const spD = ms.reduce((s, a) => s + a.spendToday, 0);
        const bud = ms.reduce((s, a) => s + (a.dailyBudget || 0), 0);
        const rev = revEURByLang[co.lang] || 0;
        const lastRaise = ms.reduce((mx, a) => (a.raiseDay && (!mx || a.raiseDay > mx)) ? a.raiseDay : mx, null);
        const leadsN = leadsByLang[co.lang] || 0;
        const insc = inscritsByLang[co.lang] || 0;
        return {
          key: co.key, name: co.name, flag: co.flag, region: co.region, lang: co.lang,
          status: ms.some(a => /ACTIVE/i.test(a.status || '')) ? 'ACTIVE' : (ms.some(a => a.status) ? 'PAUSED' : ''),
          adsets: ms.map(a => a.name),
          spendTotal: Math.round(spT), spendToday: Math.round(spD),
          dailyBudget: bud > 0 ? Math.round(bud) : null,
          leads: leadsN, inscrits: insc, revEUR: Math.round(rev),
          cpl: leadsN > 0 && spT > 0 ? +(spT / leadsN).toFixed(2) : null,
          convRate: leadsN > 0 ? +(100 * insc / leadsN).toFixed(1) : 0,
          roas: spT > 0 ? +(rev / (spT * roasRate)).toFixed(2) : null,
          lastRaise, raisedDaysAgo: daysSince(lastRaise)
        };
      });
      ads.unmatched = pool.filter(a => !used.has(a.id) && a.spendTotal > 0)
        .map(a => ({ name: a.name, spend: Math.round(a.spendTotal) })).sort((x, y) => y.spend - x.spend);

      // --- ROAS par catégorie : recap total + Leads + Candidats (today + cumul) ---
      const sc = spend.spendCat || { lead: { today: 0, total: 0 }, candidat: { today: 0, total: 0 }, follow: { today: 0, total: 0 } };
      const rr = roasRate;                                   // depense (devise compte) -> EUR
      const roasOf = (caEUR, spendNat) => spendNat > 0 ? +(caEUR / (spendNat * rr)).toFixed(2) : null;
      ads.cat = {
        total: {
          spendToday: Math.round(spend.today), spendTotal: Math.round(spend.total),
          caToday: Math.round(todayRevEURtot), caTotal: Math.round(revenueEUR),
          roasToday: roasOf(todayRevEURtot, spend.today), roasTotal: roasOf(revenueEUR, spend.total)
        },
        lead: {
          spendToday: Math.round(sc.lead.today), spendTotal: Math.round(sc.lead.total),
          caToday: Math.round(todayRevEUR.lead), caTotal: Math.round(revEURtotByBucket.lead),
          roasToday: roasOf(todayRevEUR.lead, sc.lead.today), roasTotal: roasOf(revEURtotByBucket.lead, sc.lead.total)
        },
        candidat: {
          spendToday: Math.round(sc.candidat.today), spendTotal: Math.round(sc.candidat.total),
          caToday: Math.round(todayRevEUR.candidat), caTotal: Math.round(revEURtotByBucket.candidat),
          roasToday: roasOf(todayRevEUR.candidat, sc.candidat.today), roasTotal: roasOf(revEURtotByBucket.candidat, sc.candidat.total)
        },
        follow: { spendToday: Math.round(sc.follow.today), spendTotal: Math.round(sc.follow.total) }
      };

      // --- Ad sets Candidats -> Inscrits (par langue de campagne LAL) ---
      const candPool = allAdsets.filter(a => a.cat === 'candidat');
      const CAND = [
        { key: 'IT', name: 'Candidats Italy',  flag: '🇮🇹', lang: 'IT', match: /ital|(?:^|[^a-z])it(?:[^a-z]|$)/i },
        { key: 'ES', name: 'Candidats Spain',  flag: '🇪🇸', lang: 'ES', match: /spain|espa|(?:^|[^a-z])es(?:[^a-z]|$)/i },
        { key: 'DE', name: 'Candidats DACH',   flag: '🇩🇪', lang: 'DE', match: /german|deutsch|dach|(?:^|[^a-z])de(?:[^a-z]|$)/i },
        { key: 'FR', name: 'Candidats France', flag: '🇫🇷', lang: 'FR', match: /france|fran|(?:^|[^a-z])fr(?:[^a-z]|$)/i },
        { key: 'EN', name: 'Candidats EN',     flag: '🌍', lang: 'EN', match: /english|world|(?:^|[^a-z])en(?:[^a-z]|$)/i }
      ];
      ads.candidatByCountry = CAND.map(co => {
        const ms = candPool.filter(a => co.match.test(a.name || ''));
        const spT = ms.reduce((s, a) => s + a.spendTotal, 0), spD = ms.reduce((s, a) => s + a.spendToday, 0);
        const rev = revEURCandidatByLang[co.lang] || 0;
        const cand = candidatsByLang[co.lang] || 0, insc = candidatConvByLang[co.lang] || 0;
        // Détail par pays (drill-down) : ROAS pays = dépense de l'ad set répartie au prorata des candidats.
        const lc = candidatsByLangCountry[co.lang] || {}, lcv = candidatConvByLangCountry[co.lang] || {}, lcr = revEURCandidatByLangCountry[co.lang] || {};
        const detail = Object.keys(lc).map(country => {
          const cc = lc[country], cv = lcv[country] || 0, rvC = lcr[country] || 0;
          const proxySpend = cand > 0 ? spT * (cc / cand) : 0;
          return { country, candidats: cc, inscrits: cv, convRate: cc > 0 ? +(100 * cv / cc).toFixed(1) : 0, roas: proxySpend > 0 ? +(rvC / (proxySpend * rr)).toFixed(2) : null };
        }).sort((x, y) => (y.inscrits - x.inscrits) || (y.candidats - x.candidats));
        const bud = ms.reduce((s, a) => s + (a.dailyBudget || 0), 0);
        const lastRaise = ms.reduce((mx, a) => (a.raiseDay && (!mx || a.raiseDay > mx)) ? a.raiseDay : mx, null);
        return {
          key: 'CAND_' + co.key, name: co.name, flag: co.flag, lang: co.lang,
          status: ms.some(a => /ACTIVE/i.test(a.status || '')) ? 'ACTIVE' : (ms.some(a => a.status) ? 'PAUSED' : ''),
          spendTotal: Math.round(spT), spendToday: Math.round(spD),
          dailyBudget: bud > 0 ? Math.round(bud) : null,
          candidats: cand, inscrits: insc, revEUR: Math.round(rev),
          cpl: cand > 0 && spT > 0 ? +(spT / cand).toFixed(2) : null,   // coût par candidat
          convRate: cand > 0 ? +(100 * insc / cand).toFixed(1) : 0,
          roas: spT > 0 ? +(rev / (spT * rr)).toFixed(2) : null,
          adsets: ms.map(a => a.name),
          lastRaise, raisedDaysAgo: daysSince(lastRaise),
          detail
        };
      });
      // --- Split du groupe candidat EN en 2 lignes : 1% (créa en_vX) vs 1-2% ({{adset.id}}), fenêtre depuis EN_SPLIT_SINCE ---
      if (EN_SPLIT_SINCE) {
        const _enIdx = ads.candidatByCountry.findIndex(c => c.key === 'CAND_EN');
        if (_enIdx >= 0) {
          const mkRing = (name, reAdset, ring) => {
            const ms = candPool.filter(a => reAdset.test(a.name || ''));
            const spW = ms.reduce((s, a) => s + (a.spendSplit || 0), 0);   // dépense SUR LA FENÊTRE (depuis le tag) -> ROAS comparable
            const spD = ms.reduce((s, a) => s + a.spendToday, 0);
            const bud = ms.reduce((s, a) => s + (a.dailyBudget || 0), 0);
            const rev = revEURCandidatByRing[ring] || 0, cand = candidatsByRing[ring] || 0, insc = candidatConvByRing[ring] || 0;
            const lastRaise = ms.reduce((mx, a) => (a.raiseDay && (!mx || a.raiseDay > mx)) ? a.raiseDay : mx, null);
            return {
              key: 'CAND_EN_' + ring, name, flag: '🌍', lang: 'EN', sinceSplit: EN_SPLIT_SINCE,
              status: ms.some(a => /ACTIVE/i.test(a.status || '')) ? 'ACTIVE' : (ms.some(a => a.status) ? 'PAUSED' : ''),
              spendTotal: Math.round(spW), spendToday: Math.round(spD),
              dailyBudget: bud > 0 ? Math.round(bud) : null,
              candidats: cand, inscrits: insc, revEUR: Math.round(rev),
              cpl: cand > 0 && spW > 0 ? +(spW / cand).toFixed(2) : null,
              convRate: cand > 0 ? +(100 * insc / cand).toFixed(1) : 0,
              roas: spW > 0 ? +(rev / (spW * rr)).toFixed(2) : null,
              adsets: ms.map(a => a.name),
              lastRaise, raisedDaysAgo: daysSince(lastRaise),
              detail: []
            };
          };
          // On GARDE la ligne « Candidats EN » (historique cumulé) et on insère les 2 rings JUSTE APRÈS (fenêtre depuis le tag).
          const _sd = EN_SPLIT_SINCE.slice(8, 10) + '/' + EN_SPLIT_SINCE.slice(5, 7);   // ex "10/09"
          ads.candidatByCountry.splice(_enIdx + 1, 0,
            mkRing('↳ EN 1% (depuis ' + _sd + ')',   /en\s*1%/i,  '1'),
            mkRing('↳ EN 1-2% (depuis ' + _sd + ')', /en\s*1-2/i, '12'));
        }
      }
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

    // Candidats (funnel apply-florence / pubs LAL) : total inscrits vs candidats ayant payé
    const candByCountry = Object.keys(candidatsByCountry).map(function (co) {
      const n = candidatsByCountry[co], cv = candidatConvByCountry[co] || 0;
      return { country: co, count: n, converted: cv, rate: n ? +(100 * cv / n).toFixed(1) : 0 };
    }).sort((a, b) => (b.count - a.count) || (b.converted - a.converted));
    const candidatsSummary = {
      total: candidatsTotal,
      converted: seenCandidatEmail.size,
      rate: candidatsTotal ? +(100 * seenCandidatEmail.size / candidatsTotal).toFixed(1) : 0,
      byLang: candidatsByLang,
      byCountry: candByCountry,
      newToday: newCandidatsToday
    };

    // Ventes par source (utm_source) — impact ManyChat & autres canaux. On retire le Set interne.
    const salesBySourceOut = {};
    for (const s in salesBySource) salesBySourceOut[s] = { paid: salesBySource[s].paid, revEUR: Math.round(salesBySource[s].revEUR), paidToday: salesBySource[s].paidToday, revEURToday: Math.round(salesBySource[s].revEURToday) };

    // Candidats par source (utm_source) — visibilité du canal AVANT tout paiement (ManyChat, bio…)
    const candidatsBySource = {}, candidatsBySourceToday = {};
    for (const em in candidats) {
      const s = (candidats[em] && candidats[em].source) || '';
      candidatsBySource[s] = (candidatsBySource[s] || 0) + 1;
      if (candidats[em] && candidats[em].created === today) candidatsBySourceToday[s] = (candidatsBySourceToday[s] || 0) + 1;
    }

    // Type d'artiste par CANAL d'acquisition, en artistes UNIQUES (pas par paiement) :
    // 1re expo = leads + candidats + nouveaux ; communauté = membres existants (compte avant J1).
    const artistsByBucket = { lead: 0, candidat: 0, existant: 0, nouveau: 0 };
    for (const e in artistAgg) { const b = artistAgg[e].bucket; if (artistsByBucket[b] != null) artistsByBucket[b]++; }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      updated: new Date().toISOString(),
      since: J1, today,
      communaute,
      candidats: candidatsSummary,
      salesBySource: salesBySourceOut,
      candidatsBySource, candidatsBySourceToday,
      florence: {
        payments: paid.length,
        artistsTotal: seenArtist.size,
        revenueByCurrency: revByCur,
        revenueEUR: Math.round(revenueEUR),
        revEURByBucket: { candidat: Math.round(revEURtotByBucket.candidat), lead: Math.round(revEURtotByBucket.lead), existant: Math.round(revEURtotByBucket.existant), nouveau: Math.round(revEURtotByBucket.nouveau) },
        revenueIgnored: revIgnored,
        buckets,
        artistsSplit: artists,
        artistsByBucket,
        conv
      },
      daily,
      topArtists,
      ads,
      clicks,   // clics Live Chat (via Apps Script doGet) ou null

      todayStats: {
        payments: paid.filter(c => new Date(c.created * 1000).toISOString().slice(0, 10) === today).length,
        revenueEUR: Math.round(todayRevEURtot),
        revEURByBucket: { candidat: Math.round(todayRevEUR.candidat), lead: Math.round(todayRevEUR.lead), existant: Math.round(todayRevEUR.existant), nouveau: Math.round(todayRevEUR.nouveau) },
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
