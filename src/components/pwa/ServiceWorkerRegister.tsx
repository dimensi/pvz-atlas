"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function ServiceWorkerRegister() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
        // Installability should not block app use if registration fails.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  useEffect(() => {
    if (
      pathname === "/login" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }

    const warm = () => {
      navigator.serviceWorker.ready.then((registration) => {
        registration.active?.postMessage({ type: "WARM_OFFLINE_SHELL" });
      }).catch(() => {
        // The app remains usable if the offline shell cannot be prepared.
      });
    };

    warm();
    window.addEventListener("online", warm);
    return () => window.removeEventListener("online", warm);
  }, [pathname]);

  return null;
}
