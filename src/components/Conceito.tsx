"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Card } from "@/components/ui";
import { CONCEITOS, exemploPessoal, type ConceitoId, type ContextoExemplo } from "@/lib/conceitos";

/** Corpo de um conceito: o que é, na prática, exemplo com os seus números e como o app usa. */
export function ConceitoCorpo({ id, ctx }: { id: ConceitoId; ctx?: ContextoExemplo }) {
  const c = CONCEITOS[id];
  const ex = ctx ? exemploPessoal(id, ctx) : null;
  return (
    <div className="space-y-2 text-sm">
      <p className="font-semibold text-bone-50">{c.curto}</p>
      <ul className="list-disc space-y-1 pl-5 text-muted">
        {c.pratica.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {ex ? (
        <p className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-bone-50">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">Com os seus números · </span>
          {ex}
        </p>
      ) : null}
      <p className="text-[12px] text-muted">
        <span className="font-semibold text-bone-50/90">No app: </span>
        {c.no_app}
      </p>
    </div>
  );
}

/** Botão "?" que abre a explicação prática de um conceito numa folha por cima da tela. */
export function ExplicaConceito({
  id,
  ctx,
  label,
  className = "",
}: {
  id: ConceitoId;
  ctx?: ContextoExemplo;
  /** Texto do gatilho; sem label vira um "?" redondo. */
  label?: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const c = CONCEITOS[id];
  useEffect(() => {
    if (!aberto) return;
    document.body.classList.add("sheet-open");
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", esc);
    return () => {
      document.body.classList.remove("sheet-open");
      window.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <>
      <button
        type="button"
        aria-label={`O que é ${c.termo}?`}
        onClick={() => setAberto(true)}
        className={
          label
            ? `text-[11px] font-semibold text-accent underline decoration-dotted underline-offset-2 ${className}`
            : `inline-flex h-5 w-5 items-center justify-center rounded-full border border-accent/50 text-[11px] font-bold text-accent ${className}`
        }
      >
        {label ?? "?"}
      </button>
      {aberto && typeof document !== "undefined"
        ? createPortal(
            <div
              className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] sm:items-center"
              onClick={() => setAberto(false)}
            >
              <div role="dialog" aria-modal="true" aria-label={c.termo} className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <Card className="max-h-[85dvh] overflow-y-auto border border-accent/30">
                  <p className="mb-2 text-lg font-bold">{c.termo}</p>
                  <ConceitoCorpo id={id} ctx={ctx} />
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <Link href="/conceitos" className="text-xs font-semibold text-accent" onClick={() => setAberto(false)}>
                      Ver todos os conceitos →
                    </Link>
                    <button type="button" className="motion-press min-h-10 rounded-[14px] bg-white/5 px-4 text-sm font-semibold text-bone-50" onClick={() => setAberto(false)}>
                      Entendi
                    </button>
                  </div>
                </Card>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
