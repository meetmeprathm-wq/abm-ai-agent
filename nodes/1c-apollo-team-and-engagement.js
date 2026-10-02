// SECTION 2 – Step 3+4: Apollo Team & Engagement (free – 0 credits)
// Adds 3 signals: In-house BIM team · Past outreach · Email opens, clicks, replies
// Inputs (same order, 1 item per company): Apollo Buying Signals → Apollo – BIM Team → Apollo – Engagement (this node's input)

const NO_DATA = 'No data found';
const DAY = 86400000;
const now = Date.now();
const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const daysAgo = d => Math.floor((now - new Date(d).getTime()) / DAY);
const uniq = a => [...new Set(a)];
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const errText = e => (typeof e === 'string' ? e : (e && (e.message || JSON.stringify(e))) || null);
const sig = (key, label, found, evidence, source, source_url, strength) =>
  ({ key, label, found: found ? 'Yes' : 'No', evidence: evidence || NO_DATA, source: found ? source : 'None', source_url: found ? (source_url || null) : null, strength: found ? strength : 'Not found' });
const tally = list => { const t = {}; list.forEach(x => { t[x] = (t[x] || 0) + 1; }); return Object.keys(t).sort((a, b) => t[b] - t[a]).map(k => ({ k, n: t[k] })); };
const tallyText = list => tally(list).map(x => x.n + ' ' + x.k).join(', ');

const companies = $('Apollo Buying Signals').all();
const teams = $('Apollo – BIM Team').all();

// ---------- title buckets ----------
const BIM_RE = /\b(bim|vdc|virtual design|digital delivery|revit|cad|computer aided design|draft(er|sman|sperson|ing)?|modell?er)\b/i;
const bimBucket = t => {
  if (/\b(manager|director|lead|head|principal)\b/i.test(t)) return 'BIM/VDC Manager';
  if (/coordinat/i.test(t)) return 'BIM/VDC Coordinator';
  if (/\b(cad|computer aided design|draft)/i.test(t)) return 'CAD Technician / Drafter';
  if (/model/i.test(t)) return 'BIM Modeler';
  if (/designer/i.test(t)) return 'BIM/VDC Designer';
  return 'VDC Specialist';
};
const designBucket = t => {
  if (/electric/i.test(t)) return 'Electrical';
  if (/mechanic|hvac/i.test(t)) return 'Mechanical';
  if (/plumb/i.test(t)) return 'Plumbing';
  if (/fire|sprinkler/i.test(t)) return 'Fire Protection';
  if (/\b(ict|low voltage|security|telecom|av)\b/i.test(t)) return 'ICT / Security';
  if (/control|automation/i.test(t)) return 'Controls';
  if (/struct/i.test(t)) return 'Structural';
  if (/architect|interior/i.test(t)) return 'Architectural';
  return 'General';
};
const SENIOR_RE = /\b(ceo|coo|cto|president|owner|founder|principal|partner|chief|vp|vice president|director|head)\b/i;

const out = [];

$input.all().forEach((item, i) => {
  const c = Object.assign({}, (companies[i] && companies[i].json) || {});
  const eng = item.json || {};
  const team = (teams[i] && teams[i].json) || {};
  const signals = (c.signals_apollo || []).slice();
  const domain = String(c.domain || '').toLowerCase();

  // Fix: Unfilled BIM role link → the OLDEST open BIM role
  const oldest = (c.bim_jobs || []).filter(j => j.posted_at).sort((a, b) => new Date(a.posted_at) - new Date(b.posted_at))[0];
  const ubr = signals.find(s => s.key === 'unfilled_bim_role');
  if (ubr && oldest && oldest.url) ubr.source_url = oldest.url;

  // Fix: hiring in the HQ city is normal, not an expansion push → Low
  const chp = signals.find(s => s.key === 'city_hiring_push' && s.found === 'Yes');
  const hq = String((c.snapshot && c.snapshot.hq_address && c.snapshot.hq_address.value) || '').toLowerCase();
  if (chp) {
    const city = String(chp.label || '').replace(/\s+hiring push$/i, '').trim().toLowerCase();
    if (city && hq.includes(city)) { chp.strength = 'Low'; chp.evidence += '; this is their HQ city'; }
  }

  // ---------- 8. In-house BIM team (Apollo people search) ----------
  const people = Array.isArray(team.people) ? team.people : [];
  const titles = people.map(p => String(p.title || '').replace(/\s+at\s+.+$/i, '').trim()).filter(Boolean);
  const isBim = t => BIM_RE.test(t) && !/\bgis\b/i.test(t);
  const bimTitles = titles.filter(isBim);
  const designTitles = titles.filter(t => !isBim(t) && !/\bgis\b/i.test(t) && /designer/i.test(t));
  const bimLeads = people.filter(p => isBim(p.title || '') && /\b(manager|director|lead|head)\b/i.test(p.title || ''))
    .map(p => ({ first_name: p.first_name, last_name: p.last_name_obfuscated || '', title: p.title, person_id: p.id }));
  const totalFound = typeof team.total_entries === 'number' ? team.total_entries : people.length;
  {
    const b = bimTitles.length, d = designTitles.length;
    let ev = null, str = 'Low';
    if (b || d) {
      const parts = [];
      if (b) parts.push(plural(b, 'dedicated BIM/VDC/CAD staff').replace('staffs', 'staff') + ': ' + tallyText(bimTitles.map(bimBucket)));
      else parts.push('No dedicated BIM/VDC staff found');
      if (d) parts.push('supported by ' + plural(d, 'designer') + ' (' + tallyText(designTitles.map(designBucket)) + ')');
      const size = c.snapshot && c.snapshot.size && c.snapshot.size.value;
      ev = parts.join('; ') + (size && size !== NO_DATA ? '; about ' + (b + d) + ' production people for ' + String(size).split(';')[0] : '');
      if (totalFound > people.length) ev += ' (first ' + people.length + ' of ' + totalFound + ' shown)';
      str = b >= 5 ? 'High' : b >= 2 ? 'Medium' : 'Low';
    }
    signals.push(sig('in_house_bim_team', 'In-house BIM team', b + d > 0, ev, 'Apollo', null, str));
  }

  // ---------- Apollo contacts for this company ----------
  const contacts = (Array.isArray(eng.contacts) ? eng.contacts : []).filter(ct =>
    (c.org_id && ct.organization_id === c.org_id) ||
    (domain && String(ct.email || '').toLowerCase().endsWith('@' + domain)) ||
    (domain && String((ct.account && ct.account.primary_domain) || '').toLowerCase() === domain));

  const enrolls = [];
  contacts.forEach(ct => (ct.contact_campaign_statuses || []).forEach(s => enrolls.push({
    name: ct.name, title: ct.title || '', seq: s.emailer_campaign_id, status: s.status || '', reason: s.inactive_reason || '',
    added: s.added_at, finished: s.finished_at, mailbox: s.send_email_from_email_address || ''
  })));

  // ---------- 9. Past outreach ----------
  {
    let ev = null;
    const sequenced = new Set(enrolls.map(e => e.name));
    const seniorNever = contacts.filter(ct => !(ct.contact_campaign_statuses || []).length && SENIOR_RE.test(ct.title || ''))
      .map(ct => ct.name + ' (' + ct.title + ')').slice(0, 3);
    const neverCt = contacts.filter(ct => !(ct.contact_campaign_statuses || []).length).length;
    if (enrolls.length) {
      const seqs = uniq(enrolls.map(e => e.seq));
      const added = enrolls.map(e => new Date(e.added)).filter(d => !isNaN(d));
      const first = new Date(Math.min(...added)), last = new Date(Math.max(...added));
      const st = uniq(enrolls.map(e => e.status || 'unknown'));
      const statusText = st.length === 1 ? 'all ' + st[0] : tallyText(enrolls.map(e => e.status || 'unknown')) + ' (by enrollment)';
      const seniorIn = uniq(enrolls.filter(e => SENIOR_RE.test(e.title)).map(e => e.name + ' (' + e.title + ')')).slice(0, 3);
      const roleMix = tally(enrolls.filter((e, k, a) => a.findIndex(x => x.name === e.name) === k).map(e => e.title || 'Unknown title'))[0];
      ev = plural(sequenced.size, 'contact') + ' enrolled in ' + plural(seqs.length, 'sequence') + ', ' +
        (fmtDate(first) === fmtDate(last) ? fmtDate(first) : fmtDate(first) + ' – ' + fmtDate(last)) +
        '; status: ' + statusText +
        (seniorIn.length ? '; incl. ' + seniorIn.join(', ') : (roleMix && sequenced.size > 1 ? '; mostly ' + roleMix.k : ''));
    } else if (contacts.length) {
      ev = plural(contacts.length, 'contact') + ' saved in Apollo, never added to a sequence';
    }
    if (ev && enrolls.length && neverCt) ev += '; ' + neverCt + ' saved but never sequenced';
    if (ev && seniorNever.length) ev += ' (senior: ' + seniorNever.join(', ') + ')';
    const replied = enrolls.some(e => /repl/i.test(e.reason) || /repl/i.test(e.status));
    const str = replied ? 'High' : enrolls.length ? 'Context' : 'Low';
    signals.push(sig('past_outreach', 'Past outreach', contacts.length > 0, ev, 'Apollo', null, str));
  }

  // ---------- 10. Email opens, clicks, replies ----------
  {
    const replied = enrolls.filter(e => /repl/i.test(e.reason) || /repl/i.test(e.status));
    const bounced = enrolls.filter(e => /bounc/i.test(e.reason) || /bounc/i.test(e.status));
    const unsub = contacts.filter(ct => ct.email_unsubscribed);
    const acts = contacts.map(ct => ct.last_activity_date).filter(Boolean).map(d => new Date(d));
    const lastAct = acts.length ? new Date(Math.max(...acts)) : null;
    const activeCt = contacts.filter(ct => ct.last_activity_date).length;
    const mailboxes = uniq(enrolls.map(e => e.mailbox).filter(Boolean));
    let ev = null, str = 'Low';
    if (enrolls.length || activeCt) {
      const parts = [];
      parts.push(replied.length ? plural(replied.length, 'reply').replace('replys', 'replies') : 'No replies recorded');
      if (bounced.length) parts.push(plural(bounced.length, 'bounce'));
      if (unsub.length) parts.push(plural(unsub.length, 'unsubscribe'));
      if (activeCt) parts.push('last touch ' + fmtDate(lastAct) + ' (' + daysAgo(lastAct) + ' days ago) across ' + activeCt + ' of ' + contacts.length + ' contacts');
      if (mailboxes.length) parts.push('sent from ' + plural(mailboxes.length, 'Excelize mailbox').replace('mailboxs', 'mailboxes'));
      parts.push('opens / clicks not available from Apollo API');
      ev = parts.join('; ');
      str = replied.length ? 'High' : 'Low';
    }
    signals.push(sig('email_activity', 'Email opens, clicks, replies', !!ev, ev, 'Apollo', null, str));
  }

  const apolloErr = errText(eng.error) || errText(team.error);

  out.push({ json: Object.assign(c, {
    signals_apollo: signals,
    signals_apollo_found: signals.filter(s => s.found === 'Yes').length,
    bim_team: {
      total_found: totalFound,
      bim_cad_count: bimTitles.length,
      designer_count: designTitles.length,
      bim_leads: bimLeads,
      people: people.slice(0, 50).map(p => ({ person_id: p.id, first_name: p.first_name, last_name: p.last_name_obfuscated || '', title: p.title, has_email: !!p.has_email, has_direct_phone: p.has_direct_phone || null }))
    },
    apollo_contacts: contacts.slice(0, 50).map(ct => ({
      contact_id: ct.id, person_id: ct.person_id, name: ct.name, title: ct.title || null,
      email: ct.email || null, email_status: ct.email_status || null, linkedin: ct.linkedin_url || null,
      phones: (ct.phone_numbers || []).filter(p => p.type !== 'work_hq').map(p => ({ number: p.raw_number, type: p.type, dnc: p.dnc_status || null })),
      city: ct.city || null, state: ct.state || null,
      sequences: (ct.contact_campaign_statuses || []).length, last_activity: ct.last_activity_date || null
    })),
    apollo_contact_count: contacts.length,
    engagement_error: apolloErr
  })});
});

return out;
