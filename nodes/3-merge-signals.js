// SECTION 2 – Step 5: Merge Signals (16 buying signals, intro line + score)
// Template v2: also builds A2 Signal evidence = 13 rows grouped by family
// (HIRING · CAPACITY · DEMAND · GROWTH · RECENT NEWS · TECHNOLOGY). The 3 engagement
// signals (website visit, past outreach, email activity) stay in "signals" for the
// Fit score and are shown in A4 Relationship history instead of A2.
// Apollo signals (11) come from "Apollo Team & Engagement" via Build Signals Prompt; web signals (5) from Signals Research (this node's input)
const companies = $('Build Signals Prompt').all();

const NO_DATA = 'No data found';

// Template order (hand-made sample report, section 02)
const ORDER = [
  'unfilled_bim_role', 'revit_heavy_hiring', 'city_hiring_push', 'headcount',
  'new_office', 'earlier_expansion', 'recent_news',
  'bim_tagged_firm', 'autodesk_tools', 'in_house_bim_team', 'outsource_check',
  'right_project_mix', 'project_wins', 'website_visit', 'past_outreach', 'email_activity'
];
const WEB_LABELS = {
  new_office: 'New office (last 12 months)',
  earlier_expansion: 'Earlier expansion',
  recent_news: 'Recent news',
  outsource_check: 'In-house / outsource BIM check',
  project_wins: 'Recent project wins'
};
// A2 Signal evidence – families and row order (template v2)
const A2_ORDER = [
  ['HIRING', 'unfilled_bim_role'], ['HIRING', 'revit_heavy_hiring'], ['HIRING', 'city_hiring_push'],
  ['CAPACITY', 'in_house_bim_team'], ['CAPACITY', 'outsource_check'],
  ['DEMAND', 'right_project_mix'], ['DEMAND', 'project_wins'],
  ['GROWTH', 'headcount'], ['GROWTH', 'new_office'], ['GROWTH', 'earlier_expansion'],
  ['RECENT NEWS', 'recent_news'],
  ['TECHNOLOGY', 'autodesk_tools'], ['TECHNOLOGY', 'bim_tagged_firm']
];
// Recent news row is named after its topic, e.g. "CEO change" (from the evidence text)
const NEWS_TOPICS = [
  [/\b(new |named |appointed |became |promoted to )?(ceo|chief executive)\b/i, 'CEO change'],
  [/\b(coo|chief operating|president)\b/i, 'Leadership change'],
  [/\b(bim|vdc|design technology) (manager|director|leader|lead)\b/i, 'New BIM leader'],
  [/\b(acquir|acquisition|merg|private equity|ownership|esop|employee[- ]owned)\w*/i, 'Ownership change'],
  [/\b(layoff|closure|closed|lawsuit|bankrupt)\w*/i, 'Negative news'],
  [/\b(award|ranked|ranking|top \d+)\b/i, 'Award / ranking'],
  [/\b(contract|awarded|selected|won)\b/i, 'New contract'],
  [/\b(rebrand|renamed|new name)\b/i, 'Rebrand']
];
const A2_LABELS = {
  unfilled_bim_role: 'Unfilled BIM role', revit_heavy_hiring: 'Revit-heavy hiring', city_hiring_push: 'City hiring push',
  in_house_bim_team: 'In-house BIM team', outsource_check: 'In-house / outsource BIM check',
  right_project_mix: 'Right project mix', project_wins: 'Recent project wins',
  headcount: 'Headcount (last 12 months)', new_office: 'New office (last 12 months)', earlier_expansion: 'Earlier expansion',
  recent_news: 'Recent news', autodesk_tools: 'Autodesk tools', bim_tagged_firm: 'BIM-tagged firm'
};
const newsTopic = ev => { for (const [re, t] of NEWS_TOPICS) if (re.test(ev || '')) return t; return 'Recent news'; };

// Score points per strength. Not found = 0 points but counted; Context / In-house / Not checked are left out of the score
const POINTS = { High: 3, Medium: 2, Low: 1, Negative: -2 };
const SCORED = s => ['High', 'Medium', 'Low', 'Negative'].includes(s.strength) || (s.found === 'No' && s.strength === 'Not found');
const BLOCKED = /(indeed|glassdoor|ziprecruiter|bebee|jooble|simplyhired|talent\.com|zoominfo|rocketreach|crunchbase|linkedin\.com\/jobs)/i;

// Read the JSON Claude returned (handles code fences or extra text)
function extractJson(text) {
  if (!text) return null;
  const clean = text.replace(/```json|```/g, '').trim();
  try { const j = JSON.parse(clean); if (j && j.signals) return j; } catch (e) {}
  for (let start = clean.indexOf('{'); start !== -1; start = clean.indexOf('{', start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < clean.length; i++) {
      const ch = clean[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { const j = JSON.parse(clean.slice(start, i + 1)); if (j && j.signals) return j; } catch (e) {}
          break;
        }
      }
    }
  }
  return null;
}

const notFound = (key, label, evidence) =>
  ({ key, label, found: 'No', evidence: evidence || NO_DATA, source: 'None', source_url: null, strength: 'Not found' });

const out = [];

$input.all().forEach((item, i) => {
  const c = (companies[i] && companies[i].json) || {};
  const res = item.json || {};

  // 1. Read Claude reply
  let signals_error = null;
  let web = {};
  if (res.error) {
    signals_error = typeof res.error === 'string' ? res.error : (res.error.message || JSON.stringify(res.error));
  } else {
    const text = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const parsed = extractJson(text);
    if (parsed) web = parsed.signals || {};
    else signals_error = res.stop_reason === 'max_tokens' ? 'Reply cut off (max_tokens) – raise max_tokens in Signals Research' : 'Could not read signals reply';
  }

  // 2. Web signals (5) in the same shape as Apollo signals
  const webSignals = {};
  Object.keys(WEB_LABELS).forEach(key => {
    const label = WEB_LABELS[key];
    const w = web[key] || {};
    let evidence = String(w.evidence || '').trim();
    const url = /^https?:\/\//i.test(w.source_url || '') ? w.source_url : null;
    const found = (w.found === true || w.found === 'true') && evidence && !/^(not found|no data found|none|n\/a)\.?$/i.test(evidence);
    if (!found) { webSignals[key] = notFound(key, label); return; }
    if (url && BLOCKED.test(url)) { webSignals[key] = notFound(key, label, 'Only untrusted sources found (job board / data broker)'); return; }

    if (w.date && !evidence.includes(w.date)) evidence += ' (' + w.date + ')';
    let strength = ['High', 'Medium', 'Low', 'Negative', 'In-house'].includes(w.strength) ? w.strength : 'Low';
    if (key === 'outsource_check') {
      const v = String(w.verdict || '').toLowerCase();
      if (v.startsWith('outsourc')) { strength = 'High'; evidence = 'Outsources: ' + evidence; }
      else if (v.startsWith('in-house') || v.startsWith('in house')) { strength = 'In-house'; evidence = 'In-house: ' + evidence; }
      else { strength = 'Low'; evidence = 'Unclear: ' + evidence; }
    }
    if (key !== 'recent_news' && strength === 'Negative') strength = 'Low';
    // Recent news is High only for top leadership, BIM leader or ownership change
    if (key === 'recent_news' && strength === 'High' &&
        !/\b(ceo|chief executive|coo|chief operating|president|managing (principal|partner)|bim|vdc|design technology|acquir|acquisition|merg|ownership|private equity)\b/i.test(evidence)) strength = 'Medium';
    if (key === 'recent_news' && !w.date && !/\b(19|20)\d{2}\b/.test(evidence)) evidence += ' (date not stated)';
    webSignals[key] = { key, label, found: 'Yes', evidence, source: w.source_name || 'Web', source_url: url, strength };
  });

  // 2b. Outsource check fallback – no public evidence → judge from Apollo in-house team
  if (webSignals.outsource_check.found === 'No') {
    const t = c.bim_team || {};
    const b = t.bim_cad_count || 0, d = t.designer_count || 0;
    const size = (c.snapshot && c.snapshot.size && c.snapshot.size.value && c.snapshot.size.value !== NO_DATA) ? String(c.snapshot.size.value).split(';')[0] : null;
    if (b >= 3) {
      webSignals.outsource_check = { key: 'outsource_check', label: WEB_LABELS.outsource_check, found: 'Yes',
        evidence: 'Likely in-house: no public outsourcing evidence; Apollo shows ' + b + ' BIM/CAD staff' + (d ? ' and ' + d + ' designers' : ''),
        source: 'Apollo', source_url: null, strength: 'In-house' };
    } else if (b + d > 0) {
      webSignals.outsource_check = { key: 'outsource_check', label: WEB_LABELS.outsource_check, found: 'Yes',
        evidence: 'Unclear: no public outsourcing evidence; only ' + b + ' dedicated BIM/CAD staff' + (size ? ' for ' + size : '') + ' – possible room for outside BIM support',
        source: 'Apollo', source_url: null, strength: 'Low' };
    }
  }

  // 3. Website visit – not connected yet
  const websiteVisit = { key: 'website_visit', label: 'Visited Excelize website', found: 'No', evidence: 'Not checked yet (Apollo website visitors not connected)', source: 'None', source_url: null, strength: 'Not checked' };

  // 4. All 16 signals in template order
  const apollo = {};
  (Array.isArray(c.signals_apollo) ? c.signals_apollo : []).forEach(s => { apollo[s.key] = s; });
  const signals = ORDER.map(key => {
    if (key === 'website_visit') return websiteVisit;
    if (webSignals[key]) return webSignals[key];
    const s = apollo[key];
    return s ? Object.assign({ source_url: null }, s) : notFound(key, key);
  });

  // 4b. A2 Signal evidence – 13 rows grouped by family
  const byKey = {};
  signals.forEach(s => { byKey[s.key] = s; });
  const signal_evidence = A2_ORDER.map(([family, key]) => {
    const s = byKey[key] || notFound(key, A2_LABELS[key]);
    const label = s.label && s.label !== key ? s.label : A2_LABELS[key];
    const signal = key === 'recent_news' && s.found === 'Yes' ? newsTopic(s.evidence) : label;
    return { family, key, signal, evidence: s.evidence, source: s.source, source_url: s.source_url || null, strength: s.strength };
  });
  const signal_evidence_intro = 'Grouped by signal family. Every family is always checked; missing data is shown, never hidden.';

  // 5. Counts, score and intro line
  const found = signals.filter(s => s.found === 'Yes');
  const positive = found.filter(s => s.strength === 'High' || s.strength === 'Medium');
  const negative = found.filter(s => s.strength === 'Negative');
  const missing = signals.filter(s => s.found === 'No' && s.strength === 'Not found');
  const count = level => found.filter(s => s.strength === level).length;
  const scored = signals.filter(SCORED);
  const points = scored.reduce((sum, s) => sum + (POINTS[s.strength] || 0), 0);
  const signal_score = scored.length ? Math.max(0, Math.round((points / (scored.length * 3)) * 100)) : 0;
  const signals_high = count('High');
  const signal_level = (signal_score >= 45 || signals_high >= 5) ? 'Hot' : (signal_score >= 25 || signals_high >= 2) ? 'Warm' : 'Cold';

  const strongest = found.filter(s => s.strength === 'High').map(s => s.label).slice(0, 3);
  const signals_intro =
    positive.length + ' of ' + signals.length + ' signals point to a real BIM need' +
    (strongest.length ? ' (strongest: ' + strongest.join(', ') + ')' : '') + '; ' +
    missing.length + ' signal' + (missing.length === 1 ? '' : 's') + ' we checked ' + (missing.length === 1 ? 'was' : 'were') + ' not found' +
    (negative.length ? '; watch: ' + negative.map(s => s.label).join(', ') : '') + '.';

  // 6. Top 3 signals for the Verdict section later
  const RANK = { High: 3, Medium: 2 };
  const top_signals = positive.slice().sort((a, b) => RANK[b.strength] - RANK[a.strength]).slice(0, 3).map(s => s.label + ': ' + s.evidence);

  // 7. Cost of this research call
  const u = res.usage || {};
  const searches = (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
  const signals_cost_usd = Math.round((((u.input_tokens || 0) * 2 + (u.output_tokens || 0) * 10) / 1e6 + searches * 0.01) * 1000) / 1000;
  const total_cost_usd = Math.round(((c.research_cost_usd || 0) + signals_cost_usd) * 1000) / 1000;

  // 8. Remove working fields, keep the rest
  const rest = Object.assign({}, c);
  delete rest.signals_prompt;
  delete rest.signals_apollo;
  delete rest.signals_apollo_found;

  out.push({
    json: Object.assign(rest, {
      signals,
      signals_intro,
      signal_evidence,
      signal_evidence_intro,
      signal_evidence_columns: ['Signal', 'Evidence', 'Source', 'Strength'],
      signals_found: found.length,
      signals_total: signals.length,
      signals_high,
      signals_medium: count('Medium'),
      signals_low: count('Low'),
      signals_negative: negative.length,
      signals_not_found: missing.length,
      signal_score,
      signal_level,
      top_signals,
      signals_error,
      signals_cost_usd,
      total_cost_usd
    })
  });
});

return out;
