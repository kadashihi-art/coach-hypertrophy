"use client";

import { useState } from "react";
import { IMAGEM_CREDITO, imagemDoExercicio } from "@/lib/catalog/imagens";
import type { Exercicio } from "@/lib/domain";

type Ref = string | Pick<Exercicio, "id" | "nome" | "base_id">;

function Placeholder({ size, nome }: { size: number; nome?: string }) {
  return (
    <span
      role="img"
      aria-label={nome ? `Sem imagem de ${nome} por enquanto` : "Sem imagem por enquanto"}
      data-testid="ex-img-placeholder"
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-xl border border-border bg-ink-900 text-faint"
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M6 9v6M18 9v6M3 11v2M21 11v2M6 12h12" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Miniatura só visual (para dentro de botões de lista). */
export function ExercicioThumb({ ex, size = 52, className = "" }: { ex: Ref; size?: number; className?: string }) {
  const img = imagemDoExercicio(ex);
  const nome = typeof ex === "string" ? undefined : ex.nome;
  return (
    <span className={className} style={{ display: "inline-block" }}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img.src} alt={img.alt} loading="lazy" data-testid="ex-img" style={{ height: size, width: size * 1.6 }} className="shrink-0 rounded-xl bg-white object-cover" />
      ) : (
        <Placeholder size={size} nome={nome} />
      )}
    </span>
  );
}

/** Miniatura que amplia ao tocar (logger e guia). */
export function ExercicioImagem({ ex, size = 64 }: { ex: Ref; size?: number }) {
  const [aberta, setAberta] = useState(false);
  const img = imagemDoExercicio(ex);
  const nome = typeof ex === "string" ? undefined : ex.nome;
  if (!img) return <Placeholder size={size} nome={nome} />;
  return (
    <>
      <button type="button" onClick={() => setAberta(true)} aria-label={`Ampliar imagem: ${nome ?? "exercício"}`} className="shrink-0 rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.src} alt={img.alt} data-testid="ex-img" style={{ height: size, width: size * 1.6 }} className="rounded-xl bg-white object-cover" />
      </button>
      {aberta ? (
        <div role="dialog" aria-modal="true" aria-label={img.alt} onClick={() => setAberta(false)} className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/85 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.src} alt={img.alt} className="max-h-[70dvh] w-full max-w-[480px] rounded-2xl bg-white object-contain" />
          <p className="mt-3 text-center text-sm text-bone-50">{nome}</p>
          <p className="mt-1 text-[10px] text-muted">{IMAGEM_CREDITO}</p>
          <button type="button" className="mt-4 min-h-11 rounded-[14px] border border-border px-5 text-sm text-bone-50">Fechar</button>
        </div>
      ) : null}
    </>
  );
}
