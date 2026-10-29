"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PLANO_TABS } from "@/lib/nav";

/** Segmented control do Plano: Semana | Calendário | Ajustar (cada um sua rota). */
export function PlanoTabs() {
  const pathname = usePathname();
  return (
    <div
      role="tablist"
      aria-label="Plano"
      className="mb-5 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-surface p-1"
    >
      {PLANO_TABS.map((t) => {
        const on = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={on}
            className={`chip-motion flex min-h-11 items-center justify-center !rounded-xl text-sm font-semibold ${
              on ? "on" : "!border-transparent text-muted"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
