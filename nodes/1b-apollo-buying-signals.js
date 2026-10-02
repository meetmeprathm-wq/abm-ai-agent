// SECTION 2 – Step 1: Apollo Buying Signals (free – uses data we already have)
// Uses job_details / software_used from Merge Job Details when present.
// Signals: Unfilled BIM role · Revit-heavy hiring · City hiring push · Headcount · Autodesk tools · BIM-tagged firm · Right project mix

const NO_DATA = 'No data found';
const ACTIVE_DAYS = 180;
const DAY = 86400000;
const now = Date.now();

// ---------- lookups (match by org id / domain, never by position) ----------
const snapMap = {};
$('Apollo – Company Snapshot').all().forEach(it => {
  const o = (it.json && (it.json.organization || it.json)) || {};
  if (o.id) snapMap['id:' + o.id] = o;
  if (o.primary_domain) snapMap['d:' + String(o.primary_domain).toLowerCase()] = o;
});
const jobsMap = {};
try {
  $('Real US BIM Jobs').all().forEach(it => { if (it.json.org_id) jobsMap[it.json.org_id] = it.json; });
} catch (e) {}

// ---------- helpers ----------
const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtMonth = d => new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
const monthSpan = (a, b) => {
  const A = new Date(a), B = new Date(b);
  if (fmtMonth(A) === fmtMonth(B)) return fmtMonth(B);
  const m = x => x.toLocaleDateString('en-US', { month: 'short' });
  return A.getFullYear() === B.getFullYear() ? m(A) + '–' + m(B) + ' ' + B.getFullYear() : fmtMonth(A) + '–' + fmtMonth(B);
};
const daysAgo = d => Math.floor((now - new Date(d).getTime()) / DAY);
const pct = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(1) + '%';
const uniq = a => [...new Set(a)];
const cleanTitle = (title, city) => {
  let t = String(title || '')
    .replace(/&amp;/g, '&')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(full[\s-]?time|part[\s-]?time|remote|hybrid|on[\s-]?site)\b/gi, ' ');
  if (city) t = t.replace(new RegExp('[-–,|@]?\\s*' + city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(,\\s*[A-Z]{2})?\\s*$', 'i'), ' ');
  t = t.replace(/\s[-–|]\s[A-Za-z .]+,\s*[A-Z]{2}\s*$/, ' ');   // " - Los Angeles, CA"
  t = t.replace(/,\s*[A-Za-z .]+,\s*[A-Z]{2}\s*$/, ' ');          // ", St. Louis, MO"
  t = t.replace(/[-–|]\s*remote\s*$/i, ' ');
  return t.replace(/[-–,|]\s*$/, '').replace(/\s{2,}/g, ' ').trim();
};
// dedupe same title + city, keep newest; keep only active posts
const prepJobs = list => {
  const best = {};
  (list || []).forEach(j => {
    const title = cleanTitle(j.title, j.city);
    if (!title) return;
    if (j.posted_at && daysAgo(j.posted_at) > ACTIVE_DAYS) return;
    const key = (title + '|' + (j.city || j.state || '')).toLowerCase();
    const cur = best[key];
    if (!cur || new Date(j.posted_at || 0) > new Date(cur.posted_at || 0)) best[key] = Object.assign({}, j, { title });
  });
  return Object.values(best).sort((a, b) => new Date(b.posted_at || 0) - new Date(a.posted_at || 0));
};
const place = j => j.city || j.state || 'Unknown';
const sig = (key, label, found, evidence, source, source_url, strength) =>
  ({ key, label, found: found ? 'Yes' : 'No', evidence: evidence || NO_DATA, source: found ? source : 'None', source_url: found ? (source_url || null) : null, strength: found ? strength : 'Not found' });

const JUNIOR = /\b(intern|internship|student|co-?op|apprentice|trainee)\b/i;
const SENIOR = /\b(senior|sr\.?|lead|manager|director|head)\b/i;
const DESIGN_ROLE = /\b(revit|autocad|cad|bim|vdc|model(l)?er|draft(er|sman|sperson|ing)?|designer|detailer)\b/i;

const out = [];

$input.all().forEach(item => {
  const c = item.json || {};
  const snap = c.snapshot || {};
  const o = snapMap['id:' + c.org_id] || snapMap['d:' + String(c.domain || '').toLowerCase()] || {};
  const allRaw = c.all_jobs || (jobsMap[c.org_id] && jobsMap[c.org_id].all_jobs) || c.bim_jobs || [];

  const bimJobs = prepJobs(c.bim_jobs);
  const allJobs = prepJobs(allRaw);
  const signals = [];

  // Job descriptions read in depth (from Merge Job Details), matched by title
  const details = Array.isArray(c.job_details) ? c.job_details.filter(j => j.description_found) : [];
  const normTitle = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const detailFor = j => details.find(d => normTitle(d.title) === normTitle(j.title)) || null;
  const isUrgent = d => d && d.urgency && d.urgency !== 'Not stated';

  // 1. Unfilled BIM role — oldest real BIM role still open (interns / students ranked out)
  {
    const real = bimJobs.filter(j => !JUNIOR.test(j.title));
    const juniors = bimJobs.length - real.length;
    const pool = real.length ? real : bimJobs;
    const dated = pool.filter(j => j.posted_at);
    const oldest = dated.slice().sort((a, b) => new Date(a.posted_at) - new Date(b.posted_at))[0] || pool[0];
    let ev = null, str = 'Low', url = null, source = 'Apollo';
    if (oldest) {
      const d = oldest.posted_at ? daysAgo(oldest.posted_at) : null;
      ev = oldest.title + ' (' + place(oldest) + ')' + (d !== null ? ', open since ' + fmtDate(oldest.posted_at) + ' – ' + d + ' days' : ', open date not listed');
      str = d === null ? 'Low' : d >= 90 ? 'High' : d >= 30 ? 'Medium' : 'Low';
      url = oldest.url || null;
      if (real.length > 1) ev += '; ' + real.length + ' BIM roles open';
      if (juniors) ev += (real.length ? ' (plus ' + juniors + ' intern / student role' + (juniors > 1 ? 's' : '') + ')' : '; intern / student role only');
      const senior = real.filter(j => SENIOR.test(j.title));
      if (senior.length) ev += '; includes senior role: ' + senior[0].title;
      const det = detailFor(oldest);
      if (det) {
        const bits = [];
        if (/required/i.test(det.revit)) bits.push('Revit required');
        if (det.experience_years && det.experience_years !== 'Not stated') bits.push(det.experience_years + ' yrs');
        if (isUrgent(det)) bits.push('overtime / deadline pressure mentioned');
        if (bits.length) ev += '; job ad: ' + bits.join(', ');
        source = 'Apollo + job ad';
      }
      const urgentBim = real.some(j => isUrgent(detailFor(j)));
      if (real.length >= 3 || senior.length || (real.length >= 2 && urgentBim)) str = 'High';
      else if (real.length >= 2 && str === 'Low') str = 'Medium';
      if (!real.length) str = 'Low';
    }
    signals.push(sig('unfilled_bim_role', 'Unfilled BIM role', bimJobs.length > 0, ev, source, url, str));
  }

  // 2. Revit-heavy hiring — design / CAD / BIM share of all open roles + what the job ads ask for
  {
    const design = allJobs.filter(j => DESIGN_ROLE.test(j.title));
    const n = allJobs.length, k = design.length;
    let str = 'Low';
    if (k >= 3 && k / Math.max(n, 1) >= 0.5) str = 'High'; else if (k >= 2) str = 'Medium';
    const tally = {};
    design.forEach(j => { tally[j.title] = (tally[j.title] || 0) + 1; });
    const names = Object.keys(tally).sort((a, b) => tally[b] - tally[a]).slice(0, 3).map(t => tally[t] > 1 ? t + ' ×' + tally[t] : t).join('; ');
    let ev = k ? n + ' open ' + (n === 1 ? 'role' : 'roles') + '; ' + k + (k === 1 ? ' is a design / CAD / BIM role (' : ' are design / CAD / BIM roles (') + names + ')' : null;
    let source = 'Apollo';
    if (details.length) {
      const req = details.filter(d => /required/i.test(d.revit)).length;
      const urgent = details.filter(isUrgent).length;
      const add = 'job ads read: Revit required in ' + req + ' of ' + details.length + (urgent ? ', overtime / deadline pressure in ' + urgent : '');
      ev = ev ? ev + '; ' + add : add;
      source = 'Apollo + job ads';
      if (req >= 3) str = 'High'; else if (req >= 1 && str === 'Low') str = 'Medium';
    }
    signals.push(sig('revit_heavy_hiring', 'Revit-heavy hiring', k > 0 || details.length > 0, ev, source, design[0] && design[0].url, str));
  }

  // 3. City hiring push — city with the most open roles
  {
    const count = {};
    allJobs.forEach(j => { const p = place(j); if (p !== 'Unknown') count[p] = (count[p] || 0) + 1; });
    const top = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    const n = allJobs.length;
    let found = false, ev = null, str = 'Low', label = 'City hiring push';
    if (top && n >= 2 && count[top] >= 2) {
      found = true;
      label = top + ' hiring push';
      const inCity = allJobs.filter(j => place(j) === top && j.posted_at).map(j => new Date(j.posted_at));
      const span = inCity.length ? monthSpan(Math.min(...inCity), Math.max(...inCity)) : '';
      const officeText = ((snap.offices && snap.offices.value) || '') + ' ' + ((snap.hq_address && snap.hq_address.value) || '');
      const norm = x => ' ' + String(x).toLowerCase().replace(/\bsaint\b/g, 'st').replace(/\bst\./g, 'st').replace(/\bfort\b/g, 'ft').replace(/\bft\./g, 'ft').replace(/\bmount\b/g, 'mt').replace(/\bmt\./g, 'mt').replace(/[^a-z0-9]+/g, ' ') + ' ';
      const hasOffice = norm(officeText).includes(norm(top));
      const states = uniq(allJobs.map(j => j.state).filter(Boolean));
      ev = count[top] + ' of ' + n + ' roles in ' + top + (span ? ', posted ' + span : '') +
        (hasOffice ? '' : '; no office listed there') + (states.length > 1 ? '; hiring in ' + states.length + ' states' : '');
      const share = count[top] / n;
      str = count[top] >= 3 && share >= 0.5 ? 'High' : 'Medium';
      if (!hasOffice && count[top] >= 3) str = 'High';
    }
    signals.push(sig('city_hiring_push', label, found, ev, 'Apollo', null, str));
  }

  // 4. Headcount (last 12 months)
  {
    const g12 = typeof o.organization_headcount_twelve_month_growth === 'number' ? o.organization_headcount_twelve_month_growth : null;
    const g24 = typeof o.organization_headcount_twenty_four_month_growth === 'number' ? o.organization_headcount_twenty_four_month_growth : null;
    let ev = null, str = 'Low';
    if (g12 !== null) {
      ev = (g12 < 0 ? 'Decreasing: ' : g12 > 0 ? 'Growing: ' : 'Flat: ') + pct(g12) + ' over 12 months' + (g24 !== null ? ' (' + pct(g24) + ' over 24 months)' : '');
      str = g12 < 0 ? 'Negative' : g12 >= 0.10 ? 'High' : g12 >= 0.03 ? 'Medium' : 'Low';
    }
    signals.push(sig('headcount', 'Headcount (last 12 months)', g12 !== null, ev, 'Apollo', null, str));
  }

  // 5. Autodesk tools
  {
    const techs = uniq([].concat(o.technology_names || [], (o.current_technologies || []).map(t => t.name || ''))).filter(Boolean);
    const text = (techs.join(' | ') + ' | ' + ((snap.core_software && snap.core_software.value) || '')).toLowerCase();
    const has = re => re.test(text);
    const autocad = has(/autocad/), revit = has(/revit/), acc = has(/bim 360|bim360|autodesk construction cloud|\bacc\b|autodesk docs/);
    const extra = ['Navisworks', 'Civil 3D', 'ReCap', 'Tekla', 'Bluebeam', 'Procore'].filter(n => text.includes(n.toLowerCase()));
    // Software the job ads ask for (from Merge Job Details)
    const adSw = Array.isArray(c.software_used) ? c.software_used : [];
    const adText = adSw.map(x => x.name).join(' | ').toLowerCase();
    const adRevit = /revit/.test(adText), adCad = /autocad/.test(adText), adAcc = /bim 360|acc/.test(adText);
    const any = autocad || revit || acc || adRevit || adCad || adAcc;
    let ev = 'AutoCAD: ' + (autocad || adCad ? 'Yes' : 'No') + ' · Revit: ' + (revit || adRevit ? 'Yes' : 'No') + ' · ACC / BIM 360: ' + (acc || adAcc ? 'Yes' : 'No') +
      (extra.length ? ' · Also: ' + extra.join(', ') : '');
    if (adSw.length) ev += ' · Job ads ask for: ' + adSw.slice(0, 5).map(x => x.name + ' (' + x.jobs + '/' + x.of + (x.need === 'Preferred' ? ', preferred' : '') + ')').join(', ');
    const src = (autocad || revit || acc) ? (adSw.length ? 'Apollo + job ads' : 'Apollo') : 'Job ads';
    signals.push(sig('autodesk_tools', 'Autodesk tools', any, any ? ev : null, src, null, (revit || adRevit) ? 'High' : 'Medium'));
  }

  // 6. BIM-tagged firm — Apollo keywords + services text
  {
    const kw = (o.keywords || []).map(k => String(k).toLowerCase());
    const BIM_KW = /\b(bim|building information model\w*|revit|vdc|virtual design|clash detection|clash|laser scan\w*|scan[\s-]to[\s-]bim|point cloud|navisworks|digital twin|3d model\w*|reality capture)\b/i;
    const hits = uniq(kw.filter(k => BIM_KW.test(k)));
    const svc = ((snap.what_they_do && snap.what_they_do.value) || '');
    const svcHit = BIM_KW.test(svc);
    const found = hits.length > 0 || svcHit;
    const ev = hits.length ? 'Apollo keywords include ' + hits.slice(0, 5).join(', ') : (svcHit ? 'Services mention BIM / VDC: ' + svc.slice(0, 120) : null);
    const str = hits.length >= 3 ? 'High' : 'Medium';
    signals.push(sig('bim_tagged_firm', 'BIM-tagged firm', found, ev, hits.length ? 'Apollo' : 'Web', null, str));
  }

  // 7. Right project mix — their markets vs Excelize ICP (Datacenter & Healthcare first)
  {
    const text = [(snap.key_markets && snap.key_markets.value) || '', (snap.what_they_do && snap.what_they_do.value) || '', (o.keywords || []).join(', ')].join(' | ');
    const TOP = { 'Datacenter': /data ?cent(er|re)s?|hyperscale|colocation|mission[\s-]critical/i, 'Healthcare': /health ?care|hospital|medical|clinic|life science/i };
    const MID = { 'Commercial': /commercial|office|corporate|mixed[\s-]use|retail/i, 'Hospitality': /hospitality|hotel|resort/i, 'Education': /education|higher ed|universit|school|k-12/i, 'Industrial': /industrial|manufactur|semiconductor|warehouse|distribution|logistics/i, 'Government': /government|federal|municipal|public sector|military|defense/i, 'Aviation / Transport': /aviation|airport|transit|transportation/i, 'Labs': /laborator|research facilit/i };
    const RES = /residential|multi[\s-]?family|housing|apartment|single[\s-]family/i;
    const top = Object.keys(TOP).filter(k => TOP[k].test(text));
    const mid = Object.keys(MID).filter(k => MID[k].test(text));
    const res = RES.test(text);
    const found = top.length + mid.length > 0 || res;
    let ev = null, str = 'Low';
    if (found) {
      const parts = [];
      if (top.length) parts.push('Priority: ' + top.join(', '));
      if (mid.length) parts.push('Also: ' + mid.join(', '));
      if (res) parts.push(top.length + mid.length ? 'plus residential' : 'Residential / multifamily only');
      if (MID['Government'].test(text)) parts.push('public / federal work – check offshore limits');
      ev = parts.join('; ');
      str = top.length ? 'High' : mid.length ? 'Medium' : 'Low';
    }
    signals.push(sig('right_project_mix', 'Right project mix', found, ev, (snap.key_markets && snap.key_markets.source) || 'Web', (snap.key_markets && snap.key_markets.source_url) || null, str));
  }

  const found = signals.filter(s => s.found === 'Yes').length;
  const top = bimJobs[0] || {};

  out.push({ json: Object.assign({}, c, {
    bim_jobs: bimJobs,
    bim_job_count: bimJobs.length,
    all_jobs: allJobs,
    open_role_count: allJobs.length,
    top_job_title: top.title || c.top_job_title || null,
    top_job_url: top.url || c.top_job_url || null,
    top_job_location: [top.city, top.state].filter(Boolean).join(', ') || c.top_job_location || null,
    apollo_keywords: (o.keywords || []).slice(0, 30),
    signals_apollo: signals,
    signals_apollo_found: found
  })});
});

return out;
