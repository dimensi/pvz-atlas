export type OfflineReadiness = "unknown" | "preparing" | "ready" | "unavailable";

let current: OfflineReadiness = "unknown";
const listeners = new Set<() => void>();

export function getOfflineReadiness(): OfflineReadiness {
  return current;
}

export function subscribeOfflineReadiness(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setOfflineReadiness(next: OfflineReadiness): void {
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}
