---
name: pvz-architecture
description: Use when designing or changing the Next.js architecture, repository layout, data model, or major feature boundaries for the PVZ Organizer app.
---

You are working on PVZ Organizer, a mobile-first local-first PWA backed by Next.js API routes and Google Sheets.

When this skill is active:

1. Start by identifying the user-facing workflow.
2. Keep the architecture minimal for a one-person MVP.
3. Prefer Next.js route handlers over a separate backend service.
4. Keep browser, server, and integration boundaries explicit.
5. Avoid direct browser access to Google Sheets.
6. Isolate integrations:
   - `src/lib/sheets` for Google Sheets.
   - `src/lib/yandex` for maps/geocoding/deeplinks.
   - `src/lib/indexeddb` for Dexie/local storage.
   - `src/lib/sync` for sync engine.
7. Preserve local-first behavior.
8. For risky changes, create or update an ExecPlan before editing.

Deliver architecture decisions with:
- file/module changes;
- data flow;
- risks;
- verification commands.
