// PAGES 1–3 – Step 1: Build Account Plan Prompt (free – no API call). Run Once for All Items.
// Place it right after Fit Score. Output: account_plan_prompt for the "Account Plan" HTTP node (Claude, NO web search).
// Claude writes ONLY from the evidence below (A1–A8). It never invents facts, names, emails or numbers.
// Template v2 sections: KPI cards (Business trigger, Buying intent) · 01 Bottom line · 02 Three things to know ·
// 03 Signals at a glance · 04 Stakeholder map · 05 Conversation plan · 06 Discovery questions · 07 Likely objections
const NO_DATA = 'No data found';
const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const cut = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; };
const val = (snap, k) => (snap[k] && snap[k].value !== undefined && snap[k].value !== null && snap[k].value !== NO_DATA) ? snap[k].value : 'unknown';
const ACTION_LEAD = { 'PURSUE NOW': 'Pursue now.', 'PURSUE ACTIVELY': 'Pursue actively.', 'NURTURE': 'Nurture.', 'MONITOR': 'Monitor.', 'DEPRIORITISE': 'Deprioritise.' };

const out = [];

for (const item of $input.all()) {
  const c = item.json;
  const snap = c.snapshot || {};
  const fit = c.fit_breakdown || [];
  const people = Array.isArray(c.key_people) ? c.key_people : [];
  const contacts = Array.isArray(c.contacts) ? c.contacts : [];
  const meta = c.key_people_meta || {};
  const cc = c.cc_summary || {};
  const rel = (c.relationship_history && c.relationship_history.rows) || [];
  const lead = ACTION_LEAD[c.fit_action] || 'Review.';
  const city = String(val(snap, 'hq_address')).split(',').slice(-2).join(',').replace(/\d{5}(-\d{4})?/, '').trim();

  // ---------- evidence, compact and labelled ----------
  const ev = [];
  ev.push('COMPANY: ' + c.name + ' · ' + (c.icp_audience || 'audience unknown') + (c.icp_audience_also ? ' (also ' + c.icp_audience_also + ')' : '') +
    ' · HQ ' + city + ' · ' + val(snap, 'size') + ' · revenue ' + val(snap, 'revenue') + ' · ' + (c.website || c.domain));
  ev.push('What they do: ' + cut(val(snap, 'what_they_do'), 300));
  ev.push('Key markets: ' + cut(val(snap, 'key_markets'), 250));
  ev.push('Offices: ' + cut(val(snap, 'offices'), 200) + ' · Ownership: ' + cut(val(snap, 'ownership'), 160));
  ev.push('Headcount trend: ' + val(snap, 'headcount_trend') + ' · Core software: ' + val(snap, 'core_software'));
  ev.push('Account owner at Excelize: ' + (c.account_owner || 'to be assigned'));

  ev.push('\nFIT SCORE (A8): ' + c.fit_score + '/100 · ' + c.fit_tier + ' · ' + c.fit_label + ' · action ' + c.fit_action + (c.fit_gate ? ' · gate: ' + c.fit_gate : ''));
  fit.forEach(f => ev.push('- ' + f.factor + ' ' + f.score_text + ': ' + f.why));
  (c.icp_checks || []).forEach(k => ev.push('- ICP check ' + k.check + ': ' + k.status + ' (' + k.detail + ')'));
  ev.push('Fit summary: ' + (c.fit_total_text || ''));
  ev.push('Watch list: ' + ((c.watch_list || []).join(' | ') || 'none'));

  ev.push('\nSIGNALS (A2, family · signal · strength · evidence):');
  (c.signal_evidence || []).forEach(s => ev.push('- ' + s.family + ' · ' + s.signal + ' · ' + s.strength + ' · ' + cut(s.evidence, 220)));

  ev.push('\nJOBS: ' + (c.jobs_intro || NO_DATA));
  (c.job_details || []).filter(j => j.description_found).slice(0, 4).forEach(j =>
    ev.push('- ' + j.title + ' (' + j.posted + ', ' + j.location + '): Revit ' + j.revit + '; urgency: ' + j.urgency + '; ' + cut(j.summary, 200)));
  ev.push('Jobs takeaway: ' + cut(c.jobs_takeaway, 400));
  ev.push('Best pitch (from job research): ' + cut(c.best_pitch, 300));

  ev.push('\nPROJECT PIPELINE (A3): ' + (c.cc_intro || NO_DATA));
  (c.cc_projects || []).slice(0, 6).forEach(p => ev.push('- ' + p.project + ' · ' + p.location + ' · ' + p.value + ' · ' + p.stage + ' · ' + p.type));
  if (cc.status === 'Found') ev.push('Last 6 months: ' + cc.projects_6m + ' projects, ' + cc.total_value_6m + '; open now ' + cc.open_now + '; best opportunity: ' + cc.best_opportunity + '; top types: ' + cc.top_types);
  ev.push('PERMITS (A4): ' + ((c.permit_activity && c.permit_activity.intro) || NO_DATA));

  ev.push('\nRELATIONSHIP HISTORY (A5):');
  rel.forEach(r => ev.push('- ' + r.item + ': ' + cut(r.what, 220) + ' [' + r.status + ']'));

  ev.push('\nKEY PEOPLE (A6/A7) – start with: ' + (meta.start_with || NO_DATA));
  people.forEach(p => {
    const ct = contacts.find(x => x.rank === p.rank) || {};
    ev.push('#' + p.rank + ' ' + (p.full_name || '') + ' – ' + p.title + ' – role: ' + p.persona_role +
      ' – email: ' + (ct.email ? ct.email_status : 'none') + (p.sequences ? ' – already emailed by Excelize' : ' – never contacted') +
      (p.goes_by ? ' – goes by ' + p.goes_by : '') + '\n   why: ' + cut(p.why_they_matter, 220) + '\n   background: ' + cut(p.background, 220));
  });

  const prompt =
'You are a senior B2B account strategist for Excelize – "Your extended BIM team" – a BIM outsourcing, consulting and staffing company for US AEC firms.\n' +
'Excelize services: BIM Services (3D modelling, 2D drawings, MEP/clash coordination, Revit families, Scan to BIM, 4D/5D, estimation & QTO) · ' +
'BIM Consulting (strategy, adoption, standards, execution plans, training) · BIM Staffing (on-demand team, embedded delivery center) · Design Support.\n' +
'Today is ' + today + '. Write the first three pages of the Excelize Account Intelligence Report for the sales team.\n\n' +
'EVIDENCE (the ONLY facts you may use):\n' + ev.join('\n') + '\n\n' +
'WRITING RULES\n' +
'1. Use only the evidence above. Never invent people, emails, numbers, projects, dates or vendors. If something is unknown, say "not confirmed" or turn it into a discovery question.\n' +
'2. Simple, warm, humble, confident US English. Short sentences. No hype words (never "game-changer", "unlock", "synergy", "revolutionize").\n' +
'3. Respect the account: if they present BIM as an in-house strength, position Excelize as extra capacity inside their standards, never a replacement.\n' +
'4. If the evidence mentions public / federal work, include the offshore / data restriction question.\n' +
'5. People: use the ranks above. Person #1 is the first contact. Only people listed above. Use their first name in the opening line suggestion only if natural.\n' +
'6. Use **double asterisks** for the 2–4 key phrases to bold in the bottom line. No other markdown.\n' +
'7. Never state facts about Excelize itself that are not in this prompt: no claims about our other clients, results, prices, turnaround times, team size, certifications or contract terms.\n' +
'8. In "fact" fields, write full short sentences that end with a full stop.\n\n' +
'Reply with JSON only, no other text, in exactly this shape:\n' +
'{\n' +
'"business_trigger": {"value": "2–3 words, e.g. Capacity pressure", "badge": "High | Med–High | Medium | Low", "note": "max 8 words"},\n' +
'"buying_intent": {"value": "2–4 words, e.g. Not yet visible", "badge": "Confirmed | Likely | Unconfirmed", "note": "max 8 words"},\n' +
'"bottom_line": "Starts with \\"' + lead + '\\" then 2–3 sentences: why this account, why now, the main gap. Bold 2–4 key phrases.",\n' +
'"recommended_action": "1–2 sentences: who at Excelize (the account owner) emails which person (#1) this week, about what, with which question; then which next person 3–4 days later.",\n' +
'"three_things": [{"headline": "max 8 words", "fact": "2–3 short lines with the real numbers / names from the evidence", "so_what": "1 line for the seller"}] (exactly 3),\n' +
'"signals_at_a_glance": [{"signal": "short name", "what_we_see": "fact with number/date", "what_it_may_mean": "careful interpretation", "confidence": "High | Med–High | Medium | Negative"}] (exactly 5, most material first; use Negative for signals that work against us),\n' +
'"stakeholder_intro": "1 sentence starting \\"Engage the buying group, not one person.\\" and ending \\"Contact details are in A7.\\"",\n' +
'"stakeholders": [{"rank": 1, "buying_role": "Champion (problem owner) | Decision-maker | Economic buyer | Influencer | Not a target now", "why_them": "max 18 words", "first_channel": "Email + LinkedIn | Email only | LinkedIn only | No outreach"}] (one per person above, same ranks),\n' +
'"conversation_plan": {"opening_line": "one friendly question to person #1, max 30 words, based on a real signal", "value_hypothesis": "2 sentences: their likely pain and how Excelize helps", "do": ["3 short do\'s"], "dont": ["3 short don\'ts"]},\n' +
'"discovery_questions": [{"star": true, "topic": "Pain | Openness | Decision | Restrictions | Timing | Commitment", "question": "...", "context": "why we ask, from the evidence", "ask": "which person, e.g. Zac (Champion)"}] (exactly 6, one per topic in this order, star true on the 3 that matter most),\n' +
'"objections": [{"if_they_say": "...", "respond_with": "2 sentences, calm and specific to this account"}] (exactly 5, in this order: we do BIM in-house · we are hiring for this · offshore quality / data security · our contracts restrict offshore work · not the right time)\n' +
'}';

  out.push({ json: Object.assign({}, c, {
    account_plan_prompt: prompt,
    account_plan_meta: { action_lead: lead, built: today, prompt_chars: prompt.length }
  }) });
}

return out;
