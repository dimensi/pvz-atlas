Implement the core data model and Google Sheets schema mapping.

Use AGENTS.md and the pvz-sheets-adapter skill.

Goal:
Create strict TypeScript types, Zod schemas, and conversion helpers between app models and Google Sheets rows.

Entities:
- Point
- Owner
- Visit
- Change
- Conflict

Requirements:
- App fields use camelCase.
- Sheets columns use snake_case.
- Every syncable record has id, createdAt, updatedAt, deletedAt, version.
- Add column definitions for sheets: points, owners, visits, changes_log, conflicts.
- Add row parse/serialize helpers.
- Add tests for parsing, serialization, missing required fields, and invalid versions.

Do not implement real Google API calls in this task unless they already exist.
