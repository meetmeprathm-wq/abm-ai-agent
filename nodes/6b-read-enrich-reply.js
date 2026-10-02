// SECTION 5 – Step 2b: Read Enrich Reply (free)
// Apollo – Enrich People now returns RAW TEXT, so the long request_id keeps every digit
// (n8n rounds very long numbers when it reads JSON, which broke the phone lookup)
const companies = $('Build Enrich List').all();
const out = [];

$input.all().forEach((item, i) => {
  const c = Object.assign({}, (companies[i] && companies[i].json) || {});
  const raw = item.json.data !== undefined ? item.json.data : item.json;
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);

  let reply = {}, enrich_error = null;
  try { reply = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch (e) { enrich_error = 'Could not read Apollo reply'; }
  if (item.json.error) enrich_error = typeof item.json.error === 'string' ? item.json.error : (item.json.error.message || JSON.stringify(item.json.error));

  // Take the top-level request_id straight from the text, as a string (all digits kept)
  // Only trust the id when Apollo's reply arrived as raw text (JSON mode rounds the long number)
  const m = typeof raw === 'string' ? raw.match(/^\s*\{[\s\S]*?"request_id"\s*:\s*"?(-?\d+)"?/) : null;
  const phone_request_id = m ? m[1] : null;
  if (typeof raw !== 'string' && !enrich_error)
    enrich_error = 'Apollo – Enrich People is not returning Text: set Options → Response → Response Format = Text, then run it again';

  out.push({ json: Object.assign(c, {
    enrich_matches: Array.isArray(reply.matches) ? reply.matches : [],
    enrich_credits_used: reply.credits_consumed != null ? reply.credits_consumed : null,
    enrich_missing: reply.missing_records != null ? reply.missing_records : null,
    phone_request_id: phone_request_id,
    phone_status: (reply.phone_enrichment && reply.phone_enrichment.status) || (phone_request_id ? 'pending' : 'not requested'),
    enrich_error: enrich_error
  })});
});

return out;
