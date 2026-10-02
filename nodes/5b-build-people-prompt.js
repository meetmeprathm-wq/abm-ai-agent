// SECTION 4 – Step 3a: Build People Prompt (Claude web research for Key people: full name, LinkedIn, background, why they matter)
// Input: Pick Key People (6 people per company). Output: people_prompt for the "People Research" HTTP node
const today = new Date().toISOString().slice(0, 10);

const out = [];

for (const item of $input.all()) {
  const c = item.json;
  const snap = c.snapshot || {};
  const val = k => (snap[k] && snap[k].value && snap[k].value !== 'No data found') ? snap[k].value : 'unknown';
  const meta = c.key_people_meta || {};
  const team = c.bim_team || {};
  const cc = c.cc_summary || {};
  const people = Array.isArray(c.key_people) ? c.key_people : [];

  const peopleList = people.map(p =>
    p.rank + '. ' + p.first_name + ' ' + (p.full_name ? p.full_name.split(' ').slice(1).join(' ') : p.last_name) +
    (p.full_name ? ' (full name known)' : ' (last name partly hidden)') +
    ' – ' + p.title + ' – role for us: ' + p.persona_role +
    (p.linkedin ? ' – LinkedIn: ' + p.linkedin : '') +
    (p.sequences ? ' – already emailed by Excelize (' + p.sequences + ' sequence' + (p.sequences > 1 ? 's' : '') + ')' : '')
  ).join('\n');

  const context = [
    'Audience: ' + (meta.audience || 'unknown') + '; revenue band: ' + (meta.revenue_band || 'unknown'),
    'In-house BIM team (Apollo): ' + (team.bim_cad_count || 0) + ' BIM/VDC/CAD staff, ' + (team.designer_count || 0) + ' designers',
    'Top buying signals: ' + ((c.top_signals || []).join(' | ') || 'none'),
    'Best ConstructConnect opportunity: ' + (cc.best_opportunity || 'none')
  ].join('\n');

  const prompt =
'You are a B2B research analyst for Excelize, a BIM outsourcing, consulting and staffing company (BIM modelling, coordination, shop drawings, Scan to BIM, on-demand BIM staff) serving US AEC firms.\n' +
'Today is ' + today + '.\n\n' +
'Company: ' + c.name + ' (' + (c.website || c.domain || 'unknown') + ')\n' +
'HQ: ' + val('hq_address') + '\n' +
'What they do: ' + val('what_they_do') + '\n' +
context + '\n\n' +
'Key people (from Apollo). A hidden last name like "Gl***a" shows the first two letters and the last letter:\n' +
peopleList + '\n\n' +
'For EACH person:\n' +
'1. Confirm the full name and find their public LinkedIn profile URL (only if the profile clearly matches this person, title and company).\n' +
'2. Background: one factual line (max 30 words) – time at this company, previous employers, credentials (PE, LEED AP, CCM, etc.), education if notable.\n' +
'3. Why they matter: one line (max 25 words) on why this person matters for Excelize at THIS account, using their role and the signals above.\n' +
'Then write "start_with": one sentence (max 30 words) about person #1 ONLY – sales will contact person #1 first. Start with "Start with <full name>" and say why, using the facts you found. Do not name anyone else in this sentence.\n\n' +
'Rules:\n' +
'1. TRUSTED SOURCES ONLY: the company website (team / leadership / news pages), the person\'s LinkedIn profile, official press releases, conference or association speaker bios, ENR, BD+C, local business journals, state licence lookups. ' +
'NEVER use data brokers or people-search sites (ZoomInfo, RocketReach, ContactOut, Lusha, SignalHire, Apollo, Spokeo, etc.).\n' +
'2. Work facts only. Never include age, family, home address, personal social media or anything private.\n' +
'3. Never guess. If you cannot confirm a person, keep the name as given, set name_confirmed to false, linkedin_url to null and background to "Not found". Still write why_they_matter from their title and role.\n' +
'4. Be efficient: 4–5 searches in total (a company team page or one search per key person). Do not fetch pages with code.\n' +
'5. Reply with JSON only, no other text, in exactly this shape:\n' +
'{"people": [{"rank": 1, "full_name": "...", "name_confirmed": true, "linkedin_url": "...", "background": "...", "why_they_matter": "...", "source_name": "...", "source_url": "..."}], "start_with": "..."}';

  out.push({ json: Object.assign({}, c, { people_prompt: prompt }) });
}

return out;
