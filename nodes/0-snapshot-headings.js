// SECTION 1 – Snapshot Headings: rename the 17 snapshot labels to the template names (hand-made sample report) and keep template order
const LABELS = {
  hq_address: 'HQ Address',
  what_they_do: 'What they do',
  key_markets: 'Key markets',
  legal_name: 'Legal name',
  founded: 'Founded',
  website: 'Website',
  linkedin: 'LinkedIn',
  main_phone: 'Main phone',
  industry: 'Industry',
  size: 'Size',
  revenue: 'Revenue',
  offices: 'Offices',
  ownership: 'Ownership',
  headcount_trend: 'Headcount trend',
  in_our_systems: 'In our systems',
  time_zone: 'Time zone',
  core_software: 'Core software'
};

return $input.all().map(item => {
  const c = Object.assign({}, item.json);
  const old = c.snapshot || {};
  const snapshot = {};
  Object.keys(LABELS).forEach(key => {
    const f = old[key] || { value: 'No data found', source: 'None' };
    snapshot[key] = Object.assign({}, f, { label: LABELS[key] });
  });
  // keep any extra fields the snapshot may have, after the 17 template fields
  Object.keys(old).forEach(key => { if (!snapshot[key]) snapshot[key] = old[key]; });
  c.snapshot = snapshot;
  return { json: c };
});
