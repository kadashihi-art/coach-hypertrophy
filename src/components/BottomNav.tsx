"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";

/** Ícones line (stroke, sem preenchimento) — 22px. */
function Ico({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="tab-ico"
    >
      {children}
    </svg>
  );
}

type Tab = { href: string; label: string; icon: ReactNode; also?: string[] };

const tabs: Tab[] = [
  {
    href: "/hoje",
    label: "Hoje",
    icon: (
      <Ico>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20h14V9.5" />
      </Ico>
    ),
  },
  {
    href: "/plano",
    label: "Plano",
    also: ["/calendario", "/meu-treino"],
    icon: (
      <Ico>
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </Ico>
    ),
  },
  {
    href: "/progresso",
    label: "Progresso",
    icon: (
      <Ico>
        <path d="M5 20V13M12 20V6M19 20v-9" />
      </Ico>
    ),
  },
  {
    href: "/coach",
    label: "Coach",
    icon: (
      <Ico>
        <path d="M4 5.5h16v10H9l-5 4z" />
      </Ico>
    ),
  },
  {
    href: "/perfil",
    label: "Perfil",
    icon: (
      <Ico>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 20c1.2-3.6 3.9-5.5 7-5.5s5.8 1.9 7 5.5" />
      </Ico>
    ),
  },
];

function isActive(pathname: string | null, t: Tab) {
  if (!pathname) return false;
  const roots = [t.href, ...(t.also ?? [])];
  return roots.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/** Tabbar 5 abas: Hoje · Plano · Progresso · Coach · Perfil (docs/ia-nav-audit.md §3). */
export function BottomNav() {
  const pathname = usePathname();
  const { state, ready } = useApp();

  if (!ready) return null;

  const logging =
    pathname?.startsWith("/treino") &&
    !pathname?.startsWith("/treino/feedback") &&
    state.active_sessao_id != null;

  if (
    pathname === "/" ||
    pathname?.startsWith("/onboarding") ||
    pathname?.startsWith("/entrar") ||
    pathname?.startsWith("/checkin") ||
    pathname?.startsWith("/treino/feedback") ||
    logging
  ) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 border-t border-border bg-[rgba(5,5,5,.94)] backdrop-blur-xl">
      <ul className="grid grid-cols-5 px-1 pb-[env(safe-area-inset-bottom,0px)] pt-1">
        {tabs.map((t) => {
          const active = isActive(pathname, t);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`tab-motion flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-semibold tracking-wide ${
                  active ? "is-active text-accent" : "text-faint"
                }`}
              >
                {t.icon}
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
