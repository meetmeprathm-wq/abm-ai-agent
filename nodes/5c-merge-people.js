// SECTION 4 – Step 3c: Merge People (Key people table: Person + LinkedIn · Role · Why they matter · Background)
// Inputs: this node's input = People Research (Claude reply) · company data from Build People Prompt (same order)
// The intro always names the SAME person as key_people_meta.start_with (rank 1 from Pick Key People).
// Claude's own 'start_with' sentence is used only when it is about that person; otherwise we write it from the data.
const companies = $('Build People Prompt').all();
const NO_DATA = 'Not found';

// Escape raw line breaks / tabs that sit INSIDE a JSON string (web-search replies with citations
// come back as many small text blocks, and a break can land in the middle of a value)
function fixStrings(t) {
  let outS = '', inStr = false, esc = false;
  for (const ch of t) {
    if (inStr) {
      if (esc) { esc = false; outS += ch; continue; }
      if (ch === '\\') { esc = true; outS += ch; continue; }
      if (ch === '"') { inStr = false; outS += ch; continue; }
      if (ch === '\n' || ch === '\r' || ch === '\t') { outS += ' '; continue; }
      outS += ch;
    } else { if (ch === '"') inStr = true; outS += ch; }
  }
  return outS;
}
// Read the JSON Claude returned (handles code fences, extra text and broken line breaks)
function extractJson(text) {
  if (!text) return null;
  return extractJsonRaw(text) || extractJsonRaw(fixStrings(text));
}
function extractJsonRaw(text) {
  const clean = text.replace(/```json|```/g, '').replace(/<\/?cite[^>]*>/gi, '').trim();
  try { const j = JSON.parse(clean); if (j && j.people) return j; } catch (e) {}
  for (let start = clean.indexOf('{'); start !== -1; start = clean.indexOf('{', start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < clean.length; i++) {
      const ch = clean[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { try { const j = JSON.parse(clean.slice(start, i + 1)); if (j && j.people) return j; } catch (e) {} break; } }
    }
  }
  return null;
}

// Remove <cite> tags and tidy text
const tidy = s => String(s || '').replace(/<\/?cite[^>]*>/gi, '').replace(/\s{2,}/g, ' ').trim();
const isEmpty = s => !s || /^(not found|none|n\/a|null|unknown)\.?$/i.test(String(s).trim());
const url = s => (/^https?:\/\//i.test(String(s || '').trim()) ? String(s).trim() : null);
// Clean a researched name for email / Apollo matching:
// "John Volence, PE, CEM" → name "John Volence" + credentials "PE, CEM"
// "Robert (Bob) Dick, PE" → first "Robert", last "Dick", goes by "Bob"
// "John P. McCullough"    → first "John", last "McCullough"
const SUFFIX_RE = /^(jr|sr|ii|iii|iv)\.?$/i;
const splitName = raw => {
  let n = tidy(raw), creds = '', nick = null;
  const parts0 = n.split(/\s*,\s*/);
  if (parts0.length > 1) {
    const keep = [parts0[0]];
    parts0.slice(1).forEach(x => { if (SUFFIX_RE.test(x)) keep.push(x); else creds += (creds ? ', ' : '') + x; });
    n = keep.join(' ');
  }
  n = n.replace(/\s*[("“]([^)"”]+)[)"”]\s*/, (m, x) => { nick = x.trim(); return ' '; }).replace(/\s+/g, ' ').trim();
  const w = n.split(' ').filter(x => !SUFFIX_RE.test(x));
  return { full: n, first: w[0] || '', last: w.length > 1 ? w[w.length - 1] : '', credentials: creds || null, goes_by: nick };
};
const BLOCKED = /(zoominfo|rocketreach|contactout|lusha|signalhire|apollo\.io|spokeo|cbinsights)/i;

const out = [];

$input.all().forEach((item, i) => {
  const c = Object.assign({}, (companies[i] && companies[i].json) || {});
  const res = item.json || {};

  // 1. Read Claude reply
  let people_error = null, research = { people: [], start_with: '' };
  if (res.error) people_error = typeof res.error === 'string' ? res.error : (res.error.message || JSON.stringify(res.error));
  else {
    // join text blocks WITHOUT adding line breaks – citation blocks can split a JSON value
    const text = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed = extractJson(text);
    if (parsed) research = parsed;
    else people_error = res.stop_reason === 'max_tokens' ? 'Reply cut off (max_tokens) – raise max_tokens in People Research'
      : 'Could not read people reply (stop: ' + (res.stop_reason || 'unknown') + '; text starts: ' + text.slice(0, 80).replace(/\s+/g, ' ') + ')';
  }
  const byRank = {};
  (research.people || []).forEach(r => { byRank[Number(r.rank)] = r; });

  // 2. Merge research into the picked people
  const key_people = (c.key_people || []).map(p => {
    const r = byRank[p.rank] || {};
    const confirmed = r.name_confirmed === true || r.name_confirmed === 'true';
    const nm = splitName(confirmed && !isEmpty(r.full_name) ? r.full_name : (p.full_name || (p.first_name + ' ' + p.last_name).trim()));
    const fullName = nm.full;
    const srcUrl = url(r.source_url);
    const trusted = !(srcUrl && BLOCKED.test(srcUrl));
    const background = trusted && !isEmpty(tidy(r.background)) ? tidy(r.background) : NO_DATA;
    return Object.assign({}, p, {
      full_name: fullName,
      first_name: nm.first || p.first_name,
      last_name: nm.last || p.last_name,
      goes_by: nm.goes_by,
      credentials: nm.credentials,
      display_name: fullName + (nm.credentials ? ', ' + nm.credentials : ''),   // for the A6 table only
      name_confirmed: confirmed || !!p.full_name,
      linkedin: p.linkedin || url(r.linkedin_url),
      role: p.title + ' · ' + p.persona_role,
      why_they_matter: !isEmpty(tidy(r.why_they_matter)) ? tidy(r.why_they_matter) : p.role_reason,
      background: background,
      background_source: background === NO_DATA ? null : (tidy(r.source_name) || 'Web'),
      background_url: background === NO_DATA ? null : srcUrl
    });
  });

  // 3. Intro line – one person only: the start_with person chosen by Pick Key People
  const meta = Object.assign({}, c.key_people_meta || {});
  // Apollo masks unconfirmed last names ("Zac St***n") – show "Zac St." in the report instead
  const shown = p => /\*/.test(p.full_name || '') ? String(p.full_name).replace(/(\S+?)\*+\S*$/, '$1.') : p.full_name;
  const first = key_people.find(p => p.person_id && p.person_id === meta.start_with_person_id)
    || key_people.find(p => p.rank === meta.start_with_rank) || key_people[0];
  const claudeLine = tidy(research.start_with);
  const sameName = n => { const w = String(n || '').toLowerCase().split(/\s+/).filter(x => x.length > 1 && !/\*/.test(x)); return w.length > 0 && w.every(x => claudeLine.toLowerCase().includes(x)); };
  // Claude's line is kept only if it names our start person and no other key person
  const others = key_people.filter(p => p !== first).some(p => sameName(p.full_name));
  let key_people_intro;
  if (!first) key_people_intro = NO_DATA;
  else if (!isEmpty(claudeLine) && sameName(first.full_name) && !others) key_people_intro = claudeLine;
  else {
    const why = String(first.why_they_matter || first.role_reason || '').replace(/\.$/, '');
    key_people_intro = 'Start with ' + shown(first) + ' (' + first.title + ', ' + first.persona_role + ')' + (why ? ' – ' + why.charAt(0).toLowerCase() + why.slice(1) : '') + '.';
  }
  if (first) {
    meta.start_with = shown(first) + ' (' + first.title + ', ' + first.persona_role + ')';   // full name now, not Apollo's masked one
    meta.start_with_rank = first.rank;
    meta.start_with_person_id = first.person_id;
  }

  // 4. Cost of this research call
  const u = res.usage || {};
  const searches = (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
  const people_cost_usd = Math.round((((u.input_tokens || 0) * 2 + (u.output_tokens || 0) * 10) / 1e6 + searches * 0.01) * 1000) / 1000;

  delete c.people_prompt;

  out.push({ json: Object.assign(c, {
    key_people,
    key_people_meta: meta,
    key_people_intro,
    key_people_columns: ['Person', 'Role', 'Why they matter', 'Background'],
    key_people_found: key_people.filter(p => p.background !== NO_DATA).length,
    people_error,
    people_cost_usd,
    total_cost_usd: Math.round(((c.total_cost_usd || 0) + people_cost_usd) * 1000) / 1000
  })});
});

return out;
