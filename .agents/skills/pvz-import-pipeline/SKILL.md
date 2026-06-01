---
name: pvz-import-pipeline
description: Use for importing PVZ addresses from CSV/JSON, address normalization, deduplication, source keys, geocoding, and batch upload to Google Sheets.
---

Imports must be idempotent and reviewable.

Pipeline:
1. Parse CSV/JSON.
2. Normalize brand, city, address.
3. Generate stable sourceKey.
4. Deduplicate incoming rows.
5. Compare against existing points by sourceKey and normalized address.
6. Geocode missing coordinates only when needed.
7. Create a preview: new, update, duplicate, invalid.
8. Write only after explicit confirmation in the task or through a dedicated endpoint.

Rules:
- Preserve raw address/source fields if useful for debugging.
- Do not create duplicates on repeated import.
- Do not overwrite owner/status/comment from field work during import.
- Imports may update coordinates/source metadata but should not erase human-collected data.

Testing:
- normalization tests;
- sourceKey stability tests;
- duplicate detection tests;
- import preview tests;
- safe update tests.
