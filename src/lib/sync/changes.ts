import type {
  Change,
  ChangeOperation,
  Owner,
  Point,
  SyncEntityName,
  Visit
} from "@/lib/data-model/types";

type SyncableEntityName = Exclude<SyncEntityName, "change" | "conflict">;
type SyncableEntity = Point | Owner | Visit;

export type Clock = () => string;
export type IdFactory = () => string;

export interface CreateChangeInput {
  entityName: SyncableEntityName;
  entityId: string;
  operation: ChangeOperation;
  patch: Record<string, unknown>;
  baseVersion: number;
  clientId: string;
  sourceId?: string;
  baseValues?: Record<string, unknown>;
}

export function createChangeRecord(
  input: CreateChangeInput,
  options: {
    idFactory: IdFactory;
    clock: Clock;
  }
): Change {
  const now = options.clock();

  return {
    id: options.idFactory(),
    entityName: input.entityName,
    entityId: input.entityId,
    operation: input.operation,
    baseVersion: input.baseVersion,
    clientId: input.clientId,
    patch: input.patch,
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.baseValues ? { baseValues: input.baseValues } : {}),
    syncedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1
  };
}

export function createEntityPatch<TEntity extends object>(
  current: TEntity,
  patch: Partial<TEntity>
): Partial<TEntity> {
  return Object.fromEntries(
    Object.entries(patch).filter(
      ([key, value]) =>
        value !== undefined &&
        !Object.is((current as Record<string, unknown>)[key], value)
    )
  ) as Partial<TEntity>;
}

export function baseValuesForPatch<TEntity extends object>(
  current: TEntity,
  patch: Partial<TEntity>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(patch).map((key) => [key, (current as Record<string, unknown>)[key]])
  );
}

export function assertNonEmptyPatch(patch: Record<string, unknown>): void {
  if (Object.keys(patch).length === 0) {
    throw new Error("Patch must include at least one changed field.");
  }
}

export function applyEntityPatch<TEntity extends SyncableEntity>(
  current: TEntity,
  patch: Partial<Omit<TEntity, "id" | "createdAt" | "version">>,
  now: string
): TEntity {
  return {
    ...current,
    ...patch,
    updatedAt: now,
    version: current.version + 1
  };
}

export function markChangeRecordsApplied(changes: Change[], syncedAt: string): Change[] {
  return changes.map((change) => ({
    ...change,
    syncedAt,
    updatedAt: syncedAt,
    version: change.version + 1
  }));
}
