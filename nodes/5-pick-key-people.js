// SECTION 4 – Step 2: Pick Key People (free – 0 credits)
// Picks the best 6 people using the Excelize ICP: persona role by audience + who to reach by revenue band
// Inputs: this node's input = Apollo – Key People (people search) · company data from CC Projects (same order)
// Audience = icp_audience from CC Projects (one of the 4 ICP audiences) – the same value Fit Score and the Account Plan use.
// start_with = the ONE person sales contacts first (rank 1); Merge People writes the intro about this same person.
const companies = $('CC Projects').all();

const MAX_PEOPLE = 6;
const ROLE_CAP = { 'Champion': 3, 'Decision maker': 2, 'Economic buyer': 1, 'Influencer': 2, 'Gatekeeper': 1 };

// ---------- helpers ----------
const lc = s => String(s || '').toLowerCase();
const parseRevenue = v => {                       // "$75M (Apollo estimate)" → 75000000
  const m = String(v || '').replace(/,/g, '').match(/\$?\s*([\d.]+)\s*([kmb])?/i);
  if (!m) return null;
  const n = parseFloat(m[1]); const u = lc(m[2]);
  return u === 'b' ? n * 1e9 : u === 'm' ? n * 1e6 : u === 'k' ? n * 1e3 : n;
};
const bandOf = r => r == null ? 'Unknown' : r < 10e6 ? 'Under $10M' : r < 50e6 ? '$10M–$50M' : r < 100e6 ? '$50M–$100M' : 'Over $100M';
const BAND_RULE = {
  'Under $10M': 'C-suite, Director, VP',          // revenue is not an ICP gate (team size is) – no warning here
  '$10M–$50M':  'C-suite, Director, VP',
  '$50M–$100M': 'VP, Manager, Project Manager',
  'Over $100M': 'Project Managers, Senior Project Managers',
  'Unknown':    'C-suite, Director, VP (revenue unknown)'
};

// Audience: use the shared icp_audience from CC Projects; short codes are used inside this node only
const ICP_TO_CODE = { 'Architecture': 'Architecture', 'MEPF engineering': 'MEPF', 'General contractor': 'GC', 'Subcontractor': 'Subcontractor' };
const CODE_TO_ICP = { 'Architecture': 'Architecture', 'MEPF': 'MEPF engineering', 'GC': 'General contractor', 'Subcontractor': 'Subcontractor' };
// Fallback only if CC Projects did not set icp_audience (old pinned data)
const audienceGuess = c => {
  const s = c.snapshot || {};
  const t = lc([s.industry && s.industry.value, s.what_they_do && s.what_they_do.value, c.name].join(' '));
  if (/architect/.test(t)) return 'Architecture';
  if (/general contract|construction management|design-build/.test(t)) return 'GC';
  if (/(mechanical|electrical|plumbing|fire protection|sprinkler|steel|concrete|drywall|framing|glazing|hvac)[^.;]{0,30}contract|subcontract|trade contractor|self-perform/.test(t)) return 'Subcontractor';
  if (/general contract|construction management|design-build|builder|\bconstruction\b/.test(t)) return 'GC';
  if (/engineer|mep|consult/.test(t)) return 'MEPF';
  return 'GC';
};

// Titles we never pick (ICP exclusions + field / support roles)
const EXCLUDE = /(financ|account|payroll|payable|receivable|controller|\bcfo\b|treasur|\bhr\b|human resource|people ops|talent|recruit|marketing|business development|\bbd\b|sales|creative|communicat|brand|proposal|safety|maintenance|warranty|service group|foreman|superintendent|supervisor|\bheo\b|operator|laborer|legal|counsel|\bit\b|information tech|manufactur|partnering)/i;

// Persona role by audience (ICP)
const personaOf = (title, audience) => {
  const t = lc(title);
  const isVP = /\b(vp|vice president|svp|evp)\b/.test(t);
  if (/\b(bim|vdc|virtual design|design technology|digital (delivery|practice|design)|modeling manager|modelling manager)\b/.test(t)) return { role: 'Champion', why: 'Owns BIM / VDC delivery – feels the capacity gap first' };
  if (/procure|purchas|office manager|contract(s)? manager|subcontract/.test(t)) return { role: 'Gatekeeper', why: 'Controls vendor set-up and paperwork' };
  if ((audience === 'GC' || audience === 'Subcontractor') && /precon|chief estimator/.test(t)) return { role: 'Champion', why: 'Leads preconstruction – where BIM coordination is scoped and bought' };
  if (!isVP && /\b(ceo|chief executive|president|founder|owner|founding principal)\b/.test(t)) return { role: 'Economic buyer', why: 'Signs off budget and outside partners' };
  if (/\b(coo|chief operating|managing (principal|partner|director)|director of operations|operations director)\b/.test(t) ||
      (isVP && /operat|construction|project|engineering|delivery|regional/.test(t)) ||
      (isVP && !/precon|estimat/.test(t)) || /regional leader|\bprincipal\b|\bpartner\b/.test(t) && audience === 'GC')
    return { role: 'Decision maker', why: 'Runs delivery and staffing across projects' };
  if (audience === 'Architecture' && /principal architect|project architect|director of design|design director|\bprincipal\b/.test(t)) return { role: 'Champion', why: 'Leads design teams that produce the Revit models' };
  if (audience === 'MEPF' && /principal engineer|senior (mep|mechanical|electrical|plumbing) engineer|director of engineering|engineering manager|\bprincipal\b/.test(t)) return { role: 'Champion', why: 'Leads MEP design teams that need modeling support' };
  if ((audience === 'GC' || audience === 'Subcontractor') && /precon|estimat|design integration|design manager|detailing|fabrication|prefab/.test(t)) return { role: 'Champion', why: 'Runs preconstruction / design coordination – where BIM work starts' };
  if (/director|head of/.test(t)) return { role: 'Decision maker', why: 'Directs a delivery team' };
  if (/project manager|\bpm\b|\bapm\b|operations manager|project executive/.test(t)) return { role: 'Influencer', why: 'Manages live projects that need coordination and drawings' };
  return null;
};

// Seniority 1–5 from title
const seniorityOf = title => {
  const t = lc(title);
  if (!/\b(vp|vice president)\b/.test(t) && /\b(ceo|chief|president|founder|owner)\b/.test(t)) return 5;
  if (/\b(vp|vice president|svp|evp|principal|partner|regional leader)\b/.test(t)) return 4;
  if (/director|head of/.test(t)) return 3;
  if (/assistant|asst|\bapm\b|coordinator/.test(t)) return 1;
  if (/manager|lead|project executive/.test(t)) return 2;
  return 1;
};

// Revenue band fit (ICP "who to reach")
const bandFit = (band, sen, title) => {
  const t = lc(title);
  const isPM = /project manager/.test(t) && !/assistant|asst/.test(t);
  if (band === 'Over $100M') return isPM ? 20 : sen >= 5 ? -5 : sen >= 3 ? 5 : 0;
  if (band === '$50M–$100M') return (sen === 4 || sen === 2 || isPM) ? 15 : sen === 3 ? 10 : 5;
  return sen >= 3 ? 20 : sen === 2 ? 5 : 0;           // $10–50M, unknown, under $10M
};
const ROLE_BASE = { 'Champion': 40, 'Economic buyer': 35, 'Decision maker': 35, 'Influencer': 20, 'Gatekeeper': 10 };

const out = [];

$input.all().forEach((item, i) => {
  const c = Object.assign({}, (companies[i] && companies[i].json) || {});
  const res = item.json || {};
  const people = (Array.isArray(res.people) ? res.people : []).slice();
  const revenue = parseRevenue(c.snapshot && c.snapshot.revenue && c.snapshot.revenue.value);
  const band = bandOf(revenue);
  const audience = ICP_TO_CODE[c.icp_audience] || audienceGuess(c);
  const icp_audience = CODE_TO_ICP[audience];

  // people already saved in Apollo (full name, email, LinkedIn, sequences)
  const known = {};
  (c.apollo_contacts || []).forEach(ct => { if (ct.person_id) known[ct.person_id] = ct; });

  // Add saved Apollo contacts that the people search did not return (e.g. VP of Preconstruction)
  const seenIds = new Set(people.map(p => p.id));
  const seenNames = new Set(people.map(p => lc(p.first_name) + '|' + lc(String(p.last_name_obfuscated || '').charAt(0))));
  (c.apollo_contacts || []).forEach(ct => {
    const parts = String(ct.name || '').trim().split(/\s+/);
    const key = lc(parts[0]) + '|' + lc((parts[1] || '').charAt(0));
    if ((ct.person_id && seenIds.has(ct.person_id)) || seenNames.has(key)) return;
    const pid = ct.person_id || ('contact_' + ct.contact_id);
    known[pid] = ct;
    people.push({ id: pid, first_name: parts[0] || '', last_name_obfuscated: parts.slice(1).join(' '), title: ct.title,
      has_email: !!ct.email, has_direct_phone: (ct.phones || []).length ? 'Yes' : 'Maybe', from_contacts: true });
  });

  let excluded = 0;
  const candidates = [];
  people.forEach(p => {
    const title = String(p.title || '').trim();
    if (!title || EXCLUDE.test(title)) { excluded++; return; }
    const persona = personaOf(title, audience);
    if (!persona) { excluded++; return; }
    const sen = seniorityOf(title);
    const ct = known[p.id];
    let score = ROLE_BASE[persona.role] + sen * 3 + bandFit(band, sen, title);
    if (/\b(bim|vdc)\b/i.test(title) && /director|head|senior|sr\.?|lead|manager/i.test(title)) score += 10;
    if ((audience === 'GC' || audience === 'Subcontractor') && /precon|chief estimator/i.test(title) && /\b(vp|vice president|director|chief)\b/i.test(title)) score += 10;
    if (p.has_email) score += 5;
    if (p.has_direct_phone === 'Yes') score += 3;
    if (ct) score += 5;
    candidates.push({
      person_id: p.id,
      first_name: p.first_name || '',
      last_name: ct ? String(ct.name || '').split(' ').slice(1).join(' ') : (p.last_name_obfuscated || ''),
      full_name: ct ? ct.name : null,
      title: title,
      persona_role: persona.role,
      role_reason: persona.why,
      seniority: sen,
      has_email: !!p.has_email,
      has_direct_phone: p.has_direct_phone === 'Yes' ? 'Yes' : p.has_direct_phone ? 'Maybe' : 'No',
      in_apollo: !!ct,
      linkedin: ct ? ct.linkedin || null : null,
      email: ct ? ct.email || null : null,
      sequences: ct ? ct.sequences || 0 : 0,
      score: score
    });
  });

  // Pick top 5 with role caps so the list covers the buying group
  candidates.sort((a, b) => b.score - a.score);
  const used = {}, picked = [];
  candidates.forEach(p => {
    if (picked.length >= MAX_PEOPLE) return;
    if ((used[p.persona_role] || 0) >= (ROLE_CAP[p.persona_role] || 1)) return;
    used[p.persona_role] = (used[p.persona_role] || 0) + 1;
    picked.push(p);
  });
  // fill empty slots if caps left gaps
  candidates.forEach(p => { if (picked.length < MAX_PEOPLE && !picked.includes(p)) picked.push(p); });

  // Order for the report: Champion → Decision maker → Economic buyer → Influencer → Gatekeeper
  const ORDER = ['Champion', 'Decision maker', 'Economic buyer', 'Influencer', 'Gatekeeper'];
  picked.sort((a, b) => (ORDER.indexOf(a.persona_role) - ORDER.indexOf(b.persona_role)) || (b.score - a.score));
  const key_people = picked.map((p, k) => Object.assign({ rank: k + 1 }, p));

  const start = key_people[0];
  const nameOf = p => p.full_name || (p.first_name + ' ' + p.last_name).trim();

  let people_error = null;
  if (res.error) people_error = typeof res.error === 'string' ? res.error : (res.error.message || JSON.stringify(res.error));

  out.push({ json: Object.assign(c, {
    key_people,
    key_people_meta: {
      audience: icp_audience,
      audience_match: c.icp_audience ? (c.icp_audience_match || 'Core') : 'Best guess',
      revenue_band: band,
      reach_rule: BAND_RULE[band],
      total_found: typeof res.total_entries === 'number' ? res.total_entries : people.length,
      screened: people.length,
      excluded,
      candidates: candidates.length,
      start_with: start ? nameOf(start) + ' (' + start.title + ', ' + start.persona_role + ')' : 'No data found',
      start_with_rank: start ? start.rank : null,
      start_with_person_id: start ? start.person_id : null
    },
    key_people_error: people_error
  })});
});

return out;
