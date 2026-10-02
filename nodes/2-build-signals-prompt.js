// SECTION 2 – Step 2: Build Signals Prompt (web research for the 5 web signals)
// Web signals: New office · Earlier expansion · Recent news · In-house / outsource BIM check · Recent project wins
// The other 11 signals come from Apollo (Apollo Buying Signals + Apollo Team & Engagement) – not researched again here.

const now = new Date();
const today = now.toISOString().slice(0, 10);
const monthsAgo = m => { const d = new Date(now); d.setMonth(d.getMonth() - m); return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };
const since6 = monthsAgo(6), since12 = monthsAgo(12);

const WEB_SIGNALS = {
  new_office:
    'New office opened, relocation, or expansion into a new US state or city ON OR AFTER ' + since12 + '. ' +
    'Strength: High = new US office opened in this window; Medium = announced / planned or a relocation; Low = only a small satellite or unclear date.',
  earlier_expansion:
    'Older growth BEFORE ' + since12 + ' (last 5 years): offices opened, acquisitions made, mergers, or being acquired / PE-backed. List the most important 1–3 with year. ' +
    'Strength: Medium = clear pattern of expansion or acquisitions; Low = a single older event.',
  recent_news:
    'Sales-relevant news ON OR AFTER ' + since6 + '. Look FIRST for leadership changes (new CEO, President, COO, principal/partner, BIM / VDC / Design Technology leader), ' +
    'then acquisitions or new ownership, major contracts, rankings/awards, rebrands. Give up to 2 items, most important first. ' +
    'Strength: High = new CEO/COO/BIM leader or ownership change; Medium = other growth news; Negative = layoffs, office closure, lawsuit, bankruptcy; Low = minor PR.',
  outsource_check:
    'Do they already outsource or offshore BIM / CAD / drafting, or use contract / partner production firms? Check their website (About, Services, Careers, Team pages), ' +
    'press releases and partner announcements. Put the verdict in "verdict": "Outsources" (clear evidence they use outside or offshore production), ' +
    '"In-house" (they clearly say BIM / VDC is done by their own team or list an internal BIM department), or "Unclear". ' +
    'Strength: High = Outsources; In-house = In-house; Low = Unclear.',
  project_wins:
    'Projects won, awarded, or started ON OR AFTER ' + since12 + ' (name, value, location, sector). Give up to 3, most valuable first. ' +
    'Strength: High = 2+ wins in design phase or in datacenter / healthcare / commercial / hospitality; Medium = 1 relevant win; Low = small or residential-only.'
};

const signalList = Object.keys(WEB_SIGNALS).map(k => '- ' + k + ': ' + WEB_SIGNALS[k]).join('\n');

const out = [];

for (const item of $input.all()) {
  const c = item.json;
  const snap = c.snapshot || {};
  const val = k => (snap[k] && snap[k].value && snap[k].value !== 'No data found') ? snap[k].value : 'unknown';
  const team = c.bim_team || {};
  const teamLine = (team.bim_cad_count || team.designer_count)
    ? team.bim_cad_count + ' BIM/VDC/CAD staff and ' + team.designer_count + ' designers found in Apollo'
    : 'no BIM/CAD staff found in Apollo';

  const prompt =
'You are a B2B research analyst for Excelize, a BIM outsourcing, consulting and staffing company serving US AEC firms.\n' +
'Today is ' + today + '.\n\n' +
'Company: ' + c.name + '\n' +
'Website: ' + (c.website || c.domain || 'unknown') + '\n' +
'HQ: ' + val('hq_address') + '\n' +
'Industry: ' + val('industry') + '\n' +
'Services: ' + val('what_they_do') + '\n' +
'Known offices: ' + val('offices') + '\n' +
'Ownership: ' + val('ownership') + '\n' +
'In-house team (Apollo): ' + teamLine + '\n\n' +
'Research these 5 buying signals:\n' +
signalList + '\n\n' +
'Rules:\n' +
'1. TRUSTED SOURCES ONLY: the company\'s own website (News, Projects, Careers, About, Team), official press releases (PR Newswire, Business Wire, GlobeNewswire), ' +
'ENR, BD+C, Construction Dive, Architect Magazine, Consulting-Specifying Engineer, bizjournals.com and other local business journals, government / procurement sites, ' +
'and the company\'s own LinkedIn posts. NEVER use job boards or aggregators (Indeed, Glassdoor, ZipRecruiter, beBee, Jooble, SimplyHired, Talent.com), ' +
'data brokers (ZoomInfo, RocketReach, Crunchbase lists) or AI-generated summary sites.\n' +
'2. Respect each time window exactly. Every item needs a month and year. Never guess or invent.\n' +
'3. If nothing trusted is found, set found to false, evidence to "Not found", strength to "Not found".\n' +
'4. Evidence = one short factual line (max 30 words). Put multiple items in the same line separated by "; ".\n' +
'5. One source URL per signal (the best one) and the source name (e.g. "Company website", "ENR").\n' +
'6. Be efficient: 3–4 searches in total. Do not fetch pages with code.\n' +
'7. Reply with JSON only, no other text, in exactly this shape:\n' +
'{"signals": {"new_office": {"found": true, "evidence": "...", "date": "Mon YYYY", "source_name": "...", "source_url": "...", "strength": "High"}, ' +
'"earlier_expansion": {...}, "recent_news": {...}, "outsource_check": {"found": true, "verdict": "In-house", "evidence": "...", "date": "Mon YYYY", "source_name": "...", "source_url": "...", "strength": "In-house"}, "project_wins": {...}}}';

  out.push({ json: Object.assign({}, c, { signals_prompt: prompt }) });
}

return out;
