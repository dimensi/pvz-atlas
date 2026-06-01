"use client";

import type { Owner, Point, Visit } from "@/lib/data-model/types";
import {
  createOwner,
  createPoint,
  markPointVisited,
  updateOwnerPatch,
  updatePointPatch,
  updateVisitPatch,
  type CreateOwnerInput,
  type CreatePointInput,
  type MarkPointVisitedInput
} from "@/lib/indexeddb/repositories";

type PointLocalPatch = Parameters<typeof updatePointPatch>[1];
type OwnerLocalPatch = Parameters<typeof updateOwnerPatch>[1];
type VisitLocalPatch = Parameters<typeof updateVisitPatch>[1];

export function createPointLocal(input: CreatePointInput): Promise<Point> {
  return createPoint(input);
}

export function updatePointLocal(pointId: string, patch: PointLocalPatch): Promise<Point> {
  return updatePointPatch(pointId, patch);
}

export function createOwnerLocal(input: CreateOwnerInput): Promise<Owner> {
  return createOwner(input);
}

export function updateOwnerLocal(ownerId: string, patch: OwnerLocalPatch): Promise<Owner> {
  return updateOwnerPatch(ownerId, patch);
}

export function addVisitLocal(input: MarkPointVisitedInput): Promise<Visit> {
  return markPointVisited(input);
}

export function removeVisitLocal(visitId: string): Promise<Visit> {
  return updateVisitPatch(visitId, { deletedAt: new Date().toISOString() } satisfies VisitLocalPatch);
}
