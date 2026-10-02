// SECTION 5 – Contact Details (free)
// Template columns: Person · LinkedIn · Email (work + personal) · Status · Phone · Type · DNC check
// Inputs: this node's input = Read Enrich Reply (company data + enrich_matches from Apollo)
// Also: fills empty Key-people backgrounds from Apollo work history and flags title mismatches
const NO_DATA = 'Not found';
const lc = s => String(s || '').toLowerCase().trim();
const fmtMonth = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';
const year = d => d ? new Date(d).getFullYear() : '';
const EXCLUDE = /(financ|account|payroll|marketing|business development|\bbd\b|sales|human resource|\bhr\b|recruit|talent)/i;
const EMAIL_STATUS = { verified: 'Verified', likely_to_engage: 'Likely valid', guessed: 'Guessed', unavailable: 'Not found', bounced: 'Bounced', extrapolated: 'Guessed' };
const PHONE_TYPE = { mobile: 'Mobile', work_direct: 'Direct', direct: 'Direct', work_hq: 'Main line (HQ)', home: 'Other', other: 'Other' };
const DNC = s => !s ? 'Not checked' : /dnc|do.?not/i.test(s) ? 'Do Not Call' : /clear|not.?listed|ok|safe/i.test(s) ? 'Not listed' : s;

// Background line from Apollo employment history
function historyLine(m, company) {
  const h = Array.isArray(m.employment_history) ? m.employment_history : [];
  if (!h.length) return null;
  const cur = h.filter(e => e.current);
  const here = h.filter(e => e.organization_id && e.organization_id === m.organization_id);
  const firstHere = here.map(e => e.start_date).filter(Boolean).sort()[0];
  const prev = h.filter(e => !e.current && e.organization_id !== m.organization_id && e.organization_name).slice(0, 2);
  const parts = [];
  if (firstHere) parts.push('At ' + company + ' since ' + fmtMonth(firstHere) + (cur[0] && cur[0].title ? ' (' + cur[0].title + ')' : ''));
  if (prev.length) parts.push('previously ' + prev.map(e => (e.title ? e.title + ' at ' : '') + e.organization_name +
    (e.start_date ? ' (' + year(e.start_date) + (e.end_date ? '–' + year(e.end_date) : '') + ')' : '')).join('; '));
  return parts.length ? parts.join('; ') : null;
}

const out = [];

$input.all().forEach(item => {
  const c = Object.assign({}, item.json);
  const matches = Array.isArray(c.enrich_matches) ? c.enrich_matches : [];
  const mainPhone = (c.snapshot && c.snapshot.main_phone && c.snapshot.main_phone.value) || null;
  const savedContacts = {};
  (c.apollo_contacts || []).forEach(ct => { savedContacts[lc(ct.name)] = ct; });
  // A saved number used by 2+ people is an office line, not a direct dial
  const numKey = n => String(n || '').replace(/\D/g, '');
  const phoneUse = {};
  (c.apollo_contacts || []).forEach(ct => (ct.phones || []).forEach(x => { const k = numKey(x.number); if (k) phoneUse[k] = (phoneUse[k] || 0) + 1; }));
  const slug = u => (String(u || '').match(/linkedin\.com\/in\/([^\/?#]+)/i) || [])[1] ? String(u).match(/linkedin\.com\/in\/([^\/?#]+)/i)[1].toLowerCase() : null;
  let intro = c.key_people_intro || '';
  const meta = Object.assign({}, c.key_people_meta || {});

  const findMatch = p => matches.find(m => m.id && m.id === p.person_id) ||
    matches.find(m => lc(m.name) === lc(p.full_name)) ||
    matches.find(m => lc(m.first_name) === lc(p.first_name) && lc(m.last_name).charAt(0) === lc(p.last_name).charAt(0)) || null;

  const contacts = [];
  const key_people = (c.key_people || []).map(p => {
    const m = findMatch(p) || {};
    const notes = [];

    // Full name: replace Apollo's hidden last name (e.g. "Ja***s") with the enriched name
    let fullName = p.full_name, lastName = p.last_name, nameConfirmed = p.name_confirmed;
    if (/\*/.test(fullName || '') && m.name) {
      fullName = m.name; lastName = m.last_name || lastName; nameConfirmed = true;
      intro = intro.split(p.full_name).join(fullName);
      if (meta.start_with) meta.start_with = String(meta.start_with).split(p.full_name).join(fullName);
    }
    const saved = savedContacts[lc(fullName)] || {};

    // Email (work first) – status comes from the same place as the email
    let email = null, rawStatus = null;
    if (m.email) { email = m.email; rawStatus = m.email_status; }
    else if (saved.email) { email = saved.email; rawStatus = saved.email_status; }
    else if (p.email) { email = p.email; rawStatus = saved.email_status || null; }
    const emailStatus = email ? (EMAIL_STATUS[lc(rawStatus)] || 'Unverified') : NO_DATA;
    const personal = Array.isArray(m.personal_emails) ? m.personal_emails.filter(Boolean) : [];

    // Phones: Apollo person phones, then saved-contact phones (skip HQ + invalid), then company main line
    const phonesRaw = [].concat(m.phone_numbers || [], (saved.phones || []).map(x => ({ raw_number: x.number, type: x.type, dnc_status: x.dnc, saved: true })));
    const phones = phonesRaw.filter(x => x && x.raw_number && x.type !== 'work_hq' && x.status !== 'invalid_number');
    const best = phones.find(x => x.type === 'mobile') || phones.find(x => /direct/.test(x.type || '')) || phones[0];
    let phone, phoneType, dnc;
    if (best) {
      phone = best.raw_number; dnc = DNC(best.dnc_status);
      const shared = best.saved ? (phoneUse[numKey(best.raw_number)] || 0) : 0;
      if (shared >= 2) {
        phoneType = 'Shared office line (saved in Apollo)';
        notes.push('Same number saved for ' + shared + ' people – likely an office line, not a direct dial');
      } else {
        phoneType = (PHONE_TYPE[best.type] || 'Other') + (best.saved ? ' (saved in Apollo)' : ' (Apollo)');
        if (best.saved) notes.push('Older saved number – check it still works');
      }
    }
    else if (mainPhone && mainPhone !== 'No data found') { phone = mainPhone; phoneType = 'Main line (company)'; dnc = 'Not checked'; notes.push('Direct phone not revealed yet'); }
    else { phone = NO_DATA; phoneType = '—'; dnc = '—'; }

    // Checks
    const apolloTitle = m.title || null;
    let role_check = null, title = p.title, previous_title = null;
    if (apolloTitle && lc(apolloTitle) !== lc(p.title) && EXCLUDE.test(apolloTitle))
      role_check = 'Check role: Apollo lists "' + apolloTitle + '"' + (m.headline ? ' (LinkedIn headline: "' + m.headline + '")' : '');
    else if (apolloTitle && lc(apolloTitle) !== lc(p.title)) {
      // Enrichment is fresher than the people search (e.g. a promotion) – use the new title
      title = apolloTitle; previous_title = p.title;
      notes.push('Title updated from Apollo (was "' + p.title + '")');
    }
    if (role_check) notes.push(role_check);
    if (lc(m.match_confidence) === 'low') notes.push('Low Apollo match confidence – confirm before outreach');
    // Apollo's current employer is a different company → person may have moved or the match is wrong
    if (m.organization_id && c.org_id && m.organization_id !== c.org_id)
      notes.push('Apollo lists current employer as ' + ((m.organization && m.organization.name) || 'another company') + ' – confirm they are still at ' + c.name);

    // Background: keep web research; fill gaps from Apollo work history
    let background = p.background, background_source = p.background_source, background_url = p.background_url;
    const hist = historyLine(m, c.name);
    if ((!background || background === NO_DATA) && hist) { background = hist; background_source = 'Apollo work history'; background_url = null; }

    const linkedin = m.linkedin_url || p.linkedin || null;
    // Web background taken from a different LinkedIn profile → may be a different person
    const bgSlug = slug(background_url), liSlug = slug(linkedin);
    if (bgSlug && liSlug && bgSlug !== liSlug)
      notes.push('Background came from a different LinkedIn profile than Apollo\'s – check it is the same person');

    contacts.push({
      rank: p.rank,
      person: fullName,
      title: title,
      linkedin,
      email,
      personal_email: personal[0] || null,
      email_status: emailStatus,
      phone,
      phone_type: phoneType,
      dnc_check: dnc,
      location: m.formatted_address || [m.city, m.state].filter(Boolean).join(', ') || null,
      time_zone: m.time_zone || null,
      notes: notes.join('; ') || null
    });

    return Object.assign({}, p, {
      full_name: fullName, last_name: lastName, name_confirmed: nameConfirmed,
      display_name: fullName + (p.credentials ? ', ' + p.credentials : ''),   // refresh after the hidden name is filled
      title: title, previous_title: previous_title, role: title + ' · ' + p.persona_role,
      email: email, email_status: emailStatus,                                  // so later steps (Account Plan) see the email
      linkedin, background, background_source, background_url, role_check, apollo_title: apolloTitle
    });
  });

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const withEmail = contacts.filter(x => x.email).length;
  const verified = contacts.filter(x => x.email_status === 'Verified').length;
  const direct = contacts.filter(x => /\(Apollo\)/.test(x.phone_type)).length;
  const toCheck = contacts.filter(x => x.notes && /check|confirm/i.test(x.notes)).length;
  const contacts_intro = 'Enriched with Apollo on ' + today + ': ' + withEmail + ' of ' + contacts.length + ' work emails found (' + verified + ' verified); ' +
    direct + ' direct phone' + (direct === 1 ? '' : 's') + ' revealed' + (toCheck ? '; ' + toCheck + ' contact' + (toCheck === 1 ? ' needs' : 's need') + ' a quick check (see notes)' : '') + '. Work emails are listed first. ' +
    'Check the Do Not Call status before calling any mobile number (TCPA).';

  delete c.enrich_matches;   // large raw Apollo data – no longer needed
  delete c.enrich_details;

  out.push({ json: Object.assign(c, {
    key_people,
    key_people_intro: intro,
    key_people_meta: meta,
    contacts,
    contacts_intro,
    contacts_columns: ['Person', 'LinkedIn', 'Email', 'Status', 'Phone', 'Type', 'DNC check']
  })});
});

return out;
