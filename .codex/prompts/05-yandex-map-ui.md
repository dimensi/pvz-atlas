Implement the Yandex map screen for PVZ Organizer.

Use AGENTS.md, pvz-yandex-maps, and pvz-mobile-ui.

Goal:
Create a mobile-first map view that shows PVZ points from IndexedDB and opens Yandex Maps routes.

Requirements:
- Load points from local IndexedDB/state, not directly from server.
- Display markers for points with coordinates.
- Handle points without coordinates separately.
- Marker tap opens a bottom sheet with address, brand, owner/status, and actions.
- Add route action using Yandex Maps web deeplink fallback.
- Add filters: all, no owner, nearby if location permission is available, status, brand.
- Handle Yandex Maps script load failure.
- Keep Yandex API key in env; do not hardcode secrets.

Add tests for deeplink helper and marker filtering helpers.
