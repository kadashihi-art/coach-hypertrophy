"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";

const tabs = [
  { href: "/hoje", label: "Hoje", icon: "⌂" },
  { href: "/treino", label: "Treino", icon: "✱" },
  { href: "/coach", label: "Coach", icon: "◈" },
  { href: "/meu-treino", label: "Meu treino", icon: "⚙" },
  { href: "/plano", label: "Plano", icon: "▦" },
];

/** Tabbar Hoje|Treino|Coach|Meu treino|Plano — Progresso via Meu treino. */
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
          const active =
            pathname === t.href ||
            pathname?.startsWith(`${t.href}/`) ||
            (t.href === "/meu-treino" &&
              (pathname?.startsWith("/progresso") ||
                pathname?.startsWith("/calendario")));
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`tab-motion flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-semibold tracking-wide ${
                  active ? "is-active text-accent" : "text-faint"
                }`}
              >
                <span className="tab-ico text-lg leading-none">{t.icon}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
