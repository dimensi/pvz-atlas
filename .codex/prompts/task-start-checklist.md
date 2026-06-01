# PVZ Atlas task start checklist

Use this checklist at the start of every non-trivial task.

## Default workflow

1. Read `AGENTS.md`.
2. Ask `code_mapper` to inspect the relevant code before implementation, except for tiny docs or typo-only tasks.
3. Summarize the mapper findings before editing.
4. Create or update an ExecPlan for architecture, sync, data model, UI migration, or map changes.
5. Implement the smallest safe slice.
6. Run targeted tests, typecheck, and lint where practical.
7. Ask the matching review agents to review the change.
8. Ask `test_hardening_reviewer` to review before finishing, except for docs-only tasks.
9. Fix blocker findings before finalizing.
10. Final response must include changed files, commands run, unresolved risks, and reviewer findings.

## Review agent routing

Always use:
- `code_mapper` before non-trivial implementation.
- `test_hardening_reviewer` before finishing non-docs work.

Use based on changed area:
- `mobile_ui_reviewer` for UI, components, styles, forms, drawers, dialogs, toasts, navigation, or map sheets.
- `local_first_sync_reviewer` for IndexedDB, Change queue, sync engine, API clients, API routes, Google Sheets writes, conflict handling, or local mutations.
- `map_cost_reviewer` for maps, geolocation, coordinates, geocoding, tiles, routing, nearby filters, or route links.
- `sheets_data_reviewer` for Google Sheets adapter, import/export, owners, contact fields, logs, diagnostics, env vars, or debug routes.

## Non-negotiable project rules

- Production UI must not use browser-native `alert`, `confirm`, or `prompt`.
- UI mutations must remain local-first.
- Components must not send sync writes directly to `/api/sync/*`.
- Do not introduce paid or high-quota map/geocoder APIs without explicit approval.
- Map markers should come from local coordinates already stored in app data.
