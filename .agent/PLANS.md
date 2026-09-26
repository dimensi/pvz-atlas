# ExecPlans

## Map Touch Gestures and iPhone Safe Areas

Status: verified in mobile WebKit; installed iPhone check pending

Intent:
- Keep one-finger map panning usable after an interrupted touch gesture. The operator scrolls the page outside the map.
- Keep the fixed bottom navigation above the iPhone home indicator and preserve tappable content above it.

Plan:
- Inspect Leaflet touch dragging/zoom behavior and the current mobile viewport CSS. Recover a stale Leaflet drag after a lost touch completion, cancellation, or app backgrounding without changing normal one-finger map panning.
- Enable edge-to-edge viewport only with matching top, bottom, and side safe-area padding.
- Verify map movement and page scrolling on a mobile browser interaction, plus 320–390 px layout/screenshots. Run lint, typecheck, tests, and build.
- Review the diff, publish through the existing squash/deploy workflow if the behavior is verified, and check the public release.

Verification:
- Mobile WebKit at 390 px reports Leaflet touch dragging enabled and `touch-action: none`. A synthetic one-finger gesture moved the map pane 50 px. After deliberately omitting `touchend`, the next one-finger gesture cleared the drag class and moved the pane again (30 px to 80 px).
- At 320 px, the document can scroll to its end and the bottom navigation remains fixed without covering the final map summary. Screenshots are in `docs/screenshots/map-touch/`.
- Lint, typecheck, 197 tests, and production build pass. Unit tests cover normal completion, lost completion, cancellation/backgrounding, a remaining finger after cancellation, and a stale drag class.
- The review found that a partial `touchcancel` could reset a two-finger gesture; recovery now waits until no contacts remain, with a focused regression test.
- The installed iOS PWA could not be authenticated in Simulator because its input/clipboard bridge failed. Physical-device verification remains needed for the intermittent original report and actual home-indicator inset.


## iOS Home Screen Offline Launch Recovery

Status: ready for release; installed iOS cold launch remains unverified in Simulator

Intent:
- Make the installed iOS web app reliably open after an online preparation when the phone is in airplane mode.
- Never imply offline readiness before the standalone app has an active service worker and at least one complete usable shell. A previous complete build remains available while a new build is warming.
- Give a useful recovery screen and a clear next step if offline preparation is impossible, instead of a blank screen where the worker can handle navigation.

Observed failure:
- The operator's Home Screen app opened to a blank white view in airplane mode after the prior release. The earlier browser check was in Chromium and manually confirmed a prepared CacheStorage; it did not validate the standalone iOS installation path.

Investigation and implementation:
- Reproduce the online install/open, app restart, and airplane-mode launch with iOS Simulator or a connected WebKit device when possible. Inspect the standalone app's own worker, cache, and startup URL, not Safari's data store.
- Check worker registration, installation, activation, and the unauthenticated/authenticated shell warm path. Make warm completion observable and retry failed preparation while online; preserve the prior valid shell on errors.
- Keep the ready indication simple and separate from data sync status. Verify that login, logout, and an incomplete shell cannot expose private cached pages.
- Add focused tests for the actual failure path, run lint/typecheck/tests/build, then verify the iOS/WebKit launch and publish only after the result is concrete.

Verification:
- An authenticated local production build reported a controlled service worker and a complete cached shell without manual preparation. Chromium reopened `/points` with network emulation disabled.
- A Home Screen app on iPhone 17 Simulator opened the local production login page, but Simulator input/Web Inspector problems prevented authenticated cache inspection and cold launch. The operator reported that the real iOS PWA now opens offline after its worker activated.
- Lint, typecheck, 192 unit tests, and production build pass. `docs/screenshots/offline-shell/offline-readiness-ready.png` shows the separate offline readiness state at mobile width.


## Offline Navigation in Installed PWA

Status: verified locally

Intent:
- Make every primary tab and sync-status link work when the device has no network, including when `navigator.onLine` remains true in an installed PWA.
- Show map tiles already viewed on this device when the map is reopened without network.

Plan:
- Reproduce an offline click in a production build with a complete cached shell and unchanged online signal.
- Route app navigation through full document requests handled by the service worker, while leaving the local IndexedDB data flow intact.
- Treat a failed network request as offline even when an installed PWA reports `navigator.onLine=true`; keep an HTTP server error distinct.
- Cache only tiles requested by an actively viewed map. Reuse those tiles offline and retain normal OpenStreetMap attribution. Do not prefetch map regions.
- Verify all primary tabs, the sync page, and map tiles offline in a real browser, then run lint, typecheck, tests, and build.
- Review, publish through a squash merge, and verify deployment and public worker behavior.
- Keep the global sync indicator calm across full offline-safe navigations: avoid showing a short background check, and show connection failures in the header rather than repeating warning banners on each data screen.

Verification:
- A production browser with a prepared shell opened every primary screen through the visible navigation while offline, including with `navigator.onLine=true`.
- After viewing the map online, an offline reload with the browser HTTP cache cleared loaded all nine visible OSM tiles through the service worker. The map screenshot is in `docs/screenshots/offline-shell/`.
- Lint, typecheck, 189 unit tests, and production build pass.
- On a full online page transition, the visible header status stayed on the previous useful state throughout the short background check; the browser observed only one status label. Offline list, map, and details screens had no repeated connection banners, and the offline details screen hid its unusable manual refresh action.

## Offline App Shell After Cold Start

Status: completed locally

Intent:
- Let an operator reopen the installed PWA without network after a successful online login.
- Keep the shell and all Next.js build assets it needs together across deployments.
- Never mistake an authentication redirect for an app shell, and remove offline access after explicit logout.

Journey:
- After a successful login, the active service worker prepares the list, map, add, owners, and sync pages plus their build assets in the background.
- When offline, a cold launch at the PWA start URL opens the list from IndexedDB; main-tab navigation also works by loading cached pages.
- Online navigation checks the server first, so deploys and expired sessions take effect. A failed warm leaves the previous complete shell intact.
- Explicit logout removes the offline shell even without network. A local logout marker blocks private pages and closes other open tabs until the server logout finishes after reconnection. The service worker never stores API responses or Google Sheets data.

Implementation:
- Generate a build-specific manifest of `/_next/static/` assets after `next build`, requiring every cached page to remain statically prerendered; keep it out of Git and copy it into the runtime image with `public/`.
- Add an authenticated, atomic warm operation to the service worker. Only a complete set of HTML pages and build assets becomes an offline fallback.
- Route offline main-tab clicks through full page navigation so App Router does not require a missing RSC response. Retain normal client navigation online.
- Keep static asset caches separate from the shell; clear shell caches on logout and retain the pending logout marker across worker updates.

Verification:
- Unit tests cover install, authenticated warm, redirect rejection, failed build refresh, pending offline logout, and navigation policy without Sheets. All 181 tests pass; lint, typecheck, and production build pass.
- A local production browser with a test login saved a point to IndexedDB, then opened `/points` in a new offline tab and navigated to `/map`. After offline logout, a new offline tab received the recovery page; CacheStorage contained no shell. On reconnection, `/points` redirected to login and server logout cleared the pending marker. A separate two-tab test confirmed logout redirects both already open tabs offline.
- Mobile screenshots are in `docs/screenshots/offline-shell/`.

Tradeoff:
- Map tiles from OpenStreetMap are not bundled; the map screen can show pins without a base map while offline.
- Offline access relies on the phone's local storage until the operator explicitly logs out or clears site data.

## Safe PWA Static Cache

Status: completed

Intent:
- Keep the existing Next.js PWA registration and cache static assets that the field app actually uses.
- Prevent the service worker from storing authenticated pages, login redirects, API responses, or other private data.
- Let the browser check for a fresh worker after deploys and remove the old page cache.

Implementation:
- Restrict the worker to public app assets and previously requested `/_next/static/` files. Leave navigation and API requests to Next.js and the browser.
- Keep map pins and install icons available after they have been cached, without adding a production dependency.
- Add a worker-specific no-store response header and request fresh worker bytes during registration.

Verification:
- Mocked CacheStorage tests cover public precache, navigation/API bypass, static hits, redirected responses, bounded Next asset storage, and old-cache cleanup.
- Lint, typecheck, 175 unit tests, and production build pass. A local production server returns `no-cache, no-store` for `/sw.js` and `max-age=31536000, immutable` for Next static assets. The latter already applied in production before this change, so no online speed increase is claimed.

Tradeoff:
- Reloading a closed app with no network requires an authenticated offline shell. That is outside this static-cache change; an already open tab continues using IndexedDB offline.

## Sync Status User Journey

Status: completed in the isolated worktree; not deployed

Intent:
- Make the operator's current data state visible from every screen without exposing IDs or versions.
- Resolve routine collisions and full-table refreshes automatically while keeping old local edits recoverable.

Journey:
- Opening the app shows cached data immediately and a visible server-check state; completion shows when the table was last checked.
- Offline work shows that the app is offline and counts edits saved on the device. Reconnection retries automatically.
- A failed server check shows a clear failure and a retry action; the UI never calls cached data current merely because the queue is empty.
- A source switch or remote removal replaces stale cached rows automatically and shows a readable notice with before/after counts. Changes tied to the previous source or removed records stay on the device with full record backups, are never sent to the wrong table, and can be downloaded. The prior cache is also archived before every source switch, including one after a successful push.
- A same-field collision is resolved automatically in favor of Sheets, then a visible notice links to a readable history. Reading the notice acknowledges it without asking the operator to choose values.

Implementation:
- Keep a durable last-sync attempt state and derive a compact global status from IndexedDB, connection state, pending edits, review, and unread resolution notices.
- Mark a truly empty installation before its first offline creation, and check that marker inside the pull transaction, so a migrated unbound queue or a concurrent new edit cannot be mistaken for a safe first draft. Archive unverified old cache rows before replacing them.
- Refresh on app open, reconnect, and return to the tab; show last verified time on the sync page.
- Use one global status signal in the sticky header and a detailed state/actions page. A legacy staged review remains readable during migration, while new checks apply safe full snapshots without an approval step.

Verification:
- Focused state-priority and read/unread tests; browser checks at 320 px and seven 390 px screenshots of verified, offline, error, conflict, and source-switch states; lint, typecheck, 173 unit tests, and build passed. The browser used synthetic Sheets responses, so real Sheets access remains unverified.

Review:
- UI and server agents reviewed the journey. Their findings on first-draft identity, old-record backups, cross-source conflict matching, source-switch visibility, owner/visit removal notices, and a switch after successful push were fixed. A release review found that an earlier field collision blocked a later unrelated patch; this was fixed and tested.

## Server-Authoritative Offline Sync

Status: completed in the isolated worktree; not deployed

Intent:
- Treat the current Google Sheet as the source of truth while preserving offline reads and edits.
- Prevent a cached production queue from being sent to a different spreadsheet after a bad deploy.
- Replace technical conflict choices with automatic field-level reconciliation and understandable notices.
- Replace stale cache rows from a validated full server snapshot, including when the spreadsheet changes.

Implementation:
- Add an opaque spreadsheet source ID to full pull responses and require the same ID on push; reject mismatches before writing.
- Read a fresh Sheets snapshot for push. Compare touched field base values, merge unrelated edits, prefer the server for true same-field collisions, and retain a readable record of unapplied local intent.
- Keep IndexedDB as a complete server cache plus a source-bound offline change queue. Pull full snapshots, remove clean records absent remotely, and never drop queued changes silently.
- Automatically apply validated full snapshots; show a nonblocking replacement notice and keep old-source and removed-record changes plus full local record backups. Never cross-push them.
- Replace raw conflict IDs and version cards with source/refresh status and human-readable notices; keep normal updates automatic.
- Preserve legacy queued changes during migration and expose a local backup download when they cannot be safely attributed to the current source. A first-ever offline draft with no earlier pull is bound and sent on its first connection.
- Keep the legacy staged-review action available for devices already carrying staged state; a fresh online check clears it by applying the current validated snapshot.

Verification:
- Unit tests cover source mismatch, automatic stale row removal and source switch, legacy queue preservation and backup, explicit first-ever offline marker, cross-source conflict isolation, same/different-field merge, and blocked mutation during a legacy staged review.
- Local browser verification at 320 px showed global status and the offline queued-edit journey. No real Google Sheet was accessed.
- `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm run build` passed.

Review:
- User explicitly requested parallel sub-agents. Server and UI slices were implemented in parallel, then the UI agent reviewed integrated source-switch, offline, and review flows. Its P1/P2 findings were fixed.

## App Login Auth

Status: completed

Intent:
- Replace Caddy Basic Auth with an application login page.
- Reuse `PVZ_BASIC_AUTH_USER` and `PVZ_BASIC_AUTH_PASSWORD` as the app credentials.
- Protect private pages and API routes with a signed HttpOnly session cookie.
- Keep PWA static assets available while removing Caddy Basic Auth from deployment.

Implementation:
- Add auth helpers for credential validation, JWT signing/verification, and cookie options.
- Add login/logout API routes and a typed auth API client.
- Add Next.js `proxy.ts` request protection for private pages and API routes.
- Add a mobile-first `/login` page and a logout action in the app shell.
- Update deployment script and `.env.example` comments to stop configuring Caddy Basic Auth.

Verification:
- `pnpm test` passed.
- `pnpm run typecheck` passed.
- `pnpm run lint` passed.
- `pnpm run build` passed.
- Browser check passed: `/map` redirects to `/login?next=%2Fmap`, valid login returns to `/map`, and logout is visible.

Review:
- Dedicated review sub-agent was not used because the available multi-agent tool requires explicit user delegation.
- Local diff review caught and fixed the login API proxy exemption before completion.

## Locate Operator On Map

Status: completed

Intent:
- Change the map `Рядом` action from a marker filter into a geolocation/zoom action.
- Keep PVZ markers visible when the operator asks for their own location.
- Show the operator position on the Leaflet map and keep distance labels available.

Implementation:
- Stop using `nearby` as a map quick-filter mode in the map client.
- Keep filtering by all/no-owner/brand/status only, while still computing distances from user location.
- Pass `userLocation` into the Leaflet view and center/zoom to it when it is set.
- Render a small current-location marker on the map.

Verification:
- `pnpm vitest run src/lib/map/points.test.ts`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`

## Unified PVZ Drawer

Status: completed

Intent:
- Make `PointActionDialogs` the single PVZ details/edit drawer for list and map.
- Keep list drawer behavior canonical and avoid duplicating card-level actions inside list details.
- Preserve map-only details context such as route and distance.

Implementation:
- Add optional route, distance, and visible-action controls to the shared point action drawer.
- Let `PointDetailsContent` render route/owner/note/edit actions from explicit visibility flags.
- Replace the map-local details drawer, delete dialog, and status mutation state with `PointActionDialogs`.
- Add focused tests for default hidden actions, map-visible actions, edit patching, and soft-delete.

Verification:
- `pnpm vitest run src/components/points/PointActionDialogs.test.tsx`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `pnpm run build`

## Mobile Map Page Zoom Trap

Status: completed

Intent:
- Stop mobile browsers from auto-zooming the whole page when the operator uses map filters.
- Keep Leaflet map pinch/drag behavior unchanged.
- Avoid trapping users at an enlarged page scale.

Root cause:
- The map filter native `select` controls inherit a `13px` font size. Mobile Safari auto-zooms the page when focusing form controls below 16px.
- The global viewport sets `maximumScale: 1`, which can prevent the operator from manually shrinking the page after a browser zoom.

Implementation:
- Remove the `maximumScale` viewport cap from `src/app/layout.tsx`.
- Set map/list filter native selects to at least `16px` in `src/app/globals.css`.
- Add a focused CSS test so filter selects do not regress below the mobile-safe font size.

Verification:
- `pnpm vitest run src/lib/map/mobile-zoom-css.test.ts`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`
- `pnpm test`

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

## Persist Resolved Conflicts To Sheets

Status: completed

Intent:
- Ensure resolving a conflict on `/sync` updates the corresponding `conflicts` sheet row with `resolved_at` and `resolution`.
- Keep resolution local-first: UI still updates IndexedDB first, then sync pushes the resolved conflict metadata through the server route.
- Handle the case where accepting the remote value clears the only pending change, so sync still has something to push.

Implementation:
- Extend the sync push request with locally resolved conflicts.
- Make the sync engine push when either changes or resolved conflicts are pending.
- Update the server push route to upsert newer resolved conflict rows instead of only appending newly created conflicts.
- Add focused tests for resolved-conflict push behavior.

Verification:
- `pnpm test` passed.
- `pnpm run typecheck` passed.
- `pnpm run build` passed.
- `pnpm run lint` is blocked by an existing `react-hooks/set-state-in-effect` error in `src/components/map/LeafletMapClient.tsx:142`.

## Cross-Device Conflict Resolution

Status: completed

Intent:
- Make identical conflicts resolve across devices, even when they were created independently.
- Avoid random conflict IDs for future identical conflicts.
- Keep conflict resolution side effects intact on the second device: accepting remote clears the matching local patch, accepting local retries it from the remote version.

Implementation:
- Generate deterministic conflict IDs on the server from conflict identity.
- Add logical conflict matching for pulled resolved conflicts.
- Apply pulled resolution choices to matching unresolved local conflicts during pull.
- Cover deterministic IDs and cross-device duplicate resolution with focused tests.

Verification:
- `pnpm test` passed.
- `pnpm run typecheck` passed.
- `pnpm run build` passed.
- `pnpm run lint` is blocked by the existing `react-hooks/set-state-in-effect` error in `src/components/map/LeafletMapClient.tsx:142`.

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

## Canonical shadcn Drawer Migration

Status: completed

Intent:
- Use shadcn/Vaul drawer composition from documentation: header, scroll body, footer outside scroll.
- Remove Vaul-breaking CSS overrides (`height: fit-content`, hidden `::after`).
- Share layout via `DrawerShell`; remount scroll body with `key={action}` without remounting `Drawer` root.
- Close PVZ drawer before delete `AlertDialog`; raise alert z-index above drawer overlays.

Implementation:
- Sync `src/components/ui/drawer.tsx` from shadcn registry.
- Add `src/components/ui/drawer-shell.tsx` with `DrawerScrollBody` and `DrawerShell`.
- Refactor `PointActionDialogs`, `PointDetailsContent`, `OwnersClient`.
- Remove `.point-drawer-content` hacks from `globals.css`; keep product content styles only.
- Form footers via `form` attribute + `DrawerClose`; `handleOnly` on owner/edit drawers.

Mobile QA checklist:
- List: details → edit → cancel / swipe dismiss.
- Map: details → route / assign owner.
- Edit: brand/owner Select not clipped.
- Owner: picker scroll vs drawer dismiss (`handleOnly`).
- Delete: confirm without double overlay.

Verification:
- `pnpm vitest run src/components/points/PointActionDialogs.test.tsx src/components/ui/drawer-shell.test.tsx`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
