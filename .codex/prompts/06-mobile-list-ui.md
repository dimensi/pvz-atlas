Implement the mobile-first PVZ list and owner grouping UI.

Use AGENTS.md and pvz-mobile-ui.

Goal:
Create a field-friendly list screen for managing PVZ owner assignments and visit statuses.

Requirements:
- Group points without owner first.
- Then group by owner.
- Show count per group.
- Search by address, owner label/name, brand, status, comment.
- Fast filters: no owner, brand, status.
- Point card actions:
  - route
  - assign owner
  - create owner
  - mark visited
  - edit status
  - add comment
- Mutations must go through local IndexedDB repository functions and enqueue changes.
- Show sync indicator: synced, pending, conflict, offline.
- Design for narrow phone screens.

Add tests for grouping/filtering pure functions.
