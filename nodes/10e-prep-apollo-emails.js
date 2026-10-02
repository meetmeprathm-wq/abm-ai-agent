// A5 Relationship history – Step 5: Prep Apollo Emails (free – no API call)
// Builds one Apollo request per (sequenced contact × sequence) so the next HTTP node can read every email we sent:
// delivered, opened (how many times), clicked, replied, bounced, plus subject and send date.
// Apollo can't filter emails by contact, so each request filters by sequence + the contact's name,
// and the next code node keeps only that contact's emails (by contact_id).
// Limit: max 15 requests per company (newest enrolments first). Reading emails costs no Apollo credits.

const BASE = 'https://api.apollo.io/api/v1/emailer_messages/search';
const MAX_PER_COMPANY = 15;

const companies = $input.all();                       // from Zoho History
let engItems = [];
try { engItems = $('Apollo – Engagement').all(); } catch (e) {}

const domainOf = s => String(s || '').toLowerCase().trim()
  .replace(/^\[([^\]]+)\]\([^)]*\)$/, '$1').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[\/?#].*$/, '');

// all Apollo contacts (deduplicated)
const allContacts = [];
const seen = new Set();
engItems.forEach(it => ((it.json && it.json.contacts) || []).forEach(ct => {
  if (ct && ct.id && !seen.has(ct.id)) { seen.add(ct.id); allContacts.push(ct); }
}));

const out = [];

companies.forEach((item, ci) => {
  const c = item.json || {};
  const domain = (c.relationship_prep && c.relationship_prep.domain) || domainOf(c.domain || c.website);
  const contacts = allContacts.filter(ct =>
    (c.org_id && ct.organization_id === c.org_id) ||
    (domain && String(ct.email || '').toLowerCase().endsWith('@' + domain)) ||
    (domain && domainOf((ct.account && ct.account.primary_domain) || '') === domain));

  const pairs = [];
  contacts.forEach(ct => (ct.contact_campaign_statuses || []).forEach(s => {
    if (!s.emailer_campaign_id) return;
    pairs.push({ contact_id: ct.id, contact_name: ct.name || [ct.first_name, ct.last_name].filter(Boolean).join(' '), title: ct.title || null,
      sequence_id: s.emailer_campaign_id, added: s.added_at || null });
  }));
  pairs.sort((a, b) => new Date(b.added || 0) - new Date(a.added || 0));

  pairs.slice(0, MAX_PER_COMPANY).forEach(p => {
    const keyword = String(p.contact_name || '').trim().split(/\s+/).slice(-1)[0] || p.contact_name || '';   // last name works best
    out.push({ json: {
      ci,
      company: c.name || null,
      contact_id: p.contact_id,
      contact_name: p.contact_name,
      title: p.title,
      sequence_id: p.sequence_id,
      skip: false,
      url: BASE + '?emailer_campaign_ids[]=' + p.sequence_id + '&q_keywords=' + encodeURIComponent(keyword) + '&per_page=25&page=1'
    }});
  });
});

// Keep the workflow moving when nobody was ever sequenced: one cheap call, ignored later.
if (!out.length) out.push({ json: { ci: -1, skip: true, url: 'https://api.apollo.io/api/v1/auth/health' } });

return out;
