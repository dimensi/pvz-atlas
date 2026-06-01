# AGENTS.md

## Product brief

Build a mobile-first PWA for field collection and management of pickup points (PVZ). The app is primarily for one operator walking around PVZ locations, assigning each PVZ to an owner, adding notes, and syncing with Google Sheets so data can also be edited manually.

Core capabilities:
- List PVZ grouped by owner.
- Show PVZ without owner first.
- Map mode with Leaflet and OpenStreetMap.
- Open route to a PVZ through Yandex Maps deeplink.
- Add a PVZ manually if it is missing.
- Work offline on a phone using IndexedDB.
- Sync safely with Google Sheets without overwriting manual edits.

## Tech decisions

Use:
- Next.js App Router.
- TypeScript everywhere.
- React server/client components intentionally.
- IndexedDB via Dexie for client local storage.
- Next.js route handlers for backend endpoints.
- Google Sheets API only from the server side.
- Leaflet with OpenStreetMap tiles for the in-app map.
- Yandex Maps deeplinks for routing.
- Zod for runtime validation.
- Vitest for unit tests where practical.
- Playwright only if end-to-end tests become necessary.

Do not use:
- Direct Google Sheets access from browser code.
- Database row numbers as stable IDs.
- Blind full-row overwrite sync.
- Large backend frameworks unless explicitly requested.
- Redis/Postgres in the MVP unless a task explicitly upgrades storage.

## Repository layout target

Prefer this structure unless the existing repo already has another pattern:

```txt
src/
  app/
    api/
      sync/
        pull/route.ts
        push/route.ts
      import/points/route.ts
    map/page.tsx
    points/page.tsx
    add/page.tsx
  components/
    map/
    mobile/
    points/
    owners/
    sync/
  lib/
    data-model/
    indexeddb/
    sync/
    sheets/
    map/
    yandex/
    validation/
  styles/
```

## Data model rules

Every syncable entity must have:
- `id: string`
- `createdAt: string`
- `updatedAt: string`
- `deletedAt: string | null`
- `version: number`

Entities:
- `Point`
- `Owner`
- `Visit`
- `Change`
- `Conflict`

Do not use Google Sheets row numbers as IDs. Store row numbers only as temporary lookup metadata inside server-side sheet adapters.

## Frontend API access rules

Browser code must not call Google Sheets directly.

All server communication must go through typed API clients in:

src/lib/api/

Expected modules:
- `client.ts` — shared fetch wrapper.
- `sync-api.ts` — pull/push sync requests.
- `import-api.ts` — import preview/apply requests.

UI components should not call `fetch` directly for sync or data mutations.
Use typed API clients for explicit server actions such as geocoding/import preview.
Prefer calling domain functions from `src/lib/sync`, `src/lib/indexeddb`, or typed API clients.

Normal data flow is UI -> IndexedDB -> changes queue -> sync engine -> API clients -> route handlers -> adapters:
1. UI reads from IndexedDB.
2. UI writes mutations to IndexedDB.
3. Mutations enqueue local `Change` records.
4. Sync engine calls typed API clients.
5. API clients call Next.js route handlers.
6. Route handlers talk to Google Sheets adapters.
7. Sync result is merged back into IndexedDB.

Do not push full records from UI actions directly to API routes.
Do not bypass the local change queue.

## Sync rules

The app is local-first:
1. UI reads and writes IndexedDB first.
2. Local mutations enqueue `Change` records.
3. Sync runs as: pull, push, pull.
4. Push sends patches, not whole records, unless the operation is create.
5. Each patch includes `baseVersion`.
6. Server compares `baseVersion` with remote `version`.
7. If remote version is unchanged, apply patch and increment version.
8. If remote version changed, attempt field-level merge.
9. If the same field changed on both sides, create a conflict record.
10. Never silently drop a local change.

For MVP, last-write-wins is acceptable only for fields that are explicitly marked low-risk. Owner assignment, status, comments, contact fields, and coordinates should use conflict-aware merging.

## Google Sheets rules

Use sheets as editable remote storage.

Expected sheets:
- `points`
- `owners`
- `visits`
- `changes_log`
- `conflicts`

Protect these columns conceptually:
- `id`
- `created_at`
- `updated_at`
- `deleted_at`
- `version`
- `source_key`

The backend must validate rows read from Sheets and report malformed rows instead of crashing.

## Mobile-first UI rules

Design for phone usage first:
- Bottom navigation.
- Large tap targets.
- Bottom sheets for map marker details.
- Fast filters: no owner, nearby, brand, status.
- Offline and sync status visible but not noisy.
- Actions should be possible with one hand while walking.

Primary tabs:
- List
- Map
- Add
- Sync

## Map rules

Use Leaflet with OpenStreetMap tiles for displaying points.
Use Yandex Maps deeplinks for routes instead of implementing routing in-app.
Store `lat` and `lon` in the data model; never geocode on render.
The MVP does not geocode addresses automatically. Coordinates come from manual entry, CSV/JSON import, or manual Google Sheets edits.

## Import rules

Import pipeline:
1. Parse CSV/JSON.
2. Normalize brand, city, and address.
3. Generate stable `sourceKey`.
4. Deduplicate by brand + normalized city + normalized address.
5. Preserve provided coordinates and warn when coordinates are missing.
6. Preview changes before writing.
7. Batch write to Sheets.

Repeated imports must be idempotent.

## Privacy and safety rules

Treat owner names, phones, Telegram handles, and free-form notes as sensitive personal data.
Do not expose owner/contact data in public pages.
Do not log secrets or personal contacts.
Add `.env.example` but never commit `.env.local`.

## Engineering conventions

- Prefer small modules and pure functions for sync logic.
- Keep sync algorithms unit-testable without Google Sheets or browser APIs.
- Put external integrations behind adapters.
- Validate all API inputs with Zod.
- Return structured errors from APIs.
- Use explicit types; avoid `any`.
- Keep UI components dumb where practical.
- Keep business logic in `src/lib`.

## Commands

When available, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

If the repo uses `pnpm`, use `pnpm` equivalents. Ask before adding production dependencies.

## Definition of done

A task is done only when:
- Code compiles.
- Types pass.
- Relevant tests are added or updated.
- Existing behavior is not broken.
- Sync behavior is described for affected data paths.
- Any new environment variables are documented in `.env.example`.

## ExecPlans

For complex features, sync changes, data model changes, or architecture refactors, create an ExecPlan using `.agent/PLANS.md` before editing code. Keep the plan updated while working.
