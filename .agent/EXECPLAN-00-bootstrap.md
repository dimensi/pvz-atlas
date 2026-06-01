# ExecPlan: Initial MVP Scaffold

## Goal
Create the first working PVZ Organizer skeleton: a mobile-first Next.js App Router PWA with TypeScript, domain model types, Dexie IndexedDB setup, placeholder server API routes, bottom navigation, and minimal tests for pure helpers.

## Current repo state
The repository currently contains only project guidance and prompts:
- `AGENTS.md`
- `README.md`
- `.agent/PLANS.md`
- `.codex/prompts/00-bootstrap.md`
- project skills under `.agents/skills/`

There was no Next.js application, package manifest, source tree, test setup, or environment example at the start of the task.

Implemented scaffold now includes:
- `package.json` and `package-lock.json`
- Next.js config, TypeScript config, ESLint flat config, Vitest config
- `src/app` App Router pages and API routes
- `src/lib` data model, validation, IndexedDB, sync, sheets, and Yandex helper modules
- `.env.example`

## Data and API impact
New syncable entities will be defined in `src/lib/data-model/types.ts`:
- `Point`
- `Owner`
- `Visit`
- `Change`
- `Conflict`

Every syncable entity includes:
- `id`
- `createdAt`
- `updatedAt`
- `deletedAt`
- `version`

New placeholder endpoints:
- `GET /api/sync/pull`
- `POST /api/sync/push`
- `POST /api/geocode`
- `POST /api/import/points`

Google Sheets integration is not implemented in this scaffold. Server routes return structured placeholder responses and keep the browser/server boundary explicit.

## Approach
1. Add a minimal Next.js App Router TypeScript project configuration.
2. Create `src/app` pages for List, Map, Add, and Sync, with `/` redirecting to `/points`.
3. Add a mobile app shell with bottom navigation and unobtrusive sync/offline status.
4. Define data model types and Zod schemas.
5. Add Dexie database setup in `src/lib/indexeddb`.
6. Add pure helpers for stable source keys and Yandex Maps deeplinks.
7. Add route handler placeholders with Zod input validation where applicable.
8. Add `.env.example` documenting required environment variable names without secrets.
9. Add Vitest setup and focused tests for pure helpers.
10. Run available verification commands from `package.json`.
11. Update scaffold dependencies to the current npm `latest` dist-tags after the initial pass showed the generated versions were behind.

## Conflict and offline behavior
This scaffold does not yet implement browser mutations beyond structural placeholders.

Planned behavior represented by types and APIs:
- UI reads and writes local IndexedDB first.
- Local mutations create `Change` records with entity type, operation, patch, and `baseVersion`.
- Sync order is pull, push, pull.
- Push accepts patches for updates and full records for creates.
- Server-side sync will compare `baseVersion` against remote `version`.
- If remote data changed, future sync logic will attempt field-level merge.
- If the same protected field changed locally and remotely, future sync logic will create a `Conflict`.
- Google Sheets row numbers will not be used as stable IDs.

## UI behavior
Implemented mobile-first shell:
- Sticky top status bar with app name and network/sync state.
- Bottom navigation tabs: List, Map, Add, Sync.
- Large tap targets and single-column content for phone use.
- Russian-first UI: primary visible application copy, metadata, and empty states should be written in Russian first because the field workflow targets Russian-speaking operators.
- Navigation and action icons should use Lucide React icons instead of text-letter placeholders.

Implemented initial states:
- List page shows grouped placeholder sections with "No owner" first.
- Map page explains that Yandex Maps integration is pending and links route behavior to stored coordinates.
- Add page presents the intended offline-first form shape without implementing persistence yet.
- Sync page shows pull/push/pull workflow and pending queue placeholders.
- Empty states are explicit and avoid exposing sensitive owner/contact data.

## Tests
Added Vitest tests for:
- stable source key normalization/deduplication helper;
- Yandex route deeplink builder.

Verification results:
- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm test`: passed, 2 files and 3 tests
- `npm run build`: passed
- `npm audit --omit=dev`: passed, 0 vulnerabilities
- Browser smoke check: `/points` rendered at `http://127.0.0.1:3000/points`, bottom navigation is fixed, and the list empty state is visible.

Dependency update target:
- `next`: `16.2.6`
- `react` / `react-dom`: `19.2.6`
- `dexie`: `4.4.3`
- `zod`: `4.4.3`
- dev tooling: npm `latest` for TypeScript, Next ESLint config, Vitest, jsdom, React/Node types, and Testing Library. ESLint uses the latest compatible 9.x because `eslint-config-next@16.2.6` still depends on plugins whose peer ranges do not support ESLint 10.

Dependency update results:
- Updated `next` to `16.2.6`.
- Updated `react` and `react-dom` to `19.2.6`.
- Updated `dexie` to `4.4.3`.
- Updated `zod` to `4.4.3` and migrated `z.record` usage to the Zod 4 signature.
- Updated TypeScript to `6.0.3`, Vitest to `4.1.8`, jsdom to `29.1.1`, `eslint-config-next` to `16.2.6`, and React/Node type packages to latest.
- Kept ESLint at `9.39.4`, the newest compatible version for the current Next ESLint dependency chain. ESLint `10.4.1` was tested and rejected because `eslint-plugin-react` from `eslint-config-next@16.2.6` fails at runtime.
- Replaced `FlatCompat` ESLint config with direct flat config imports from `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
- `npm outdated` now reports only ESLint `10.4.1`, intentionally not used for compatibility.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.

Russian-first and icon update plan:
- Add `lucide-react` as the icon library.
- Replace bottom navigation letter placeholders with Lucide icons.
- Translate primary app UI copy to Russian: metadata, header, nav labels, page titles, empty states, form labels/placeholders, buttons, and visible route placeholder text.
- Keep route paths and internal TypeScript domain identifiers in English for stable code conventions.
- Rerun lint, typecheck, tests, build, audit, and browser smoke check.

Russian-first and icon update results:
- Added `lucide-react@1.17.0`.
- Replaced text-letter bottom navigation placeholders with Lucide icons: list, map, plus, refresh.
- Set HTML language and metadata to Russian.
- Translated primary visible app copy across List, Map, Add, Sync, and API placeholder messages.
- Browser smoke check confirmed `/points` renders Russian copy and 4 Lucide SVG icons in the bottom navigation.

## Risks
- Manual scaffolding may miss a standard Next.js generated file. Mitigation: keep configuration minimal and verify with build.
- Adding production dependencies is required for the requested stack (`next`, `react`, `dexie`, `zod`). Mitigation: use the smallest direct dependency set.
- Placeholder APIs could imply complete sync behavior. Mitigation: route responses state `not_implemented` while preserving contracts.
- Browser-only Dexie code can accidentally enter server components. Mitigation: isolate Dexie in `src/lib/indexeddb` and only import it from client-side modules later.

## Rollback
Remove the generated scaffold files and restore the repository to documentation-only state. Since no existing app code is present, rollback is a clean deletion of the new package/config/source/test/env files.

## Progress
- [x] Inspect project instructions and bootstrap prompt.
- [x] Create first ExecPlan before code edits.
- [x] Scaffold Next.js App Router project files.
- [x] Add domain model, validation, IndexedDB, sync, sheets, and Yandex helper modules.
- [x] Add mobile pages and bottom navigation.
- [x] Add placeholder API route handlers.
- [x] Add `.env.example`.
- [x] Add minimal helper tests.
- [x] Run lint, typecheck, test, and build.
- [x] Update this ExecPlan with implementation results.
- [x] Update dependencies to npm latest and refresh lockfile.
- [x] Fix any migration issues from latest dependency versions.
- [x] Rerun lint, typecheck, tests, build, audit, and browser smoke check after dependency update.
- [x] Add Russian-first UI rule and Lucide icon plan.
- [x] Install Lucide React and replace navigation placeholders with icons.
- [x] Translate visible application UI to Russian.
- [x] Rerun verification after translation and icon changes.
- [x] Commit the completed scaffold.
