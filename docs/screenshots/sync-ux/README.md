# Sync UX screenshots

Captured at a 390 × 844 mobile viewport from the production Next.js build with a synthetic Google Sheets API response. All PVZ names, addresses, edits, and spreadsheet sources are test data. These screenshots do not contain production contacts or notes.

| File | Case |
| --- | --- |
| `01-verified.png` | Table checked successfully, no pending edits, last check time visible. |
| `02-offline-with-edit.png` | Offline with one edit saved on the device; retry is disabled until reconnect. |
| `03-error.png` | Server check failed; cached data and the pending edit remain available. |
| `04-conflict-notice.png` | A same-field edit was resolved automatically; the global header links to its explanation. |
| `05-conflict-history.png` | Human-readable explanation of the edit the table did not accept, without IDs or a choice between versions. |
| `06-source-switch.png` | A different table replaced the old cache automatically; before/after counts and the old-data backup are visible. |
| `07-new-table-list.png` | The list shows only the new table's test point after that switch. |

The screenshots verify the interface journey. Sync algorithms and source isolation are covered by the unit tests; a live Google Sheet was not used for these images.
