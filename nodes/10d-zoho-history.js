// A5 Relationship history – Step 4: Zoho History (free – no API call)
// Reads the Zoho – History replies (notes, calls, meetings, tasks) and adds them to A5 as a new row
// "Notes, calls & meetings" (after Past outreach), plus a clean timeline for the Account Plan step.
// Inputs: Zoho – History (this node's input) · Prep Zoho History · Relationship History

const now = Date.now();
const DAY = 86400000;
const companies = $('Relationship History').all();
const prep = $('Prep Zoho History').all();
const replies = $input.all();

const fmtDate = d => { const x = new Date(d); return isNaN(x) ? null : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const daysAgo = d => Math.floor((now - new Date(d).getTime()) / DAY);
const uniq = a => [...new Set(a.filter(Boolean))];
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const clean = s => String(s || '')
  .replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|li|div)>/gi, '; ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/\s*;\s*(;\s*)+/g, '; ').replace(/\s+/g, ' ').replace(/^[;\s]+|[;\s]+$/g, '').trim();
const cut = (s, n) => s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
const LABEL = { note: 'Note', call: 'Call', meeting: 'Meeting', meeting_upcoming: 'Upcoming meeting', task: 'Task', task_open: 'Open task' };

// ---------- collect every logged item per company ----------
const byCompany = {};
const errors = {};
replies.forEach((r, k) => {
  const idx = (r.pairedItem && typeof r.pairedItem.item === 'number') ? r.pairedItem.item : k;
  const p = (prep[idx] && prep[idx].json) || {};
  if (p.skip || typeof p.ci !== 'number' || p.ci < 0) return;
  const body = r.json || {};
  if (body.error || body.code === 'INVALID_URL_PATTERN' || body.status === 'error') {
    errors[p.ci] = errors[p.ci] || String((body.error && (body.error.message || body.error)) || body.message || body.code || 'Zoho error');
    return;
  }
  const rows = Array.isArray(body.data) ? body.data : [];
  rows.forEach(x => {
    const kind = p.kind;
    const date = x.Created_Time || x.Call_Start_Time || x.Start_DateTime || x.Due_Date || x.Modified_Time || null;
    const title = clean(x.Note_Title || x.Subject || x.Event_Title || '');
    const text = clean(x.Note_Content || x.Description || '');
    const extra = [x.Call_Type, x.Call_Result, x.Status].filter(Boolean).join(', ');
    const who = x.Who_Id && x.Who_Id.name ? x.Who_Id.name : null;
    (byCompany[p.ci] = byCompany[p.ci] || []).push({
      id: x.id, kind, label: LABEL[kind] || kind, date,
      title: title || null, text: text || null, detail: extra || null, with: who,
      by: x.Owner ? (x.Owner.name || null) : null,
      on: p.parent_module === 'Accounts' ? 'Account' : p.parent_module === 'Leads' ? 'Lead' : 'Deal'
    });
  });
});

const out = [];

companies.forEach((item, ci) => {
  const c = Object.assign({}, item.json || {});
  const rh = Object.assign({}, c.relationship_history || {});
  const z = rh.zoho || {};
  const inZoho = (z.account_ids || []).length + (z.lead_ids || []).length > 0;

  // de-duplicate (same record can sit on account + deal), newest first
  const seen = new Set();
  const all = (byCompany[ci] || []).filter(x => { const key = x.kind.replace('_upcoming', '').replace('_open', '') + ':' + x.id; if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const past = all.filter(x => !['meeting_upcoming', 'task_open'].includes(x.kind));
  const upcoming = all.filter(x => x.kind === 'meeting_upcoming' && x.date && new Date(x.date) >= new Date(now - DAY))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const openTasks = all.filter(x => x.kind === 'task_open');
  const count = k => past.filter(x => x.kind === k).length;
  const last = past[0] || null;

  const line = x => fmtDate(x.date) + ' – ' + x.label + (x.by ? ' (' + x.by + ')' : '') + ': "' +
    cut([x.title, x.text].filter(Boolean).join(' – ') || x.detail || 'no details', 140) + '"';

  let what, status;
  if (errors[ci] && !all.length) {
    what = 'Could not read Zoho notes and activities (' + cut(errors[ci], 80) + ')';
    status = 'Not checked';
  } else if (all.length) {
    const counts = [['note', 'note'], ['call', 'call'], ['meeting', 'meeting'], ['task', 'task']]
      .filter(([k]) => count(k)).map(([k, w]) => plural(count(k), w));
    what = (counts.length ? counts.join(', ') + ' logged' : 'No past activity logged') +
      (last ? ' (latest ' + fmtDate(last.date) + ', ' + daysAgo(last.date) + ' days ago' + (last.by ? ', by ' + last.by : '') + ')' : '') +
      (past.length ? '; ' + past.slice(0, 3).map(line).join('; ') : '') +
      (upcoming.length ? '; upcoming: ' + upcoming.slice(0, 2).map(x => fmtDate(x.date) + ' – "' + cut(x.title || 'Meeting', 60) + '"').join(', ') : '') +
      (openTasks.length ? '; ' + plural(openTasks.length, 'open task') : '');
    status = 'Context';
  } else if (inZoho) {
    what = 'In Zoho, but no notes, calls, meetings or tasks logged yet';
    status = 'Low';
  } else {
    what = 'No Zoho record, so no logged history';
    status = 'Not found';
  }

  const row = { item: 'Notes, calls & meetings', what, source: 'Zoho CRM (notes & activities)', status };
  const rows = (rh.rows || []).filter(r => r.item !== row.item);
  const pos = rows.findIndex(r => r.item === 'Past outreach');
  rows.splice(pos >= 0 ? pos + 1 : rows.length, 0, row);

  rh.rows = rows;
  rh.zoho_activity = {
    notes: count('note'), calls: count('call'), meetings: count('meeting'), tasks: count('task'),
    upcoming_meetings: upcoming.length, open_tasks: openTasks.length,
    last_date: last ? last.date : null,
    last_days: last ? daysAgo(last.date) : null,
    last_by: last ? last.by : null,
    people_logging: uniq(past.map(x => x.by)),
    error: errors[ci] || null,
    timeline: all.slice(0, 15)   // for the Account Plan (Claude) step
  };

  out.push({ json: Object.assign(c, { relationship_history: rh }) });
});

return out;
