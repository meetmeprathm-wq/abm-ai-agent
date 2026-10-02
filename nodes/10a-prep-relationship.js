// A5 Relationship history – Step 1: Prep Relationship (free – no API call)
// Turns the single-item Zoho / Apollo "Execute Once" outputs back into one item per company,
// and builds the search for Apollo – Past Contacts (our own saved contacts = 0 credits).
// Search key: the company's clean website domain (matches contact emails + company field).
// If there is no website, it falls back to the cleaned company name.

const companies = $('Permit Activity').all();

const domainOf = s => String(s || '')
  .toLowerCase()
  .replace(/^\[([^\]]+)\]\([^)]*\)$/, '$1')   // [www.x.com](https://www.x.com) → www.x.com
  .replace(/^https?:\/\//, '')
  .replace(/^www\./, '')
  .replace(/[\/?#].*$/, '')
  .trim();

const cleanName = n => String(n || '')
  .replace(/&/g, ' and ')
  .replace(/^\s*the\s+/i, '')
  .replace(/[.,()"']/g, ' ')
  .replace(/\b(inc|incorporated|llc|l l c|ltd|limited|corp|corporation|co|company|pllc|pc|lp|llp)\b/gi, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim();

return companies.map(item => {
  const c = item.json || {};
  const domain = domainOf(c.domain || c.website);
  const name = cleanName(c.name);
  const keyword = domain || name;

  return {
    json: Object.assign({}, c, {
      relationship_prep: {
        domain: domain || null,
        search_name: name || null,
        search_by: domain ? 'website' : (name ? 'name' : 'none'),
        apollo_contacts_body: {
          q_keywords: keyword || 'no-company-keyword',
          page: 1,
          per_page: 25
        }
      }
    })
  };
});
