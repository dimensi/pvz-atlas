# ExecPlans for PVZ Organizer

Use an ExecPlan for multi-step work, sync changes, storage changes, map integration, import pipeline work, or risky refactors.

An ExecPlan is a living implementation document. It must be understandable without prior conversation context.

## Required sections

### Goal
State the user-facing outcome.

### Current repo state
Summarize relevant files, commands, and existing behavior after inspecting the repo.

### Data and API impact
List affected entities, fields, endpoints, sheets, and sync logic.

### Approach
Describe the implementation path in concrete steps.

### Conflict and offline behavior
For any data mutation, explain:
- what happens offline;
- what enters the local change queue;
- how push applies the change;
- how conflicts are detected;
- what happens if Google Sheets was edited manually.

### UI behavior
Describe mobile UI states, loading states, empty states, error states, and sync indicators.

### Tests
List unit/integration/manual tests that will prove the feature works.

### Risks
List likely breakage points and mitigations.

### Rollback
Explain how to revert or disable the change safely.

### Progress
Maintain a checklist while implementing.

## Rules

- Do not edit code before the first version of the plan exists.
- Update the plan when implementation discovers new facts.
- Keep implementation aligned with the plan or update the plan first.
- Prefer small commits/patches with verifiable checkpoints.

---

## Data Model and Sheets Schema Mapping

### Goal
Create strict TypeScript model coverage and Google Sheets row mapping for points, owners, visits, change logs, and conflicts, with tested parse and serialize helpers.

### Current repo state
The repo already has `src/lib/data-model/types.ts` and `src/lib/data-model/schemas.ts` defining the five sync entities and shared sync metadata. `src/lib/sheets/README.md` is a placeholder for server-side Sheets adapters. Vitest is configured for `src/**/*.test.ts`.

### Data and API impact
Affected entities are `Point`, `Owner`, `Visit`, `Change`, and `Conflict`. No API endpoints or Google API calls are added in this task. New Sheets-facing modules will define snake_case columns for `points`, `owners`, `visits`, `changes_log`, and `conflicts`, and convert to/from camelCase app models.

### Approach
Add a small `src/lib/sheets/schema.ts` module containing sheet names, column lists, row schemas, and row codecs. Keep conversion explicit for each entity. Add focused tests covering successful parsing, serialization, missing required fields, invalid versions, JSON fields for changes/conflicts, and malformed row diagnostics.

### Conflict and offline behavior
This task does not add data mutation flows. It preserves the existing local-first model contract: changes remain represented as `Change` records with `baseVersion` and patch data; conflicts remain explicit `Conflict` records. The row codecs make manual Google Sheets edits visible as validation failures instead of silently coercing bad data.

### UI behavior
No UI behavior changes. Future sync indicators can consume structured malformed-row diagnostics from the Sheets adapter layer.

### Tests
Add Vitest coverage for row parsing, row serialization, missing required fields, and invalid versions.

### Risks
The main risk is a mismatch between model schemas and sheet columns. Mitigate with column constants, strict Zod object validation, and round-trip tests.

### Rollback
Remove the new `src/lib/sheets/schema.ts` module and its tests. Existing app code does not depend on it yet.

### Progress
- [x] Inspect existing data model and Sheets adapter placeholder.
- [x] Add Sheets schema and row codec module.
- [x] Add parser and serializer tests.
- [x] Run lint, typecheck, tests, and build.

---

## IndexedDB Local-First Sync Engine

### Goal
Make IndexedDB the client-side source of truth for points, owners, and visits, and queue local mutations as patch-based `Change` records for later Google Sheets sync.

### Current repo state
The repo already has strict sync entity types in `src/lib/data-model/types.ts`, Zod schemas in `src/lib/data-model/schemas.ts`, server sync contract stubs in `src/lib/sync/contracts.ts`, and a Dexie database shell in `src/lib/indexeddb/db.ts`. App pages currently describe local-first behavior but do not call Google Sheets directly and do not yet read/write IndexedDB.

### Data and API impact
Affected client tables are `points`, `owners`, `visits`, `changes`, `conflicts`, and a new `meta` table. The existing `Change` shape remains compatible with Sheets mapping: `entityName`, `operation`, `entityId`, `patch`, `baseVersion`, `syncedAt`, and standard sync metadata. No server route changes are required for this step.

### Approach
Add pure helpers for building changes and applying patches, then add IndexedDB repository functions for points, owners, visits, and change queue operations. Mutating repository functions will use Dexie transactions to write the local entity and enqueue the matching `Change` in the same transaction where Dexie supports it.

### Conflict and offline behavior
Offline mutations commit to IndexedDB first and remain visible to UI consumers immediately. Creates enqueue `create` changes with the full created record in `patch` and `baseVersion: 0`. Updates enqueue only changed fields plus metadata needed by the target record, preserving `baseVersion` from the pre-mutation record. Push later sends pending unsynced changes; the server must compare each `baseVersion` with the remote version, merge independent field edits, and emit conflicts when the same field was changed manually in Google Sheets.

### UI behavior
No app page is wired to live IndexedDB reads in this prompt. The repository functions provide the local-first surface needed by future mobile UI components; sync queue helpers can power the Sync tab's pending count and conflict indicators.

### Tests
Add Vitest coverage for pure change creation and patch logic: create change content, update patch filtering, no-op patch rejection, local entity patch metadata, and synced change marking.

### Risks
The main risk is accidentally storing full-row updates instead of patches. Keep patch creation pure and tested, and keep repository mutation helpers small. Browser-only Dexie code must remain behind `"use client"` modules so server routes do not import IndexedDB.

### Rollback
Remove the new IndexedDB repository and sync helper modules, revert the Dexie schema version addition, and leave existing data-model and Sheets modules intact.

### Progress
- [x] Inspect existing model, sync contract, Dexie shell, and UI pages.
- [x] Add pure change and patch helpers.
- [x] Add Dexie tables and repository functions.
- [x] Add unit tests for change creation and patch logic.
- [x] Run lint, typecheck, tests, and build.
