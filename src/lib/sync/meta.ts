import type { PullResponse } from "@/lib/api/types";
import type { Owner, Point, Visit } from "@/lib/data-model/types";

export const SYNC_SOURCE_META_KEY = "syncSourceId";
export const STAGED_SNAPSHOT_META_KEY = "stagedServerSnapshot";
export const SYNC_RUN_META_KEY = "syncRunState";
export const SEEN_SYNC_NOTICES_META_KEY = "seenSyncNotices";
export const PREVIOUS_DATA_BACKUPS_META_KEY = "previousDataBackups";
export const FIRST_OFFLINE_DRAFT_META_KEY = "firstOfflineDraft";
export const HELD_RECORDS_BACKUP_META_KEY = "heldRecordsBackup";
export const CACHE_REPLACEMENT_NOTICE_META_KEY = "cacheReplacementNotice";

export interface CacheReplacementNotice {
  kind: "source-changed" | "records-removed";
  at: string;
  beforePoints: number;
  afterPoints: number;
  removedPoints: number;
  removedOwners: number;
  removedVisits: number;
}

export interface HeldRecordBackup {
  sourceId: string | null;
  entityName: "point" | "owner" | "visit";
  entityId: string;
  savedAt: string;
  record: Point | Owner | Visit;
}

export interface PreviousDataBackup {
  savedAt: string;
  sourceId: string | null;
  points: Point[];
  owners: Owner[];
  visits: Visit[];
}

export interface SyncRunState {
  state: "checking" | "ok" | "review" | "error";
  at: string;
}

export interface SeenSyncNotices {
  sourceId: string;
  through: string;
}

export interface SyncReview {
  kind: "source-changed" | "source-unverified" | "records-removed";
  beforePoints: number;
  afterPoints: number;
  removedPoints: number;
  removedOwners: number;
  removedVisits: number;
  pendingChanges: number;
}

export interface StagedSnapshot {
  response: PullResponse;
  review: SyncReview;
}
