---
name: pvz-sheets-adapter
description: Use when implementing Google Sheets API access, sheet schema, row parsing, batch reads/writes, caching, or sheet validation for PVZ Organizer.
---

Google Sheets is the editable remote store, not the source of UI truth.

Rules:
- Access Sheets only from server-side code.
- Do not expose service account credentials to the browser.
- Never use row number as entity ID.
- Use stable `id` columns.
- Read sheets in batches.
- Write changes in batches.
- Validate rows with Zod.
- Return malformed rows as structured diagnostics.
- Keep a server-side cache/snapshot to avoid repeated sheet reads.
- Invalidate or update the cache after writes.

Expected sheets:
- `points`
- `owners`
- `visits`
- `changes_log`
- `conflicts`

Column naming in Sheets should use snake_case. TypeScript model fields may use camelCase. Keep conversion functions explicit and tested.

When implementing:
- create row codecs;
- create read adapters;
- create write adapters;
- create lookup by `id`;
- create batch update helpers;
- document required columns.
