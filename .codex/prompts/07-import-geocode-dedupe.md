Implement the import pipeline for PVZ addresses.

Use AGENTS.md and pvz-import-pipeline.

Goal:
Import CSV/JSON points safely into the app/Sheets without creating duplicates or overwriting human field-work data.

Requirements:
- Parse CSV/JSON input.
- Normalize brand, city, address.
- Generate stable sourceKey from brand + normalized city + normalized address.
- Deduplicate incoming rows.
- Compare with existing points.
- Preview result categories: new, duplicate, update, invalid.
- Do not overwrite ownerId/status/comment/contact-like fields from existing points.
- Geocode only missing coordinates and only through server-side geocode adapter.
- Add POST /api/import/points preview/apply flow if API exists.
- Add tests for normalization, sourceKey, dedupe, and safe update behavior.
