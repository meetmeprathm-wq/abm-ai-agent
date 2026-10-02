// SECTION 1 – Job details, Step 3: Build Job Prompt
// Cleans each job page (from Open Job Page) into plain text, groups the jobs back per company,
// and builds ONE Claude prompt per company to read every Excelize-related job in depth.
// Jobs whose page could not be read are sent to Claude to find on the web (company site / Indeed / LinkedIn).
const companies = $('Good Fit').all(0);          // company data (true branch)
const links = $('List Job Links').all();          // job list (same order as Open Job Page)
const pages = $input.all();                       // Open Job Page results
const MAX_CHARS = 6000;                           // max description text per job sent to Claude

const decode = s => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
  .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));

function jobPostingJson(html) {
  // Many ATS pages (Greenhouse, Workday, iCIMS…) include a schema.org JobPosting block
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const b of blocks) {
    try {
      const j = JSON.parse(b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, ''));
      const list = Array.isArray(j) ? j : (j['@graph'] || [j]);
      const jp = list.find(x => x && /JobPosting/i.test(x['@type']));
      if (jp && jp.description) return jp;
    } catch (e) {}
  }
  return null;
}

function cleanText(html) {
  let h = String(html || '');
  const jp = jobPostingJson(h);
  if (jp) {
    const extra = [jp.employmentType, jp.datePosted && ('Posted ' + jp.datePosted),
      jp.jobLocationType, jp.baseSalary && JSON.stringify(jp.baseSalary.value || jp.baseSalary)].filter(Boolean).join(' | ');
    h = (extra ? extra + '\n' : '') + decode(String(jp.description));
  } else {
    const main = h.match(/<main[\s\S]*?<\/main>/i) || h.match(/<article[\s\S]*?<\/article>/i);
    if (main) h = main[0];
    h = h.replace(/<(script|style|noscript|svg|head|header|footer|nav|form)[\s\S]*?<\/\1>/gi, ' ');
  }
  return decode(h
    .replace(/<\/(p|li|h[1-6]|div|br|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// 1. Clean every page and attach it to its job
const byCompany = {};
links.forEach((l, i) => {
  const job = l.json;
  const p = (pages[i] && pages[i].json) || {};
  const raw = typeof p.html === 'string' ? p.html : (typeof p.data === 'string' ? p.data : '');
  let text = raw ? cleanText(raw) : '';
  const blocked = !raw || p.error || /captcha|access denied|enable javascript|are you a robot/i.test(text.slice(0, 500));
  const readable = !blocked && text.length > 400;
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS) + ' …';
  const ci = job.company_index;
  (byCompany[ci] = byCompany[ci] || []).push(Object.assign({}, job, {
    page_status: job.job_index === -1 ? 'no_job_link' : readable ? 'read' : 'not_readable',
    page_text: readable ? text : null,
    page_chars: readable ? text.length : 0
  }));
});

// 2. One Claude prompt per company
const today = new Date().toISOString().slice(0, 10);
const out = [];

companies.forEach((item, ci) => {
  const c = item.json;
  const jobs = (byCompany[ci] || []).filter(j => j.job_index !== -1);
  const noLinks = (byCompany[ci] || []).some(j => j.job_index === -1);
  const needWeb = jobs.filter(j => j.page_status !== 'read');

  const jobBlocks = jobs.map((j, n) =>
    '### JOB ' + (n + 1) + ': ' + j.title + '\n' +
    'Listed location: ' + ([j.city, j.state].filter(Boolean).join(', ') || 'not stated') +
    ' | Posted: ' + (j.posted_at ? j.posted_at.slice(0, 10) : 'not stated') + '\n' +
    'Link: ' + (j.url || 'none') + '\n' +
    (j.page_status === 'read'
      ? 'DESCRIPTION (from the job page):\n' + j.page_text
      : 'DESCRIPTION: the job page could not be read. Use web search to find THIS job on the company careers site, Indeed or LinkedIn Jobs.')
  ).join('\n\n');

  const prompt =
'You are a sales research analyst for Excelize, a BIM outsourcing, consulting and staffing company serving US AEC firms.\n' +
'Excelize services: BIM Services (Revit modeling, MEP/clash coordination, shop drawings, families/content, Scan-to-BIM, CAD-to-BIM, construction documents), ' +
'BIM Consulting (BIM standards, execution plans, workflows, ACC setup), BIM Staffing (remote or onsite BIM modelers, coordinators, designers).\n' +
'Today is ' + today + '.\n\n' +
'Company: ' + c.name + ' (' + (c.website || c.domain || 'website unknown') + ')\n' +
'Open roles in Apollo: ' + (c.open_role_count || 0) + ' total.\n\n' +
'Read each Excelize-related job below IN DEPTH and extract the facts. ' +
(needWeb.length || noLinks ? 'For jobs marked "could not be read", search the web (max 3 searches) for that exact job. ' : 'Do NOT search the web; everything you need is below. ') +
'Only use what the job description says. Never guess. Use "Not stated" when the description does not say it.\n\n' +
jobBlocks + '\n\n' +
'Reply with JSON only, no other text, in exactly this shape:\n' +
'{"jobs":[{"job":1,"title":"...","description_found":true,"source":"Company careers page | Indeed | LinkedIn | Not found","source_url":"...",' +
'"location":"...","work_mode":"On-site | Hybrid | Remote | Not stated","employment_type":"Full-time | Part-time | Contract | Internship | Not stated",' +
'"seniority":"Entry | Mid | Senior | Lead/Manager | Not stated","experience_years":"e.g. 4+ | 3–7 | Not stated","education":"...",' +
'"software":["Revit","AutoCAD","Navisworks","..."],"revit":"Required | Preferred | Not mentioned",' +
'"bim_work":["3D modeling","clash detection / coordination","families / content","shop drawings","construction documents","Scan-to-BIM","BIM standards / templates","..."],' +
'"lod":"e.g. LOD 100–200 | Not stated","disciplines":["Electrical","Mechanical","..."],"sectors":["Healthcare","..."],"certifications":["..."],' +
'"salary":"Not stated","urgency":"quote any urgency words (overtime, tight deadlines, immediate start) or Not stated",' +
'"summary":"one plain sentence on what this person will do",' +
'"excelize_fit":["BIM Services","BIM Staffing","BIM Consulting"],"pitch_angle":"one sentence: how Excelize can help with THIS role"}],' +
'"hiring_takeaway":"2 short sentences: what these jobs together say about their BIM workload and gaps",' +
'"best_pitch":"one sentence: the single strongest Excelize offer for this account"}';

  const rest = Object.assign({}, c);
  out.push({ json: Object.assign(rest, {
    job_pages: jobs.map(j => ({ title: j.title, url: j.url, link_type: j.link_type, tier: j.tier, area: j.area,
      city: j.city, state: j.state, posted_at: j.posted_at, page_status: j.page_status, page_chars: j.page_chars })),
    job_pages_read: jobs.filter(j => j.page_status === 'read').length,
    job_pages_web: needWeb.length,
    jobs_prompt: prompt,
    jobs_use_web: needWeb.length > 0 || noLinks
  })});
});

return out;
