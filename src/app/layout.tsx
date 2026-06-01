import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ListTodo, Map, Plus, RefreshCw } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ПВЗ Органайзер",
  description: "Мобильное приложение для полевого учета пунктов выдачи"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f8fafc"
};

const tabs = [
  { href: "/points", label: "Список", icon: ListTodo },
  { href: "/map", label: "Карта", icon: Map },
  { href: "/add", label: "Добавить", icon: Plus },
  { href: "/sync", label: "Синхр.", icon: RefreshCw }
];

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <div className="app-shell">
          <header className="top-bar">
            <div>
              <p className="eyebrow">ПВЗ Органайзер</p>
              <h1>Полевой обход</h1>
            </div>
            <div className="status-pill" aria-label="Статус синхронизации">
              Офлайн готов
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
      </body>
    </html>
  );
}
