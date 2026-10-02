// A5 Relationship history – Step 2: Relationship History (free – no API call)
// Builds the A5 table: "What Excelize already knows about <Co>, and what has already happened."
// Rows: CRM records (Zoho + Apollo) · Former customer (Zoho Deals) · Past outreach (Apollo sequences by name)
//       · Website visits · Email engagement.   Status values: Not checked · Context · Low · Not found
// Also fixes A1 "In our systems" (adds Zoho) and sets account_owner for page 1.
// Inputs: Prep Relationship (this node's input) · Zoho – Accounts · Zoho – Deals · Zoho – Leads · Apollo – Sequences · Apollo – Engagement
// Leads are matched by website, by work-email domain (free mail like gmail is ignored) or by company name.

const NO_DATA = 'No data found';
const now = Date.now();
const DAY = 86400000;

const safeAll = name => { try { return $(name).all(); } catch (e) { return []; } };
const companies = $input.all();
const zohoAccounts = safeAll('Zoho – Accounts').map(i => i.json || {}).filter(a => a.id);
const zohoDeals = safeAll('Zoho – Deals').map(i => i.json || {}).filter(d => d.id);
const zohoLeads = safeAll('Zoho – Leads').map(i => i.json || {}).filter(l => l.id);
const seqItems = safeAll('Apollo – Sequences');
const engItems = safeAll('Apollo – Engagement');

// ---------- helpers ----------
const fmtDate = d => { const x = new Date(d); return isNaN(x) ? null : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const fmtMonth = d => { const x = new Date(d); return isNaN(x) ? null : x.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };
const daysAgo = d => Math.floor((now - new Date(d).getTime()) / DAY);
const uniq = a => [...new Set(a.filter(Boolean))];
const plural = (n, w, p) => n + ' ' + (n === 1 ? w : (p || w + 's'));
const usdFmt = v => (typeof v === 'number' && v > 0) ? '$' + Math.round(v).toLocaleString('en-US') : null;
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; };

const domainOf = s => String(s || '')
  .toLowerCase()
  .trim()
  .replace(/^\[([^\]]+)\]\([^)]*\)$/, '$1')   // [www.x.com](https://www.x.com) → www.x.com
  .replace(/^https?:\/\//, '')
  .replace(/^www\./, '')
  .replace(/[\/?#].*$/, '')
  .trim();

const ENTITY = /\b(inc|incorporated|corp|corporation|co|company|llc|l l c|ltd|limited|lp|llp|pllc|pc|pvt|private|group|holdings|the)\b/g;
const core = s => String(s || '')
  .toLowerCase()
  .replace(/,?\s+an?\s+[\w&.\- ]+?\s+company\s*$/i, '')   // "Example Group, a Parent Co company" → "Example Group"
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(ENTITY, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const nameMatch = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length <= b.length ? a : b, long = a.length <= b.length ? b : a;
  return short.length >= 8 && long.startsWith(short + ' ');
};
const domainMatch = (a, b) => !!a && !!b && (a === b || a.endsWith('.' + b) || b.endsWith('.' + a));

// Test / sample / internal records are never treated as a real account
const JUNK = /\(sample\)|delete the entry|^\W*$|^abc$|excelize/i;
const FREE_MAIL = /@(gmail|yahoo|hotmail|outlook|live|msn|aol|icloud|me|proton|protonmail|gmx|yandex|zoho|mail)\./i;
const emailDomain = e => { const m = String(e || '').toLowerCase().match(/@([a-z0-9.-]+)$/); return m && !FREE_MAIL.test(String(e)) ? m[1].replace(/^www\./, '') : null; };
const leadName = l => l.Full_Name || [l.First_Name, l.Last_Name].filter(Boolean).join(' ') || null;

// ---------- Apollo sequences: id → info ----------
const seqMap = {};
seqItems.forEach(it => ((it.json && it.json.emailer_campaigns) || []).forEach(s => {
  seqMap[s.id] = { name: String(s.name || 'Unnamed sequence').trim(), created: s.created_at, last_used: s.last_used_at };
}));

// ---------- Apollo contacts (from Apollo – Engagement) ----------
const allContacts = [];
const seenCt = new Set();
engItems.forEach(it => ((it.json && it.json.contacts) || []).forEach(ct => {
  if (ct && ct.id && !seenCt.has(ct.id)) { seenCt.add(ct.id); allContacts.push(ct); }
}));

// ---------- Deals currency → approx USD (fixed rates; Zoho Exchange_Rate is not reliable) ----------
const TO_USD = { USD: 1, INR: 0.0113, AED: 0.2723 };
const dealUsd = d => {
  const amt = typeof d.Amount === 'number' ? d.Amount : null;
  const rate = TO_USD[String(d.Currency || '').toUpperCase()];
  return amt != null && rate ? amt * rate : null;
};
const dealKind = st => /closed won/i.test(st) ? 'won' : /closed lost/i.test(st) ? 'lost' : /on hold/i.test(st) ? 'hold' : 'open';

const out = [];

companies.forEach(item => {
  const c = item.json || {};
  const prep = c.relationship_prep || {};
  const domain = prep.domain || domainOf(c.domain || c.website);
  const cName = core(c.name);
  const coName = c.name || 'this company';

  // =============== 1. Zoho Accounts ===============
  const accts = zohoAccounts.filter(a => !JUNK.test(String(a.Account_Name || '').trim())).map(a => {
    const zd = domainOf(a.Website);
    const byDomain = domainMatch(zd, domain);
    const byName = nameMatch(core(a.Account_Name), cName);
    return (byDomain || byName) ? Object.assign({}, a, { _matched_by: byDomain ? 'website' : 'name' }) : null;
  }).filter(Boolean)
    .sort((x, y) => new Date(y.Modified_Time || 0) - new Date(x.Modified_Time || 0));

  const acctIds = new Set(accts.map(a => a.id));
  const owners = uniq(accts.map(a => a.Owner && a.Owner.name));
  const primary = accts[0] || null;
  const owner = primary && primary.Owner ? primary.Owner.name : null;
  const ownerEmail = primary && primary.Owner ? primary.Owner.email : null;
  const created = accts.map(a => a.Created_Time).filter(Boolean).sort()[0] || null;
  const lastAct = accts.map(a => a.Last_Activity_Time).filter(Boolean).sort().slice(-1)[0] || null;
  const abmStage = primary ? (primary.ABM_Touch_Stage || null) : null;
  const touches = uniq([].concat(...accts.map(a => Array.isArray(a.Touch_Made) ? a.Touch_Made : [])));
  const rating = primary ? (primary.Rating || null) : null;

  // =============== 1b. Zoho Leads (not yet converted) ===============
  const leads = zohoLeads.filter(l => !JUNK.test(String(l.Company || '').trim())).map(l => {
    const byDomain = domainMatch(domainOf(l.Website), domain) || domainMatch(emailDomain(l.Email), domain);
    const byName = nameMatch(core(l.Company), cName);
    return (byDomain || byName) ? Object.assign({}, l, { _matched_by: byDomain ? 'website / email' : 'name' }) : null;
  }).filter(Boolean)
    .sort((x, y) => new Date(y.Modified_Time || y.Created_Time || 0) - new Date(x.Modified_Time || x.Created_Time || 0));
  const leadOwners = uniq(leads.map(l => l.Owner && l.Owner.name));
  const leadCreated = leads.map(l => l.Created_Time).filter(Boolean).sort()[0] || null;
  const leadLastAct = leads.map(l => l.Last_Activity_Time).filter(Boolean).sort().slice(-1)[0] || null;
  const leadStatuses = uniq(leads.map(l => l.Lead_Status));
  const leadSources = uniq(leads.map(l => l.Lead_Source));
  const leadPeople = leads.map(l => { const n = leadName(l); return n ? n + (l.Designation ? ' (' + l.Designation + ')' : '') : null; }).filter(Boolean);

  // =============== 2. Zoho Deals ===============
  const deals = zohoDeals.filter(d => {
    const an = d.Account_Name || {};
    return (an.id && acctIds.has(an.id)) || nameMatch(core(an.name), cName);
  }).map(d => ({
    name: d.Deal_Name || 'Unnamed deal',
    stage: d.Stage || 'Unknown',
    kind: dealKind(d.Stage || ''),
    usd: dealUsd(d),
    currency: d.Currency || null,
    amount: typeof d.Amount === 'number' ? d.Amount : null,
    closing: d.Closing_Date || null,
    created: d.Created_Time || null,
    loss_reason: d.Reason_For_Loss__s || null,
    note: d.Description && !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(d.Description) ? cut(d.Description, 140) : null,
    owner: d.Owner ? d.Owner.name : null,
    project_type: d.Project_Type || null
  })).sort((x, y) => new Date(y.closing || y.created || 0) - new Date(x.closing || x.created || 0));

  const won = deals.filter(d => d.kind === 'won');
  const lost = deals.filter(d => d.kind === 'lost');
  const open = deals.filter(d => d.kind === 'open');
  const hold = deals.filter(d => d.kind === 'hold');
  const sumUsd = list => list.reduce((s, d) => s + (d.usd || 0), 0);

  // =============== 3. Apollo contacts + sequences ===============
  const contacts = allContacts.filter(ct =>
    (c.org_id && ct.organization_id === c.org_id) ||
    (domain && String(ct.email || '').toLowerCase().endsWith('@' + domain)) ||
    (domain && domainOf((ct.account && ct.account.primary_domain) || '') === domain));

  const enrolls = [];
  contacts.forEach(ct => (ct.contact_campaign_statuses || []).forEach(s => enrolls.push({
    contact: ct.name, title: ct.title || '', seq: s.emailer_campaign_id,
    status: String(s.status || 'unknown'), reason: String(s.inactive_reason || ''),
    added: s.added_at || null, finished: s.finished_at || null
  })));

  const bySeq = {};
  enrolls.forEach(e => {
    // Sequences not returned by Apollo – Sequences (archived / deleted) are grouped into one line
    const k = (e.seq && seqMap[e.seq]) ? e.seq : 'archived';
    if (!bySeq[k]) bySeq[k] = { id: k, name: k === 'archived' ? 'Older sequences (archived in Apollo)' : seqMap[k].name, contacts: new Set(), statuses: [], added: [] };
    bySeq[k].contacts.add(e.contact);
    bySeq[k].statuses.push(e.status);
    if (e.added) bySeq[k].added.push(e.added);
  });
  const seqList = Object.values(bySeq).map(s => ({
    id: s.id,
    name: s.name,
    contacts: s.contacts.size,
    first_added: s.added.sort()[0] || null,
    statuses: uniq(s.statuses)
  })).sort((x, y) => new Date(y.first_added || 0) - new Date(x.first_added || 0));

  const replied = enrolls.filter(e => /repl/i.test(e.reason) || /repl/i.test(e.status));
  const bounced = enrolls.filter(e => /bounc/i.test(e.reason) || /bounc/i.test(e.status));
  const unsub = contacts.filter(ct => ct.email_unsubscribed);
  const actDates = contacts.map(ct => ct.last_activity_date).filter(Boolean).sort();
  const lastTouch = actDates.length ? actDates[actDates.length - 1] : null;
  const neverSeq = contacts.filter(ct => !(ct.contact_campaign_statuses || []).length);

  // =============== Rows ===============
  const rows = [];

  // Row 1 – CRM records (Zoho + Apollo)
  {
    const parts = [];
    if (accts.length) {
      let z = 'Zoho: ' + plural(accts.length, 'account record') +
        (owner ? ', owner ' + owner : '') +
        (owners.length > 1 ? ' (also ' + owners.filter(o => o !== owner).join(', ') + ')' : '') +
        (created ? ', created ' + fmtMonth(created) : '') +
        (abmStage ? ', ABM stage "' + abmStage + '"' : '') +
        (touches.length ? ', touches: ' + touches.join(', ') : '') +
        (rating ? ', rating ' + rating : '') +
        (lastAct ? ', last activity ' + fmtDate(lastAct) : '');
      if (accts.length > 1) z += ' – duplicate records, worth merging';
      parts.push(z);
    } else {
      parts.push('Zoho: no account record');
    }
    if (leads.length) {
      parts.push('Zoho Leads: ' + plural(leads.length, 'lead') +
        (leadPeople.length ? ' – ' + leadPeople.slice(0, 3).join(', ') + (leadPeople.length > 3 ? ' +' + (leadPeople.length - 3) + ' more' : '') : '') +
        (leadStatuses.length ? '; status ' + leadStatuses.join(', ') : '') +
        (leadSources.length ? '; source ' + leadSources.join(', ') : '') +
        (leadOwners.length ? '; owner ' + leadOwners.join(', ') : '') +
        (leadCreated ? '; first added ' + fmtMonth(leadCreated) : '') +
        (leadLastAct ? '; last activity ' + fmtDate(leadLastAct) : '') +
        (accts.length ? '' : ' – not yet converted to an account'));
    }
    const apolloSince = c.snapshot && c.snapshot.in_our_systems && c.snapshot.in_our_systems.value;
    if (contacts.length || (apolloSince && apolloSince !== NO_DATA)) {
      parts.push('Apollo: ' + (contacts.length ? plural(contacts.length, 'saved contact') : 'no saved contacts') +
        (apolloSince && apolloSince !== NO_DATA ? ' (' + apolloSince + ')' : ''));
    } else {
      parts.push('Apollo: not saved');
    }
    rows.push({
      item: 'CRM records',
      what: parts.join('; '),
      source: 'Zoho CRM + Apollo',
      status: (accts.length || leads.length || contacts.length) ? 'Context' : 'Not found'
    });
  }

  // Row 2 – Former customer (Zoho Deals)
  {
    let what, status;
    if (deals.length) {
      const parts = [];
      if (won.length) {
        const w = won[0];
        parts.push('Yes – ' + plural(won.length, 'won deal') + (usdFmt(sumUsd(won)) ? ' (≈' + usdFmt(sumUsd(won)) + ')' : '') +
          '; latest: "' + w.name + '"' + (w.closing ? ', closed ' + fmtMonth(w.closing) : ''));
      } else {
        parts.push('Not a customer yet – no won deals');
      }
      if (open.length) parts.push(plural(open.length, 'open deal') + ' (' + uniq(open.map(d => d.stage)).join(', ') + ')' +
        (usdFmt(sumUsd(open)) ? ', ≈' + usdFmt(sumUsd(open)) : '') + '; latest: "' + open[0].name + '"');
      if (hold.length) parts.push(plural(hold.length, 'deal') + ' on hold');
      if (lost.length) {
        const reasons = uniq(lost.map(d => d.loss_reason));
        const lessons = lost.map(d => d.note).filter(Boolean).slice(0, 1);
        parts.push(plural(lost.length, 'lost deal') + (reasons.length ? ' (reason: ' + reasons.join(', ') + ')' : '') +
          (lessons.length ? '; note: "' + lessons[0] + '"' : ''));
      }
      what = parts.join('; ');
      status = 'Context';
    } else if (accts.length) {
      what = 'No deals recorded against the Zoho account';
      status = 'Not found';
    } else {
      what = 'No Zoho account, so no deal history';
      status = 'Not found';
    }
    rows.push({ item: 'Former customer', what, source: 'Zoho Deals', status });
  }

  // Row 3 – Past outreach (Apollo sequences by name)
  {
    let what, status;
    if (seqList.length) {
      const people = uniq(enrolls.map(e => e.contact));
      const shown = seqList.slice(0, 4).map(s =>
        '"' + s.name + '" (' + plural(s.contacts, 'contact') + (s.first_added ? ', ' + fmtMonth(s.first_added) : '') + ', ' + s.statuses.join('/') + ')');
      what = plural(people.length, 'contact') + ' in ' + plural(seqList.length, 'sequence') + ': ' + shown.join('; ') +
        (seqList.length > 4 ? '; +' + (seqList.length - 4) + ' more' : '');
      const seniorNever = neverSeq.filter(ct => /\b(ceo|coo|president|owner|founder|principal|chief|vp|vice president|director)\b/i.test(ct.title || ''))
        .map(ct => ct.name + ' (' + ct.title + ')').slice(0, 2);
      if (neverSeq.length) what += '; ' + neverSeq.length + ' saved but never sequenced' + (seniorNever.length ? ', incl. ' + seniorNever.join(', ') : '');
      status = 'Context';
    } else if (contacts.length) {
      what = plural(contacts.length, 'contact') + ' saved in Apollo, never added to a sequence';
      status = 'Low';
    } else {
      what = 'No Apollo outreach found';
      status = 'Not found';
    }
    rows.push({ item: 'Past outreach', what, source: 'Apollo sequences', status });
  }

  // Row 4 – Website visits
  rows.push({
    item: 'Website visits',
    what: 'Not checked yet (Apollo website visitor tracking not connected)',
    source: 'Apollo (website visitors)',
    status: 'Not checked'
  });

  // Row 5 – Email engagement
  {
    let what, status;
    if (enrolls.length || lastTouch) {
      const parts = [];
      parts.push(replied.length ? plural(replied.length, 'reply', 'replies') + ' (' + uniq(replied.map(e => e.contact)).join(', ') + ')' : 'No replies recorded');
      if (bounced.length) parts.push(plural(bounced.length, 'bounce'));
      if (unsub.length) parts.push(plural(unsub.length, 'unsubscribe'));
      if (lastTouch) parts.push('last touch ' + fmtDate(lastTouch) + ' (' + daysAgo(lastTouch) + ' days ago)');
      parts.push('opens / clicks not available from Apollo API');
      what = parts.join('; ');
      status = replied.length ? 'Context' : 'Low';
    } else {
      what = 'No emails sent to this company yet';
      status = 'Not found';
    }
    rows.push({ item: 'Email engagement', what, source: 'Apollo', status });
  }

  // =============== A1 fix: In our systems (add Zoho) ===============
  const snapshot = Object.assign({}, c.snapshot || {});
  {
    const prev = snapshot.in_our_systems || { label: 'In our systems', value: NO_DATA, source: 'None' };
    const prevVal = prev.value && prev.value !== NO_DATA ? prev.value : null;
    const zohoPart = accts.length
      ? 'Zoho account since ' + (fmtMonth(created) || 'unknown date') + (owner ? ' (owner ' + owner + ')' : '') +
        (won.length ? ', former customer' : open.length ? ', open deal' : '') +
        (leads.length ? '; ' + plural(leads.length, 'Zoho lead') : '')
      : leads.length
        ? 'Zoho lead since ' + (fmtMonth(leadCreated) || 'unknown date') + (leadOwners.length ? ' (owner ' + leadOwners[0] + ')' : '') + ', not converted'
        : 'Not in Zoho CRM';
    snapshot.in_our_systems = {
      label: 'In our systems',
      value: [zohoPart, prevVal].filter(Boolean).join('; '),
      source: prevVal ? 'Zoho CRM + Apollo' : 'Zoho CRM'
    };
  }

  out.push({ json: Object.assign({}, c, {
    snapshot,
    account_owner: owner || leadOwners[0] || 'to be assigned',
    account_owner_email: ownerEmail || ((leads[0] && leads[0].Owner && leads[0].Owner.email) || null),
    account_owner_source: owner ? 'Zoho account' : leadOwners.length ? 'Zoho lead' : null,
    relationship_history: {
      intro: 'What Excelize already knows about ' + coName + ', and what has already happened.',
      columns: ['Item', 'What we know', 'Source', 'Status'],
      rows,
      zoho: {
        matched: accts.length > 0,
        matched_by: primary ? primary._matched_by : null,
        account_ids: accts.map(a => a.id),
        owner: owner || null,
        owners,
        abm_stage: abmStage,
        touches,
        rating,
        created: created,
        last_activity: lastAct,
        leads: leads.length,
        lead_ids: leads.map(l => l.id),
        lead_matched_by: leads[0] ? leads[0]._matched_by : null,
        lead_owners: leadOwners,
        lead_statuses: leadStatuses,
        lead_sources: leadSources,
        lead_people: leadPeople.slice(0, 10),
        lead_created: leadCreated,
        lead_last_activity: leadLastAct
      },
      deals: {
        total: deals.length,
        won: won.length,
        lost: lost.length,
        open: open.length,
        on_hold: hold.length,
        won_usd: Math.round(sumUsd(won)) || 0,
        open_usd: Math.round(sumUsd(open)) || 0,
        loss_reasons: uniq(lost.map(d => d.loss_reason)),
        list: deals.slice(0, 10)
      },
      outreach: {
        contacts_saved: contacts.length,
        contacts_sequenced: uniq(enrolls.map(e => e.contact)).length,
        never_sequenced: neverSeq.length,
        sequences: seqList,
        replies: replied.length,
        bounces: bounced.length,
        unsubscribes: unsub.length,
        last_touch: lastTouch,
        last_touch_days: lastTouch ? daysAgo(lastTouch) : null
      },
      former_customer: won.length > 0,
      open_deal: open.length > 0,
      website_visits: 'Not checked'
    }
  })});
});

return out;
