# Setup

## Accounts you need

| Service | Used for | n8n credential |
|---|---|---|
| [n8n](https://n8n.io) | Runs the workflow | none |
| [Apollo.io](https://www.apollo.io) | Companies, job posts, people, verified emails, sequences | Header Auth `X-Api-Key` (use a **master** key: people search and sequences need it) |
| [Anthropic API](https://console.anthropic.com) | Research and writing (Claude) | Header Auth `x-api-key` + `anthropic-version` |
| [ConstructConnect](https://www.constructconnect.com) | Project pipeline | per your API access |
| [Shovels](https://www.shovels.ai) | Building permits | Header Auth `X-API-Key` |
| [Zoho CRM](https://www.zoho.com/crm/) | Your own account history | n8n OAuth2 (check your data centre, e.g. `zohoapis.in` or `zohoapis.com`) |

Keys always live in **n8n credentials**, never inside Code nodes. None of the files in `nodes/` contain a key.

## n8n settings that matter

- Use **Run Once for All Items** mode for every Code node.
- On HTTP nodes that call paid APIs:
  - turn on **On Error → Continue** and **Always Output Data**, so one bad company doesn't stop the run
  - add batching (1 request every 300–1000 ms)
- Create a data table called `processed_companies` so a company is never researched twice.
- Keep `Daily Limit` small (2) while testing.

## Testing without burning credits

1. Pin the trigger, the company search and `Daily Limit`.
2. Pin every paid node after its first good run (Claude calls, Apollo enrich, Shovels, ConstructConnect).
3. While building, use **Execute step** inside a node. **Execute workflow** re-runs everything that is unpinned, including paid steps.
4. Unpin everything before you activate the workflow.

## Shovels free plan

You get 500 credits per rolling 30 days, and 1 credit = 1 record. `9a Prep Shovels` keeps you safe:

- contractor-type companies only
- at most 5 companies per run
- stops at 450 credits used
