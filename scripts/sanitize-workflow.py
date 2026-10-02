#!/usr/bin/env python3
"""Clean an n8n workflow export before sharing it.

Usage: python3 sanitize-workflow.py <input.json> <output.json>
"""
import json
import re
import sys

KEY_HEADERS = {"x-api-key", "x-apikey", "api-key", "apikey", "authorization", "x-api-token"}
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
SECRET_RE = re.compile(r"(sk-ant-[A-Za-z0-9_\-]+|Bearer\s+[A-Za-z0-9._\-]+)")


def clean(obj):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in ("credentials", "webhookId", "pinData", "meta", "id", "versionId", "instanceId"):
                continue
            # header parameter lists: [{name, value}]
            if k == "value" and isinstance(v, str) and obj.get("name", "").lower() in KEY_HEADERS:
                out[k] = "<YOUR_KEY_HERE>"
                continue
            out[k] = clean(v)
        return out
    if isinstance(obj, list):
        return [clean(x) for x in obj]
    if isinstance(obj, str):
        return SECRET_RE.sub("<REMOVED_SECRET>", obj)
    return obj


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        wf = json.load(f)
    wf = clean(wf)
    text = json.dumps(wf, indent=2, ensure_ascii=False)
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write(text + "\n")
    emails = sorted(set(EMAIL_RE.findall(text)))
    print(f"Saved {sys.argv[2]} ({len(wf.get('nodes', []))} nodes).")
    if emails:
        print("Check these emails before you commit:")
        for e in emails:
            print("  ", e)
    else:
        print("No email addresses left in the file.")


if __name__ == "__main__":
    main()
