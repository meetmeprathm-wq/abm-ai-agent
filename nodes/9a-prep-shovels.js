// A4 Permit activity – Step 1: Prep Shovels (free – no API call)
// Decides which companies may use Shovels credits and builds the request URLs.
// Free plan = 500 credits / rolling 30 days; 1 credit = 1 record returned.
// Rules: contractor-type companies only · max 5 companies per run · stop at 450 credits used
//        · contractor lookup size=1 (≤1 credit) · permits only if found, 3 most recent commercial (≤3 credits)
// Companies that are skipped get the free usage URL, so the next HTTP nodes cost nothing for them.
// Lookup order: 1) by website (Shovels – Contractor)  2) by cleaned company name, only if 1 found nothing
//               (Shovels – Contractor by Name, fuller name). Empty searches return 0 records = 0 credits.
//               A strict match check (Pick Shovels Match) runs before any permit credits are spent.

const MONTHLY_STOP = 450;          // keep 50 credits spare for testing
const MAX_PER_RUN = 5;             // companies per run that may use credits
const COST_PER_COMPANY = 4;        // 1 contractor + 3 permits (worst case)
const PERMITS_PER_COMPANY = 3;
const BASE = 'https://api.shovels.ai/v2';
const FREE_URL = BASE + '/usage';  // returns no records → 0 credits

const companies = $('Contact Details').all();
let usage = {};
try { usage = $('Shovels – Usage').first().json || {}; } catch (e) {}
const used = typeof usage.credits_used === 'number' ? usage.credits_used : null;

const STATES = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY' };
const CODES = new Set(Object.values(STATES));
const stateCode = c => {
  const tries = [c.state, c.snapshot && c.snapshot.hq_address && c.snapshot.hq_address.value];
  for (const t of tries) {
    const s = String(t || '').trim();
    if (!s) continue;
    if (CODES.has(s.toUpperCase())) return s.toUpperCase();
    const low = s.toLowerCase();
    const name = Object.keys(STATES).sort((a, b) => b.length - a.length).find(n => new RegExp('\\b' + n + '\\b').test(low));
    if (name) return STATES[name];
    const m = s.match(/,\s*([A-Z]{2})\b/);
    if (m && CODES.has(m[1])) return m[1];
  }
  return null;
};

// Contractor-type = builds things (pulls permits). Engineering / architecture firms rarely pull permits → skipped.
const CONTRACTOR = /\b(general contract\w*|contractor|construction (company|services|manag\w*)|design[\s-]build|builder|subcontract\w*|fabricat\w*|installer|installation|erector|self[\s-]perform\w*)\b/i;
const DESIGN_FIRM = /\b(engineering|engineers|architect\w*|design firm|consult\w*|planning)\b/i;
const isContractor = c => {
  const snap = c.snapshot || {};
  const industry = String((snap.industry && snap.industry.value) || '');
  const what = String((snap.what_they_do && snap.what_they_do.value) || '');
  const kw = (c.apollo_keywords || []).join(', ');
  if (CONTRACTOR.test(what) || CONTRACTOR.test(kw)) return true;
  if (/\bconstruction\b/i.test(industry) && !DESIGN_FIRM.test(what)) return true;
  return false;
};

const fmt = d => d.toISOString().slice(0, 10);
const to = new Date();
const from = new Date(); from.setFullYear(from.getFullYear() - 1);
// Fuller name keeps the entity word so individuals and look-alikes don't match:
// "The Acme Corporation" → "Acme Corporation"; "Example Builders, Inc." → "Example Builders Inc"
const cleanName = n => String(n || '')
  .replace(/&/g, ' and ')
  .replace(/^\s*the\s+/i, '')
  .replace(/[.,()"']/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim();
const domainOf = c => String(c.domain || c.website || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

let planned = 0;
const out = [];

companies.forEach(item => {
  const c = item.json || {};
  const geo = stateCode(c);
  const domain = domainOf(c);
  let reason = null;

  if (used === null) reason = 'Not checked (Shovels usage unavailable)';
  else if (usage.is_over_limit) reason = 'Not checked (monthly Shovels limit)';
  else if (!isContractor(c)) reason = 'Not a contractor – engineering and architecture firms rarely pull permits; see A3';
  else if (!domain) reason = 'Not checked (no company website)';
  else if (!geo) reason = 'Not checked (HQ state unknown)';
  else if (planned >= MAX_PER_RUN) reason = 'Not checked (run limit of ' + MAX_PER_RUN + ' companies)';
  else if (used + (planned + 1) * COST_PER_COMPANY > MONTHLY_STOP) reason = 'Not checked (monthly Shovels limit – ' + used + ' of 500 credits used)';

  const check = !reason;
  if (check) planned++;

  const contractorUrl = check
    ? BASE + '/contractors/search?geo_id=' + geo + '&permit_from=' + fmt(from) + '&permit_to=' + fmt(to) +
      '&contractor_website=' + encodeURIComponent(domain) + '&size=1'
    : FREE_URL;
  const name = cleanName(c.name);
  const nameUrl = check && name.length >= 3
    ? BASE + '/contractors/search?geo_id=' + geo + '&permit_from=' + fmt(from) + '&permit_to=' + fmt(to) +
      '&contractor_name=' + encodeURIComponent(name) + '&size=1'
    : FREE_URL;
  const permitsBase = BASE + '/permits/search?geo_id=' + (geo || '') + '&permit_from=' + fmt(from) + '&permit_to=' + fmt(to) +
    '&property_type=commercial&size=' + PERMITS_PER_COMPANY;

  out.push({ json: Object.assign({}, c, {
    shovels: {
      check,
      reason,
      geo_id: geo,
      domain,
      window: fmt(from) + ' to ' + fmt(to),
      credits_used_before: used,
      contractor_url: contractorUrl,
      search_name: name,
      contractor_name_url: nameUrl,
      permits_base_url: permitsBase,
      free_url: FREE_URL
    }
  })});
});

return out;
