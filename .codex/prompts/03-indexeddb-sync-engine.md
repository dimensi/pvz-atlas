Implement the client-side local-first storage and change queue.

Use AGENTS.md and the pvz-sync-engine skill.

Goal:
Make IndexedDB the source of truth for the UI and queue local changes for sync.

Requirements:
- Use Dexie.
- Tables: points, owners, visits, changes, conflicts, meta.
- Add repository functions for points/owners/visits.
- Mutations must write local record and enqueue a Change in one transaction where possible.
- Add helpers:
  - createPoint
  - updatePointPatch
  - assignOwnerToPoint
  - markPointVisited
  - createOwner
  - enqueueChange
  - getPendingChanges
  - markChangesApplied
- Add unit tests for pure change creation and patch logic.
- UI should not call Google Sheets directly.

Explain offline behavior in the final summary.
