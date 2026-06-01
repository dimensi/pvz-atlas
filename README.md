# PVZ Organizer Codex Starter Pack

This pack contains repository-level Codex guidance, reusable skills, and task prompts for building a mobile-first Next.js PWA for PVZ field visits.

## How to use

1. Copy these files into the repository root.
2. Open the repository in Codex CLI, IDE extension, app, or web.
3. Start with `.codex/prompts/00-bootstrap.md`.
4. For large tasks, tell Codex: `Use an ExecPlan before editing code.`

## Intended architecture

- Next.js App Router
- TypeScript
- Mobile-first PWA
- Yandex Maps for map UI
- Yandex Maps deeplinks for routes
- IndexedDB/Dexie for local-first storage
- Next.js API routes as the small backend
- Google Sheets as editable remote storage
- Patch-based sync with record versions and conflict handling
