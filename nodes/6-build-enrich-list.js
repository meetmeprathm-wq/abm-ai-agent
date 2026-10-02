// SECTION 5 – Step 1: Build Enrich List (free – prepares the Apollo enrichment request)
// Sends the 6 key people to Apollo bulk enrichment (max 10 per call): email + LinkedIn + direct phones
// Apollo person id when we have one; otherwise name + company domain + LinkedIn (saved contacts)
const out = [];

$input.all().forEach(item => {
  const c = Object.assign({}, item.json);
  const people = Array.isArray(c.key_people) ? c.key_people.slice(0, 10) : [];

  const details = people.map(p => {
    const pid = String(p.person_id || '');
    if (pid && !pid.startsWith('contact_')) return { id: pid };
    const d = { first_name: p.first_name, last_name: p.last_name, domain: c.domain, organization_name: c.name };
    if (p.linkedin) d.linkedin_url = p.linkedin;
    if (p.email) d.email = p.email;
    return d;
  });

  out.push({ json: Object.assign(c, {
    enrich_details: details,
    enrich_count: details.length,
    enrich_credit_estimate: {
      emails: details.length,              // ~1 credit per person matched
      phones_max: details.length * 8,      // up to 8 extra credits per mobile number returned
      note: 'Apollo charges phone credits only when a number is returned'
    }
  })});
});

return out;
