Use AGENTS.md.

Task: add an explicit frontend API access layer for the PVZ Atlas app architecture.

Context:
The app is local-first. UI must read/write IndexedDB first. UI components must not call Next.js `/api/*` routes directly for sync or data mutations. All server communication must go through typed API clients under `src/lib/api/`, and sync must be orchestrated by the sync engine.

Implement or update the architecture so the data flow is:

UI components
  -> local domain actions
  -> IndexedDB / Dexie
  -> local changes queue
  -> sync engine
  -> typed API clients in `src/lib/api`
  -> Next.js route handlers in `src/app/api`
  -> Google Sheets / Yandex adapters

Required files/modules:

1. `src/lib/api/client.ts`
Create a shared typed fetch wrapper:
- accepts path and RequestInit
- automatically sets JSON headers
- parses JSON responses
- throws structured errors for non-2xx responses
- supports requests without body
- does not expose secrets to the browser

2. `src/lib/api/sync-api.ts`
Create typed wrappers:
- `pullSync(since: string | null): Promise<PullResponse>`
- `pushSync(request: PushRequest): Promise<PushResponse>`

3. `src/lib/api/geocode-api.ts`
Create typed wrapper:
- `geocodeAddress(request: GeocodeRequest): Promise<GeocodeResponse>`

4. `src/lib/api/import-api.ts`
Create typed wrappers if import routes exist or add stubs if they do not yet exist:
- `previewImportPoints(request: ImportPreviewRequest): Promise<ImportPreviewResponse>`
- `applyImportPoints(request: ImportApplyRequest): Promise<ImportApplyResponse>`

5. Shared request/response types
Put shared API types in an appropriate existing data-model module, or create:
- `src/lib/api/types.ts`
Do not duplicate incompatible types between frontend clients and route handlers.

Expected sync request/response shape:
- `PullResponse` contains `serverTime`, `points`, `owners`, `visits`, and optionally `conflicts`.
- `PushRequest` contains `clientId` and `changes`.
- `PushResponse` contains `serverTime`, `applied`, `rejected`, `conflicts`, and optionally changed entities returned by the server.

6. Sync engine integration
Update the sync engine so it imports and uses:
- `pullSync`
- `pushSync`

The sync flow must remain:
1. Pull remote changes.
2. Apply remote changes to IndexedDB.
3. Read local queued changes.
4. Push queued changes through `pushSync`.
5. Apply push result.
6. Pull again to reconcile final server state.

7. UI mutation rule
Update or create local domain mutation functions, for example:
- `updatePointLocal(pointId, patch)`
- `createPointLocal(input)`
- `updateOwnerLocal(ownerId, patch)`
- `createOwnerLocal(input)`
- `addVisitLocal(input)`

These functions must:
- write to IndexedDB first
- enqueue a `Change`
- mark affected data as pending sync
- not call `/api/sync/push` directly

8. Remove direct API calls from components
Search the codebase for direct client-side calls like:
- `fetch('/api/sync`
- `fetch("/api/sync`
- `fetch('/api/geocode`
- `fetch("/api/geocode`
- `fetch('/api/import`
- `fetch("/api/import`

Replace them with typed API clients or local domain actions depending on the context.

Rule:
- Components may call geocode/import API wrappers for explicit user actions if needed.
- Components must not call sync push/pull directly unless the component is a dedicated Sync screen/button and even then it should call `runSync()`, not `fetch`.

9. AGENTS.md update
Add a section named `Frontend API access rules` with these rules:
- browser code must not call Google Sheets directly
- all server communication must go through typed API clients in `src/lib/api`
- UI components should not call `fetch` directly for sync/data mutations
- normal data flow is UI -> IndexedDB -> changes queue -> sync engine -> API clients -> route handlers -> adapters
- do not push full records from UI actions directly to API routes
- do not bypass the local change queue

10. Tests
Add or update tests for:
- API client error handling
- sync engine uses API clients
- local mutation enqueues Change without calling network
- direct fetch is not used in core UI mutation paths, if there is an existing lint/test pattern suitable for this

Do not add a heavy custom lint system unless the project already has one.

Acceptance criteria:
- `src/lib/api/*` exists and is used by sync/geocode/import logic.
- No sync mutation component directly calls `/api/sync/push`.
- Local data mutations go through IndexedDB and enqueue Change records.
- The sync engine uses typed API clients, not inline fetch.
- Shared request/response types are not duplicated inconsistently.
- AGENTS.md documents this architecture rule.
- Typecheck passes.
- Tests pass or meaningful tests are added if the project has a test setup.

Before editing:
- inspect the existing repo structure
- create or update an ExecPlan if this touches sync, data model, or architecture
- preserve existing behavior where possible