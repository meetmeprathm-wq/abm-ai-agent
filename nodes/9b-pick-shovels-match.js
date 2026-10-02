// A4 Permit activity – Step 2: Pick Shovels Match (free – no API call)
// Checks the Shovels result is really OUR company before any permit credits are spent.
// Accept: website match (exact domain), or a name match that contains the full company name
//         (e.g. "ACME CORPORATION") — never an individual or a look-alike ("ACME JOHN DOE").
// Output: one item per company with shovels.match (or null) and shovels.permits_url (free URL when no match).

const companies = $('Prep Shovels').all();
const byWebsite = $('Shovels – Contractor').all();
const byName = $input.all();                       // Shovels – Contractor by Name

const ENTITY = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LLC|L L C|LTD|LIMITED|LP|LLP|PLLC|PC|GROUP|HOLDINGS|ENTERPRISES|CONSTRUCTION|CONSTRUCTORS|CONTRACTORS|CONTRACTING|BUILDERS|SERVICES)\b/g;
const norm = s => ' ' + String(s || '').toUpperCase().replace(/&/g, ' AND ').replace(/^\s*THE\s+/, '').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
const core = s => norm(s).replace(ENTITY, ' ').replace(/\s+/g, ' ').trim();
const domainOf = s => String(s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

function verify(cand, sh, companyName) {
  if (!cand) return { ok: false, why: 'Not found in Shovels' };
  const names = [cand.name, cand.business_name, cand.dba].filter(Boolean);
  const site = domainOf(cand.website);
  if (site && sh.domain && site === sh.domain) return { ok: true, why: 'Website matches (' + site + ')' };
  const want = norm(sh.search_name);                       // e.g. " ACME CORPORATION "
  const wantCore = core(companyName);                      // e.g. "ACME"
  const hasEntity = want.trim() !== core(sh.search_name);  // search name includes an entity word
  for (const n of names) {
    if (hasEntity && norm(n).includes(want)) return { ok: true, why: 'Name matches (' + n + ')' };
    if (!hasEntity && wantCore.length >= 3 && core(n) === wantCore) return { ok: true, why: 'Name matches exactly (' + n + ')' };
  }
  return { ok: false, why: 'Shovels returned "' + (cand.name || cand.business_name) + '" – not the same company, ignored' };
}

const out = [];

companies.forEach((item, i) => {
  const c = item.json || {};
  const sh = Object.assign({}, c.shovels || {});
  const web = ((byWebsite[i] && byWebsite[i].json && byWebsite[i].json.items) || [])[0] || null;
  const nam = ((byName[i] && byName[i].json && byName[i].json.items) || [])[0] || null;

  let match = null, match_note = null, credits = 0;
  if (!sh.check) {
    match_note = sh.reason || 'Not checked';
  } else {
    if (web) credits++;
    if (nam) credits++;
    const v1 = verify(web, sh, c.name);
    const v2 = v1.ok ? v1 : verify(nam, sh, c.name);
    const pick = v1.ok ? web : (v2.ok ? nam : null);
    match_note = v1.ok ? v1.why : v2.why;
    if (!web && !nam) match_note = 'Not found in Shovels (' + (sh.geo_id || 'HQ state') + ', last 12 months)';
    if (pick) {
      const a = pick.address || {};
      match = {
        id: pick.id,
        name: pick.business_name || pick.name,
        website: pick.website || null,
        license: pick.license || null,
        classification: pick.classification_derived || pick.classification || null,
        permit_count: typeof pick.permit_count === 'number' ? pick.permit_count : null,
        total_job_value_cents: typeof pick.total_job_value === 'number' ? pick.total_job_value : null,
        avg_job_value_cents: typeof pick.avg_job_value === 'number' ? pick.avg_job_value : null,
        status_tally: pick.status_tally || {},
        tag_tally: pick.tag_tally || {},
        employee_count: pick.employee_count || null,
        revenue: pick.revenue || null,
        city: a.city || null,
        state: a.state || null,
        matched_by: v1.ok ? 'website' : 'name'
      };
    }
  }

  sh.match = match;
  sh.match_note = match_note;
  sh.lookup_credits = credits;
  sh.permits_url = match
    ? sh.permits_base_url + '&contractor_name=' + encodeURIComponent(match.name)
    : sh.free_url;

  out.push({ json: Object.assign({}, c, { shovels: sh }) });
});

return out;
