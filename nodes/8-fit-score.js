// A8 Fit score breakdown + Data coverage (free – no API call)
// Place it after Apollo Email Activity (end of the A5 chain). Run Once for All Items.
//
// Calibrated on the approved template (hand-made sample report, v2):
//   BIM capacity need 17/20 · Firm profile 14/15 · Project pipeline 12/15 · Outsourcing openness 5/15
//   Technology fit 10/10 · Growth and timing 6/10 · Engagement 3/10 · Reachability 5/5  = 72 / 100 · Tier B
// and on the Excelize ICP must-haves (BIM adoption, active pipeline, outsource readiness).
// Revenue is NOT a gate: team size is the ICP size check – under 200 people matches the ICP revenue band.
//
// How it works
// - Each factor adds small, named parts; every part has a plain reason. The "why" shows the strongest 3.
// - Missing data scores conservatively (it never counts as a pass).
// - ICP gates: the 0–100 score stays honest, but a FAILED must-have caps the account at Tier C
//   and sets the ICP action (no BIM → NURTURE; no active pipeline → MONITOR, re-engage in 6 months).
//   Unknown data is marked "Confirm", never "Fail".
// - Pipeline is audience-aware: design firms (architecture / MEPF / structural) do their BIM work in
//   Planning–Bidding; contractors in Bidding–Pre-construction (ICP stage table).

const NO_DATA = 'No data found';
const DAY = 86400000;

// ---------- lookups (only used if a field is missing on the item) ----------
const byOrg = name => {
  const m = {};
  try { $(name).all().forEach(it => { if (it.json && it.json.org_id) m[it.json.org_id] = it.json; }); } catch (e) {}
  return m;
};
const jobsMap = byOrg('Merge Job Details');
const snapMap = {};
try {
  $('Apollo – Company Snapshot').all().forEach(it => {
    const o = (it.json && (it.json.organization || it.json)) || {};
    if (o.id) snapMap['id:' + o.id] = o;
    if (o.primary_domain) snapMap['d:' + String(o.primary_domain).toLowerCase()] = o;
  });
} catch (e) {}

// Latest A3 data straight from CC Projects (so a CC Projects update reaches the score without re-running paid nodes)
const ccMap = {};
try { $('CC Projects').all().forEach(it => { if (it.json && it.json.org_id) ccMap[it.json.org_id] = it.json; }); } catch (e) {}

// ---------- helpers ----------
const pts = (strength, map) => (map[strength] !== undefined ? map[strength] : 0);
const cap = (v, max) => Math.max(0, Math.min(max, Math.round(v)));
const money = v => v >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + v;
const num = text => { const m = String(text || '').replace(/,/g, '').match(/(\d+(\.\d+)?)/); return m ? parseFloat(m[1]) : null; };
const revenueFromText = text => {
  const m = String(text || '').replace(/,/g, '').match(/\$\s*(\d+(\.\d+)?)\s*(B|M|K)?/i);
  if (!m) return null;
  const mult = { b: 1e9, m: 1e6, k: 1e3 }[String(m[3] || '').toLowerCase()] || 1;
  return parseFloat(m[1]) * mult;
};
const plural = (n, w, p) => n + ' ' + (n === 1 ? w : (p || w + 's'));
const domainOf = s => String(s || '').toLowerCase().trim()
  .replace(/^\[([^\]]+)\]\([^)]*\)$/, '$1').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[\/?#].*$/, '');
const ownEmail = (email, domain) => {
  const e = String(email || '').toLowerCase();
  return !!(domain && e && (e.endsWith('@' + domain) || e.endsWith('.' + domain)));
};
const sizeWord = n => n === null ? '' : n < 50 ? 'Small' : n <= 500 ? 'Mid-size' : 'Large';

// ICP audiences (all four are core targets) + other firm types
const FIRM_TYPES = [
  { re: /naics 238|electrical contractor|mechanical contractor|plumbing contractor|hvac contractor|fire protection contractor|subcontractor|specialty contractor/i, label: 'subcontractor', audience: 'Subcontractor', design: false, pts: 6 },
  { re: /\bmep\b|mepf|mechanical|electrical|plumbing|fire protection|building systems|naics 541330/i, label: 'MEP consulting firm', audience: 'MEPF engineering', design: true, pts: 6 },
  { re: /architect|naics 541310/i, label: 'architecture firm', audience: 'Architecture', design: true, pts: 6 },
  { re: /general contract|construction manag|design[\s-]build|builder|naics 2362/i, label: 'general contractor', audience: 'General contractor', design: false, pts: 6 },
  { re: /structural/i, label: 'structural engineering firm', audience: 'Engineering', design: true, pts: 5 },
  { re: /contractor|construction/i, label: 'contractor', audience: 'Contractor', design: false, pts: 5 },
  { re: /fabricat|steel|precast|prefab|modular/i, label: 'fabricator', audience: 'Fabricator', design: false, pts: 4 },
  { re: /civil|survey|infrastructure/i, label: 'civil / infrastructure firm', audience: 'Civil', design: true, pts: 3 },
  { re: /engineer/i, label: 'engineering firm', audience: 'Engineering', design: true, pts: 4 }
];
// Shared ICP audience from CC Projects (one of the 4 audiences) → firm type used here.
// Core 6 pts · Close 5 (nearest audience, e.g. structural engineer) · Best guess 4 (weak evidence).
// FIRM_TYPES above is only a fallback for old pinned data without icp_audience.
const ICP_FIRM = {
  'Architecture':       { label: 'architecture firm',      audience: 'Architecture',       design: true },
  'MEPF engineering':   { label: 'MEP engineering firm',   audience: 'MEPF engineering',   design: true },
  'General contractor': { label: 'general contractor',     audience: 'General contractor', design: false },
  'Subcontractor':      { label: 'specialty subcontractor', audience: 'Subcontractor',     design: false }
};
const MATCH_PTS = { 'Core': 6, 'Close': 5, 'Best guess': 4 };
const firmFromIcp = (aud, match, reason) => {
  const base = ICP_FIRM[aud];
  if (!base) return null;
  const label = aud === 'MEPF engineering' && /structural|civil/i.test(reason || '') ? 'engineering firm (structural / civil)' : base.label;
  return Object.assign({}, base, { label, pts: MATCH_PTS[match] || 6, match: match || 'Core' });
};
const DECISION_ROLE = /\b(owner|founder|president|ceo|coo|cvo|chief|principal|partner|vice president|vp|director|head)\b/i;

// ICP project mix
// Name the highest-value markets actually found (for the "why" line)
const HI_GROUPS = [['data center', /data ?cent|mission critical/i], ['healthcare', /healthcare|hospital(?!ity)|medical|clinic/i],
  ['life sciences / pharma', /pharma|life science|laborator|biotech/i], ['semiconductor', /semiconductor/i]];
const hiNames = t => HI_GROUPS.filter(g => g[1].test(t)).map(g => g[0]).join(' / ') || 'data center / healthcare';
const MIX_HIGHEST = /data ?cent|healthcare|hospital(?!ity)|medical|clinic|semiconductor|pharma|life science|laborator|mission critical/i;
const MIX_TARGET = /commercial|office|hospitality|hotel|resort|higher ed|universit|education|government|federal|industrial|manufactur|airport|aviation|transportation|institutional/i;
const MIX_LOW = /residential|multi-?family|apartment|housing|single[- ]family|retail|restaurant|parking|senior living|student/i;

// ConstructConnect stages
const DESIGN_ACTIVE = /planning|conceptual|design|bidding|pre-?construction|negotiated/i;   // not "Post-Bid"
const BUILD_ACTIVE = /bidding|pre-?construction|negotiated/i;
const BUILD_MEDIUM = /award|mobiliz|under construction/i;
const isActive = (stage, design) => !/post-?bid|bid results|cancel|abandon/i.test(stage || '') && (design ? DESIGN_ACTIVE : BUILD_ACTIVE).test(stage || '');

const out = [];

$input.all().forEach(item => {
  const ccNode = ccMap[(item.json || {}).org_id];
  const c = ccNode ? Object.assign({}, item.json || {}, { cc_intro: ccNode.cc_intro, cc_columns: ccNode.cc_columns, cc_projects: ccNode.cc_projects, cc_summary: ccNode.cc_summary, cc_projects_error: ccNode.cc_projects_error }) : (item.json || {});
  const snap = c.snapshot || {};
  const sv = k => (snap[k] && snap[k].value !== undefined && snap[k].value !== null && snap[k].value !== NO_DATA) ? snap[k].value : null;
  const o = snapMap['id:' + c.org_id] || snapMap['d:' + String(c.domain || '').toLowerCase()] || {};
  const jd = jobsMap[c.org_id] || {};
  const job = k => (c[k] !== undefined ? c[k] : jd[k]);
  const domain = domainOf(c.domain || c.website);

  const signals = Array.isArray(c.signals) ? c.signals : (Array.isArray(c.signals_apollo) ? c.signals_apollo : []);
  const S = key => signals.find(s => s.key === key) || { found: 'No', strength: 'Not found', evidence: NO_DATA };
  const breakdown = [];
  const watch = [];
  const add = (factor, max, parts) => {
    const points = cap(parts.reduce((a, p) => a + p[0], 0), max);
    const shown = parts.filter(p => p[1]).sort((a, b) => b[0] - a[0]).map(p => p[1]).slice(0, 3);
    breakdown.push({ factor, score: points, max, score_text: points + '/' + max, why: shown.join('; ') || 'No evidence found' });
  };

  // ---------- shared facts ----------
  const details = (job('job_details') || []).filter(j => j.description_found);
  const revitReq = details.filter(j => /required/i.test(j.revit)).length;
  const urgent = details.filter(j => j.urgency && j.urgency !== 'Not stated').length;

  const empl = typeof o.estimated_num_employees === 'number' ? o.estimated_num_employees : num(sv('size'));
  const revenue = typeof o.annual_revenue === 'number' ? o.annual_revenue : revenueFromText(sv('revenue'));
  const typeText = [sv('what_they_do') || '', sv('industry') || '', (c.apollo_keywords || []).join(', ')].join(' | ');
  const ccA = ccMap[c.org_id] || {};
  const icpAud = c.icp_audience || ccA.icp_audience || null;
  const icpMatch = c.icp_audience_match || ccA.icp_audience_match || null;
  const icpReason = c.icp_audience_reason || ccA.icp_audience_reason || '';
  const ft = firmFromIcp(icpAud, icpMatch, icpReason) || FIRM_TYPES.find(f => f.re.test(typeText)) || null;
  if (ft && ft.match === 'Best guess') watch.push('Firm type unclear – confirm which ICP audience fits before outreach');
  const designFirm = ft ? ft.design : false;
  const state = c.state || '';

  const team = c.bim_team || {};
  const teamKnown = typeof team.total_found === 'number' && team.total_found > 0;
  const bimStaff = teamKnown && typeof team.bim_cad_count === 'number' ? team.bim_cad_count : null;

  // pipeline (uses full stage counts from CC Projects when available, else the listed projects)
  const cc = Array.isArray(c.cc_projects) ? c.cc_projects : [];
  const ccs = c.cc_summary || {};
  const stageCounts = ccs.stage_counts && typeof ccs.stage_counts === 'object' ? ccs.stage_counts : null;
  const activeList = cc.filter(p => isActive(p.stage, designFirm));
  const activeCount = stageCounts
    ? Object.entries(stageCounts).reduce((a, [st, n]) => a + (isActive(st, designFirm) ? (Number(n) || 0) : 0), 0)
    : activeList.length;
  const mediumCount = designFirm ? 0 : (stageCounts
    ? Object.entries(stageCounts).reduce((a, [st, n]) => a + (BUILD_MEDIUM.test(st) ? (Number(n) || 0) : 0), 0)
    : cc.filter(p => BUILD_MEDIUM.test(p.stage || '')).length);
  const biggestActive = activeList.reduce((m, p) => (typeof p.value_usd === 'number' && (!m || p.value_usd > m.value_usd)) ? p : m, null);
  const stem = s => String(s || '').split(/\s[\/–-]\s|\s\/|\/\s/)[0].trim().toLowerCase();
  const stems = {};
  cc.forEach(p => { const k = stem(p.project); if (k.length >= 6) stems[k] = (stems[k] || 0) + 1; });
  const repeat = Object.entries(stems).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0] || null;
  const repeatName = repeat ? (cc.find(p => stem(p.project) === repeat[0]).project.split(/\s[\/–-]\s|\s\//)[0].trim()) : null;

  // ================= 1. BIM capacity need (20) =================
  {
    const u = S('unfilled_bim_role'), r = S('revit_heavy_hiring');
    const oldest = (c.bim_jobs || []).map(j => j.posted_at).filter(Boolean).sort()[0];
    const openDays = oldest ? Math.floor((Date.now() - new Date(oldest).getTime()) / DAY) : null;
    const openText = openDays === null ? null : openDays >= 60 ? Math.floor(openDays / 30) + '+ months' : openDays + ' days';
    let loadPts = 0, loadWhy = null;
    if (activeCount > 0) {
      if (bimStaff === 0) { loadPts = 3; loadWhy = 'No dedicated BIM / CAD staff for ' + plural(activeCount, 'active project'); }
      else if (bimStaff > 0) {
        const ratio = activeCount / bimStaff;
        loadPts = ratio >= 2 ? 3 : ratio >= 1 ? 2 : 1;
        loadWhy = bimStaff + ' BIM/CAD staff for ' + plural(activeCount, 'active project');
      } else { loadPts = 1; loadWhy = plural(activeCount, 'active project') + '; BIM team size unknown'; }
    }
    add('BIM capacity need', 20, [
      [pts(u.strength, { High: 8, Medium: 5, Low: 2 }), u.found === 'Yes' ? 'BIM seat open ' + (openText || '(' + u.strength + ')') : null],
      [pts(r.strength, { High: 6, Medium: 4, Low: 2 }), r.found === 'Yes' ? (details.length ? 'Revit required in ' + revitReq + ' of ' + plural(details.length, 'job ad') + ' read' : 'Revit-heavy hiring (' + r.strength + ')') : null],
      [loadPts, loadWhy],
      [urgent ? 3 : 0, urgent ? plural(urgent, 'job ad') + ' mention overtime / deadline pressure' : null]
    ]);
  }

  // ================= 2. Firm profile (15) =================
  let mixLevel = 'Unknown';
  {
    const markets = String(sv('key_markets') || '') + ' ' + String(sv('what_they_do') || '');
    const projText = cc.map(p => (p.type || '') + ' ' + (p.project || ''));
    const projHighest = projText.filter(t => MIX_HIGHEST.test(t) && !/animal|veterinar|pet /i.test(t)).length;
    const lowShare = projText.length ? projText.filter(t => MIX_LOW.test(t) && !MIX_HIGHEST.test(t)).length / projText.length : 0;
    const projLowOnly = projText.length >= 3 && lowShare >= 0.8;   // 80%+ of listed projects are residential / retail / parking
    const mktHighest = MIX_HIGHEST.test(markets);
    const mktTarget = MIX_TARGET.test(markets);
    const mktLowOnly = !mktHighest && !mktTarget && MIX_LOW.test(markets);
    let mixWhy;
    if (projText.length && (projHighest >= 3 || projHighest / projText.length >= 0.25)) { mixLevel = 'High'; mixWhy = 'Highest-value work (' + hiNames(projText.join(' ')) + ') in ' + projHighest + ' of ' + projText.length + ' listed projects'; }
    else if (mktHighest || projHighest) { mixLevel = 'Medium'; mixWhy = 'Lists ' + hiNames(markets + ' ' + projText.join(' ')) + ' among other markets'; }
    else if (mktTarget && !projLowOnly) { mixLevel = 'Medium'; mixWhy = 'Commercial / hospitality / institutional mix'; }
    else if (mktTarget && projLowOnly) { mixLevel = 'Low'; mixWhy = 'Lists commercial / hospitality, but ' + Math.round(lowShare * 100) + '% of listed projects are residential / retail / parking'; }
    else if (mktLowOnly || projLowOnly) { mixLevel = 'Low'; mixWhy = 'Mostly residential / light commercial (ICP low)'; }
    else { mixLevel = 'Unknown'; mixWhy = null; }
    const mixPts = { High: 4, Medium: 3, Low: 1, Unknown: 1 }[mixLevel];

    // Size fit: team size first (under 200 people = ICP revenue band); revenue only when headcount is missing
    let revPts, revWhy;
    if (empl !== null) {
      const inBand = empl >= 20 && empl <= 200;   // Apollo sizes are estimates, so ~200 counts as the ICP band
      revPts = inBand ? 5 : empl > 200 && empl <= 1000 ? 4 : empl > 1000 ? 3 : 2;
      revWhy = '~' + empl + ' people' + (inBand ? ' (ICP size band)' : empl < 20 ? ' (very small team)' : ' (larger firm)');
    } else if (revenue !== null) {
      revPts = revenue >= 10e6 && revenue <= 100e6 ? 5 : revenue > 100e6 ? 4 : 3;
      revWhy = money(revenue) + ' revenue';
    } else { revPts = 2; revWhy = 'team size not found'; }
    const lead = [sizeWord(empl), ft ? ft.label : 'firm (type unclear)'].filter(Boolean).join(' ') + (state ? ' in ' + state : '');
    const leadWhy = (lead.charAt(0).toUpperCase() + lead.slice(1)) + (ft && ft.pts >= 6 ? ', a core Excelize target' : '') + '; ' + revWhy;
    add('Firm profile', 15, [
      [(ft ? ft.pts : 2) + revPts, leadWhy],
      [mixPts, mixWhy ? mixWhy + ' (' + mixLevel + ')' : null]
    ]);
    if (empl !== null && empl < 20) watch.push('Very small team (~' + empl + ' people) – check they have the budget and an internal reviewer');
    if (revenue !== null && revenue > 500e6 && ft && /General contractor/.test(ft.audience)) watch.push('GC revenue above $500M – enterprise track, not standard outbound');
    if (/public \/ federal|federal/i.test(S('right_project_mix').evidence || '') || /federal/i.test(sv('key_markets') || ''))
      watch.push('Some federal / public work – check offshore / data restrictions before offering remote production');
  }

  // ================= 3. Project pipeline (15) =================
  {
    const wins = S('project_wins');
    const stageWord = designFirm ? 'in Planning or Bidding' : 'at bidding / pre-construction stage';
    const actPts = activeCount >= 10 ? 8 : activeCount >= 5 ? 6 : activeCount >= 3 ? 4 : activeCount >= 1 ? 2 : 0;
    const big = biggestActive ? biggestActive.value_usd : 0;
    const bigPts = big >= 25e6 ? 3 : big >= 5e6 ? 2 : big > 0 ? 1 : 0;
    add('Project pipeline', 15, [
      [actPts + bigPts, activeCount ? plural(activeCount, 'project') + ' ' + stageWord + (biggestActive ? ', incl. a ' + money(big) + ' ' + String(biggestActive.stage || 'active').split('/')[0].toLowerCase().replace(/\bgc\b/, 'GC') + '-stage project' : '') : (cc.length ? 'No projects ' + stageWord + ' right now' : null)],
      [repeat ? 1 : 0, repeat ? 'Repeat rollouts (' + repeatName + ' ×' + repeat[1] + ')' : null],
      [Math.min(2, mediumCount), mediumCount ? plural(mediumCount, 'project') + ' awarded / under construction' : null],
      [pts(wins.strength, { High: 2, Medium: 1 }), wins.found === 'Yes' && /High|Medium/.test(wins.strength) ? 'Recent project wins (' + wins.strength + ')' : null]
    ]);
    if (!cc.length) watch.push('No ConstructConnect projects found in the last 6 months');
    else if (!activeCount) watch.push('No project ' + stageWord + ' – ICP says monitor and re-engage in 6 months');
    if (!stageCounts && cc.length) watch.push('Pipeline scored on the ' + cc.length + ' listed ConstructConnect projects only – full stage counts come with the A3 update');
  }

  // ================= 4. Outsourcing openness (15) =================
  {
    const oc = S('outsource_check');
    const ocPts = oc.strength === 'High' ? 11 : oc.strength === 'In-house' ? 3 : 6;
    const ocWhy = oc.strength === 'High' ? 'Already outsources BIM / drafting' : oc.strength === 'In-house' ? 'BIM presented as an in-house strength; no outsourcing vendor' : 'No outsourcing evidence either way';
    const teamPts = bimStaff === null ? 2 : bimStaff === 0 ? 4 : bimStaff <= 4 ? 3 : bimStaff <= 9 ? 2 : 0;
    const teamWhy = bimStaff === null ? 'BIM team size unknown' : bimStaff === 0 ? (team.designer_count ? 'No dedicated BIM staff – relies on ' + team.designer_count + ' designers' : 'No dedicated BIM / CAD staff found')
      : plural(bimStaff, 'dedicated BIM / CAD staff', 'dedicated BIM / CAD staff') + (bimStaff >= 5 ? ' – growing by hiring' : ' – lean team');
    add('Outsourcing openness', 15, [[ocPts, ocWhy], [teamPts, teamWhy]]);
    if (oc.strength === 'In-house' || (bimStaff !== null && bimStaff >= 5)) watch.push('Strong in-house BIM – pitch extra capacity inside their standards, never a replacement');
  }

  // ================= 5. Technology fit (10) =================
  {
    const ev = String(S('autodesk_tools').evidence || '');
    const has = (k, re) => new RegExp(k + ':\\s*' + (re || 'Yes'), 'i').test(ev);
    const sw = [String(sv('core_software') || ''), ev, (c.software_used || []).map(s => s.name).join(' ')].join(' ');
    const revit = has('Revit') || /revit/i.test(String(sv('core_software') || ''));
    const acad = has('AutoCAD') || /autocad/i.test(String(sv('core_software') || ''));
    const acc = has('ACC / BIM 360', 'Yes|Likely') || /\b(acc|bim 360|autodesk construction cloud)\b/i.test(String(sv('core_software') || ''));
    const others = ['Navisworks', 'ReCap', 'Dynamo', 'Tekla', 'Civil 3D'].filter(t => new RegExp(t, 'i').test(sw));
    add('Technology fit', 10, [
      [(revit ? 5 : 0) + (acad ? 2 : 0), revit || acad ? [revit ? 'Revit' : null, acad ? 'AutoCAD' : null].filter(Boolean).join(' and ') + ' confirmed' : null],
      [acc ? 1 : 0, acc ? 'ACC / BIM 360' + (has('ACC / BIM 360', 'Likely') ? ' likely' : '') : null],
      [others.length ? 1 : 0, others.length ? others.join(' and ') + ' in use' : null],
      [revitReq ? 1 : 0, revitReq ? 'Job ads require Revit' : null]
    ]);
  }

  // ================= 6. Growth and timing (10) =================
  {
    // e.g. "Leadership change (Jul 2026)" / "Ownership change (May 2026)" instead of a cut-off sentence
    const newsWhy = () => {
      const fam = (c.signal_evidence || []).find(x => x.key === 'recent_news') || {};
      const label = fam.signal && !/^recent news$/i.test(fam.signal) ? fam.signal : null;
      const ev = String(S('recent_news').evidence || '');
      const when = (ev.match(/\(([A-Z][a-z]{2} \d{4})[^)]*\)\s*$/) || [])[1] || (ev.match(/\b([A-Z][a-z]{2,8} \d{4})\b/) || [])[1] || '';
      if (label) return label + (when ? ' (' + when + ')' : '');
      return 'Recent news: ' + (t => t.length > 70 ? t.slice(0, 70).replace(/\s+\S*$/, '') + '…' : t)(ev.split(/[,.;(]/)[0].trim());
    };
    const h = S('headcount'), no = S('new_office'), city = S('city_hiring_push'), news = S('recent_news'), exp = S('earlier_expansion'), wins = S('project_wins');
    const recentPost = (c.all_jobs || []).some(j => j.posted_at && (Date.now() - new Date(j.posted_at)) / DAY <= 30);
    const hEv = String(h.evidence || '').replace(/^(Decreasing|Growing|Stable):\s*/i, '').split('(')[0].trim();
    const parts = [
      [pts(h.strength, { High: 3, Medium: 2, Low: 1 }), h.found === 'Yes' && h.strength !== 'Negative' ? 'Headcount ' + hEv : null],
      [pts(city.strength, { High: 3, Medium: 2, Low: 1 }), city.found === 'Yes' ? city.label + (city.strength === 'Low' ? ' (HQ city)' : '') : null],
      [pts(news.strength, { High: 3, Medium: 2 }), news.found === 'Yes' && /High|Medium/.test(news.strength) ? newsWhy() : null],
      [pts(no.strength, { High: 3, Medium: 2, Low: 1 }), no.found === 'Yes' ? 'New office' : null],
      [/High|Medium/.test(exp.strength) && exp.found === 'Yes' ? 1 : 0, exp.found === 'Yes' && /High|Medium/.test(exp.strength) ? 'Earlier expansion' : null],
      [recentPost ? 1 : 0, recentPost ? 'New roles posted in the last 30 days' : null]
    ];
    const hPct = (String(h.evidence || '').match(/[−+-]?\d+(\.\d+)?%/) || [hEv])[0];
    const offsets = [h.strength === 'Negative' ? hPct + ' headcount' : null, wins.found !== 'Yes' ? 'no public wins' : null].filter(Boolean);
    const points = cap(parts.reduce((a, p) => a + p[0], 0), 10);
    const pos = parts.filter(p => p[1]).sort((a, b) => b[0] - a[0]).map(p => p[1]).slice(0, 2);
    breakdown.push({ factor: 'Growth and timing', score: points, max: 10, score_text: points + '/10',
      why: (pos.length ? pos.join(' and ') : 'No growth signal found') + (offsets.length ? '; offset by ' + offsets.join(' and ') : '') });
    if (h.strength === 'Negative') watch.push('Headcount shrinking: ' + String(h.evidence).replace(/^Decreasing:\s*/, '') + ' – ask whether hiring replaces people who left');
  }

  // ================= 7. Engagement (10) – A5 Relationship history =================
  {
    const rh = (c.relationship_history && !Array.isArray(c.relationship_history)) ? c.relationship_history : {};
    const deals = rh.deals || {};
    const outr = rh.outreach || {};
    const em = outr.emails || {};
    const zoho = rh.zoho || {};
    const za = rh.zoho_activity || {};
    const v = S('website_visit');
    const usd = n => n > 0 ? ' (≈' + money(n) + ')' : '';

    const replies = Math.max(outr.replies || 0, em.people_replied || 0);
    const clicked = em.people_clicked || 0;
    const talks = (za.calls || 0) + (za.meetings || 0);
    const zDays = typeof za.last_days === 'number' ? za.last_days : null;
    const touchDays = [outr.last_touch_days, zDays].filter(d => typeof d === 'number');
    const lastTouch = touchDays.length ? Math.min(...touchDays) : null;
    const recent = lastTouch !== null && lastTouch <= 90;
    const seqNames = (outr.sequences || []).map(s => s.name || '').join(' | ');
    const exHint = !deals.won && /old customer|retouch|existing client|past client|former client/i.test(seqNames);

    const parts = [
      [deals.won ? 5 : 0, deals.won ? 'Former customer – ' + plural(deals.won, 'won deal') + usd(deals.won_usd) : null],
      [deals.open ? 4 : 0, deals.open ? plural(deals.open, 'open deal') + ' in Zoho' + usd(deals.open_usd) : null],
      [za.upcoming_meetings ? 3 : 0, za.upcoming_meetings ? plural(za.upcoming_meetings, 'upcoming meeting') + ' booked in Zoho' : null],
      [replies ? 4 : 0, replies ? plural(replies, 'person', 'people') + ' replied to our emails' : null],
      [talks ? (zDays !== null && zDays <= 180 ? 3 : 1) : 0, talks ? plural(za.calls || 0, 'call') + ' and ' + plural(za.meetings || 0, 'meeting') + ' logged in Zoho' + (zDays !== null ? ' (latest ' + zDays + ' days ago)' : '') : null],
      [clicked && !replies ? 2 : 0, clicked && !replies ? plural(clicked, 'person', 'people') + ' clicked our emails' : null],
      [v.found === 'Yes' ? pts(v.strength, { High: 3, Medium: 2, Low: 1 }) : 0, v.found === 'Yes' ? (v.strength === 'Low' ? 'Low-intent website visits' : 'Visited Excelize website (' + v.strength + ')') : null],
      [exHint ? 1 : 0, exHint ? 'Ex-customer link unconfirmed' : null],
      [za.notes && !talks ? 1 : 0, za.notes && !talks ? plural(za.notes, 'note') + ' logged in Zoho' : null],
      [outr.contacts_sequenced ? 1 : 0, outr.contacts_sequenced ? plural(outr.contacts_sequenced, 'contact') + ' in our sequences' +
        (em.delivered ? ' (' + plural(em.delivered, 'email') + ' delivered' + (replies || clicked ? '' : ', no clicks or replies') + ')' : ', no emails sent') : null],
      [recent ? 1 : 0, recent ? 'Last touch ' + lastTouch + ' days ago' : null],
      [zoho.abm_stage ? 1 : 0, zoho.abm_stage ? 'ABM stage in Zoho: ' + zoho.abm_stage : null]
    ];
    if (!parts.some(p => p[1])) parts.push([0, zoho.matched || (zoho.leads || 0) > 0 ? 'In Zoho, but no deals, replies or recent touches' : 'No past relationship found']);
    add('Engagement', 10, parts);

    if (v.strength === 'Not checked') watch.push('Website visits not checked yet (Apollo website visitors not connected)');
    if (za.upcoming_meetings) watch.push('Meeting already booked in Zoho – brief ' + (za.last_by || zoho.owner || 'the owner') + ' and do not start a new sequence');
    if (za.open_tasks) watch.push(plural(za.open_tasks, 'open Zoho task') + ' – check with ' + (zoho.owner || 'the owner') + ' before reaching out');
    if (deals.lost) watch.push('Lost ' + plural(deals.lost, 'deal') + ' before' + ((deals.loss_reasons || []).length ? ' (reason: ' + deals.loss_reasons.join(', ') + ')' : '') + ' – read A5 before pricing');
    if (deals.open) watch.push('Open Zoho deal – coordinate with ' + (zoho.owner || 'the account owner') + ' before any outreach');
    if (exHint) watch.push('Possible former customer (old-customer sequence) – check Zoho deals and past projects before outreach');
    if (zoho.owners && zoho.owners.length > 1) watch.push('Duplicate Zoho accounts with different owners (' + zoho.owners.join(', ') + ') – agree one owner');
    const leadOwners = (zoho.lead_owners || []).filter(Boolean);
    if (zoho.owner && leadOwners.some(x => x !== zoho.owner))
      watch.push('Zoho account owner (' + zoho.owner + ') differs from lead owner (' + leadOwners.filter(x => x !== zoho.owner).join(', ') + ') – agree who leads');
    else if (!zoho.owner && leadOwners.length > 1)
      watch.push('Zoho leads have different owners (' + leadOwners.join(', ') + ') – agree who leads');
    if (replies) watch.push('Someone already replied – read the reply thread in Apollo before writing');
    else if (em.people_opened && !clicked) watch.push('Emails were opened but never clicked or answered – opens may be email-security scanners, not real interest');
    if (outr.contacts_sequenced && !replies && lastTouch !== null && lastTouch > 180)
      watch.push('Last touch was ' + lastTouch + ' days ago with no reply – open with a fresh angle');
    if (outr.never_sequenced) watch.push(outr.never_sequenced + ' saved contact' + (outr.never_sequenced > 1 ? 's were' : ' was') + ' never sequenced – see A5 for senior names');
    if (outr.bounces) watch.push(plural(outr.bounces, 'email bounce') + ' – use the verified emails in A7');
    if (em.unsubscribes || outr.unsubscribes) watch.push(plural(Math.max(em.unsubscribes || 0, outr.unsubscribes || 0), 'person', 'people') + ' unsubscribed – do not email them again');
    if (za.error) watch.push('Zoho notes and activities could not be read this run – check Zoho before outreach');
    if (em.error) watch.push('Apollo email history could not be read this run – check Apollo before outreach');
  }

  // ================= 8. Reachability (5) – only people on the company's own email domain =================
  const contacts = Array.isArray(c.contacts) ? c.contacts : [];
  {
    const own = contacts.filter(x => ownEmail(x.email, domain));
    const foreign = contacts.filter(x => x.email && !ownEmail(x.email, domain));
    const verified = own.filter(x => x.email_status === 'Verified').length;
    const direct = own.filter(x => /direct|mobile/i.test(x.phone_type || '') && !/shared|main line/i.test(x.phone_type || ''));
    const dnc = direct.filter(x => /do not call/i.test(x.dnc_check || '')).length;
    const emailByName = {};
    contacts.forEach(x => { emailByName[String(x.person || '').toLowerCase()] = x.email; });
    const dms = (c.key_people || []).filter(p => DECISION_ROLE.test(p.title || p.apollo_title || p.role || '') &&
      ownEmail(p.email || emailByName[String(p.full_name || '').toLowerCase()], domain));
    add('Reachability', 5, [
      [verified >= 3 ? 3 : verified >= 1 ? 2 : own.length ? 1 : 0, own.length ? 'Verified work emails for ' + verified + ' of ' + plural(contacts.length, 'contact') : null],
      [direct.length ? 1 : 0, direct.length ? plural(direct.length, 'direct dial') + (dnc ? ' (' + dnc + ' on Do Not Call)' : '') : null],
      [dms.length ? 1 : 0, dms.length ? 'Decision-maker reachable (' + dms[0].full_name + ')' : null]
    ]);
    if (foreign.length) watch.push(plural(foreign.length, 'contact') + ' use another company\'s email domain (' + [...new Set(foreign.map(x => x.email.split('@')[1]))].join(', ') + ') – check they really work here before emailing');
    if (!own.length) watch.push('No work emails on ' + (domain || 'the company domain') + ' – reach through LinkedIn or main line');
    if (!dms.length) watch.push('No reachable decision-maker on the company domain yet – find the COO / VP before pitching');
  }

  // ================= ICP gates ("Must meet ALL") =================
  const tech = breakdown.find(b => b.factor === 'Technology fit');
  const bimAdoption = tech.score >= 5 || revitReq > 0 || (c.bim_job_count || 0) > 0;
  const ocS = S('outsource_check').strength;
  const icp_checks = [
    { check: 'BIM adoption', status: bimAdoption ? 'Pass' : 'Fail', detail: bimAdoption ? 'Revit / BIM roles found' : 'No Revit or BIM evidence (pure 2D?)' },
    { check: 'Active pipeline', status: activeCount > 0 || (c.permit_activity && /Found/.test(c.permit_activity.status || '') && /active/i.test(c.permit_activity.intro || '')) ? 'Pass' : cc.length ? 'Fail' : 'Confirm',
      detail: activeCount > 0 ? plural(activeCount, 'active project') : cc.length ? 'Projects found, none at an active stage' : 'No ConstructConnect match' },
    { check: 'Outsource readiness', status: ocS === 'High' ? 'Pass' : 'Confirm', detail: ocS === 'High' ? 'Already outsources' : ocS === 'In-house' ? 'In-house culture – ask on first call' : 'No evidence either way – ask on first call' }
  ];
  const failed = icp_checks.filter(x => x.status === 'Fail');

  // ---------- total, tier, action ----------
  const fit_score = breakdown.reduce((a, b) => a + b.score, 0);
  let tier = fit_score >= 80 ? { t: 'A', label: 'Top fit', action: 'PURSUE NOW' }
    : fit_score >= 60 ? { t: 'B', label: 'Strong fit', action: 'PURSUE ACTIVELY' }
    : fit_score >= 40 ? { t: 'C', label: 'Possible fit', action: 'NURTURE' }
    : { t: 'D', label: 'Weak fit', action: 'DEPRIORITISE' };
  let fit_gate = null;
  if (failed.length) {
    const noPipe = failed.some(x => x.check === 'Active pipeline') && failed.length === 1;
    if (tier.t === 'A' || tier.t === 'B') tier = { t: 'C', label: 'Possible fit', action: tier.action };
    tier.action = tier.t === 'D' ? 'DEPRIORITISE' : noPipe ? 'MONITOR' : 'NURTURE';
    fit_gate = 'Capped by ICP: ' + failed.map(x => x.check + ' – ' + x.detail).join('; ') + (noPipe ? '. Re-engage in 6 months.' : '.');
    watch.unshift(fit_gate);
  }

  const ratio = b => b.score / b.max;
  const low = f => /^BIM/.test(f) ? f : f.charAt(0).toLowerCase() + f.slice(1);
  const strong = breakdown.filter(b => ratio(b) >= 0.7).sort((a, b) => ratio(b) - ratio(a));
  const weak = breakdown.filter(b => ratio(b) < 0.5).sort((a, b) => ratio(a) - ratio(b));
  const strongPhrase = (() => {
    const names = strong.map(b => b.factor);
    const need = names.includes('BIM capacity need'), techF = names.includes('Technology fit');
    if (need && techF) return 'Real need and technical fit';
    if (need) return 'Real BIM need';
    if (techF) return 'Strong technical fit';
    return strong.length ? 'Strong ' + strong.slice(0, 2).map(b => low(b.factor)).join(' and ') : 'No clear strength yet';
  })();
  const gapName = b => b.factor === 'Outsourcing openness' && S('outsource_check').strength === 'In-house' ? 'in-house culture'
    : b.factor === 'Engagement' ? 'no engagement' : low(b.factor);
  const gaps = weak.slice(0, 2).map(gapName);
  const fit_total_text = 'Tier ' + tier.t + ' · ' + tier.label + '. ' + strongPhrase +
    (gaps.length ? '; ' + gaps.join(' and ') + (gaps.length > 1 ? ' are' : ' is') + ' the gap' + (gaps.length > 1 ? 's' : '') : '') +
    (fit_gate ? '. ' + fit_gate : '.');
  const fit_intro = 'Customer fit for Excelize only. Missing data scores conservatively. 80+ Tier A · 60–79 Tier B · 40–59 Tier C · <40 deprioritise';

  // CUSTOMER FIT card (page 1)
  const fitBadge = fit_score >= 70 ? 'High' : fit_score >= 55 ? 'Med–High' : fit_score >= 40 ? 'Medium' : 'Low';
  const card_customer_fit = {
    title: 'CUSTOMER FIT', value: fit_score + ' / 100 · Tier ' + tier.t, badge: fitBadge,
    note: fit_gate ? 'Capped: ' + failed.map(x => x.check).join(', ') : (strongPhrase === 'Real need and technical fit' ? 'Real need and strong technical fit' : strongPhrase)
  };

  // ---------- DATA COVERAGE card: 17 snapshot fields + 8 research checks = 25 ----------
  const SNAP_KEYS = ['hq_address', 'what_they_do', 'key_markets', 'legal_name', 'founded', 'website', 'linkedin', 'main_phone', 'industry', 'size', 'revenue', 'offices', 'ownership', 'headcount_trend', 'in_our_systems', 'time_zone', 'core_software'];
  const SNAP_LABELS = { hq_address: 'HQ Address', what_they_do: 'What they do', key_markets: 'Key markets', legal_name: 'Legal name', founded: 'Founded', website: 'Website', linkedin: 'LinkedIn', main_phone: 'Main phone', industry: 'Industry', size: 'Size', revenue: 'Revenue', offices: 'Offices', ownership: 'Ownership', headcount_trend: 'Headcount trend', in_our_systems: 'In our systems', time_zone: 'Time zone', core_software: 'Core software' };
  const snapFound = SNAP_KEYS.filter(k => sv(k) !== null && sv(k) !== '').length;
  const web = ['new_office', 'earlier_expansion', 'recent_news', 'outsource_check', 'project_wins'];
  const checks = [
    ['Job postings', (c.all_jobs || []).length > 0],
    ['Job descriptions', details.length > 0],
    ['In-house BIM team', teamKnown],
    ['Web signals', web.some(k => S(k).found === 'Yes')],
    ['Project pipeline', cc.length > 0],
    ['Key people', (c.key_people || []).length > 0],
    ['Work emails', contacts.some(x => ownEmail(x.email, domain))],
    ['Website visits', S('website_visit').strength === 'Not checked' ? null : S('website_visit').found === 'Yes']
  ];
  const notChecked = checks.filter(x => x[1] === null).map(x => x[0]);
  const checksFound = checks.filter(x => x[1] === true).length;
  const notFoundList = SNAP_KEYS.filter(k => !(sv(k) !== null && sv(k) !== '')).map(k => SNAP_LABELS[k])
    .concat(checks.filter(x => x[1] === false).map(x => x[0]));
  const covered = snapFound + checksFound, total = SNAP_KEYS.length + checks.length;
  const card_data_coverage = {
    title: 'DATA COVERAGE', value: covered + ' of ' + total + ' fields',
    badge: covered >= 22 ? 'High' : covered >= 17 ? 'Medium' : 'Low',
    note: notChecked.length + ' not checked, ' + notFoundList.length + ' not found',
    not_checked: notChecked, not_found: notFoundList
  };

  // ---------- A8 notes line ----------
  const gathered = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const noteBits = [];
  if (S('unfilled_bim_role').found === 'Yes') noteBits.push('Capacity pressure is inferred, not confirmed.');
  if (cc.length) noteBits.push('Demand growth needs a second ConstructConnect snapshot.');
  if (!details.length) noteBits.push('Job descriptions could not be read, so capacity need is based on job titles only.');
  if (S('outsource_check').strength !== 'High') noteBits.push('No vendor found does not prove no vendor use.');
  noteBits.push('Apollo counts only public profiles.');
  const fit_notes = 'Notes: ' + noteBits.join(' ') + ' Sources: Apollo.io, Zoho CRM, ConstructConnect' + (c.permit_activity && c.permit_activity.status === 'Found' ? ', Shovels' : '') + ', company website and news, job postings, public LinkedIn profiles; gathered ' + gathered + '.';

  // ---------- header KPI strip ----------
  const header_kpis = {
    revenue: sv('revenue') || (revenue !== null ? money(revenue) : NO_DATA),
    employees: empl !== null ? String(empl) : NO_DATA,
    open_roles: typeof c.open_role_count === 'number' ? String(c.open_role_count) : NO_DATA,
    active_bids: String(activeCount),
    bim_cad_staff: bimStaff !== null ? String(bimStaff) + (team.designer_count ? ' + ' + team.designer_count + ' designers' : '') : NO_DATA
  };

  out.push({ json: Object.assign({}, c, {
    fit_score,
    fit_tier: 'Tier ' + tier.t,
    fit_label: tier.label,
    fit_action: tier.action,
    fit_gate,
    icp_checks,
    firm_audience: ft ? ft.audience : 'Unclear',
    project_mix_level: mixLevel,
    active_projects: activeCount,
    fit_intro,
    fit_breakdown: breakdown,
    fit_columns: ['Factor', 'Score', 'Why'],
    fit_total_text,
    fit_notes,
    card_customer_fit,
    card_data_coverage,
    watch_list: watch,
    header_kpis
  })});
});

return out;
