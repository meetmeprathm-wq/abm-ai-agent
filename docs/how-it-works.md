# How it works

The workflow runs in one straight line, from finding companies to building the report. Code nodes are numbered to match the files in `nodes/`, and every other node is an n8n built-in (HTTP Request, Data Table, If). Paid steps are marked **(paid)**.

## 1. Trigger and qualification

`Schedule Trigger` (7:00 AM) → `Apollo – Find BIM Hiring Companies` → `Clean Company List` → `Skip Already Processed` (data table `processed_companies`) → `Daily Limit` → `Mark as Started` → `Get Job Posts` → **1a Real US BIM Jobs**

## 2. A1 Company snapshot

`Apollo – Company Snapshot` → `Build Snapshot from Apollo` → `Not a Competitor` → `Web Research` **(paid)** → `Merge Snapshot` → **0 Snapshot Headings** → `Good Fit`

## 3. Job details

**1d List Job Links** → `Open Job Page` → **1e Build Job Prompt** → `Job Research` **(paid)** → **1f Merge Job Details**

## 4. A2 Buying signals

**1b Apollo Buying Signals** → `Apollo – BIM Team` → `Apollo – Engagement` → **1c Apollo Team & Engagement** → **2 Build Signals Prompt** → `Signals Research` **(paid)** → **3 Merge Signals**

16 signals, grouped as Hiring · Capacity · Demand · Growth · Recent news · Technology · Engagement.

## 5. A3 Project pipeline

`CC – Find Company` → `CC Company` → `CC – Get Projects` → **4 CC Projects**

This step also sets `icp_audience`, one of the 4 customer types. Every later node uses this one value.

## 6. A6 People and A7 Contacts

`Apollo – Key People` → **5 Pick Key People** → **5b Build People Prompt** → `People Research` **(paid)** → **5c Merge People** → **6 Build Enrich List** → `Apollo – Enrich People` **(paid)** → **6b Read Enrich Reply** → **7 Contact Details**

## 7. A4 Permit activity (contractors only)

`Shovels – Usage` → **9a Prep Shovels** → `Shovels – Contractor` → `Shovels – Contractor by Name` → **9b Pick Shovels Match** → `Shovels – Permits` **(paid)** → **9c Permit Activity**

Permit credits are spent only after the contractor is verified to be the right company.

## 8. A5 Relationship history

`Zoho – Accounts` → `Zoho – Deals` → `Apollo – Sequences` → `Zoho – Leads` → **10a Prep Relationship** → **10b Relationship History** → **10c Prep Zoho History** → `Zoho – History` → **10d Zoho History** → **10e Prep Apollo Emails** → `Apollo – Email Messages` → **10f Apollo Email Activity**

## 9. A8 Fit score

**8 Fit Score**: 100 points across 8 factors.

| Factor | Points |
|---|---|
| BIM capacity need | 20 |
| Firm profile | 15 |
| Project pipeline | 15 |
| Outsourcing openness | 15 |
| Technology fit | 10 |
| Growth and timing | 10 |
| Engagement | 10 |
| Reachability | 5 |

- Missing data scores conservatively and is marked "Confirm", never "Fail".
- Failing a must-have (BIM adoption, active pipeline) caps the account at Tier C.
- Revenue is not a gate.

## 10. Pages 1–3 and the report

**11 Build Account Plan Prompt** → `Account Plan` **(paid**, Claude, no web search**)** → **12 Merge Account Plan** → **13 Assemble Report**

The output is one HTML file per company, 6 pages at US Letter size, which auto-fits for printing or saving as PDF.

| Page | Contents |
|---|---|
| 1 | Header, fit gauge, KPI cards, 01 Bottom line, 02 Three things to know, 03 Signals at a glance |
| 2 | 04 Stakeholder map, 05 Conversation plan, 06 Discovery questions |
| 3 | 07 Likely objections, A1 Company snapshot, start of A2 |
| 4 | Rest of A2, A3 Project pipeline, A4 Permit activity |
| 5 | A5 Relationship history, A6 People background |
| 6 | A7 Contact details, A8 Fit score breakdown |

## Claude calls (Anthropic Messages API)

- Skip `thinking` blocks and join the `text` blocks without line breaks before parsing JSON.
- Use enough `max_tokens`: Account Plan 12000, People Research about 6000. A cut-off reply is the most common failure.
- Set the timeout to 180 s.
- The Account Plan prompt forbids claims about your own company that aren't in the prompt (clients, results, prices, turnaround, team size, certifications).
