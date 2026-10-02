// Real US BIM Jobs – keeps BIM jobs (to qualify the company) AND all US open roles (for Buying signals)
const companies = $('Daily Limit').all();
const jobResults = $input.all();

const BIM_TITLE = /\b(BIM|VDC|Revit|Virtual Design|Digital Delivery)\b/i;
const isUS = j => {
  const c = (j.country || '').toLowerCase();
  return c === '' || c.includes('united states') || c === 'us' || c === 'usa';
};
const slim = j => ({
  title: j.title || '',
  url: j.url || null,
  city: j.city || null,
  state: j.state || null,
  posted_at: j.posted_at || j.last_seen_at || null
});

const out = [];

jobResults.forEach((item, i) => {
  const company = companies[i] && companies[i].json;
  if (!company) return;

  const posts = item.json.organization_job_postings || item.json.job_postings || [];
  const usJobs = posts.filter(isUS).map(slim);
  const bimJobs = usJobs.filter(j => BIM_TITLE.test(j.title));

  if (bimJobs.length === 0) return;   // not hiring for BIM → skip company

  out.push({ json: Object.assign({}, company, {
    bim_job_count: bimJobs.length,
    bim_jobs: bimJobs,
    all_jobs: usJobs,
    open_role_count: usJobs.length,
    top_job_title: bimJobs[0].title,
    top_job_url: bimJobs[0].url,
    top_job_location: [bimJobs[0].city, bimJobs[0].state].filter(Boolean).join(', ')
  })});
});

return out;
