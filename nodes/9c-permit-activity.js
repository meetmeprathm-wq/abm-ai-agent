// A4 Permit activity – Step 3: Permit Activity (free – no API call)
// Builds the A4 section of the report from Pick Shovels Match + Shovels – Permits.
// Keeps only permits whose contractor is our verified match (drops look-alikes).

const companies = $('Pick Shovels Match').all();
const permitsRes = $input.all();                  // Shovels – Permits

const NO_DATA = 'No data found';
const usd = cents => (typeof cents === 'number' && cents > 0) ? '$' + Math.round(cents / 100).toLocaleString('en-US') : null;
const short = v => v >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + Math.round(v);
const fmtDate = d => d ? new Date(d + (String(d).length === 10 ? 'T12:00:00Z' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : NO_DATA;
const cap = s => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase()).replace(/\bHvac\b/g, 'HVAC').replace(/\bAdu\b/g, 'ADU').replace(/\bEv\b/g, 'EV');
const STATUS = { active: 'Active', final: 'Final', in_review: 'In review', inactive: 'Inactive' };

const out = [];

companies.forEach((item, i) => {
  const c = item.json || {};
  const sh = c.shovels || {};
  const m = sh.match;
  const res = (permitsRes[i] && permitsRes[i].json) || {};
  const raw = m && Array.isArray(res.items) ? res.items : [];
  const permitCredits = raw.length;
  const mine = raw.filter(p => !p.contractor_id || p.contractor_id === m.id);

  let status, intro;
  const rows = mine.map(p => {
    const a = p.address || {};
    return {
      permit: p.description_derived || p.description || ('Permit ' + (p.number || '')),
      location: [a.city, a.state].filter(Boolean).join(', ') || NO_DATA,
      job_value: usd(p.job_value) || NO_DATA,
      status: STATUS[p.status] || cap(p.status) || NO_DATA,
      filed: fmtDate(p.file_date),
      work_types: (p.tags || []).map(cap).join(', ') || null,
      property_type: cap(p.property_type) || null,
      number: p.number || null
    };
  });

  if (!sh.check) {
    status = /contractor/i.test(sh.reason || '') ? 'Not applicable' : 'Not checked';
    intro = sh.reason || 'Not checked';
  } else if (!m) {
    status = 'Not found';
    intro = 'Source: Shovels (public building permits). ' + (sh.match_note || 'Not found in Shovels') +
      '. Shovels covers licensed contractors that pull permits; specialty subcontractors are often listed under the general contractor.';
  } else {
    status = 'Found';
    const st = m.status_tally || {};
    const tags = Object.keys(m.tag_tally || {}).sort((a, b) => m.tag_tally[b] - m.tag_tally[a]).slice(0, 3).map(cap);
    const total = typeof m.total_job_value_cents === 'number' ? m.total_job_value_cents / 100 : null;
    const parts = [];
    parts.push((m.permit_count != null ? m.permit_count : 'Unknown number of') + ' permits in ' + (sh.geo_id || 'their state') + ' in the last 12 months');
    if (total) parts.push(short(total) + ' total job value');
    if (tags.length) parts.push('mostly ' + tags.join(', '));
    if (st.active) parts.push(st.active + ' active');
    intro = 'Source: Shovels (public building permits), matched as "' + m.name + '". ' + parts.join(' · ') + '.' +
      (rows.length ? ' Most recent commercial permits:' : ' No commercial permits in this window.');
  }

  out.push({ json: Object.assign({}, c, {
    permit_activity: {
      status,
      intro,
      rows,
      columns: ['Permit', 'Location', 'Job value (USD)', 'Status', 'Filed'],
      contractor: m ? { name: m.name, license: m.license, classification: m.classification, permit_count: m.permit_count, city: m.city, state: m.state, matched_by: m.matched_by } : null,
      credits_used: (sh.lookup_credits || 0) + permitCredits
    }
  })});
});

return out;
