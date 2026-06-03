# ExecPlans

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
