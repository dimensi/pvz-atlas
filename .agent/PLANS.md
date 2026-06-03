# ExecPlans

## Map Coordinate Clusters

Status: completed

Intent:
- Prevent overlapping map pins for PVZ with identical coordinates.
- Show one grouped marker with a count when several PVZ share a coordinate.
- Open a bottom drawer with the grouped PVZ list, then let the operator choose a concrete PVZ for the existing details/edit flow.
- Keep the map local-first and avoid new map provider or geocoder dependencies.

Implementation:
- Add coordinate grouping helpers in `src/lib/map/points.ts`.
- Update `LeafletMapView` to render single-point markers and grouped count markers.
- Update `LeafletMapClient` to open a cluster drawer and then route selection into the existing point details/actions drawers.
- Add focused tests for coordinate grouping.

Verification:
- `pnpm test`
- `pnpm run typecheck`
- `pnpm run lint`

Follow-up:
- Adjusted coordinate grouping to cluster points within 1 meter, because sub-meter coordinate differences still overlap visually as Leaflet pins at normal mobile zoom.

## Map Pin Spiderfy

Status: completed

Intent:
- Reduce visual noise from cluster count markers on real PVZ data.
- Keep nearby/overlapping PVZ individually tappable on mobile.
- Preserve real coordinates in storage and route links; only shift rendered marker positions on the Leaflet map.

Implementation:
- Reuse close-coordinate grouping as a layout helper.
- Render grouped points as separate brand pins spread in a circle around the original coordinate.
- Remove the cluster count marker and cluster list drawer from the map screen.
- Update map helper tests to describe spread groups rather than count-marker UX.

Verification:
- `pnpm vitest run src/lib/map/points.test.ts`
- `pnpm run typecheck`
- `pnpm test`
- `pnpm run lint`

## Switch Project To pnpm

Status: completed

Intent:
- Make pnpm the canonical package manager for local development, Docker builds, and deployment scripts.
- Replace npm lockfile/install commands with `pnpm-lock.yaml` and frozen pnpm installs.
- Keep runtime behavior unchanged.

Implementation:
- Add `packageManager` metadata to `package.json`.
- Generate `pnpm-lock.yaml`.
- Update `Dockerfile` to install dependencies with Corepack-managed pnpm.
- Update docs/scripts references that mention npm package-manager commands.

Verification:
- `pnpm install --frozen-lockfile`
- `pnpm test`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`
- `docker build -t pvz-atlas:pnpm-check .`

## Conflict Resolution From Sync Page

Status: completed

Intent:
- Let the operator clear unresolved sync conflicts from `/sync` without using Sheets directly.
- Keep the local-first queue intact: accepting local retries the queued patch against the current remote version; accepting remote removes the conflicted field from the queued patch and applies the remote value locally.
- Prevent a later pull from resurrecting a conflict that was resolved locally but still exists unresolved in the remote sheet snapshot.

Implementation:
- Add conflict resolution domain helpers in `src/lib/sync/local-actions.ts`.
- Update sync pull conflict merging in `src/lib/sync/engine.ts`.
- Add conflict cards and resolution buttons to `src/components/sync/SyncClient.tsx`.
- Cover queue/pull behavior with focused unit tests.

Verification:
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Quick Point Status Change

Status: completed

Intent:
- Replace the status Select + separate drawer with an inline shadcn Button Group picker.
- Save status immediately on tap in the actions drawer and on the map marker drawer.
- Temporarily hide the `closed` status and close-PVZ actions from operator UI while keeping the data model unchanged.

Implementation:
- Add `button-group` via shadcn CLI and `EDITABLE_POINT_STATUSES` in `src/lib/points/list.ts`.
- Add `PointStatusPicker` in `src/components/points/PointStatusPicker.tsx`.
- Wire picker into `PointActionDialogs` details/edit flows and `LeafletMapClient` marker drawer.
- Remove `status` and `close` actions from `PointAction`.

Verification:
- `npm test`
- `npm run typecheck`
- `npm run lint`

## Replace 5Post With Avito Brand

Status: completed

Intent:
- Replace the known `fivepost` brand with `avito` in the app's selectable/filterable brand set.
- Use the existing `public/map-pins/pin-avito.png` asset for map markers and offline precache.
- Leave existing `fivepost`/`5Post` sheet or IndexedDB records unmigrated; they should keep a legacy map marker but stay unavailable for new point creation.

Implementation:
- Update brand canonicalization, labels, and aliases in `src/lib/brands.ts`.
- Update map marker style keys, classes, colors, glyph fallback, and pin source in `src/lib/map/marker-style.ts`; keep a legacy-only FivePost marker resolver outside the createable brand options.
- Update brand pill CSS and service worker precache entries, including the legacy FivePost pin for offline maps.
- Update tests for brand helpers, marker styles, and service worker asset caching.

Verification:
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Map Pin Status Styling

Status: completed

Intent:
- Make map markers visually reflect point status without changing data flow or Leaflet marker generation.
- New points should show their pin at 50% opacity.
- Active points should show a fully opaque pin.
- Points needing review should show a bright yellow halo.

Implementation:
- Add marker CSS variables for pin opacity and status halo in `src/app/globals.css`.
- Remove the old status ring/border styling so pins are not outlined by a gray/status stroke.
- Keep existing marker status class names generated by `src/lib/map/marker-style.ts`.
- Add a focused CSS source test to lock the new status styling behavior.

Verification:
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
