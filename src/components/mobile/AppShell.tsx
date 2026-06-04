"use client";

import type React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ListTodo, LogOut, Map, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/api/auth-api";

const tabs = [
  { href: "/map", label: "Карта", icon: Map },
  { href: "/points", label: "Список", icon: ListTodo },
  { href: "/add", label: "Добавить", icon: Plus },
  { href: "/owners", label: "Владельцы", icon: Users }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";

  async function handleLogout() {
    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Не удалось выйти. Попробуйте еще раз.");
    }
  }

  if (isLoginPage) {
    return <div className="auth-shell">{children}</div>;
  }

  return (
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
            width="44"
          />
          <div className="brand-copy">
            <p className="eyebrow">ПВЗ Органайзер</p>
            <h1>Полевой обход</h1>
          </div>
        </div>
        <div className="top-bar-actions">
          <div className="status-pill" aria-label="Статус приложения">
            На устройстве
          </div>
          <Button aria-label="Выйти" onClick={handleLogout} size="icon-sm" type="button" variant="ghost">
            <LogOut />
          </Button>
        </div>
      </header>
      <main className="main-content">{children}</main>
      <nav className="bottom-nav" aria-label="Основная навигация">
        {tabs.map((tab) => (
          <Link className="nav-tab" href={tab.href} key={tab.href}>
            <span aria-hidden="true">
              <tab.icon size={18} strokeWidth={2.4} />
            </span>
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
