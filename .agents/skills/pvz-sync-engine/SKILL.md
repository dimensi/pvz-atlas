---
name: pvz-sync-engine
description: Use for local-first IndexedDB sync, change queues, Google Sheets sync, conflict detection, versioning, offline behavior, or data merge logic.
---

Build sync as patch-based local-first synchronization.

Core rules:
- UI writes to IndexedDB first.
- Every mutation creates a `Change` record.
- Sync order is pull -> push -> pull.
- Push sends patches and `baseVersion`.
- Server applies patches only after checking remote `version`.
- Never overwrite an entire row unless creating a new record.
- Never drop local changes silently.
- Treat Google Sheets manual edits as legitimate remote changes.

Change shape:

```ts
type Change = {
  id: string
  entity: 'point' | 'owner' | 'visit'
  entityId: string
  op: 'create' | 'update' | 'delete'
  patch: Record<string, unknown>
  baseVersion: number
  createdAt: string
  clientId: string
}
```

Conflict handling:
- If remote version equals baseVersion, apply patch.
- If remote changed but touched different fields, merge.
- If same field changed locally and remotely, create a `Conflict`.
- Make conflict state visible in the Sync tab.

Testing expectations:
- Unit test patch application.
- Unit test version mismatch.
- Unit test field-level merge.
- Unit test same-field conflict.
- Unit test delete vs update behavior.
