// A5 Relationship history – Step 6: Apollo Email Activity (free – no API call)
// Reads the Apollo – Email Messages replies and rewrites the A5 "Email engagement" row with real numbers:
// emails delivered, people who opened / clicked / replied, bounces, last email sent, and who engaged most.
// Note: Apollo opens can include email-security scanners, so clicks and replies are the stronger signals.
// Inputs: Apollo – Email Messages (this node's input) · Prep Apollo Emails · Zoho History

const now = Date.now();
const DAY = 86400000;
const companies = $('Zoho History').all();
const prep = $('Prep Apollo Emails').all();
const replies = $input.all();

const fmtDate = d => { const x = new Date(d); return isNaN(x) ? null : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const daysAgo = d => Math.floor((now - new Date(d).getTime()) / DAY);
const plural = (n, w, p) => n + ' ' + (n === 1 ? w : (p || w + 's'));
const yes = v => v === true || v === 'true' || (typeof v === 'number' && v > 0);

// ---------- collect emails per company (only the contact each request was for) ----------
const byCompany = {};
const errors = {};
replies.forEach((r, k) => {
  const idx = (r.pairedItem && typeof r.pairedItem.item === 'number') ? r.pairedItem.item : k;
  const p = (prep[idx] && prep[idx].json) || {};
  if (p.skip || typeof p.ci !== 'number' || p.ci < 0) return;
  const body = r.json || {};
  if (body.error) { errors[p.ci] = errors[p.ci] || String(body.error.message || body.error); return; }
  const msgs = Array.isArray(body.emailer_messages) ? body.emailer_messages : [];
  const bucket = byCompany[p.ci] = byCompany[p.ci] || {};
  msgs.filter(m => !m.contact_id || m.contact_id === p.contact_id).forEach(m => {
    bucket[m.id] = {
      id: m.id,
      contact_id: p.contact_id,
      contact: p.contact_name,
      title: p.title,
      sequence_id: m.emailer_campaign_id || p.sequence_id,
      subject: m.subject || (m.variant && m.variant.subject) || null,
      sent_at: m.completed_at || m.sent_at || m.updated_at || m.created_at || null,
      status: m.status || null,
      delivered: yes(m.delivered) || m.status === 'completed',
      opens: typeof m.num_opens === 'number' ? m.num_opens : (yes(m.opened) ? 1 : 0),
      clicked: yes(m.clicked) || yes(m.num_clicks),
      replied: yes(m.replied) || /repl/i.test(String(m.reply_class || m.status || '')),
      bounced: yes(m.bounced) || /bounc/i.test(String(m.failure_reason || m.status || '')),
      unsubscribed: yes(m.unsubscribe) || yes(m.unsubscribed)
    };
  });
});

const out = [];

companies.forEach((item, ci) => {
  const c = Object.assign({}, item.json || {});
  const rh = Object.assign({}, c.relationship_history || {});
  const outreach = Object.assign({}, rh.outreach || {});
  const emails = Object.values(byCompany[ci] || {});

  const delivered = emails.filter(e => e.delivered && !e.bounced);
  const people = {};
  emails.forEach(e => {
    const p = people[e.contact_id] = people[e.contact_id] || { name: e.contact, title: e.title, sent: 0, opens: 0, clicks: 0, replied: false, bounced: false, last: null };
    if (e.delivered) p.sent++;
    p.opens += e.opens || 0;
    if (e.clicked) p.clicks++;
    if (e.replied) p.replied = true;
    if (e.bounced) p.bounced = true;
    if (e.sent_at && (!p.last || new Date(e.sent_at) > new Date(p.last))) p.last = e.sent_at;
  });
  const list = Object.values(people);
  const openedPeople = list.filter(p => p.opens > 0);
  const clickedPeople = list.filter(p => p.clicks > 0);
  const repliedPeople = list.filter(p => p.replied);
  const bounces = emails.filter(e => e.bounced).length;
  const unsubs = emails.filter(e => e.unsubscribed).length;
  const lastSent = emails.map(e => e.sent_at).filter(Boolean).sort().slice(-1)[0] || null;
  const top = list.slice().sort((a, b) => (b.replied - a.replied) || (b.clicks - a.clicks) || (b.opens - a.opens))[0] || null;

  let what, status;
  if (errors[ci] && !emails.length) {
    what = 'Could not read Apollo emails (' + String(errors[ci]).slice(0, 80) + ')';
    status = 'Not checked';
  } else if (emails.length) {
    const parts = [];
    parts.push(plural(delivered.length, 'email') + ' delivered to ' + plural(list.length, 'person', 'people'));
    parts.push(openedPeople.length ? plural(openedPeople.length, 'person', 'people') + ' opened' : 'no opens');
    parts.push(clickedPeople.length ? plural(clickedPeople.length, 'person', 'people') + ' clicked' : 'no clicks');
    parts.push(repliedPeople.length ? plural(repliedPeople.length, 'reply', 'replies') + ' (' + repliedPeople.map(p => p.name).join(', ') + ')' : 'no replies');
    if (bounces) parts.push(plural(bounces, 'bounce'));
    if (unsubs) parts.push(plural(unsubs, 'unsubscribe'));
    if (lastSent) parts.push('last email ' + fmtDate(lastSent) + ' (' + daysAgo(lastSent) + ' days ago)');
    if (top && (top.opens || top.clicks || top.replied)) {
      parts.push('most engaged: ' + top.name + (top.title ? ' (' + top.title + ')' : '') + ' – ' +
        [top.replied ? 'replied' : null, top.clicks ? plural(top.clicks, 'click') : null, top.opens ? plural(top.opens, 'open') : null].filter(Boolean).join(', '));
    }
    what = parts.join('; ') + (openedPeople.length && !clickedPeople.length && !repliedPeople.length ? ' (opens alone may be email-security scanners)' : '');
    status = repliedPeople.length || clickedPeople.length ? 'Context' : 'Low';
  } else if (outreach.contacts_sequenced) {
    what = 'Contacts were sequenced, but Apollo returned no sent emails (sequence may have been paused before sending)';
    status = 'Low';
  } else {
    what = 'No emails sent to this company yet';
    status = 'Not found';
  }

  const row = { item: 'Email engagement', what, source: 'Apollo (sequence emails)', status };
  const rows = (rh.rows || []).filter(r => r.item !== 'Email engagement');
  rows.push(row);
  rh.rows = rows;

  outreach.emails = {
    delivered: delivered.length,
    people_emailed: list.length,
    people_opened: openedPeople.length,
    people_clicked: clickedPeople.length,
    people_replied: repliedPeople.length,
    bounces,
    unsubscribes: unsubs,
    last_sent: lastSent,
    last_sent_days: lastSent ? daysAgo(lastSent) : null,
    most_engaged: top && (top.opens || top.clicks || top.replied) ? { name: top.name, title: top.title, opens: top.opens, clicks: top.clicks, replied: top.replied } : null,
    per_person: list,
    error: errors[ci] || null
  };
  // keep the counters Fit Score reads in sync with the email-level truth
  outreach.replies = Math.max(outreach.replies || 0, repliedPeople.length);
  outreach.bounces = Math.max(outreach.bounces || 0, bounces);
  if (lastSent && (!outreach.last_touch || new Date(lastSent) > new Date(outreach.last_touch))) {
    outreach.last_touch = lastSent;
    outreach.last_touch_days = daysAgo(lastSent);
  }
  rh.outreach = outreach;

  out.push({ json: Object.assign(c, { relationship_history: rh }) });
});

return out;
