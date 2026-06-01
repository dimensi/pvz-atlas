# Mobile UX Simplification After UI Migration

## Goal
Make the mobile app faster for field use by replacing the primary sync tab with Owners, hiding sync internals, simplifying point cards, adding owner management, standardizing brand input, improving coordinate paste input, and confirming PWA installability.

## Current repo state
The app is a Next.js App Router PWA shell with bottom navigation in `src/app/layout.tsx`. `/points`, `/map`, `/add`, and `/sync` exist; there is no `/owners` page. `PointsListClient` renders grouped point cards but shows per-card sync badges and many actions. `LeafletMapClient` has similar sync status and brand filter behavior. `AddPointClient` uses free-text brand plus separate latitude/longitude fields. `PointActionDialogs` already provides accessible drawer/dialog flows and uses local actions. `src/app/manifest.ts` and icon files already exist, but there is no service worker registration in the inspected files.

## Data and API impact
No Google Sheets adapter, API routes, or sync engine internals should change. Affected client entities are `Point`, `Owner`, `Visit`, `Change`, and `Conflict`. Owner create/update and point update/create actions must continue to use `createOwnerLocal`, `updateOwnerLocal`, `createPointLocal`, and `updatePointLocal` so IndexedDB and queued changes stay authoritative.

## Approach
Add shared brand helpers under `src/lib/brands.ts` and coordinate parsing support for one paste field. Add a compact shared `SyncHealthIndicator` component. Update bottom navigation to show Owners and keep `/sync` as an unlinked debug route with less implementation copy. Simplify point cards so secondary actions open the existing drawer. Add `/owners` and an `OwnersClient` for search, create, edit, archive-when-unused, and owner details. Update add/edit point forms to use brand select helpers. Add minimal service worker support if PWA installability is missing.

## Conflict and offline behavior
All mutations remain local-first. Creating or editing owners writes IndexedDB and enqueues owner changes. Creating or editing points writes IndexedDB and enqueues point changes. Offline changes stay visible locally and are sent when sync runs. Push behavior remains the existing version-checked patch flow; competing manual Sheets edits continue to become conflicts through the current sync path. This task does not change conflict resolution semantics.

## UI behavior
Primary tabs become `Список`, `Карта`, `Добавить`, `Владельцы`. Sync appears only as compact status for offline, pending changes, conflicts, or errors, with neutral/silent behavior when clean. Point cards show brand, address, owner, non-default status, route when coordinates exist, and one drawer action. Owners page shows unassigned count, owner list sorted by name, counts per owner, search, create/edit, archive only when no PVZ are assigned, and details drawer with assigned PVZ.

## Tests
Add or update tests for brand canonicalization and coordinate parsing. Add focused UI tests where practical for owner management and edit/add brand selection. Run lint, typecheck, tests, and build.

## Risks
Existing imported brands may not match canonical ids, so display/filter helpers must tolerate legacy labels while new UI writes canonical ids. Service worker caching must avoid stale API/sync responses. Owner archive must not hide owners with assigned PVZ. Shared sync indicator must not accidentally hide conflict/error states.

## Rollback
Revert the new owner page/client, shared brand/sync/PWA files, and edits to list/map/add/action components. Existing data remains compatible because no migration or backend schema change is introduced.

## Progress
- [x] Read task instructions and project checklist.
- [x] Inspect core UI, local actions, list/map helpers, and PWA manifest.
- [x] Reconcile code mapper findings.
- [x] Add shared brand, coordinate, and sync indicator helpers.
- [x] Update navigation, list cards, add/edit forms, and sync copy.
- [x] Add Owners page/client.
- [x] Add minimal service worker support if needed.
- [x] Run tests, lint, typecheck, and build.
- [x] Run review agents and fix blocker findings.
