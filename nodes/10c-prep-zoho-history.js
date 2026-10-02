// A5 Relationship history – Step 3: Prep Zoho History (free – no API call)
// Builds one Zoho request per (company × Zoho record × activity list), so the next HTTP node can read
// what the team actually logged: Notes, past Calls, past Meetings, past Tasks, plus upcoming Meetings and open Tasks.
// Zoho records used: matched Accounts + Leads (from Relationship History) and their Deals (from Zoho – Deals).
// Limits: max 6 Zoho records per company (accounts first, then leads, then newest deals), 20 rows per list.
// Companies with no Zoho record send nothing (A5 will say "No Zoho record, so no logged history").

const BASE = 'https://www.zohoapis.in/crm/v8';       // India data centre (same as your Zoho credential)
const MAX_PARENTS = 6;
const PER_LIST = 20;
const LISTS = [
  { list: 'Notes',          kind: 'note',    fields: 'Note_Title,Note_Content,Created_Time,Owner' },
  { list: 'Calls_History',  kind: 'call',    fields: 'Subject,Call_Start_Time,Call_Type,Call_Result,Description,Owner,Who_Id' },
  { list: 'Events_History', kind: 'meeting', fields: 'Event_Title,Start_DateTime,Description,Owner' },
  { list: 'Events',         kind: 'meeting_upcoming', fields: 'Event_Title,Start_DateTime,Description,Owner' },
  { list: 'Tasks_History',  kind: 'task',    fields: 'Subject,Due_Date,Status,Description,Owner' },
  { list: 'Tasks',          kind: 'task_open', fields: 'Subject,Due_Date,Status,Description,Owner' }
];

const companies = $input.all();
let allDeals = [];
try { allDeals = $('Zoho – Deals').all().map(i => i.json || {}).filter(d => d.id); } catch (e) {}

const out = [];

companies.forEach((item, ci) => {
  const c = item.json || {};
  const z = (c.relationship_history && c.relationship_history.zoho) || {};
  const acctIds = Array.isArray(z.account_ids) ? z.account_ids : [];
  const leadIds = Array.isArray(z.lead_ids) ? z.lead_ids : [];
  const dealIds = allDeals
    .filter(d => d.Account_Name && acctIds.includes(d.Account_Name.id))
    .sort((a, b) => new Date(b.Modified_Time || 0) - new Date(a.Modified_Time || 0))
    .map(d => d.id);

  const parents = []
    .concat(acctIds.map(id => ({ module: 'Accounts', id })))
    .concat(leadIds.map(id => ({ module: 'Leads', id })))
    .concat(dealIds.map(id => ({ module: 'Deals', id })))
    .slice(0, MAX_PARENTS);

  parents.forEach(p => LISTS.forEach(L => out.push({ json: {
    ci,
    company: c.name || null,
    parent_module: p.module,
    parent_id: p.id,
    list: L.list,
    kind: L.kind,
    skip: false,
    url: BASE + '/' + p.module + '/' + p.id + '/' + L.list + '?fields=' + L.fields + '&per_page=' + PER_LIST + '&sort_by=Modified_Time&sort_order=desc'
  }})));
});

// Keep the workflow moving even when no company is in Zoho: one cheap call (current user), ignored later.
if (!out.length) out.push({ json: { ci: -1, skip: true, kind: 'none', url: BASE + '/users?type=CurrentUser' } });

return out;
