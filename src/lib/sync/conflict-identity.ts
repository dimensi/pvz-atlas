import type { Conflict } from "@/lib/data-model/types";

type ConflictIdentity = Pick<
  Conflict,
  | "entityName"
  | "entityId"
  | "field"
  | "localValue"
  | "remoteValue"
  | "baseVersion"
  | "remoteVersion"
>;

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeValue(child)])
    );
  }

  return value;
}

function valueKey(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  return JSON.stringify(normalizeValue(value));
}

export function conflictIdentityKey(conflict: ConflictIdentity): string {
  return [
    conflict.entityName,
    conflict.entityId,
    conflict.field,
    String(conflict.baseVersion),
    String(conflict.remoteVersion),
    valueKey(conflict.localValue),
    valueKey(conflict.remoteValue)
  ].join("\u001f");
}

export function conflictsHaveSameIdentity(left: Conflict, right: Conflict): boolean {
  return conflictIdentityKey(left) === conflictIdentityKey(right);
}

export function deterministicConflictId(conflict: ConflictIdentity): string {
  let hash = 2166136261;
  const key = conflictIdentityKey(conflict);

  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `conflict_${(hash >>> 0).toString(36)}`;
}
