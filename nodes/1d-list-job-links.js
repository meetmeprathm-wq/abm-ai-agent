// SECTION 1 – Job details, Step 1: List Job Links
// Picks the Excelize-related jobs (BIM / VDC / CAD / design / drafting / detailing / coordination)
// from ALL open US roles, so the next node can open each job page and read the full description.
// The overview of ALL jobs (by department, location, month) is built later for free in Merge Job Details.
const MAX_JOBS = 5;   // deep-read up to 5 Excelize-related jobs per company

// Excelize-related roles, strongest first (tier 1 = core BIM, 2 = design/drafting, 3 = coordination / digital)
const TIERS = [
  { tier: 1, area: 'BIM / VDC', re: /\b(bim|vdc|revit|virtual design|digital delivery|digital construction|scan[- ]to[- ]bim|point cloud|navisworks)\b/i },
  { tier: 2, area: 'Design / Drafting / Detailing', re: /\b(cad|drafter|draftsman|drafting|designer|design technician|modeler|modeller|detailer|detailing|tekla|plant 3d|civil 3d|autocad|shop drawing)\b/i },
  { tier: 3, area: 'Coordination / Design tech', re: /\b(mep coordinator|design coordinator|coordination|design technology|design technologist|digital practice|computational|reality capture|laser scan)/i }
];
// Not Excelize work even if a keyword matches
const NOT_RELATED = /\b(graphic|web|ux|ui|product designer|instructional|fashion|marketing|brand|landscape maintenance|hair|kitchen designer|floral)\b/i;

function classify(title) {
  const t = String(title || '');
  if (!t || NOT_RELATED.test(t)) return null;
  for (const x of TIERS) if (x.re.test(t)) return { tier: x.tier, area: x.area };
  return null;
}
// Interns / students / apprentices still show BIM need, but are read last (least value for Excelize)
const JUNIOR = /\b(intern|internship|student|co-?op|apprentice|trainee)\b/i;

const linkType = url => !url ? 'none'
  : /linkedin\.com/i.test(url) ? 'linkedin'
  : /myworkdayjobs|workday/i.test(url) ? 'workday'
  : /indeed\./i.test(url) ? 'indeed'
  : /greenhouse|lever\.co|ashby|icims|bamboohr|paylocity|adp|ultipro|jobvite|smartrecruiters|ourcareerpages|applytojob|workable/i.test(url) ? 'careers_ats'
  : 'company_site';

const out = [];

$input.all().forEach((item, ci) => {
  const c = item.json;
  const pool = [].concat(Array.isArray(c.bim_jobs) ? c.bim_jobs : [], Array.isArray(c.all_jobs) ? c.all_jobs : []);

  // Dedupe by link, then by title + city
  const seen = new Set();
  const related = [];
  pool.forEach(j => {
    const cls = classify(j.title);
    if (!cls) return;
    const k1 = j.url ? 'u:' + j.url : null;
    const k2 = 't:' + String(j.title).toLowerCase() + '|' + String(j.city || '').toLowerCase();
    if ((k1 && seen.has(k1)) || seen.has(k2)) return;
    if (k1) seen.add(k1);
    seen.add(k2);
    related.push(Object.assign({}, j, cls, { junior: JUNIOR.test(j.title) }));
  });

  // Experienced roles first, then core BIM first, then oldest posting first (open longest = biggest pain)
  related.sort((a, b) => (a.junior - b.junior) || a.tier - b.tier || String(a.posted_at || '').localeCompare(String(b.posted_at || '')));
  const pick = related.slice(0, MAX_JOBS);

  if (!pick.length) {
    // Keep the chain going: Claude will search the careers page / web for related jobs
    out.push({ json: { company_index: ci, company: c.name, job_index: -1, title: null, url: c.website || null,
      has_link: false, link_type: 'none', related_total: 0 } });
    return;
  }

  pick.forEach((j, ji) => {
    out.push({ json: {
      company_index: ci,
      company: c.name,
      job_index: ji,
      title: j.title,
      area: j.area,
      tier: j.tier,
      junior: j.junior,
      url: j.url || c.website || null,
      has_link: !!j.url,
      link_type: linkType(j.url),
      city: j.city || null,
      state: j.state || null,
      posted_at: j.posted_at || null,
      related_total: related.length
    }});
  });
});

return out;
