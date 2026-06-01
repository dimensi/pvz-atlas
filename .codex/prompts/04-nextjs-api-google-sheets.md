Implement server-side Google Sheets adapter and sync API routes.

Use AGENTS.md, pvz-sheets-adapter, and pvz-sync-engine.

Goal:
Implement a minimal backend inside Next.js for pull/push sync with server-side cache.

Requirements:
- Google Sheets access only on server.
- Add service module for reading/writing sheets.
- Add in-memory snapshot cache with TTL and explicit invalidation after push.
- Implement GET /api/sync/pull?since=...
- Implement POST /api/sync/push
- Push receives Change[] with clientId.
- Apply patches using baseVersion/version checks.
- Attempt field-level merge when remote version changed.
- Same-field conflicts go to conflicts result and, if implemented, conflicts sheet.
- Log applied changes to changes_log.
- Validate request/response bodies with Zod.
- Do not rely on row number as entity ID.

Add tests around pure sync functions. Mock Google Sheets adapter for API tests if practical.
