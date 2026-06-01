You are building the initial MVP scaffold for PVZ Organizer.

Use the repository instructions in AGENTS.md. If the repo is empty, create a Next.js App Router TypeScript project structure for a mobile-first PWA.

Goal:
Create the first working skeleton with data model types, route placeholders, IndexedDB setup, and basic mobile navigation.

Requirements:
- Next.js App Router.
- TypeScript.
- Mobile-first layout.
- Bottom navigation tabs: List, Map, Add, Sync.
- Define domain types: Point, Owner, Visit, Change, Conflict.
- Add Dexie setup for IndexedDB.
- Add placeholder API routes:
  - GET /api/sync/pull
  - POST /api/sync/push
  - POST /api/geocode
  - POST /api/import/points
- Add `.env.example` with required env var names, but no secrets.
- Add minimal tests for pure helper functions if test tooling exists; otherwise add a test setup proposal.

Before editing:
- Inspect the repo.
- Create an ExecPlan using `.agent/PLANS.md` because this is initial architecture work.

After editing:
- Run lint/typecheck/build commands available in package.json.
- Summarize files changed and next step.
