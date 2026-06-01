---
name: pvz-test-review
description: Use for reviewing implementation quality, writing tests, validating sync edge cases, checking mobile workflows, and preparing final verification notes.
---

Review against the PVZ Organizer MVP constraints.

Check:
- TypeScript strictness.
- No browser-side secrets.
- No direct browser Google Sheets writes.
- Local-first behavior preserved.
- Mutations enqueue changes.
- Push uses patches and baseVersion.
- Google Sheets row numbers are not stable IDs.
- UI works on narrow mobile screens.
- Empty/error/offline states exist.
- API inputs are validated.
- Integration code is behind adapters.

For sync features, require tests for:
- create;
- update;
- delete;
- version mismatch;
- field-level merge;
- same-field conflict;
- remote manual edit;
- offline queued changes.

Final response should include:
- what changed;
- how it was verified;
- known limitations;
- next recommended task.
