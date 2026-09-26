import { logout } from "@/lib/api/auth-api";

export const shellCachePrefix = "pvz-atlas-shell-";
const mapTileCacheNames = new Set(["pvz-atlas-map-tiles-v1", "pvz-atlas-map-tiles-meta-v1"]);
const authCacheName = "pvz-atlas-auth-state";
const logoutMarkerUrl = "/__pvz_logout_pending__";
export const localLogoutCookieName = "pvz_local_logout";
export const localLogoutNoticeKey = "pvz-atlas-logout-notice";

function setLocalLogoutCookie(pending: boolean): void {
  document.cookie = `${localLogoutCookieName}=${pending ? "1; Max-Age=2592000" : "; Max-Age=0"}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

export function hasPendingLogout(): boolean {
  return document.cookie.split("; ").some((part) => part === `${localLogoutCookieName}=1`);
}

export async function beginLocalLogout(): Promise<void> {
  setLocalLogoutCookie(true);
  try {
    localStorage.setItem(localLogoutNoticeKey, String(Date.now()));
  } catch {
    // Focus and pageshow checks still close other tabs if storage is unavailable.
  }
  try {
    if ("caches" in window) {
      const cache = await caches.open(authCacheName);
      await cache.put(logoutMarkerUrl, new Response("pending"));
    }
  } finally {
    await clearOfflineShell();
  }
}

let pendingLogoutPromise: Promise<void> | null = null;

export function finishPendingLogout(): Promise<void> {
  if (!hasPendingLogout()) return Promise.resolve();
  if (!pendingLogoutPromise) {
    pendingLogoutPromise = logout()
      .then(async () => {
        if ("caches" in window) {
          const cache = await caches.open(authCacheName);
          await cache.delete(logoutMarkerUrl);
        }
        setLocalLogoutCookie(false);
      })
      .finally(() => {
        pendingLogoutPromise = null;
      });
  }
  return pendingLogoutPromise;
}

export async function clearOfflineShell(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;

  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const worker = registration?.active;
      if (worker) {
        await new Promise<void>((resolve) => {
          const channel = new MessageChannel();
          const finish = () => {
            window.clearTimeout(timeout);
            channel.port1.close();
            resolve();
          };
          const timeout = window.setTimeout(finish, 1500);
          channel.port1.onmessage = finish;
          worker.postMessage({ type: "CLEAR_OFFLINE_SHELL" }, [channel.port2]);
        });
      }
    } catch {
      // CacheStorage cleanup below still runs if the worker is unavailable.
    }
  }

  const names = await caches.keys();
  await Promise.all(
    names.filter((name) => name.startsWith(shellCachePrefix) || mapTileCacheNames.has(name))
      .map((name) => caches.delete(name))
  );
}
