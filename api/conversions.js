// Vercel Serverless Function — Dashboard conversions LIVE.
// Croise les PAIEMENTS Stripe avec les LEADS Brevo, ventilé par segment/langue.
//
// Variables d'env (Vercel) :
//   STRIPE_API_KEY      — clé restreinte Stripe. DOIT avoir "Charges: Read" (en plus de Events: Read).
//   BREVO_API_KEY       — déjà présente.
//   DASHBOARD_PASSWORD  — mot de passe qui protège l'accès (choisi par toi).
//
// Sécurité : la page envoie le mot de passe dans l'en-tête "x-dash-key". Sans lui → 401.
// Aucune donnée n'est accessible sans le mot de passe.

// Listes Brevo des leads Florence (langue). Non secret.
const LEAD_LISTS = { 152: 'FR', 153: 'EN', 154: 'ES', 155: 'IT', 156: 'DE' };

async function stripeCharges(max) {
  const key = process.env.STRIPE_API_KEY;
  let out = [], after = null;
  while (out.length < max) {
    const url = 'https://api.stripe.com/v1/charges?limit=100' + (after ? '&starting_after=' + after : '');
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) throw new Error('Stripe ' + r.status + ' (la clé a-t-elle "Charges: Read" ?)');
    const d = await r.json();
    out = out.concat(d.data || []);
    if (!d.has_more || !d.data || !d.data.length) break;
    after = d.data[d.data.length - 1].id;
  }
  return out.slice(0, max);
}

async function brevoLeads() {
  const key = process.env.BREVO_API_KEY;
  const map = {};
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
        if (e && !map[e]) map[e] = LEAD_LISTS[lid];
      }
      if (cs.length < 500) break;
      off += 500;
    }
  }
  return map;
}

export default async function handler(req, res) {
  if (!process.env.DASHBOARD_PASSWORD || (req.headers['x-dash-key'] || '') !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!process.env.STRIPE_API_KEY || !process.env.BREVO_API_KEY) {
    return res.status(500).json({ error: 'STRIPE_API_KEY / BREVO_API_KEY manquant(s) dans Vercel' });
  }
  try {
    const [charges, leads] = await Promise.all([stripeCharges(300), brevoLeads()]);
    const paid = charges.filter(c => c.paid && !c.refunded && c.status === 'succeeded');

    const revByCur = {};
    const bySeg = { 'Lead FR': 0, 'Lead EN': 0, 'Lead ES': 0, 'Lead IT': 0, 'Lead DE': 0, 'Autre': 0 };
    let convFromLeads = 0;
    const rows = [];

    for (const c of paid) {
      const email = ((c.billing_details && c.billing_details.email) || c.receipt_email || '').trim().toLowerCase();
      const cur = (c.currency || '').toUpperCase();
      const amt = (c.amount || 0) / 100;
      revByCur[cur] = (revByCur[cur] || 0) + amt;
      const lang = email && leads[email];
      const seg = lang ? ('Lead ' + lang) : 'Autre';
      if (lang) convFromLeads++;
      bySeg[seg] = (bySeg[seg] || 0) + 1;
      rows.push({
        date: new Date(c.created * 1000).toISOString().slice(0, 10),
        email, amount: amt, currency: cur, country: (c.billing_details && c.billing_details.address && c.billing_details.address.country) || '',
        segment: seg
      });
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));

    const leadsTotal = Object.keys(leads).length;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      updated: new Date().toISOString(),
      payments: paid.length,
      revenueByCurrency: revByCur,
      leadsTotal,
      convertersFromLeads: convFromLeads,
      conversionRate: leadsTotal ? (100 * convFromLeads / leadsTotal) : 0,
      bySegment: bySeg,
      recent: rows.slice(0, 50)
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
