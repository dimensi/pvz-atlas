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

## Branded Leaflet Map Pins

### Goal
Show mobile-readable PVZ map pins styled by `point.brand`, using a local full-pin image for Ozon, local logo pins for Yandex Market, Wildberries, CDEK, and 5Post, and branded vector fallback pins for unknown brands.

### Current repo state
The `/map` route renders `LeafletMapClient`, which reads local cached points, filters mappable coordinates, and passes markers into `LeafletMapView`. `LeafletMapView` currently creates status-only Leaflet `divIcon`s with small dot CSS in `src/app/globals.css`. Brand canonicalization already exists in `src/lib/brands.ts`; the data model has `Point.brand` as a string and no separate PVZ type field. The repo has a user-added `pin-ozon.svg` at the root.

### Data and API impact
No data model, IndexedDB, sync engine, API routes, Google Sheets schema, import logic, or environment variables change. Marker style is derived from existing `point.brand` with `canonicalizeBrand`; unknown brands fall back to `other` visual styling while preserving stored/displayed brand text.

### Approach
Add a pure map marker style helper that maps known canonical brands to controlled classes, glyphs, local asset URLs, and inline SVG pin body colors. Move the Ozon pin asset into `public/map-pins/`, use user-provided WB/CDEK logos, and add a local Yandex Market logo asset based on the supplied logo. Update `LeafletMapView` to create per-brand/status `divIcon`s with static controlled HTML. Use one-piece 45x65 vector pin bodies for logo/fallback pins so tails do not distort.

### Conflict and offline behavior
This is display-only. Offline behavior is unchanged: the map still renders from local cached IndexedDB snapshot data, and no changes enter the local change queue. Existing sync pull/push/conflict behavior is unaffected.

### UI behavior
On mobile and desktop, markers use recognizable brand visuals. Ozon uses the supplied full-pin asset. Yandex Market, Wildberries, CDEK, and 5Post use local logo assets inside a unified vector pin body. Unknown/other points use color vector pins with short glyph labels. Clicking a marker keeps the existing bottom drawer behavior and route/edit actions. Status remains visible as a secondary accent.

### Tests
Add unit tests for marker style mapping: Ozon aliases, Yandex Market aliases, WB/Wildberries, СДЭК, 5Post, and unknown fallback. Run targeted map/brand tests plus lint and typecheck. Smoke-test `/map` in the browser at mobile and desktop sizes.

### Risks
Leaflet `divIcon` accepts HTML strings, so marker HTML must only use controlled helper output and not interpolate raw stored brand values. Asset path mistakes can make pins blank; cover with helper tests and browser smoke. Large markers can overlap more than the old dots; keep anchors and dimensions stable.

### Rollback
Restore the old status-only `LeafletMapView` icon factory and marker CSS, remove `src/lib/map/marker-style.ts`, its tests, and `public/map-pins/`. No data rollback is required.

### Progress
- [x] Read project instructions and run `code_mapper`.
- [x] Decide the visual variant: local logo/image pins for Ozon and Yandex Market, color fallback pins for others.
- [x] Add marker style helper and tests.
- [x] Add local map pin assets.
- [x] Update Leaflet marker rendering and CSS.
- [x] Run tests, lint, typecheck, and browser smoke.
- [ ] Run map, mobile UI, and test hardening reviewers.

Verification results:
- `npm test -- src/lib/brands.test.ts src/lib/map/points.test.ts src/lib/map/marker-style.test.ts`: passed, 3 files and 12 tests.
- `npm test -- src/lib/brands.test.ts src/lib/map/marker-style.test.ts src/components/pwa/service-worker.test.ts`: passed, 3 files and 13 tests after the logo-pin refactor.
- `npm test`: passed, 23 files and 87 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Browser smoke on existing dev server `http://localhost:3000/map`: desktop 1280x720 rendered 24 markers using local 45x65 image pins and marker click opened the existing drawer; mobile 390x844 rendered 24 visible 45x65 markers with no horizontal overflow.
- Browser visual check after logo-pin refactor: map rendered Ozon, WB, Yandex Market, CDEK, and 5Post marker classes; WB/CDEK/Market/5Post use one-piece inline SVG pin bodies instead of the earlier CSS circle-plus-tail shape.
- `map_cost_reviewer`: no blockers; noted the new SVG pins should be precached for offline field use, so local `/map-pins/*.svg` marker assets were added to `public/sw.js` and cache name was bumped to `pvz-atlas-v2`.
- `test_hardening_reviewer`: no blockers; noted actual `divIcon` output was not directly asserted, so controlled marker class/html builders were added and tested.
- `mobile_ui_reviewer`: found a blocker where stored `fivepost` fell back to `other`; fixed by adding the `fivepost` alias, adding tests, increasing map padding, adding marker `aria-label`/`role`/`tabindex` and keyboard handling, integrating the status dot inside the pin head, and adding safe-area bottom padding.

---

## Mobile Accessible Edit Flows Without Native Prompts

### Goal
Replace production `alert`, `confirm`, and `prompt` usage with mobile-first accessible React UI primitives for PVZ editing, owner assignment, notes, status changes, confirmations, map marker actions, and non-blocking feedback.

### Current repo state
Native browser API usage is concentrated in `src/components/points/PointsListClient.tsx` for owner assignment, owner creation, status changes, and comments. `src/components/map/LeafletMapClient.tsx` already has a custom marker bottom sheet but only exposes route details. The project uses Next.js, React, TypeScript, Dexie, Leaflet, lucide icons, global CSS, and no Tailwind/shadcn setup. Local-first mutation helpers already exist in `src/lib/sync/local-actions.ts`.

### Data and API impact
Affected client entities are `Point`, `Owner`, and `Visit`. No route handlers, Google Sheets schema, or environment variables change. UI mutations must continue to call local domain actions (`updatePointLocal`, `createOwnerLocal`, `addVisitLocal`) so IndexedDB is written first and `Change` records are queued before sync.

### Approach
Initialize real shadcn/ui support with `components.json`, Tailwind v4/PostCSS, shadcn registry components under `src/components/ui`, and standard shadcn utilities. Add shared point action flow components for edit point, assign owner/create owner, note edit, status selection, and close confirmation. Replace prompt handlers in the list with those flows and use labeled card actions instead of icon-only controls. Replace the custom map marker bottom sheet with the shared Vaul Drawer surface and expose route, assign owner, status, note, and edit actions there. Update global CSS for Tailwind theme tokens, app-specific mobile layouts, and z-index layering above Leaflet.

### Conflict and offline behavior
All edits remain local-first. Owner assignment, status, comments, and point field edits call `updatePointLocal` with patches, which writes IndexedDB and enqueues an update `Change` with the current `baseVersion`. Owner creation calls `createOwnerLocal` and then patches the point owner. Visit actions call `addVisitLocal`. If offline, the UI shows the saved local state after cache refresh and the toast tells the operator the change is queued. On push, the server compares `baseVersion` against Sheets and creates conflicts for competing manual edits instead of silently dropping local changes.

### UI behavior
Primary edit flows use bottom drawers on mobile and dialog-style layout on larger screens. Forms include labels, inline validation, save/cancel buttons, and large tap targets. Owner assignment supports search, owner selection, inline new-owner creation, and clearing the owner. Notes use a textarea. Status changes use an accessible select with Russian labels and existing visual badges. Destructive close/mark-closed uses AlertDialog. Feedback uses non-blocking toasts. Map marker details use the shared Vaul Drawer surface with the required actions. Point cards show icon+text action labels so the operator does not need to infer actions from icons.

### Tests
Add a static Vitest check that fails on production `alert`, `confirm`, or `prompt` usage in `src`, excluding test files. Add focused component tests where practical for the new point action flows to verify local action callbacks are invoked through form submissions rather than native prompts.

### Risks
Adding shadcn/Tailwind primitives can increase bundle size and CSS surface; keep dependencies narrow and components small. Radix/vaul components are client-side only, so wrappers must use `"use client"`. Existing global CSS has custom class names, so the shadcn theme tokens must map to existing app variables and avoid broad visual churn. Leaflet uses z-index values up to about 1000, so drawer/dialog/select portals must stay above map panes and controls.

### Rollback
Remove the new UI wrappers and action flow components, revert `PointsListClient.tsx`, `LeafletMapClient.tsx`, global CSS additions, package dependency additions, and the forbidden-native-API test. No data migration or backend rollback is required.

### Progress
- [x] Inspect current native browser API usage.
- [x] Inspect package and UI setup.
- [x] Add minimal accessible UI primitives and toast provider.
- [x] Replace list prompt flows with drawers/dialogs.
- [x] Extend map marker bottom sheet actions.
- [x] Add tests/static scan.
- [x] Update AGENTS.md UI component rules.
- [x] Run lint, typecheck, tests, and build.

Verification results:
- `rg -n "\b(window\.)?(alert|confirm|prompt)\s*\(" src --glob '!*.test.*' --glob '!*.spec.*'`: no production matches
- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm test`: passed, 16 files and 57 tests
- `npm run build`: passed
- Browser smoke on existing dev server `http://localhost:3000`: `/points` rendered with labeled card actions and no `.icon-action` elements, edit drawer opened with form fields, owner drawer opened with search/new-owner/clear controls, close AlertDialog opened without applying the destructive action, `/map` rendered 24 Leaflet markers, marker click opened a `.ui-drawer-content` details drawer, and old custom `.map-bottom-sheet` / `.map-sheet-backdrop` elements were absent.
- After shadcn/Tailwind install: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` passed. Browser z-index check on `/map`: drawer overlay `z-index: 2000`, drawer content `z-index: 2010`, select content `z-index: 2020`, Leaflet top controls `z-index: 1000`, markers `z-index: 299`.
- Marker drawer sizing fix: disabled Vaul bottom drawer `::after`, removed marker drawer content scrolling, made marker actions a two-column grid, and verified in browser that drawer `::after` is `display: none`, `scrollTop` is `0`, action grid has two columns, and the drawer height is content-sized.

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

---

## Online-First Sync With IndexedDB Fallback

### Goal
Make List and Map usable without a manual Sync button: show IndexedDB cache immediately when present, refresh from online Sheets-backed API automatically when online, and keep local mutations instant while auto-syncing them in the background.

### Current repo state
`PointsListClient` and `LeafletMapClient` read directly from Dexie only. `runSync()` performs pull, push, pull, but it is only called by `SyncClient`. The current sync engine already preserves dirty local entities during pull and avoids re-pushing changes with unresolved conflicts.

### Data and API impact
No wire contract changes for `/api/sync/pull` or `/api/sync/push`. The browser still never talks to Google Sheets directly. IndexedDB remains the render source, but it becomes an online-refreshed cache rather than a manual-only data store.

### Approach
Add a shared client-side cached snapshot reader and a `refreshOnlineCache` single-flight sync helper. If no pushable local changes exist, auto refresh performs pull-only and writes the result to IndexedDB. If pushable local changes exist, auto refresh runs the full `runSync()` flow. Refactor List and Map to use the shared snapshot hook: read cache first, then online refresh, then re-read cache. Trigger auto refresh on screen open, network reconnect, and after local mutations.

### Conflict and offline behavior
Local mutations continue to write IndexedDB first and enqueue `Change` records. Offline mode keeps cached data and pending changes visible. Online refresh does not overwrite dirty local entities before conflict handling, and changes with unresolved conflicts are not pushed again until resolved.

### UI behavior
List and Map should distinguish cache loading from online refreshing. With cached data, show it immediately and display a small refreshing state. With no cache and online available, show an online loading state instead of an empty list/map. Sync screen remains as a forced sync/status screen, not the primary way to load data.

### Tests
Add unit coverage for pull-only refresh, full sync refresh with pending changes, snapshot reading with `lastPullServerTime`, and cache-first/online-refresh hook behavior. Keep existing sync dirty-entity and unresolved-conflict regressions.

### Risks
Multiple screens may try to refresh at the same time; mitigate with a module-level single-flight promise. Browser online status is advisory, so failed refreshes must keep cache visible and show a non-blocking error.

### Rollback
Revert the new snapshot/online refresh modules and restore List/Map to direct Dexie reads plus manual Sync button behavior. No data migration or API rollback is required.

### Progress
- [x] Add ExecPlan.
- [x] Add cached snapshot reader and online refresh helper.
- [x] Refactor List and Map to use online cache behavior.
- [x] Update Sync copy and forced sync refresh behavior.
- [x] Add tests.
- [x] Run lint, typecheck, tests, and build.

Verification results:
- `npm run typecheck`: passed
- `npx vitest run src/lib/sync/engine.test.ts src/lib/sync/cache.test.ts src/lib/sync/use-online-cached-snapshot.test.tsx src/lib/map/points.test.ts src/lib/import/points.test.ts`: passed, 5 files and 20 tests
- `npm run lint`: passed
- `npm test`: passed, 15 files and 56 tests
- `npm run build`: passed

---

## Leaflet OSM Map Without Geocoding

### Goal
Show PVZ points on the map with Leaflet and OpenStreetMap tiles, keep external route buttons as Yandex Maps deeplinks, and remove automatic address geocoding from add/import flows.

### Current repo state
The map screen was implemented in `src/components/map/YandexMapClient.tsx` and loaded by `src/app/map/page.tsx`. Generic marker filtering helpers lived under `src/lib/yandex/map.ts`. Route buttons use `src/lib/yandex/deeplinks.ts`. Add/import flows called `/api/geocode`, which delegated to `src/lib/yandex/geocode.ts`.

### Data and API impact
`Point.lat` and `Point.lon` stay in the data model, Sheets schema, IndexedDB, and sync patches. `/api/geocode` and the typed geocode client are removed. Import keeps CSV/JSON `lat`/`lon` values when provided and otherwise leaves coordinates null with warnings.

### Approach
Install `leaflet` and `react-leaflet`, plus Leaflet types. Replace the Yandex map component with a Leaflet client component using OSM tiles and custom CSS markers. Move generic map point helpers into `src/lib/map/points.ts`. Update the add form to accept optional latitude and longitude fields instead of a geocode button. Remove Yandex geocoder modules and env vars while keeping Yandex route deeplink helpers.

### Conflict and offline behavior
No sync conflict behavior changes. Manual coordinate edits still move through existing local-first mutations, change queue patches, server version checks, and Sheets conflict handling. Points saved without coordinates remain valid local records and sync normally, but they are omitted from marker rendering.

### UI behavior
The map keeps current mobile filters, loading/empty/error overlays, summary counts, missing-coordinate list, marker bottom sheet, and Yandex route action. Add form exposes optional coordinate inputs and validates that latitude and longitude are either both empty or both valid.

### Tests
Update map helper tests after moving modules. Update import tests to remove auto-geocode behavior and cover missing-coordinate warnings. Add coordinate input validation tests. Keep Yandex deeplink tests. Run lint, typecheck, tests, build, and a browser smoke check for `/map`.

### Risks
Leaflet CSS and marker sizing can break mobile layout if not loaded globally. React Leaflet map props are mostly immutable after init, so viewport updates use a small `useMap` controller. OSM public tiles are acceptable for MVP usage but may need a dedicated tile provider later.

### Rollback
Revert the new Leaflet component/helpers/dependencies, restore the Yandex map component and geocode route/client/modules, and re-add Yandex map/geocoder env vars.

### Progress
- [x] Create worktree and merge current `main`.
- [x] Add map dependencies.
- [x] Replace Yandex map display with Leaflet/OSM.
- [x] Remove geocoding and update add/import flows.
- [x] Update map helper tests and add coordinate parsing tests.
- [x] Run verification commands and browser smoke check.

Verification results:
- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm test`: passed, 13 files and 47 tests
- `npm run build`: passed
- Browser smoke check: `http://localhost:3011/map` rendered the map page with no console errors.
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
