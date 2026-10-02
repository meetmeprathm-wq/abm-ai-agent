# Workflow file

Put the exported n8n workflow here as `abm-ai-agent.json`.

## Before you commit it

An n8n export can carry pinned test data with **real companies, people and emails** in it. Always clean it first:

```bash
python3 scripts/sanitize-workflow.py "My workflow.json" workflow/abm-ai-agent.json
```

The script:

- removes pinned data (`pinData`)
- removes credential IDs, webhook IDs and instance metadata
- replaces any API-key-looking header value with a placeholder
- lists every email address still left in the file, so you can check it by eye

## Importing

In n8n, go to **Workflows → Import from file**. Then:

1. Open each HTTP node and pick your own credential.
2. Leave the workflow inactive until a test run looks right.
