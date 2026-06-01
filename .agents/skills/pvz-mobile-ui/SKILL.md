---
name: pvz-mobile-ui
description: Use for mobile-first UI, PVZ list, owner grouping, bottom navigation, forms, sync indicators, and field-visit workflows.
---

Design for a person walking between PVZ locations with a phone.

UI rules:
- Mobile first; desktop can be functional but secondary.
- Use large tap targets.
- Keep primary actions visible.
- Avoid dense tables in the main mobile UI.
- Prefer cards, bottom sheets, and sticky actions.
- Every mutation should feel instant because it writes to IndexedDB first.
- Sync state should be visible but not intrusive.

Main navigation:
- List
- Map
- Add
- Sync

List behavior:
- Group PVZ without owner first.
- Then group by owner.
- Show count per group.
- Provide filters: no owner, nearby, brand, status.
- Provide search by address/owner/comment.

PVZ card actions:
- Open route in Yandex Maps.
- Assign owner.
- Create owner.
- Mark visited.
- Change status.
- Add note.

Add form:
- Brand.
- City.
- Address.
- Optional comment.
- Optional owner.
- Geocode action.
- Save offline if needed.
