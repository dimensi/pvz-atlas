Google Sheets adapters live here.

Rules:
- server-side only;
- validate rows before returning them to sync logic;
- never use row numbers as stable IDs;
- treat row numbers as temporary adapter metadata only.

Expected sheets and columns:

- `points`: `id`, `source_key`, `brand`, `city`, `address`, `normalized_city`, `normalized_address`, `owner_id`, `status`, `lat`, `lon`, `comment`, `created_at`, `updated_at`, `deleted_at`, `version`
- `owners`: `id`, `name`, `phone`, `telegram`, `comment`, `created_at`, `updated_at`, `deleted_at`, `version`
- `visits`: `id`, `point_id`, `visited_at`, `status`, `comment`, `created_at`, `updated_at`, `deleted_at`, `version`
- `changes_log`: `id`, `entity_name`, `entity_id`, `operation`, `base_version`, `client_id`, `patch`, `synced_at`, `created_at`, `updated_at`, `deleted_at`, `version`
- `conflicts`: `id`, `entity_name`, `entity_id`, `field`, `local_value`, `remote_value`, `base_version`, `remote_version`, `resolved_at`, `resolution`, `created_at`, `updated_at`, `deleted_at`, `version`
