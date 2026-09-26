"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getOfflineReadiness, setOfflineReadiness } from "@/lib/pwa/offline-readiness";

const WORKER_TIMEOUT_MS = 15000;

function workerMessage(worker: ServiceWorker, type: string): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let finished = false;
    const finish = (ready: boolean) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(ready);
    };
    const timer = window.setTimeout(() => finish(false), WORKER_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<{ ready?: boolean }>) => {
      finish(event.data?.ready === true);
    };
    try {
      worker.postMessage({ type }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}

export function ServiceWorkerRegister() {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || isLoginPage) return;
    if (!("serviceWorker" in navigator)) {
      setOfflineReadiness("unavailable");
      return;
    }

    const serviceWorker = navigator.serviceWorker;
    let cancelled = false;
    let running = false;
    let retryRequested = false;
    let retryTimer: number | undefined;

    const scheduleRetry = () => {
      if (!navigator.onLine) return;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => void prepare(), 30000);
    };

    const prepare = async () => {
      if (cancelled || running) return;
      running = true;
      if (getOfflineReadiness() !== "ready") setOfflineReadiness("preparing");
      try {
        // Register on each attempt. A failed first installation must recover
        // after connectivity returns without requiring an app restart.
        let registration: ServiceWorkerRegistration | undefined = serviceWorker.controller
          ? await serviceWorker.getRegistration().catch(() => undefined)
          : undefined;
        let registrationTimeout: number | undefined;
        if (registration) {
          if (navigator.onLine) {
            void serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
          }
        } else {
          try {
            registration = await Promise.race([
              serviceWorker.register("/sw.js", { updateViaCache: "none" }),
              new Promise<undefined>((resolve) => {
                registrationTimeout = window.setTimeout(() => resolve(undefined), WORKER_TIMEOUT_MS);
              })
            ]);
          } catch {
            registration = await serviceWorker.getRegistration();
          } finally {
            if (registrationTimeout !== undefined) window.clearTimeout(registrationTimeout);
          }
        }
        if (!registration) registration = await serviceWorker.getRegistration();
        if (!registration) throw new Error("Service worker registration is unavailable.");

        let timeout: number | undefined;
        const activeRegistration = await Promise.race([
          serviceWorker.ready,
          new Promise<null>((resolve) => {
            timeout = window.setTimeout(() => resolve(null), WORKER_TIMEOUT_MS);
          })
        ]);
        if (timeout !== undefined) window.clearTimeout(timeout);
        if (cancelled) return;
        const worker = serviceWorker.controller ?? activeRegistration?.active;
        const ready = worker
          ? await workerMessage(worker, navigator.onLine ? "WARM_OFFLINE_SHELL" : "CHECK_OFFLINE_SHELL")
          : false;
        if (cancelled) return;
        const usable = ready && Boolean(serviceWorker.controller);
        setOfflineReadiness(usable ? "ready" : "unavailable");
        if (!usable) scheduleRetry();
      } catch {
        if (!cancelled) {
          setOfflineReadiness("unavailable");
          scheduleRetry();
        }
      } finally {
        running = false;
        if (retryRequested && !cancelled) {
          retryRequested = false;
          void prepare();
        }
      }
    };

    const retry = () => {
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (running) {
        retryRequested = true;
        return;
      }
      void prepare();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine && getOfflineReadiness() !== "ready") retry();
    };

    void prepare();
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVisible);
    serviceWorker.addEventListener("controllerchange", retry);
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisible);
      serviceWorker.removeEventListener("controllerchange", retry);
    };
  }, [isLoginPage]);

  return null;
}
