// SECTION 1 – Job details, Step 5: Merge Job Details (free – no API call)
// Reads Claude's in-depth job reading (Job Research), joins it back to each company,
// and adds an overview of ALL open roles (by department, by location, by month).
// Output: one item per company, ready for Apollo Buying Signals.

const companies = $('Build Job Prompt').all();   // one item per company (same order as Job Research)
const replies = $input.all();                     // Job Research results

// ---------- helpers ----------
function readReply(res) {
  // Use only the "text" blocks (skip "thinking" / tool blocks), then pull out the JSON
  const blocks = Array.isArray(res && res.content) ? res.content : [];
  const text = blocks.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n');
  if (!text) return { data: null, error: res && res.error ? 'Job Research failed: ' + (res.error.message || JSON.stringify(res.error)) : 'Empty reply from Claude' };
  let t = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a === -1 || b <= a) return { data: null, error: 'No JSON found in the reply' };
  t = t.slice(a, b + 1);
  try { return { data: JSON.parse(t), error: null }; }
  catch (e) {
    try { return { data: JSON.parse(t.replace(/,\s*([}\]])/g, '$1')), error: null }; }   // remove trailing commas
    catch (e2) { return { data: null, error: 'Could not read the JSON: ' + e2.message }; }
  }
}

const list = v => (Array.isArray(v) ? v : (v ? [v] : []))
  .filter(x => x && !/^not (stated|mentioned|found)$/i.test(String(x).trim()));

// Software names: "Revit MEP" → Revit, "AutoCAD (preferred)" → AutoCAD, "BIM 360 / ACC" → BIM 360 / ACC
const SOFTWARE_NAMES = [
  [/revit/i, 'Revit'], [/autocad|\bcad\b/i, 'AutoCAD'], [/navisworks/i, 'Navisworks'],
  [/bim ?360|construction cloud|\bacc\b/i, 'BIM 360 / ACC'], [/bluebeam/i, 'Bluebeam'],
  [/civil ?3d/i, 'Civil 3D'], [/plant ?3d/i, 'Plant 3D'], [/tekla/i, 'Tekla'], [/recap/i, 'ReCap'],
  [/microsoft office|ms office|excel|word/i, 'Microsoft Office']
];
const softwareName = x => {
  const raw = String(x).replace(/\(.*?\)/g, '').trim();
  for (const [re, name] of SOFTWARE_NAMES) if (re.test(raw)) return name;
  return raw;
};
const str = v => (v === undefined || v === null || v === '') ? 'Not stated' : String(v);
const fmtMonth = d => new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
const place = j => [j.city, j.state].filter(Boolean).join(', ') || (j.state || 'Location not listed');

// Departments for the all-jobs overview (first match wins, top to bottom)
const DEPARTMENTS = [
  ['Design / BIM / CAD', /\b(bim|vdc|revit|cad|autocad|draft(er|sman|sperson|ing)?|designer|model(l)?er|detailer|tekla|virtual design|digital (delivery|construction)|scan|point cloud|navisworks)\b/i],
  ['Engineering',        /\b(engineer|engineering|\bEIT\b|\bPE\b|structural|mechanical|electrical|civil|plumbing|fire protection)\b/i],
  ['Project management', /\b(project manager|project engineer|project coordinator|program manager|superintendent|\bPM\b|construction manager|project executive|scheduler)\b/i],
  ['Estimating',         /\b(estimat|preconstruction|pre-construction|cost)\b/i],
  ['Safety & quality',   /\b(safety|quality|\bQA\b|\bQC\b|inspector|commissioning)\b/i],
  ['Field & craft',      /\b(foreman|electrician|plumber|pipefitter|carpenter|laborer|operator|technician|installer|welder|journeyman|apprentice|helper|field)\b/i],
  ['Sales & business development', /\b(sales|business development|account (manager|executive)|marketing|proposal)\b/i],
  ['Office / HR / IT / Finance',   /\b(hr|human resources|recruit|talent|accountant|accounting|payroll|finance|admin|administrative|receptionist|office|it |information technology|systems|help desk|controller)\b/i]
];
const deptOf = title => { for (const [name, re] of DEPARTMENTS) if (re.test(title || '')) return name; return 'Other'; };

function overview(allJobs) {
  const jobs = Array.isArray(allJobs) ? allJobs : [];
  const byDept = {}, byLoc = {}, byMonth = {};
  jobs.forEach(j => {
    const d = deptOf(j.title);
    (byDept[d] = byDept[d] || []).push(j.title);
    const l = place(j);
    byLoc[l] = (byLoc[l] || 0) + 1;
    if (j.posted_at) {
      const k = new Date(j.posted_at).toISOString().slice(0, 7);   // yyyy-mm, for sorting
      byMonth[k] = (byMonth[k] || 0) + 1;
    }
  });
  const departments = Object.keys(byDept).sort((a, b) => byDept[b].length - byDept[a].length)
    .map(d => ({ department: d, count: byDept[d].length, share_pct: Math.round(byDept[d].length / Math.max(jobs.length, 1) * 100), titles: byDept[d].slice(0, 6) }));
  const locations = Object.keys(byLoc).sort((a, b) => byLoc[b] - byLoc[a]).map(l => ({ location: l, count: byLoc[l] }));
  const months = Object.keys(byMonth).sort().map(k => ({ month: fmtMonth(k + '-15'), count: byMonth[k] }));
  return { total: jobs.length, departments, locations, months };
}

// ---------- merge ----------
const out = [];

companies.forEach((item, i) => {
  const c = item.json || {};
  const res = (replies[i] && replies[i].json) || {};
  const pages = Array.isArray(c.job_pages) ? c.job_pages : [];

  let data = null, jobs_error = null;
  if (!pages.length && !c.jobs_prompt) {
    jobs_error = 'No Excelize-related job links to read';
  } else {
    const r = readReply(res);
    data = r.data; jobs_error = r.error;
  }
  const replyJobs = data && Array.isArray(data.jobs) ? data.jobs : [];

  // 1. In-depth table: one row per Excelize-related job (Claude's reading + our link data)
  const job_details = pages.map((p, n) => {
    const r = replyJobs.find(x => Number(x.job) === n + 1) || replyJobs[n] || {};
    const found = r.description_found === true || (r.description_found !== false && p.page_status === 'read' && !!r.summary);
    return {
      job: n + 1,
      title: r.title || p.title,
      area: p.area || null,
      tier: p.tier || null,
      posted_at: p.posted_at || null,
      posted: p.posted_at ? new Date(p.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not stated',
      url: p.url || null,
      source: r.source || (p.page_status === 'read' ? 'Company careers page' : 'Not found'),
      source_url: r.source_url || p.url || null,
      description_found: found,
      location: r.location || place(p),
      work_mode: str(r.work_mode),
      employment_type: str(r.employment_type),
      seniority: str(r.seniority),
      experience_years: str(r.experience_years),
      education: str(r.education),
      software: list(r.software),
      revit: str(r.revit === undefined ? null : r.revit),
      bim_work: list(r.bim_work),
      lod: str(r.lod),
      disciplines: list(r.disciplines),
      sectors: list(r.sectors),
      certifications: list(r.certifications),
      salary: str(r.salary),
      urgency: str(r.urgency),
      summary: r.summary || (found ? 'Not stated' : 'Job description could not be found'),
      excelize_fit: list(r.excelize_fit),
      pitch_angle: r.pitch_angle || null
    };
  });

  // 2. Quick totals across the in-depth jobs
  const read = job_details.filter(j => j.description_found);
  const revitRequired = read.filter(j => /required/i.test(j.revit)).length;
  const revitAny = read.filter(j => /required|preferred/i.test(j.revit)).length;
  const tally = arr => { const t = {}; arr.forEach(x => { const k = String(x).trim(); if (k) t[k] = (t[k] || 0) + 1; }); return Object.keys(t).sort((a, b) => t[b] - t[a]).map(k => ({ name: k, count: t[k] })); };
  // Count each software once per job; "required" if at least one job lists it without "(preferred)"
  const swCount = {}, swRequired = {};
  read.forEach(j => {
    const seen = {};
    j.software.forEach(x => {
      const n = softwareName(x);
      if (!n) return;
      if (!/preferred|plus|nice to have/i.test(x)) swRequired[n] = true;
      if (seen[n]) return;
      seen[n] = true;
      swCount[n] = (swCount[n] || 0) + 1;
    });
  });
  const software_used = Object.keys(swCount).sort((a, b) => swCount[b] - swCount[a])
    .map(n => ({ name: n, jobs: swCount[n], of: read.length, need: swRequired[n] ? 'Required' : 'Preferred' }));
  const disciplines_hiring = tally([].concat(...read.map(j => j.disciplines)));
  const services_needed = tally([].concat(...read.map(j => j.excelize_fit)));
  const urgent = read.filter(j => j.urgency && j.urgency !== 'Not stated').map(j => j.title + ': ' + j.urgency);

  // 2b. Location check: Apollo sometimes gives every job the same wrong city
  // (e.g. "Smallville" for jobs the ad itself places in Springfield, PA, their HQ).
  // When the job ad we read names a different city that IS one of their offices, trust the ad.
  const snapT = ((c.snapshot && c.snapshot.offices && c.snapshot.offices.value) || '') + ' ' + ((c.snapshot && c.snapshot.hq_address && c.snapshot.hq_address.value) || '');
  const normC = x => ' ' + String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  const isOffice = city => !!city && normC(snapT).includes(normC(city));
  const cityFix = {};
  read.forEach(d => {
    const aj = [].concat(c.all_jobs || [], c.bim_jobs || []).find(j => j.url && j.url === d.url);
    const adCity = String(d.location || '').split(',')[0].trim();
    if (!aj || !aj.city || !adCity || /remote|not stated|multiple|various/i.test(adCity)) return;
    if (normC(aj.city) !== normC(adCity) && !isOffice(aj.city) && isOffice(adCity)) cityFix[aj.city] = adCity;
  });
  const fixCity = list => Array.isArray(list) ? list.map(j => cityFix[j.city] ? Object.assign({}, j, { city: cityFix[j.city], city_apollo: j.city }) : j) : list;
  const job_location_note = Object.keys(cityFix).length
    ? 'Apollo listed ' + Object.keys(cityFix).map(k => k + ' → job ad says ' + cityFix[k]).join('; ') + ' (job ad used)' : null;
  if (job_location_note) { c.all_jobs = fixCity(c.all_jobs); c.bim_jobs = fixCity(c.bim_jobs); }

  // 3. Overview of ALL open roles (not only Excelize-related)
  const all_jobs_overview = overview(c.all_jobs);
  const designDept = all_jobs_overview.departments.find(d => d.department === 'Design / BIM / CAD');
  const topDept = all_jobs_overview.departments[0];
  const topLoc = all_jobs_overview.locations[0];

  const jobs_intro = pages.length
    ? all_jobs_overview.total + ' open roles in total; ' + (designDept ? designDept.count : 0) + ((designDept ? designDept.count : 0) === 1 ? ' is a design / BIM / CAD role' : ' are design / BIM / CAD roles') +
      (topDept && topDept.department !== 'Design / BIM / CAD' ? ' (largest group: ' + topDept.department + ', ' + topDept.count + ')' : '') +
      (topLoc ? '; most hiring in ' + topLoc.location + ' (' + topLoc.count + ')' : '') + '. ' +
      'We read ' + read.length + ' of ' + job_details.length + ' Excelize-related job descriptions in depth' +
      (read.length ? ': Revit is required in ' + revitRequired + ' of ' + read.length : '') + '.'
    : all_jobs_overview.total + ' open roles in total; no Excelize-related job links to read.';

  // 4. Cost of the Job Research call
  const u = res.usage || {};
  const searches = (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
  const jobs_cost_usd = Math.round((((u.input_tokens || 0) * 2 + (u.output_tokens || 0) * 10) / 1e6 + searches * 0.01) * 1000) / 1000;

  // 5. Remove working fields, keep the rest
  const rest = Object.assign({}, c);
  delete rest.jobs_prompt;
  delete rest.jobs_use_web;
  delete rest.job_pages;      // same jobs now live in job_details

  out.push({
    json: Object.assign(rest, {
      job_details,
      jobs_intro,
      jobs_takeaway: (data && data.hiring_takeaway) || null,
      best_pitch: (data && data.best_pitch) || null,
      jobs_read: read.length,
      jobs_revit_required: revitRequired,
      jobs_revit_any: revitAny,
      software_used,
      disciplines_hiring,
      services_needed,
      urgent_jobs: urgent,
      all_jobs_overview,
      all_jobs: c.all_jobs,
      bim_jobs: c.bim_jobs,
      job_location_note,
      jobs_error,
      jobs_web_searches: searches,
      jobs_cost_usd,
      // research_cost_usd is what Merge Signals adds to later, so the job cost is carried into the final total
      research_cost_usd: Math.round(((c.research_cost_usd || 0) + jobs_cost_usd) * 1000) / 1000,
      total_cost_usd: Math.round(((c.total_cost_usd || c.research_cost_usd || 0) + jobs_cost_usd) * 1000) / 1000
    })
  });
});

return out;
