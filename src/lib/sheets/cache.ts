import "server-only";

import { readSheetsSnapshot, type SheetsSnapshot } from "./adapter";

const defaultTtlMs = 30_000;

let cachedSnapshot: { value: SheetsSnapshot; expiresAt: number } | null = null;

export async function getSheetsSnapshot(options: { ttlMs?: number } = {}): Promise<SheetsSnapshot> {
  const ttlMs = options.ttlMs ?? defaultTtlMs;
  if (cachedSnapshot && cachedSnapshot.expiresAt > Date.now()) {
    return cachedSnapshot.value;
  }

  const value = await readSheetsSnapshot();
  cachedSnapshot = {
    value,
    expiresAt: Date.now() + ttlMs
  };

  return value;
}

export function invalidateSheetsSnapshot(): void {
  cachedSnapshot = null;
}
