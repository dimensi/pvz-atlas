import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { ListTodo, Map, Plus, RefreshCw } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "ПВЗ Органайзер",
  title: "ПВЗ Органайзер",
  description: "Мобильное приложение для полевого учета пунктов выдачи",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ПВЗ Органайзер"
  }
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
            <div className="brand-lockup">
              <Image
                alt=""
                aria-hidden="true"
                className="brand-logo"
                height="44"
                src="/brand/logo.png"
                width="44"
              />
              <div className="brand-copy">
                <p className="eyebrow">ПВЗ Органайзер</p>
                <h1>Полевой обход</h1>
              </div>
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
          <Toaster />
        </div>
      </body>
    </html>
  );
}
