# Offline shell browser cases

Captured at 390 × 844 in a local production build with a test login and no Google Sheets connection.

| Screenshot | Case |
| --- | --- |
| `offline-cold-open.png` | A new tab opens `/points` with network emulation disabled and shows a locally saved test point from IndexedDB. The offline status includes one unsent edit. |
| `offline-after-logout.png` | After an offline logout deletes the shell cache and marks logout pending, a new offline tab receives the recovery page instead of the saved app. |
| `offline-map-tiles.png` | The map reopens offline with previously viewed OpenStreetMap tiles and a point from IndexedDB, after the browser's HTTP cache is cleared. |
| `offline-sync-status.png` | The header gives the compact offline status; the details screen explains the saved edit and waits for reconnection without repeating warnings on every page. |

After reconnection, a visit to `/points` redirected to login and the pending server logout completed. The old session could not reopen the local data.
With two tabs already open offline, logging out in one immediately redirected both to the recovery page.

The map tab was also opened from the offline list. Only tiles actually viewed online are available offline; no area is downloaded in advance.
