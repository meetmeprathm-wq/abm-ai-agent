// PAGES 1–3 – Step 3: Merge Account Plan (free – no API call). Run Once for All Items.
// Place it right after the "Account Plan" HTTP node.
// Inputs: this node's input = Account Plan (Claude reply) · company data from Build Account Plan Prompt (same order)
// Claude writes the words; names, titles, emails and LinkedIn always come from our own data (A6/A7), never from Claude.
const companies = $('Build Account Plan Prompt').all();

// ---------- reading Claude's JSON safely ----------
// Escape raw line breaks / tabs that sit INSIDE a JSON string
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
const looksRight = j => j && (j.bottom_line || j.three_things || j.signals_at_a_glance);
function extractJsonRaw(text) {
  const clean = text.replace(/```json|```/g, '').replace(/<\/?cite[^>]*>/gi, '').trim();
  try { const j = JSON.parse(clean); if (looksRight(j)) return j; } catch (e) {}
  for (let start = clean.indexOf('{'); start !== -1; start = clean.indexOf('{', start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < clean.length; i++) {
      const ch = clean[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { try { const j = JSON.parse(clean.slice(start, i + 1)); if (looksRight(j)) return j; } catch (e) {} break; } }
    }
  }
  return null;
}
const extractJson = text => text ? (extractJsonRaw(text) || extractJsonRaw(fixStrings(text))) : null;

// ---------- small text helpers ----------
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Plain text: no markdown, no cite tags, no emails Claude may have typed
const tidy = s => String(s == null ? '' : s).replace(/<\/?cite[^>]*>/gi, '').replace(/\*\*/g, '').replace(EMAIL_RE, '').replace(/\s{2,}/g, ' ').trim();
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const arr = a => Array.isArray(a) ? a : [];
const pick = (v, allowed, dflt) => { const x = tidy(v); const hit = allowed.find(a => a.toLowerCase() === x.toLowerCase()); return hit || dflt; };

const TRIGGER_BADGES = ['High', 'Med–High', 'Medium', 'Low'];
const INTENT_BADGES = ['Confirmed', 'Likely', 'Unconfirmed'];
const CONFIDENCE = ['High', 'Med–High', 'Medium', 'Negative'];
const ROLES = ['Champion (problem owner)', 'Decision-maker', 'Economic buyer', 'Influencer', 'Not a target now'];
const CHANNELS = ['Email + LinkedIn', 'Email only', 'LinkedIn only', 'No outreach'];
const TOPICS = ['Pain', 'Openness', 'Decision', 'Restrictions', 'Timing', 'Commitment'];
const OBJECTIONS = ['We do BIM in-house', 'We are hiring for this', 'Offshore quality / data security', 'Our contracts restrict offshore work', 'Not the right time'];
const normDash = s => String(s || '').replace(/Med-High|Med - High|Medium-High|Medium–High/i, 'Med–High');

// Default buying role from our persona, if Claude skipped someone
const ROLE_FROM_PERSONA = p => /champion|problem/i.test(p) ? ROLES[0] : /decision/i.test(p) ? ROLES[1] : /economic|budget|owner|ceo|president/i.test(p) ? ROLES[2] : ROLES[3];

const out = [];

$input.all().forEach((item, i) => {
  const c = Object.assign({}, (companies[i] && companies[i].json) || {});
  const res = item.json || {};
  const warnings = [];
  const lead = (c.account_plan_meta && c.account_plan_meta.action_lead) || 'Review.';

  // 1. Read Claude reply (skip the "thinking" block – only text blocks, joined without line breaks)
  let account_plan_error = null, plan = {};
  if (res.error) account_plan_error = typeof res.error === 'string' ? res.error : (res.error.message || JSON.stringify(res.error));
  else {
    const text = arr(res.content).filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed = extractJson(text);
    if (parsed) plan = parsed;
    else account_plan_error = res.stop_reason === 'max_tokens' ? 'Reply cut off (max_tokens) – raise max_tokens in Account Plan'
      : 'Could not read account plan reply (stop: ' + (res.stop_reason || 'unknown') + '; text starts: ' + text.slice(0, 80).replace(/\s+/g, ' ') + ')';
  }

  // 2. KPI cards (page 1)
  const bt = plan.business_trigger || {}, bi = plan.buying_intent || {};
  const card_business_trigger = { title: 'BUSINESS TRIGGER', value: tidy(bt.value) || 'Not confirmed', badge: pick(normDash(bt.badge), TRIGGER_BADGES, 'Medium'), note: tidy(bt.note) };
  const card_buying_intent = { title: 'BUYING INTENT', value: tidy(bi.value) || 'Not yet visible', badge: pick(bi.badge, INTENT_BADGES, 'Unconfirmed'), note: tidy(bi.note) };

  // 3. 01 Bottom line – must start with the action lead; **bold** becomes <strong>
  let bottomRaw = String(plan.bottom_line || '').replace(/<\/?cite[^>]*>/gi, '').replace(EMAIL_RE, '').replace(/\s{2,}/g, ' ').trim();
  if (bottomRaw && !bottomRaw.replace(/\*\*/g, '').startsWith(lead)) { bottomRaw = lead + ' ' + bottomRaw; warnings.push('Bottom line did not start with "' + lead + '" – added'); }
  const bottom_line = tidy(bottomRaw);
  const bottom_line_html = esc(bottomRaw).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*\*/g, '');
  const recommended_action = tidy(plan.recommended_action);

  // 4. 02 Three things to know
  const three_things = arr(plan.three_things).slice(0, 3).map(t => ({ headline: tidy(t.headline), fact: tidy(t.fact), so_what: tidy(t.so_what) }));
  if (three_things.length < 3) warnings.push('Only ' + three_things.length + ' of 3 "things to know"');

  // 5. 03 Signals at a glance
  const signals_at_a_glance = arr(plan.signals_at_a_glance).slice(0, 5).map(s => ({
    signal: tidy(s.signal), what_we_see: tidy(s.what_we_see), what_it_may_mean: tidy(s.what_it_may_mean),
    confidence: pick(normDash(s.confidence), CONFIDENCE, 'Medium')
  }));
  if (signals_at_a_glance.length < 5) warnings.push('Only ' + signals_at_a_glance.length + ' of 5 signals');

  // 6. 04 Stakeholder map – our people only, in our rank order; contact details from A7
  const people = arr(c.key_people), contacts = arr(c.contacts);
  const byRank = {};
  arr(plan.stakeholders).forEach(s => { byRank[Number(s.rank)] = s; });
  const dropped = arr(plan.stakeholders).filter(s => !people.some(p => p.rank === Number(s.rank))).length;
  if (dropped) warnings.push(dropped + ' stakeholder row(s) from Claude did not match our people – removed');
  const stakeholders = people.map(p => {
    const s = byRank[p.rank] || {};
    const ct = contacts.find(x => x.rank === p.rank) || {};
    if (!byRank[p.rank]) warnings.push('No stakeholder row for #' + p.rank + ' – role taken from our data');
    const hasEmail = !!ct.email, hasLi = !!(ct.linkedin || p.linkedin);
    let channel = pick(s.first_channel, CHANNELS, hasEmail && hasLi ? CHANNELS[0] : hasEmail ? CHANNELS[1] : hasLi ? CHANNELS[2] : CHANNELS[3]);
    // never suggest a channel we cannot use
    if (/Email/.test(channel) && !hasEmail) channel = hasLi ? CHANNELS[2] : CHANNELS[3];
    if (/LinkedIn/.test(channel) && !hasLi) channel = hasEmail ? CHANNELS[1] : CHANNELS[3];
    return {
      rank: p.rank,
      person: p.display_name || p.full_name,
      title: p.title,
      buying_role: pick(s.buying_role, ROLES, ROLE_FROM_PERSONA(p.persona_role || '')),
      why_them: tidy(s.why_them) || tidy(p.why_they_matter || p.role_reason),
      first_channel: channel,
      email: ct.email || null,
      email_status: ct.email_status || 'Not found',
      linkedin: ct.linkedin || p.linkedin || null,
      is_start_with: !!(c.key_people_meta && c.key_people_meta.start_with_rank === p.rank)
    };
  });
  let stakeholder_intro = tidy(plan.stakeholder_intro);
  if (!/^Engage the buying group, not one person\./.test(stakeholder_intro)) stakeholder_intro = 'Engage the buying group, not one person. ' + stakeholder_intro.replace(/^Engage the buying group[^.]*\.\s*/i, '');
  if (!/Contact details are in A7\.$/.test(stakeholder_intro)) stakeholder_intro = stakeholder_intro.replace(/\s*Contact details are in A7\.?/i, '').trim() + ' Contact details are in A7.';

  // 7. 05 Conversation plan
  const cp = plan.conversation_plan || {};
  const conversation_plan = {
    opening_line: tidy(cp.opening_line),
    value_hypothesis: tidy(cp.value_hypothesis),
    do: arr(cp.do).slice(0, 3).map(tidy),
    dont: arr(cp.dont).slice(0, 3).map(tidy)
  };

  // 8. 06 Discovery questions – one per topic, fixed order, max 3 stars
  const qs = arr(plan.discovery_questions);
  let stars = 0;
  const discovery_questions = TOPICS.map((t, k) => {
    const q = qs.find(x => tidy(x.topic).toLowerCase() === t.toLowerCase()) || qs[k] || {};
    if (!q.question) warnings.push('Discovery question missing for ' + t);
    const star = (q.star === true || q.star === 'true') && stars < 3;
    if (star) stars++;
    return { star, topic: t, question: tidy(q.question) || 'Not provided', context: tidy(q.context), ask: tidy(q.ask) };
  });

  // 9. 07 Likely objections – fixed 5, fixed order
  const objs = arr(plan.objections);
  const objections = OBJECTIONS.map((label, k) => {
    const o = objs[k] || {};
    if (!o.respond_with) warnings.push('Objection reply missing: ' + label);
    return { if_they_say: tidy(o.if_they_say) || label, respond_with: tidy(o.respond_with) || 'Not provided' };
  });

  // 10. Cost of this call (thinking tokens are already inside output_tokens)
  const u = res.usage || {};
  const account_plan_cost_usd = Math.round((((u.input_tokens || 0) * 2 + (u.output_tokens || 0) * 10) / 1e6) * 1000) / 1000;

  delete c.account_plan_prompt;

  out.push({ json: Object.assign(c, {
    card_business_trigger,
    card_buying_intent,
    bottom_line,
    bottom_line_html,
    recommended_action,
    three_things,
    signals_at_a_glance,
    stakeholder_intro,
    stakeholders,
    conversation_plan,
    discovery_questions,
    objections,
    account_plan_warnings: warnings,
    account_plan_error,
    account_plan_cost_usd,
    total_cost_usd: Math.round(((c.total_cost_usd || 0) + account_plan_cost_usd) * 1000) / 1000
  })});
});

return out;
