// A3 Project pipeline – CC Projects (free – no API call). Paste after CC – Get Projects. Run Once for All Items.
// Also sets icp_audience (one of the 4 ICP audiences) – the single source used by every later node.
// Template v2: "Source: ConstructConnect. <N> projects in <Co>'s history (<n> Planning, <n> Bidding, <n> Post-Bid);
//              the 10 most recent by start date:"   Columns: Project name · Location · Value (USD) · Stage (coloured dot) · Last updated
// Also passes cc_summary.stage_counts (projects updated in the last 6 months, by stage) to Fit Score,
// so design firms get credit for Planning-stage work. Opportunity is kept on each row for later steps,
// but it is no longer a report column.
const companies = $('CC Company').all();

const MONTHS = 6;
const LIMIT_ROWS = 10;
const NO_DATA = 'No data found';
const cutoff = new Date();
cutoff.setMonth(cutoff.getMonth() - MONTHS);

// ICP stage → Excelize opportunity (first match wins) – used by later steps, not shown in A3
const STAGE_MAP = [
  { re: /cancel|abandon|withdrawn/i,                    opp: 'None' },
  { re: /final planning/i,                              opp: 'Low' },
  { re: /gc bidding|general contractor bidding/i,       opp: 'Highest' },
  { re: /pre-?construction|negotiat/i,                  opp: 'Highest' },
  { re: /sub-?bidding|subcontractor bidding/i,          opp: 'High' },
  { re: /post-?bid|bid results/i,                       opp: 'Medium' },
  { re: /award/i,                                       opp: 'Medium' },
  { re: /under construction|construction|started/i,     opp: 'Medium' },
  { re: /occupan|complete/i,                            opp: 'Low–Medium' },
  { re: /on hold|delayed/i,                             opp: 'Low' },
  { re: /conceptual|planning|design/i,                  opp: 'None' }
];
const opportunity = stage => { const m = STAGE_MAP.find(s => s.re.test(stage || '')); return m ? m.opp : 'Unknown'; };
const OPP_RANK = { 'Highest': 5, 'High': 4, 'Medium': 3, 'Low–Medium': 2, 'Low': 1, 'None': 0, 'Unknown': 0 };

// Template history buckets: Planning · Bidding · Post-Bid (everything after bidding)
const bucket = stage => {
  const s = String(stage || '');
  if (/cancel|abandon|withdrawn|on hold|delayed/i.test(s)) return 'Other';
  if (/bidding|pre-?construction|negotiat/i.test(s)) return 'Bidding';   // checked first: "Pre-Construction" is not Post-Bid
  if (/post-?bid|bid results|award|mobiliz|construction|started|occupan|complete|closeout/i.test(s)) return 'Post-Bid';
  if (/conceptual|planning|design/i.test(s)) return 'Planning';
  return 'Other';
};
// Stage dot colours (template): Conceptual purple · Planning / Design blue · Bidding green · Post-Bid grey · Cancelled / on hold red
const stageColor = stage => {
  const s = String(stage || '');
  if (/cancel|abandon|withdrawn|on hold|delayed/i.test(s)) return 'red';
  if (/conceptual/i.test(s)) return 'purple';
  const b = bucket(s);
  return b === 'Planning' ? 'blue' : b === 'Bidding' ? 'green' : 'grey';
};

// Still open for work (bidding / pre-con / post-bid)
const isOpen = stage => ['Highest', 'High'].includes(opportunity(stage)) || /post-?bid/i.test(stage || '');

const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const dollars = v => (typeof v === 'number' && v > 0) ? '$' + Math.round(v).toLocaleString('en-US') : '';
const clean = s => String(s || '').replace(/&amp;/g, '&').replace(/^"+|"+$/g, '').replace(/\s{2,}/g, ' ').trim();
const time = d => { const t = d ? new Date(d).getTime() : NaN; return isNaN(t) ? null : t; };
const SUFFIX = /,?\s+(llc|inc\.?|corp\.?|corporation|co\.?|ltd\.?|pllc|pc|p\.?c\.?)$/i;   // "Example Architecture Inc" → "Example Architecture"
const shortName = (c) => {
  const cc = clean((c.cc_match && c.cc_match.name) || '').replace(/\s*-?\s*\((hq|headquarters)\)\s*$/i, '').replace(/\s+-\s*$/, '').replace(SUFFIX, '').trim();
  const nm = clean(c.name || '').replace(SUFFIX, '').trim();
  return cc || nm.replace(/\b\w/g, ch => ch.toUpperCase()) || 'the company';
};
const possessive = n => n + (/s$/i.test(n) ? "'" : "'s");

// ---------- ICP audience (shared by Pick Key People, Fit Score and the Account Plan) ----------
// Always ONE of the 4 Excelize ICP audiences: Architecture · MEPF engineering · General contractor · Subcontractor
// Evidence is scored, because Apollo's industry label and NAICS code are sometimes wrong
// (e.g. an MEP firm labelled "architecture & planning", an architect with a builder NAICS code).
// Weights: what they do (web) 2 (+1 if it is their first-listed service) · company name 2 · NAICS 2 (238 = 3)
//          · Apollo industry label 1 · AI fit note 1 · Apollo team mix (engineering vs design) 1
// match: Core (clear lead of 3+ points) · Close (mixed firm, nearest audience) · Best guess (little evidence – check)
const ICP_AUDIENCES = ['Architecture', 'MEPF engineering', 'General contractor', 'Subcontractor'];
const TRADE = '(electrical|electric\\b|mechanical contract|plumbing|hvac|heating|fire protection|sprinkler|low[\\s-]?voltage|structured cabling|audio[\\s-]?vis|\\bav\\b|security systems|steel|concrete|drywall|framing|glazing|curtain wall|roofing|masonry|insulation|millwork|sheet metal|elevator|fabricat|precast|prefab)';
const AUD_RE = {
  'Architecture': /architect|design studio|interior design|\binteriors\b|space planning/,
  'MEPF engineering': /\bmep\b|mepf|consulting engineer|engineering consult|engineers?\b(?! contractor)|(mechanical|electrical|plumbing|fire protection|structural|civil|process)[\w\s,()&/]{0,25}(engineering|design)\b/,
  'General contractor': /general contract|construction manag|\bcm at risk\b|design[\s-]?build|\bbuilders?\b|\bconstruction (company|co|group|services|inc)\b/,
  'Subcontractor': new RegExp('subcontract|trade contractor|self-perform|specialty contractor|' + TRADE + '[\\w\\s,()&/]{0,30}(contract|install|integrat|service|repair|fabricat)|(install|integrat)[\\w\\s,()&/]{0,15}' + TRADE)
};
const audienceOf = c => {
  const s = c.snapshot || {};
  const v = k => String((s[k] && s[k].value) || '').toLowerCase();
  const ind = v('industry');
  const label = ind.replace(/\(naics[^)]*\)/, '').trim();
  const naics = (ind.match(/naics\s*(\d{4,6})/) || [])[1] || '';
  const what = v('what_they_do');
  const name = String(c.name || '').toLowerCase();
  const size = v('size');
  const eng = +((size.match(/~?(\d+)\s*engineering/) || [])[1] || 0);
  const des = +((size.match(/~?(\d+)\s*design/) || [])[1] || 0);
  const pts = { 'Architecture': 0, 'MEPF engineering': 0, 'General contractor': 0, 'Subcontractor': 0 };
  const why = { 'Architecture': [], 'MEPF engineering': [], 'General contractor': [], 'Subcontractor': [] };
  const add = (a, n, w) => { pts[a] += n; why[a].push(w); };

  // what they do (web research) – and which audience is listed first
  let first = null, firstAt = Infinity;
  ICP_AUDIENCES.forEach(a => { const m = what.match(AUD_RE[a]); if (m) { add(a, 2, 'what they do'); if (m.index < firstAt) { firstAt = m.index; first = a; } } });
  if (first) add(first, 1, 'first-listed service');
  // company name
  ICP_AUDIENCES.forEach(a => { if (AUD_RE[a].test(name)) add(a, 2, 'name'); });
  // NAICS code
  if (naics === '541310' || naics === '541320') add('Architecture', 2, 'NAICS ' + naics);
  else if (/^5413(30|40)/.test(naics)) add('MEPF engineering', 2, 'NAICS ' + naics);
  else if (/^238/.test(naics)) add('Subcontractor', 3, 'NAICS ' + naics);
  else if (/^(236|237)/.test(naics)) add('General contractor', 2, 'NAICS ' + naics);
  // Apollo industry label
  if (/architect/.test(label)) add('Architecture', 1, 'Apollo industry');
  else if (/engineering/.test(label)) add('MEPF engineering', 1, 'Apollo industry');
  // AI fit note from web research
  const note = String(c.fit_note || '').toLowerCase();
  ICP_AUDIENCES.forEach(a => { if (AUD_RE[a].test(note)) add(a, 1, 'fit note'); });
  // Apollo team mix
  if (eng && des && eng >= des * 1.5) add('MEPF engineering', 1, 'mostly engineers');
  else if (eng && des && des >= eng * 1.5) add('Architecture', 1, 'mostly designers');

  const ranked = ICP_AUDIENCES.slice().sort((a, b) => pts[b] - pts[a]);
  const top = ranked[0], second = ranked[1];
  if (!pts[top]) return { audience: 'General contractor', match: 'Best guess', reason: 'Not enough evidence – check firm type', also: null };
  const lead = pts[top] - pts[second];
  let match = pts[top] < 3 ? 'Best guess' : lead >= 3 ? 'Core' : 'Close';
  // structural / civil / process engineers are not MEPF – nearest ICP audience only
  const nearestOnly = top === 'MEPF engineering' && !/\bmep\b|mepf|mechanical|electrical|plumbing|fire protection|hvac/.test(what + ' ' + name);
  if (nearestOnly && match === 'Core') match = 'Close';
  const also = pts[second] >= 3 ? second : null;
  return {
    audience: top,
    match: match,
    reason: top + (nearestOnly ? ' – nearest ICP audience for a structural / civil firm' : '') + ' (' + why[top].join(', ') + ')' + (also ? '; also ' + also : ''),
    also: also
  };
};

const out = [];

$input.all().forEach((item, i) => {
  const c = (companies[i] && companies[i].json) || {};
  const res = item.json || {};
  const ccId = c.cc_company_id ? String(c.cc_company_id) : null;
  const docs = Array.isArray(res.docs) ? res.docs : [];
  const aud = audienceOf(c);

  let projects_error = null;
  if (res.error) projects_error = typeof res.error === 'string' ? res.error : (res.error.message || JSON.stringify(res.error));

  // All projects that list our matched company (history) …
  const mine = ccId ? docs.filter(p => (p.companyId || []).map(String).includes(ccId)) : [];
  // … and the ones updated in the last 6 months (live pipeline)
  const recent = mine.filter(p => p.lastUpdatedDate && new Date(p.lastUpdatedDate) >= cutoff);

  // ---------- history line (template) ----------
  const hist = { Planning: 0, Bidding: 0, 'Post-Bid': 0, Other: 0 };
  mine.forEach(p => { hist[bucket(p.projectStatus)]++; });
  const allTime = Math.max((c.cc_match && c.cc_match.project_count) || 0, mine.length);
  const partial = allTime > mine.length;                      // stage mix only covers the projects returned

  // ---------- 10 most recent by start date (no cancelled) ----------
  const listable = mine.filter(p => !/cancel|abandon|withdrawn/i.test(p.projectStatus || ''));
  listable.sort((a, b) => {
    const sa = time(a.startDate), sb = time(b.startDate);
    if (sa !== null && sb !== null && sa !== sb) return sb - sa;
    if (sa === null && sb !== null) return 1;
    if (sb === null && sa !== null) return -1;
    return (time(b.lastUpdatedDate) || 0) - (time(a.lastUpdatedDate) || 0);
  });

  const toRow = p => {
    const a = p.address || {};
    const stage = p.projectStatus || NO_DATA;
    return {
      // template columns
      project: clean(p.title) || NO_DATA,
      location: [a.city, a.stateAbbr].filter(Boolean).join(', ') || NO_DATA,
      value: dollars(p.projectValue) || (p.projectValueRange || [])[0] || NO_DATA,
      stage: stage,
      stage_color: stageColor(stage),
      updated: fmtDate(p.lastUpdatedDate) || NO_DATA,
      // extra detail for later steps (not report columns)
      stage_group: bucket(stage),
      opportunity: opportunity(stage),
      value_usd: typeof p.projectValue === 'number' ? p.projectValue : null,
      type: (p.categories || []).join(', ') || NO_DATA,
      sector: (p.sectors || []).filter(s => s !== 'Public - All')[0] || NO_DATA,
      bid_date: fmtDate(p.bidDate) || NO_DATA,
      start: fmtDate(p.startDate) || NO_DATA,
      open: isOpen(stage) ? 'Yes' : 'No',
      link: p.projectUrl || null
    };
  };
  const rows = listable.slice(0, LIMIT_ROWS).map(toRow);

  // ---------- live pipeline summary (last 6 months) ----------
  const stage_counts = {};
  recent.forEach(p => { const s = p.projectStatus || 'Unknown'; stage_counts[s] = (stage_counts[s] || 0) + 1; });
  const totalValue = recent.reduce((s, p) => s + (typeof p.projectValue === 'number' ? p.projectValue : 0), 0);
  const openCount = recent.filter(p => isOpen(p.projectStatus)).length;
  const oppCount = {};
  recent.forEach(p => { const o = opportunity(p.projectStatus); oppCount[o] = (oppCount[o] || 0) + 1; });
  const typeCount = {};
  recent.forEach(p => (p.categories || []).forEach(t => { typeCount[t] = (typeCount[t] || 0) + 1; }));
  const topTypes = Object.keys(typeCount).sort((x, y) => typeCount[y] - typeCount[x]).slice(0, 3);
  const bestP = recent.slice().sort((a, b) =>
    (OPP_RANK[opportunity(b.projectStatus)] - OPP_RANK[opportunity(a.projectStatus)]) ||
    ((b.projectValue || 0) - (a.projectValue || 0)))[0];
  const best = bestP && OPP_RANK[opportunity(bestP.projectStatus)] >= 3 ? toRow(bestP) : null;

  let status;
  if (!ccId) status = 'No match';
  else if (projects_error) status = 'Error';
  else if (mine.length === 0) status = 'No projects';
  else status = 'Found';

  // ---------- A3 intro (template wording) ----------
  const co = possessive(shortName(c));
  const histParts = ['Planning', 'Bidding', 'Post-Bid'].map(k => hist[k] + ' ' + k);
  if (hist.Other) histParts.push(hist.Other + ' on hold / cancelled');
  let cc_intro;
  if (!ccId) cc_intro = 'Source: ConstructConnect. No matching company found' + ((c.cc_match && c.cc_match.reason) ? ' (' + c.cc_match.reason + ')' : '') + '.';
  else if (projects_error) cc_intro = 'Source: ConstructConnect. Projects could not be read this run (' + String(projects_error).slice(0, 80) + ').';
  else if (!mine.length) cc_intro = 'Source: ConstructConnect. No projects listed for ' + shortName(c) + '.';
  else cc_intro = 'Source: ConstructConnect. ' + allTime + (allTime === 1 ? ' project' : ' projects') + ' in ' + co + ' history (' + histParts.join(', ') + ')' +
    (partial ? ', stage mix from the ' + mine.length + ' most recent' : '') +
    (rows.length === 1 ? '; the most recent by start date:' : '; the ' + Math.min(LIMIT_ROWS, rows.length) + ' most recent by start date:');

  const summary = {
    status: status,
    // history (template line)
    history_total: allTime,
    history_planning: hist.Planning,
    history_bidding: hist.Bidding,
    history_post_bid: hist['Post-Bid'],
    history_other: hist.Other,
    history_partial: partial,
    // live pipeline (last 6 months) – used by Fit Score and the Account Plan
    stage_counts: stage_counts,
    projects_6m: recent.length + (mine.length === docs.length && res.numFound > docs.length ? '+' : ''),
    total_value_6m: dollars(totalValue) || NO_DATA,
    open_now: openCount,
    highest_opportunity: oppCount['Highest'] || 0,
    high_opportunity: oppCount['High'] || 0,
    best_opportunity: best ? best.project + ' (' + best.stage + ', ' + best.value + ')' : NO_DATA,
    top_types: topTypes.length ? topTypes.join(', ') : NO_DATA,
    all_time_projects: allTime,
    note: !ccId ? ((c.cc_match && c.cc_match.reason) || NO_DATA)
      : !mine.length ? 'No projects listed'
      : rows.length + ' of ' + mine.length + ' shown, most recent start date first'
  };

  out.push({
    json: Object.assign({}, c, {
      icp_audience: aud.audience,
      icp_audience_match: aud.match,
      icp_audience_reason: aud.reason,
      icp_audience_also: aud.also,
      cc_intro: cc_intro,
      cc_columns: ['Project name', 'Location', 'Value (USD)', 'Stage', 'Last updated'],
      cc_projects: rows,
      cc_summary: summary,
      cc_projects_error: projects_error
    })
  });
});

return out;
