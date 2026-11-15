import type { Metadata } from "next";
import { Suspense } from "react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import Link from "next/link";
import AppNav from "@/components/AppNav";
import AuthProvider from "@/components/auth/AuthProvider";
import UserMenu from "@/components/auth/UserMenu";
import GraphBackdrop from "@/components/GraphBackdrop";
import PresentMode from "@/components/PresentMode";
import RouteProgress from "@/components/RouteProgress";
import { Chip } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "KYI — Know Your Investor · Know Your Investment",
  description:
    "Know your investor. Know your investment. Every number has a source. Founders find lead investors; investors see where money flows — powered by Cala.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable} h-full`}>
      <body className="relative isolate flex min-h-full flex-col bg-bg text-ink">
        <AuthProvider>
          <Suspense fallback={null}>
            <PresentMode />
          </Suspense>
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          <div className="ambient" aria-hidden />
          <GraphBackdrop />
          <header className="no-print sticky top-0 z-30 h-14 shrink-0 border-b border-line/60 bg-bg/55 backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
              <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold tracking-tight sm:gap-3">
                <span className="kyi-mark grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white">
                  KYI
                </span>
                <span className="hidden truncate lg:inline">Know Your Investor · Know Your Investment</span>
                <span className="truncate text-sm lg:hidden">KYI</span>
              </Link>
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <Chip tone="neutral" className="hidden fit:inline-flex present-hide">
                  Powered by Cala
                </Chip>
                <AppNav />
                <UserMenu />
              </div>
            </div>
          </header>
          <main className="relative z-10 flex min-h-0 flex-1 flex-col fit:h-[calc(100dvh-3.5rem)] fit:max-h-[calc(100dvh-3.5rem)] fit:overflow-hidden">
            {children}
          </main>
          <footer className="app-footer no-print relative z-10 border-t border-line/60 py-6 text-center text-xs text-muted">
            KYI · Junction 2026 · Every number has a source
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
