// Step 4: Assemble Report (free – no API call). Run Once for All Items.
// Place it right after Merge Account Plan.
// Builds the Excelize Account Intelligence Report (template v2, sample-report design) as one HTML file per company.
// Page 1: header, fit gauge, 4 KPI cards, 01 Bottom line, 02 Three things, 03 Signals at a glance
// Page 2: 04 Stakeholder map, 05 Conversation plan, 06 Discovery questions
// Page 3: 07 Likely objections, Appendix, A1 Company snapshot, A2 Signal evidence (first rows)
// Page 4: A2 (rest), A3 Project pipeline, A4 Permit activity
// Page 5: A5 Relationship history, A6 People background
// Page 6: A7 Contact details, A8 Fit score breakdown
// Output: binary "report" (.html) – open it in a browser; Ctrl+P → Save as PDF gives the 6-page report.
const NO_DATA = 'No data found';
const PAGES = 6;
const A2_ON_PAGE_3 = 4;   // like the sample report: first 4 evidence rows on page 3, the rest on page 4

// ---------- helpers ----------
const e = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const arr = a => Array.isArray(a) ? a : [];
const has = s => s != null && String(s).trim() !== '' && String(s).trim() !== NO_DATA;
const val = (snap, k) => (snap[k] && has(snap[k].value)) ? snap[k].value : NO_DATA;
const link = (url, text) => url ? '<a href="' + e(url) + '" target="_blank">' + e(text) + '</a>' : e(text);
const shortUrl = u => String(u || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
// joins Claude's line breaks into one paragraph, adding a full stop where a line has none
const oneLine = s => String(s || '').split(/\s*\n+\s*/).map(x => x.trim()).filter(Boolean).map((x, i, a) => i < a.length - 1 && !/[.!?:;,]$/.test(x) ? x + '.' : x).join(' ');
const endDot = s => { s = oneLine(s); return s && !/[.!?"”]$/.test(s) ? s + '.' : s; };
const longDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const isoDate = new Date().toISOString().slice(0, 10);

// Badge colours (same palette as the sample report)
const BADGE = {
  'high': 'g', 'med–high': 'g', 'confirmed': 'g', 'likely': 'g', 'verified': 'g',
  'medium': 'a', 'unconfirmed': 'a', 'not checked': 'a',
  'negative': 'r', 'bounced': 'r',
  'low': 'n', 'not found': 'o',
  'context': 'b', 'in-house': 'p'
};
const badge = t => { const k = String(t || '').trim().toLowerCase().replace('med-high', 'med–high'); return '<span class="bd bd-' + (BADGE[k] || 'n') + '">' + e(t || '—') + '</span>'; };
const statusText = t => { const k = String(t || '').toLowerCase(); return '<span class="st ' + (k === 'verified' ? 'st-g' : k === 'bounced' ? 'st-r' : 'st-n') + '">' + e(t || '—') + '</span>'; };

const FIRM_TYPE = { 'Architecture': 'Architecture firm', 'MEPF engineering': 'MEP engineering firm', 'General contractor': 'General contractor', 'Subcontractor': 'Specialty subcontractor' };
const firmType = c => c.icp_audience === 'Architecture' && c.icp_audience_also === 'MEPF engineering' ? 'Architecture & MEP engineering firm' : (FIRM_TYPE[c.icp_audience] || 'AEC firm');

// Fit gauge (270° arc, like the sample report)
function gauge(score) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  const r = 40, cx = 55, cy = 52;
  const pt = a => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)].map(n => n.toFixed(2)).join(' ');
  const arc = (a0, sweep) => 'M ' + pt(a0) + ' A ' + r + ' ' + r + ' 0 ' + (sweep > 180 ? 1 : 0) + ' 1 ' + pt(a0 + sweep);
  const sweep = Math.max(0.01, 270 * s / 100);
  return '<svg viewBox="0 0 110 96" class="gauge"><path d="' + arc(135, 270) + '" class="g-bg"/><path d="' + arc(135, sweep) + '" class="g-val"/>' +
    '<text x="55" y="58" class="g-num">' + s + '</text><text x="55" y="72" class="g-sub">out of 100</text></svg>';
}

// Section heading: number chip + template name
const H = (num, title) => '<h2><span class="chip">' + num + '</span>' + e(title) + '</h2>';
const table = (cols, rows, cls) => '<table class="' + (cls || '') + '"><thead><tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';

// ---------- page frame ----------
const page = (n, company, body) =>
  '<section class="page"><header class="banner"><div class="logo">excelize</div><div class="bn-r"><div>ACCOUNT INTELLIGENCE · CONFIDENTIAL</div><div class="tag">Your extended BIM team</div></div></header>' +
  '<div class="content"><div class="fit">' + body + '</div></div>' +
  '<footer><span>Excelize · excelize.com · For internal sales use</span><span>' + e(company) + ' · Page ' + n + ' of ' + PAGES + '</span></footer></section>';

const CSS = `
*{box-sizing:border-box}body{margin:0;background:#e9edf2;font-family:"Segoe UI","DejaVu Sans",Helvetica,Arial,sans-serif;color:#1d2433;font-size:11.5px;line-height:1.35}
a{color:#1a6fd6;text-decoration:none}
.page{width:8.5in;height:11in;overflow:hidden;margin:24px auto;background:#fff;display:flex;flex-direction:column;box-shadow:0 2px 10px rgba(0,0,0,.12)}
.banner{background:#0c2340;color:#fff;display:flex;justify-content:space-between;align-items:center;padding:12px 0.7in;border-bottom:4px solid #1a6fd6}
.logo{font-size:26px;font-weight:700;letter-spacing:.3px}.bn-r{text-align:right;font-size:12px}.bn-r .tag{color:#9cc2f0}
.content{padding:18px 0.7in 6px;flex:1;min-height:0;overflow:hidden}
footer{margin:0 0.7in;padding:10px 0 18px;border-top:1px solid #dde3ea;color:#6b7280;font-size:11px;display:flex;justify-content:space-between}
.kicker{color:#1a6fd6;font-weight:700;font-size:11px;letter-spacing:.3px;margin:4px 0 10px}
.top{display:flex;justify-content:space-between;gap:18px}
h1{font-size:28px;color:#0c2340;margin:0 0 6px;line-height:1.1}
.sub{font-size:13.5px;color:#3b4456;margin-bottom:8px}.meta{color:#6b7280;font-size:11.5px}
.fitbox{width:190px;border:1px solid #dde3ea;border-radius:10px;text-align:center;overflow:hidden;flex-shrink:0}
.fitbox .fh{background:#0c2340;color:#fff;font-weight:700;font-size:11px;padding:6px}
.gauge{width:120px;height:104px;margin:4px auto -6px;display:block}.g-bg{fill:none;stroke:#dde3ea;stroke-width:9;stroke-linecap:round}.g-val{fill:none;stroke:#1a6fd6;stroke-width:9;stroke-linecap:round}
.g-num{font-size:30px;font-weight:700;fill:#0c2340;text-anchor:middle}.g-sub{font-size:8px;fill:#6b7280;text-anchor:middle}
.fitbox .tier{font-weight:700;color:#0c2340;font-size:14px}.fitbox .act{color:#1a6fd6;font-weight:700;font-size:11.5px;padding-bottom:10px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0 4px}
.kpi{background:#f5f7fa;border-top:3px solid #0c2340;padding:8px 10px 10px}.kpi .kt{font-size:10.5px;font-weight:700;color:#3b4456}
.kpi .kv{font-size:14px;font-weight:700;color:#0c2340;margin:6px 0}.kpi .kn{font-size:11px;color:#6b7280;margin-top:6px}
h2{font-size:16px;color:#0c2340;margin:14px 0 6px;padding-bottom:6px;border-bottom:1px solid #dde3ea;display:flex;align-items:center;gap:10px}
.chip{background:#1a6fd6;color:#fff;font-size:11px;font-weight:700;border-radius:4px;padding:3px 6px;min-width:26px;text-align:center}
.intro{color:#5b6475;margin:0 0 8px}
.callout{background:#eaf2fd;border-left:4px solid #1a6fd6;padding:9px 14px;margin:6px 0;font-size:12.5px}
.callout.dark{background:#f5f7fa;border-left-color:#0c2340}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.card{background:#f5f7fa;border-top:3px solid #1a6fd6;border-bottom:1px solid #dde3ea;display:flex;flex-direction:column}
.card .ch{font-weight:700;color:#0c2340;font-size:13px;padding:10px 12px 4px}.card .ch b{color:#1a6fd6}
.card .cf{padding:6px 12px 10px;flex:1}.card .cs{border-top:1px solid #dde3ea;padding:8px 12px;color:#1a6fd6}.card .cs b{color:#0c2340}
table{width:100%;border-collapse:collapse;margin:4px 0 2px;font-size:10.5px}
th{background:#0c2340;color:#fff;text-align:left;padding:6px 7px;font-size:10px}
td{padding:5px 7px;border-bottom:1px solid #dde3ea;vertical-align:middle}
tbody tr:nth-child(even) td{background:#f5f7fa}
td.b{font-weight:700;color:#0c2340}td.em{white-space:nowrap}td .note{font-weight:400;font-size:10px;color:#8a919e;margin-top:2px}td.c{text-align:center}td.r{text-align:right;white-space:nowrap}td.nw{white-space:nowrap}
.bd{display:inline-block;white-space:nowrap;min-width:70px;text-align:center;border-radius:6px;border:1px solid;padding:1px 8px;font-weight:700;font-size:11px}
.bd-g{color:#1e7b45;background:#e6f4ea;border-color:#2e8b57}.bd-a{color:#9a6a00;background:#fff4d6;border-color:#d9a400}
.bd-r{color:#b42318;background:#fde8e8;border-color:#d64545}.bd-n{color:#4b5563;background:#f1f3f5;border-color:#6b7280}
.bd-o{color:#8a919e;background:#fff;border-color:#b8bec8}.bd-b{color:#1a5fb4;background:#e7f0fc;border-color:#1a6fd6}.bd-p{color:#5b3fc4;background:#eee9fd;border-color:#7a5fe0}
.st{font-weight:700}.st-g{color:#1e7b45}.st-r{color:#b42318}.st-n{color:#8a919e;font-weight:400}
.fam{color:#1a6fd6;font-size:9.5px;font-weight:700;display:block}
.dodont{display:grid;grid-template-columns:1fr 1fr;margin-top:8px}.do{background:#e6f4ea;padding:10px 14px}.dont{background:#fde8e8;padding:10px 14px}
.do b{color:#1e7b45}.dont b{color:#b42318}
.star{color:#1a6fd6;font-size:13px}
.snap td.k{color:#5b6475;font-weight:700;font-size:10.5px;text-transform:uppercase;width:19%}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.dot-purple{background:#6b4fd8}.dot-blue{background:#1a6fd6}.dot-green{background:#1e7b45}.dot-grey{background:#5b6475}
.small{font-size:10.5px;color:#8a919e}.red{color:#b42318;font-weight:700}
.bar{display:inline-block;width:78px;height:7px;background:#dde3ea;border-radius:4px;vertical-align:middle;margin-right:8px;overflow:hidden}
.bar i{display:block;height:100%;border-radius:4px}.bar .bg{background:#1e7b45}.bar .ba{background:#d29a00}.bar .br{background:#b42318}
tr.total td{background:#eaf2fd!important;border-top:2px solid #0c2340;font-weight:700}
.notes{color:#5b6475;margin-top:8px}
.warn{background:#fff4d6;border:1px solid #d9a400;color:#7a5400;padding:8px 12px;margin:10px 0;font-size:11.5px}
@page{size:Letter;margin:0}
@media print{body{background:#fff}.page{margin:0;box-shadow:none;height:10.98in;break-after:page;page-break-after:always}.page:last-child{break-after:auto}
 *{-webkit-print-color-adjust:exact;print-color-adjust:exact}tr,.card,.callout{break-inside:avoid}}
`;

// Keeps every page on one sheet: if a page's content is too tall, it is scaled down a little (never below 70%)
const FIT_JS = '<script>function fitPages(){document.querySelectorAll(".content").forEach(function(c){var f=c.firstElementChild,z=1;f.style.zoom=1;' +
  'while((c.scrollHeight>c.clientHeight+1||f.getBoundingClientRect().bottom>c.getBoundingClientRect().bottom-8)&&z>0.7){z-=0.02;f.style.zoom=z;}});}' +
  'window.addEventListener("load",fitPages);window.addEventListener("beforeprint",fitPages);</script>';

const out = [];

for (const item of $input.all()) {
  const c = item.json;
  const snap = c.snapshot || {};
  const co = c.name || 'Company';
  const city = String(val(snap, 'hq_address')).split(',').slice(-2).map(x => x.replace(/\d{5}(-\d{4})?/, '').trim()).filter(Boolean).join(', ');
  const people = String(val(snap, 'size')).split(';')[0].trim();
  const web = c.website || val(snap, 'website');
  const lead = (c.account_plan_meta && c.account_plan_meta.action_lead) || '';

  // ================= PAGE 1 =================
  const kpiCard = k => k ? '<div class="kpi"><div class="kt">' + e(k.title) + '</div><div class="kv">' + e(k.value) + '</div>' + badge(k.badge) + '<div class="kn">' + e(k.note) + '</div></div>' : '';
  let bottom = c.bottom_line_html || e(c.bottom_line || NO_DATA);
  if (lead && bottom.startsWith(lead)) bottom = '<strong>' + e(lead) + '</strong>' + bottom.slice(lead.length);
  const errors = [c.account_plan_error, c.people_error, c.signals_error, c.research_error].filter(Boolean);

  const p1 =
    '<div class="kicker">ACCOUNT INTELLIGENCE REPORT · PAGE 1 IS THE 60-SECOND DECISION</div>' +
    '<div class="top"><div><h1>' + e(co) + '</h1>' +
    '<div class="sub">' + e(firmType(c)) + ' · ' + e(city) + ' · ' + e(people) + ' · ' + link(web, shortUrl(web)) + '</div>' +
    '<div class="meta">Data as of ' + longDate + ' · Account owner: ' + e(c.account_owner || 'to be assigned') + ' · Prepared by Revenue Operations &amp; GTM</div></div>' +
    '<div class="fitbox"><div class="fh">EXCELIZE FIT SCORE</div>' + gauge(c.fit_score) +
    '<div class="tier">' + e(c.fit_tier) + ' · ' + e(c.fit_label) + '</div><div class="act">' + e(c.fit_action) + '</div></div></div>' +
    (errors.length ? '<div class="warn"><b>Check before sharing:</b> ' + e(errors.join(' · ')) + '</div>' : '') +
    '<div class="kpis">' + [c.card_customer_fit, c.card_business_trigger, c.card_buying_intent, c.card_data_coverage].map(kpiCard).join('') + '</div>' +
    H('01', 'Bottom line') +
    '<div class="callout">' + bottom + '</div>' +
    '<div class="callout dark"><b>Recommended action:</b> ' + e(c.recommended_action || NO_DATA) + '</div>' +
    H('02', 'Three things to know before you reach out') +
    '<div class="cards">' + arr(c.three_things).map((t, i) =>
      '<div class="card"><div class="ch"><b>' + (i + 1) + '</b> ' + e(t.headline) + '</div><div class="cf">' + e(oneLine(t.fact)) + '</div>' +
      '<div class="cs"><b>So what:</b> ' + e(t.so_what) + '</div></div>').join('') + '</div>' +
    H('03', 'Signals at a glance') +
    '<p class="intro">The most material signals, with confidence. Full evidence is in A2.</p>' +
    table(['Signal', 'What we see', 'What it may mean', 'Confidence'], arr(c.signals_at_a_glance).map(s =>
      '<tr><td class="b">' + e(s.signal) + '</td><td>' + e(s.what_we_see) + '</td><td>' + e(s.what_it_may_mean) + '</td><td class="c">' + badge(s.confidence) + '</td></tr>'));

  // ================= PAGE 2 =================
  const sh = arr(c.stakeholders);
  const targets = sh.filter(s => s.buying_role !== 'Not a target now');
  const nonTargets = sh.filter(s => s.buying_role === 'Not a target now');
  const shRows = targets.map(s =>
    '<tr><td class="b">' + s.rank + ' ' + e(s.person) + '<div class="small">' + e(s.title) + '</div></td><td class="b">' + e(s.buying_role) + '</td><td>' + e(s.why_them) +
    '</td><td>' + e(s.first_channel) + '</td><td>' + statusText(s.email_status) + '</td></tr>');
  if (nonTargets.length) shRows.push('<tr><td class="b">— ' + e(nonTargets.map(s => s.person).join(' / ')) + '</td><td class="b">Not a target now</td><td>' +
    e(nonTargets.map(s => s.why_them).join('; ')) + '</td><td>No outreach</td><td>' + statusText(nonTargets[0].email_status) + '</td></tr>');
  const cp = c.conversation_plan || {};
  const joinList = l => arr(l).map(x => String(x).replace(/\.$/, '')).filter(Boolean).join('; ') + '.';
  const opening = oneLine(cp.opening_line).replace(/^["“]|["”]$/g, '');

  const p2 =
    '<div class="kicker">ACTION PLAN · HOW TO APPROACH THIS ACCOUNT</div>' +
    H('04', 'Stakeholder map') +
    '<p class="intro">' + e(c.stakeholder_intro) + '</p>' +
    table(['Person', 'Buying role', 'Why them', 'First channel', 'Email'], shRows) +
    H('05', 'Conversation plan') +
    '<div class="callout"><b>Opening line:</b> “' + e(opening) + '”</div>' +
    '<div class="callout dark"><b>Value hypothesis:</b> ' + e(cp.value_hypothesis || NO_DATA) + '</div>' +
    '<div class="dodont"><div class="do"><b>DO</b> ' + e(joinList(cp.do)) + '</div><div class="dont"><b>DON’T</b> ' + e(joinList(cp.dont)) + '</div></div>' +
    H('06', 'Discovery questions') +
    '<p class="intro">Answers that tell us whether to pursue. <span class="star">★</span> marks the three that matter most on the first call.</p>' +
    table(['', 'Topic', 'Question', 'Context: why we ask', 'Ask'], arr(c.discovery_questions).map(q =>
      '<tr><td class="c star">' + (q.star ? '★' : '') + '</td><td class="b">' + e(q.topic) + '</td><td class="b">' + e(q.question) + '</td><td>' + e(q.context) + '</td><td>' + e(q.ask) + '</td></tr>'));

  // ================= PAGE 3 =================
  const quote = s => { s = oneLine(s).replace(/^["“]|["”]$/g, '').replace(/[.]$/, ''); return '“' + s + '.”'; };
  const A1_FULL = ['hq_address', 'what_they_do', 'key_markets'];
  const A1_PAIRS = [['legal_name', 'founded'], ['website', 'linkedin'], ['main_phone', 'industry'], ['size', 'revenue'], ['offices', 'ownership'], ['headcount_trend', 'in_our_systems'], ['time_zone', 'core_software']];
  const label = k => e((snap[k] && snap[k].label) || k.replace(/_/g, ' '));
  const cell = k => {
    const v = val(snap, k);
    if (k === 'website' && has(v)) return link(v, shortUrl(v));
    if (k === 'linkedin' && has(v)) return link(v, co + ' company page');
    return e(v);
  };
  const snapRows = A1_FULL.map(k => '<tr><td class="k">' + label(k) + '</td><td colspan="3">' + cell(k) + '</td></tr>')
    .concat(A1_PAIRS.map(([a, b]) => '<tr><td class="k">' + label(a) + '</td><td>' + cell(a) + '</td><td class="k">' + label(b) + '</td><td>' + cell(b) + '</td></tr>'));

  const ev = arr(c.signal_evidence);
  const evRow = s => {
    let txt = e(s.evidence);
    txt = txt.replace(/^(In-house|Outsourc\w*|Unclear|Mixed):/, '<strong>Observation: $1.</strong>');
    return '<tr><td><span class="fam">' + e(s.family) + '</span><b>' + e(s.signal) + '</b></td><td>' + txt + '</td><td>' + link(s.source_url, s.source) + '</td><td class="c">' + badge(s.strength) + '</td></tr>';
  };
  const evCols = ['Signal', 'Evidence', 'Source', 'Strength'];

  const p3 =
    H('07', 'Likely objections and how to respond') +
    table(['If they say…', 'Respond with…'], arr(c.objections).map(o =>
      '<tr><td class="b" style="width:32%">' + e(quote(o.if_they_say)) + '</td><td>' + e(o.respond_with) + '</td></tr>')) +
    '<div class="kicker" style="margin-top:22px">APPENDIX · SUPPORTING EVIDENCE</div>' +
    H('A1', 'Company snapshot') +
    table(['', '', '', ''], snapRows, 'snap').replace('<thead><tr><th></th><th></th><th></th><th></th></tr></thead>', '') +
    H('A2', 'Signal evidence') +
    '<p class="intro">' + e(c.signal_evidence_intro || 'Grouped by signal family. Every family is always checked; missing data is shown, never hidden.') + '</p>' +
    table(evCols, ev.slice(0, A2_ON_PAGE_3).map(evRow));

  // ================= PAGE 4 =================
  const ccs = c.cc_summary || {};
  let ccText = String(c.cc_intro || NO_DATA).replace(/No matching company found \(Company not found in ConstructConnect\)\./, 'No matching company found in ConstructConnect.');
  if (ccs.status === 'Found' && has(ccs.total_value_6m))
    ccText = ccText.replace(/;\s*the (\d+ most recent[^:]*:)\s*$/, '. Last 6 months: ' + ccs.projects_6m + ' projects, ' + ccs.total_value_6m + '. The $1');
  const ccIntro = e(ccText).replace(/(\d+ projects)( in )/, '<b>$1</b>$2');
  const ccRows = arr(c.cc_projects).map(p =>
    '<tr><td class="b">' + link(p.link, p.project) + '</td><td class="nw">' + e(p.location) + '</td><td class="r">' + e(p.value) + '</td><td class="nw"><span class="dot dot-' + e(p.stage_color || 'grey') + '"></span>' + e(p.stage) + '</td><td class="nw">' + e(p.updated) + '</td></tr>');
  const pa = c.permit_activity || {};
  const permitRows = arr(pa.rows).map(r =>
    '<tr><td class="b">' + e(r.permit || r.description) + '</td><td>' + e(r.location) + '</td><td class="r">' + e(r.job_value || r.value) + '</td><td>' + e(r.status) + '</td><td class="nw">' + e(r.filed) + '</td></tr>');

  const p4 =
    (ev.length > A2_ON_PAGE_3 ? table(evCols, ev.slice(A2_ON_PAGE_3).map(evRow)) : '') +
    H('A3', 'Project pipeline') +
    '<p class="intro">' + ccIntro + '</p>' +
    (ccRows.length ? table(['Project name', 'Location', 'Value (USD)', 'Stage', 'Last updated'], ccRows) : '') +
    H('A4', 'Permit activity') +
    '<p class="intro">' + e(endDot(pa.intro || 'Not checked')) + '</p>' +
    (permitRows.length ? table(arr(pa.columns).length ? pa.columns : ['Permit', 'Location', 'Job value (USD)', 'Status', 'Filed'], permitRows) : '');

  // ================= PAGE 5 =================
  const rel = c.relationship_history || {};
  const relRows = arr(rel.rows).map(r =>
    '<tr><td class="b">' + e(r.item) + '</td><td>' + e(r.what) + '</td><td>' + e(r.source) + '</td><td class="c">' + badge(r.status) + '</td></tr>');
  const kp = arr(c.key_people);
  const titleNotes = kp.filter(p => p.previous_title).map(p => 'Apollo now lists ' + p.full_name + ' as ' + p.title + ' (was ' + p.previous_title + ').');
  const peopleRows = kp.map(p =>
    '<tr><td class="b">' + link(p.linkedin, p.rank + ' ' + (p.display_name || p.full_name)) + '</td><td>' + e(p.title) + '</td><td>' + e(p.why_they_matter) + '</td><td>' + e(p.background) +
    (p.background_source ? '<div class="small">Source: ' + link(p.background_url, p.background_source) + '</div>' : '') + '</td></tr>');
  const contactRows = arr(c.contacts).map(ct => {
    const dnc = String(ct.dnc_check || '');
    const note = String(ct.notes || '').split(/;\s*/).filter(x => x && !/^Direct phone not revealed yet$/i.test(x)).join('; ');
    return '<tr><td class="b">' + e(ct.person) + (note ? '<div class="note">' + e(note) + '</div>' : '') + '</td><td class="nw">' + (ct.linkedin ? link(ct.linkedin, 'View profile') : '—') + '</td>' +
      '<td class="em">' + e(ct.email || 'Not found') + (ct.personal_email ? '<div class="small">' + e(ct.personal_email) + ' (personal)</div>' : '') + '</td>' +
      '<td>' + statusText(ct.email_status) + '</td><td class="nw">' + e(ct.phone) + '</td><td>' + e(ct.phone_type) + '</td>' +
      '<td>' + (/do not call/i.test(dnc) ? '<span class="red">Do Not Call</span>' : /not checked/i.test(dnc) ? '<span class="small">Not checked</span>' : e(dnc)) + '</td></tr>';
  });

  const p5 =
    H('A5', 'Relationship history') +
    '<p class="intro">' + e(rel.intro || ('What Excelize already knows about ' + co + ', and what has already happened.')) + '</p>' +
    table(['Item', 'What we know', 'Source', 'Status'], relRows) +
    H('A6', 'People background') +
    '<p class="intro">' + e([c.key_people_intro].concat(titleNotes).filter(Boolean).join(' ')) + '</p>' +
    table(['Person', 'Role', 'Why they matter', 'Background'], peopleRows);

  const a7 =
    H('A7', 'Contact details') +
    '<p class="intro">' + e(c.contacts_intro || NO_DATA).replace('Do Not Call', '<b>Do Not Call</b>') + '</p>' +
    table(['Person', 'LinkedIn', 'Email', 'Status', 'Phone', 'Type', 'DNC check'], contactRows);

  // ================= PAGE 6 =================
  const barCls = r => r >= 0.7 ? 'bg' : r >= 0.4 ? 'ba' : 'br';
  const fitRows = arr(c.fit_breakdown).map(f => {
    const r = f.max ? f.score / f.max : 0;
    return '<tr><td class="b">' + e(f.factor) + '</td><td class="nw"><span class="bar"><i class="' + barCls(r) + '" style="width:' + Math.round(r * 100) + '%"></i></span><b>' + e(f.score_text) + '</b></td><td>' + e(f.why) + '</td></tr>';
  });
  const totalText = String(c.fit_total_text || '');
  const tierPart = c.fit_tier + ' · ' + c.fit_label + '.';
  fitRows.push('<tr class="total"><td>Total</td><td class="r" style="font-size:16px">' + e(c.fit_score) + ' <span class="small">/ 100</span></td><td>' +
    (totalText.startsWith(tierPart) ? '<b>' + e(tierPart) + '</b>' + e(totalText.slice(tierPart.length)) : e(totalText)) + '</td></tr>');

  const p6 = a7 +
    H('A8', 'Fit score breakdown') +
    '<p class="intro">' + e(c.fit_intro || '').replace(/(80\+|60–79|40–59|&lt;40)/g, '<b>$1</b>') + '</p>' +
    table(['Factor', 'Score', 'Why'], fitRows) +
    '<p class="notes">' + e(c.fit_notes || '') + '</p>';

  // ================= ASSEMBLE =================
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + e(co) + ' – Excelize Account Intelligence Report</title><style>' + CSS + '</style></head><body>' +
    [p1, p2, p3, p4, p5, p6].map((b, i) => page(i + 1, co, b.replace(/ - /g, ' – '))).join('') + FIT_JS + '</body></html>';

  const fileName = 'Excelize Account Intelligence - ' + co.replace(/[^A-Za-z0-9]+/g, ' ').trim() + ' - ' + isoDate + '.html';

  out.push({
    json: Object.assign({}, c, {
      report_file_name: fileName,
      report_built: longDate,
      report_size_kb: Math.round(html.length / 1024),
      report_check: errors.length ? 'Check before sharing: ' + errors.join(' · ') : 'OK'
    }),
    binary: {
      report: {
        data: Buffer.from(html, 'utf8').toString('base64'),
        mimeType: 'text/html',
        fileName: fileName,
        fileExtension: 'html'
      }
    }
  });
}

return out;
