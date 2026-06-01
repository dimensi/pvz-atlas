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

---

## Next.js API Google Sheets Sync Backend

### Goal
Implement a minimal server-only Google Sheets backend for pull/push sync, with a cached remote snapshot, version-checked patch application, conflict reporting, and typed Next.js API responses.

### Current repo state
The repo already has Next.js App Router route placeholders at `src/app/api/sync/pull/route.ts` and `src/app/api/sync/push/route.ts`. Data model types and Zod schemas exist in `src/lib/data-model`. Sync request/response contracts exist in `src/lib/sync/contracts.ts`. Sheet row codecs and column definitions already exist in `src/lib/sheets/schema.ts`, including parse/serialize helpers and tests.

### Data and API impact
Affected endpoints:
- `GET /api/sync/pull?since=...`
- `POST /api/sync/push`

Affected sheets:
- `points`
- `owners`
- `visits`
- `changes_log`
- `conflicts`

Push accepts a client-scoped batch of `Change` records. The existing schema does not include per-field base values, so field-level merge can only be conservative when `remote.version !== change.baseVersion`: if a patched field already equals the local value it can be accepted as already applied; if a patched field differs remotely, a conflict is created instead of overwriting a possible manual Sheets edit.

### Approach
Add a server-only Sheets client that uses environment variables for service-account credentials and the Sheets REST API. Add a Sheets adapter that reads all sync sheets, validates rows through existing codecs, updates records by stable `id`, appends change/conflict logs, and never treats row numbers as entity IDs. Add an in-memory snapshot cache with TTL and invalidation after writes. Add pure sync application helpers for create, update, delete, version checks, conservative merge/conflict behavior, and tests. Wire the pull and push route handlers through Zod request/response validation.

### Conflict and offline behavior
Offline UI behavior remains local-first: browser mutations enqueue `Change` records in IndexedDB and push later. Push applies create records as full new entities when the remote entity does not exist. Updates/deletes apply only when `baseVersion` matches the remote `version`. If Google Sheets was manually edited and the version changed, the server will not blindly overwrite patched fields; differing patched fields become `Conflict` records and successful independent/no-op fields can still be accepted where provable from the current remote snapshot.

### UI behavior
No mobile UI changes in this task. The Sync tab can later display `acceptedChangeIds`, returned `conflicts`, and `warnings` from malformed Sheets rows or unavailable configuration.

### Tests
Add Vitest coverage for pure server sync logic:
- direct version match applies a patch and increments version;
- version mismatch with same field difference creates a conflict;
- remote value already equal to local patch is accepted;
- create inserts a new record;
- delete marks `deletedAt` and increments version.

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

### Risks
The largest behavioral risk is field-level merge without base field values. Mitigate by being conservative on version mismatch and documenting the limitation. The integration risk is Google service-account authentication without adding production dependencies; keep it isolated in a small server module and return structured configuration errors.

### Rollback
Revert the new server Sheets adapter/cache/sync modules and restore the two sync route placeholders. Existing client IndexedDB and sheet schema modules can remain unchanged.

### Progress
- [x] Inspect prompt, project rules, existing sync contracts, route stubs, and Sheets codecs.
- [x] Add pure server sync apply logic and tests.
- [x] Add server-only Google Sheets adapter and snapshot cache.
- [x] Wire pull and push routes with Zod validation.
- [x] Run verification commands and update this plan with results.

Verification results:
- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm test`: passed, 5 files and 21 tests
- `npm run build`: passed

---

## Mobile PVZ List and Owner Grouping UI

### Goal
Create a mobile-first list screen for field work: points without owners first, then owner groups, with fast search/filtering, point actions, local IndexedDB mutations, and visible sync state.

### Current repo state
`src/app/points/page.tsx` is currently a static placeholder. The data model is defined in `src/lib/data-model/types.ts`. Local-first mutation helpers already exist in `src/lib/indexeddb/repositories.ts`, including point creation/update, owner creation, owner assignment, and visit creation. Yandex route deeplinks are available in `src/lib/yandex/deeplinks.ts`. Global mobile shell and base CSS live in `src/app/layout.tsx` and `src/app/globals.css`.

### Data and API impact
Affected client entities are `Point`, `Owner`, `Visit`, `Change`, and `Conflict`. No API endpoints, Google Sheets columns, or environment variables change. Mutations remain client-side IndexedDB writes plus queued `Change` records through existing repository functions.

### Approach
Add pure list helpers for grouping and filtering points. Add a client list component that loads IndexedDB state, renders filters/search/grouped cards, and calls repository mutation functions for owner assignment, owner creation, status edits, comments, and visit marking. Replace the placeholder points page with the client component. Extend CSS for mobile list controls and cards. Add Vitest coverage for the pure grouping/filtering helpers.

### Conflict and offline behavior
All point actions write to IndexedDB first and enqueue changes through existing repository functions. Owner assignment, status, comment, created owners, and visits remain pending until sync push. Push will compare `baseVersion` with Google Sheets remote versions and create conflict records for conflicting manual edits. The list shows offline, pending, conflict, and synced states based on navigator connectivity plus local `changes` and `conflicts` tables.

### UI behavior
The page shows a compact search field, filter chips for no owner, brand, and status, then grouped point cards. Empty states guide the operator to add/import/sync data without exposing sensitive owner contacts. Cards expose route, owner assignment, owner creation, visited, status, and comment actions with phone-sized tap targets. Loading and error states keep the screen usable on narrow phones.

### Tests
Add unit tests for no-owner-first grouping, owner group counts, search across address/owner/brand/status/comment, and fast filters.

### Risks
Dexie is browser-only, so IndexedDB access must remain inside a client component. Browser prompts are simple but limited; this keeps scope small for MVP while preserving local-first mutation semantics.

### Rollback
Revert the new list helper/component/test files and restore `src/app/points/page.tsx` to the static placeholder. No data migrations or backend changes are required.

### Progress
- [x] Inspect prompt, project rules, mobile UI skill, data model, repositories, and current pages.
- [x] Add pure grouping/filtering helpers and tests.
- [x] Add mobile client list UI wired to IndexedDB repositories.
- [x] Replace static points page and extend mobile CSS.
- [x] Run lint, typecheck, tests, and build.

Verification results:
- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm test`: passed, 6 files and 25 tests
- `npm run build`: passed
- Browser check: opened `http://localhost:3001/points`, verified empty state renders and search/no-owner filter controls respond.

---

## Yandex Map Mobile UI

### Goal
Create a mobile-first map screen that reads PVZ points from local IndexedDB, renders coordinate-backed points on Yandex Maps, handles points without coordinates separately, and opens Yandex Maps route deeplinks from marker details.

### Current repo state
`src/app/map/page.tsx` is a static placeholder. IndexedDB tables and repository mutation helpers already exist in `src/lib/indexeddb`. The points list client already demonstrates browser-only Dexie reads, local sync state, status labels, filters, and route links. `src/lib/yandex/deeplinks.ts` already builds web fallback route URLs and has a Vitest test.

### Data and API impact
Affected client entities are `Point`, `Owner`, `Change`, and `Conflict` for local display and sync-state badges. No server endpoints, Google Sheets adapters, sheet columns, sync contracts, or production dependencies are changed. Yandex Maps API key remains an environment variable consumed by client-side script loading.

### Approach
Add pure map helpers for coordinate filtering, marker filtering, nearby filtering, status/brand options, and script URL construction. Add a client map component that loads local IndexedDB state, lazy-loads the Yandex Maps script, initializes markers, opens a bottom sheet on marker tap, and exposes route deeplinks. Replace the map placeholder with the client component and extend the existing mobile CSS.

### Conflict and Offline Behavior
This task does not mutate PVZ data. Offline behavior is read-only: points already in IndexedDB remain visible, pending changes and conflicts are reflected from local tables, and route links remain available for points with coordinates. Future sync still uses the existing pull/push/pull flow and conflict-aware server application for any queued mutations created elsewhere.

### UI Behavior
The map screen shows a compact header, local sync badge, filter toolbar for all/no owner/nearby/brand/status, a map load state, script failure state, empty coordinate state, a count of points without coordinates, and a mobile bottom sheet with brand, address, city, owner/status/comment, and route action after marker tap.

### Tests
Add or update Vitest coverage for Yandex deeplink helpers and new marker filtering helpers, including no-owner, brand, status, nearby, coordinate separation, and malformed coordinate exclusion.

### Risks
The main risks are browser-only Yandex globals and script load failure. Mitigate by keeping all map code in a client component, guarding script initialization, and providing a non-map fallback list/state when the script cannot load or the API key is missing.

### Rollback
Revert the new map helper/component/test files, restore `src/app/map/page.tsx` to the placeholder, and remove the related CSS additions. No data migration or backend rollback is required.

### Progress
- [x] Inspect prompt, project rules, map/mobile skills, existing IndexedDB reads, deeplink helper, and placeholder map page.
- [x] Add pure map helpers and tests.
- [x] Add mobile Yandex map client UI wired to IndexedDB.
- [x] Replace placeholder map page and extend CSS.
- [x] Run lint, typecheck, tests, build, and browser verification.

Verification results:
- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm test`: passed, 12 files and 44 tests
- `npm run build`: passed after clearing stale `.next` output
- Browser check: opened `http://localhost:3001/map`, verified the empty IndexedDB/no-coordinate fallback, filters, summary counts, bottom navigation, and no console errors.

---

## Frontend API Access Layer

### Goal
Make the browser/server boundary explicit for PVZ Atlas by routing all frontend server calls through typed clients in `src/lib/api`, keeping UI data mutations local-first through IndexedDB and the change queue, and having the sync engine orchestrate pull-push-pull.

### Current repo state
The repo already has Next.js sync, geocode, and import route handlers; IndexedDB repository functions for local point/owner/visit mutations; server-side Sheets adapters; and a static Sync page. `AGENTS.md` already documents most frontend API access rules. There is not yet a `src/lib/api` folder, and there is no browser sync engine module that calls typed API clients.

### Data and API impact
Affected endpoint contracts are `GET /api/sync/pull`, `POST /api/sync/push`, `POST /api/geocode`, and `POST /api/import/points`. Shared request/response types and Zod schemas will live in the API/sync contract modules so route handlers and frontend clients do not drift. Push requests gain `clientId`; push responses expose server time, applied/rejected change ids, conflicts, and optionally changed entities.

### Approach
Add a shared typed fetch wrapper, typed clients for sync/geocode/import, and shared API types. Update sync contracts and route handlers to use the shared shapes. Add a client-side sync engine that pulls remote state into IndexedDB, reads queued local changes, pushes through `pushSync`, marks applied changes, stores conflicts, and pulls again. Add local domain-action aliases around existing repository mutations so UI code has clear local-first entry points.

### Conflict and offline behavior
Local UI mutations continue to write to IndexedDB first and enqueue `Change` records without network access. Sync runs pull, apply remote entities, push queued changes, apply push results, then pull again. Google Sheets manual edits remain remote changes; server push compares `baseVersion`, accepts provable non-conflicting changes, and returns conflicts for same-field differences.

### UI behavior
No major UI redesign is required. The Sync page/button should call `runSync()` in future UI wiring rather than direct `/api/sync/*` fetches. Existing list mutations remain offline-capable and show pending/conflict states from local tables.

### Tests
Add Vitest coverage for API client JSON/error behavior, sync engine API-client orchestration, and local mutations enqueueing `Change` records without direct network calls. Check direct `/api/sync` fetches with repository search and avoid adding a heavy custom lint system.

### Risks
The main risk is contract drift between existing route handlers and new typed clients. Mitigate by keeping Zod schemas and TypeScript types together and using the route handlers' schemas to parse responses. IndexedDB sync tests may need lightweight fake tables instead of a browser Dexie instance.

### Rollback
Remove the new `src/lib/api` clients and sync engine wiring, restore the previous `src/lib/sync/contracts.ts` schemas and sync route response shapes, and keep existing local IndexedDB repositories intact.

### Progress
- [x] Inspect existing repo structure, AGENTS rules, sync routes, IndexedDB repositories, and tests.
- [x] Add shared API types, schemas, and typed fetch wrapper.
- [x] Add sync/geocode/import API clients.
- [x] Update sync route handlers and sync engine integration.
- [x] Add local domain-action aliases for local-first mutations.
- [x] Add/update tests.
- [x] Run lint, typecheck, tests, and build.

Verification results:
- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm test`: passed, 12 files and 44 tests
- `npm run build`: passed
- Direct fetch scan: only `src/lib/api/sync-api.ts` calls `/api/sync/push` outside route handlers.
- Browser check: production server on `http://localhost:3010`, `/add` and `/sync` rendered expected controls with zero console errors.

---

## Import Geocode Dedupe Pipeline

### Goal
Import CSV/JSON PVZ point rows through a reviewable preview/apply flow that creates no duplicates and preserves human field-work data already stored in Sheets.

### Current repo state
`src/app/api/import/points/route.ts` previously validated a narrow JSON shape and echoed generated source keys with a warning. `src/lib/data-model/source-key.ts` has basic normalization and stable source-key helpers. `src/lib/sheets/adapter.ts` can read and write points by stable IDs and append through the Sheets adapter. `YANDEX_GEOCODER_API_KEY` is already documented in `.env.example`, and geocoding must stay server-side.

### Data and API impact
Affected entity: `Point`. Affected endpoint: `POST /api/import/points`, with modes for `preview` and `apply`. The route accepts CSV text or JSON rows, normalizes brand/city/address, generates `sourceKey`, deduplicates incoming rows, compares with existing points by `sourceKey` and normalized location, and writes only points that are new or safe metadata updates. No owner/status/comment/contact-style fields are overwritten on existing points.

### Approach
Add pure import helpers under `src/lib/import/points.ts` for parsing JSON/CSV, normalization, source keys, incoming dedupe, existing-point comparison, safe update construction, optional geocoding for missing coordinates, and preview category generation. Wire the route to read Sheets, run preview, and only write on explicit apply. Keep geocoding behind an injected server-side Yandex adapter and treat missing configuration or no-result lookups as warnings rather than import failures.

### Conflict and offline behavior
The import endpoint is a server-side Sheets operation, not an offline UI mutation. Field-work conflicts are avoided by preserving owner assignment, status, comments, and contact-like fields from existing points. If Google Sheets was edited manually, the import compares against the latest server snapshot and increments versions only for safe source/coordinate metadata changes.

### UI behavior
No mobile UI is added in this task. The endpoint returns structured preview buckets (`new`, `duplicate`, `update`, `invalid`) plus warnings so a future import screen can render review and apply states.

### Tests
Add Vitest coverage for normalization/source-key stability, JSON and CSV parsing, incoming dedupe, existing duplicate detection, safe update behavior, and geocoding only when coordinates are missing.

### Risks
CSV parsing is intentionally small and dependency-free; quoted-field edge cases are covered but full spreadsheet dialect support is limited. Real geocoding depends on `YANDEX_GEOCODER_API_KEY` and Yandex response availability, so the import pipeline treats missing configuration and no-result lookups as warnings rather than failures.

### Rollback
Revert the new `src/lib/import` module and tests, and restore `src/app/api/import/points/route.ts` to its previous preview stub. No schema migration is required.

### Progress
- [x] Inspect prompt, project rules, existing import route, data model, Sheets adapter, and geocode placeholder.
- [x] Add pure import parser/preview/apply helpers.
- [x] Wire `POST /api/import/points` preview/apply flow to Sheets.
- [x] Add tests for normalization, sourceKey, dedupe, safe updates, and geocode behavior.
- [x] Run lint, typecheck, tests, and build.

Verification results:
- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm test`: passed, 12 files and 44 tests
- `npm run build`: passed
