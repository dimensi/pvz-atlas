"use client";

import { useEffect, type ReactNode } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ListTodo, LogOut, Map, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { beginLocalLogout, finishPendingLogout, hasPendingLogout, localLogoutNoticeKey } from "@/lib/pwa/offline-shell";
import { OfflineAwareLink } from "@/components/pwa/OfflineAwareLink";
import { SyncReviewBanner } from "@/components/sync/SyncReviewBanner";
import { SyncOverviewProvider } from "@/components/sync/SyncOverviewProvider";
import { SyncStatusPill } from "@/components/sync/SyncStatusPill";
import { SyncReplacementNotice } from "@/components/sync/SyncReplacementNotice";

const tabs = [
  { href: "/points", label: "Список", icon: ListTodo },
  { href: "/map", label: "Карта", icon: Map },
  { href: "/add", label: "Добавить", icon: Plus },
  { href: "/owners", label: "Владельцы", icon: Users }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (isLoginPage) return;
    const redirectIfLoggedOut = () => {
      if (hasPendingLogout()) window.location.replace("/login");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === localLogoutNoticeKey) redirectIfLoggedOut();
    };
    redirectIfLoggedOut();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", redirectIfLoggedOut);
    window.addEventListener("pageshow", redirectIfLoggedOut);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", redirectIfLoggedOut);
      window.removeEventListener("pageshow", redirectIfLoggedOut);
    };
  }, [isLoginPage]);

  async function handleLogout() {
    try {
      await beginLocalLogout();
    } catch {
      // The local logout cookie still blocks private pages if CacheStorage fails.
    }
    await finishPendingLogout().catch(() => undefined);
    window.location.replace("/login");
  }

  if (isLoginPage) {
    return <div className="auth-shell">{children}</div>;
  }

  return (
    <SyncOverviewProvider>
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-lockup">
          <Image
            alt=""
            aria-hidden="true"
            className="brand-logo"
            height="44"
            priority
            src="/brand/logo.png"
            unoptimized
            width="44"
          />
          <div className="brand-copy">
            <p className="eyebrow">ПВЗ Органайзер</p>
            <h1>Полевой обход</h1>
          </div>
        </div>
        <div className="top-bar-actions">
          <SyncStatusPill />
          <Button aria-label="Выйти" onClick={handleLogout} size="icon-sm" type="button" variant="ghost">
            <LogOut />
          </Button>
        </div>
      </header>
      <main className="main-content">
        <SyncReviewBanner />
        <SyncReplacementNotice />
        {children}
      </main>
      <nav className="bottom-nav" aria-label="Основная навигация">
        {tabs.map((tab) => (
          <OfflineAwareLink className="nav-tab" href={tab.href} key={tab.href}>
            <span aria-hidden="true">
              <tab.icon size={18} strokeWidth={2.4} />
            </span>
            {tab.label}
          </OfflineAwareLink>
        ))}
      </nav>
    </div>
    </SyncOverviewProvider>
  );
}
