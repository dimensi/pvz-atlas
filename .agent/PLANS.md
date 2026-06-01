# ExecPlans for PVZ Organizer

Use an ExecPlan for multi-step work, sync changes, storage changes, map integration, import pipeline work, or risky refactors.

An ExecPlan is a living implementation document. It must be understandable without prior conversation context.

## Required sections

### Goal
State the user-facing outcome.

### Current repo state
Summarize relevant files, commands, and existing behavior after inspecting the repo.

### Data and API impact
List affected entities, fields, endpoints, sheets, and sync logic.

### Approach
Describe the implementation path in concrete steps.

### Conflict and offline behavior
For any data mutation, explain:
- what happens offline;
- what enters the local change queue;
- how push applies the change;
- how conflicts are detected;
- what happens if Google Sheets was edited manually.

### UI behavior
Describe mobile UI states, loading states, empty states, error states, and sync indicators.

### Tests
List unit/integration/manual tests that will prove the feature works.

### Risks
List likely breakage points and mitigations.

### Rollback
Explain how to revert or disable the change safely.

### Progress
Maintain a checklist while implementing.

## Rules

- Do not edit code before the first version of the plan exists.
- Update the plan when implementation discovers new facts.
- Keep implementation aligned with the plan or update the plan first.
- Prefer small commits/patches with verifiable checkpoints.
