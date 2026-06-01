Focus only on sync conflict tests and edge cases.

Use AGENTS.md, pvz-sync-engine, and pvz-test-review.

Goal:
Make sync behavior safe and explicit.

Add or improve tests for:
- create new local record;
- update with unchanged remote version;
- update with remote version changed but different fields;
- update with same field changed locally and remotely;
- delete local while remote updated;
- remote deleted while local updated;
- manual Google Sheets edit changing status;
- local owner assignment while remote comment changed;
- repeated push retry does not duplicate changes;
- repeated import does not duplicate points.

Do not change product behavior unless tests expose a real bug. If you change behavior, document it.
