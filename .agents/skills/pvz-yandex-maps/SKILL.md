---
name: pvz-yandex-maps
description: Use for Yandex Maps JS API, map markers, routes via deeplinks, geocoding, coordinates, and map-related mobile UI.
---

Use Yandex Maps for map display and deeplinks for route navigation.

Rules:
- Do not implement in-app route planning in the MVP.
- Open Yandex Maps route links from PVZ cards and marker bottom sheets.
- Store `lat` and `lon` in the Point model.
- Do not geocode on every render.
- Geocoding should be server-side and explicit.
- Map markers should be color/status differentiated in a maintainable way.
- Marker tap opens a mobile bottom sheet with actions.

Deeplink helper should support web fallback:

```ts
export function getYandexRouteUrl(lat: number, lon: number) {
  return `https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=auto`
}
```

When adding map code:
- lazy-load map scripts where possible;
- handle missing coordinates;
- handle map load errors;
- keep map state independent from sync state;
- avoid expensive rerenders with many points.
