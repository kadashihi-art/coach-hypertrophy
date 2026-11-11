"use client";

import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import { ConceitoCorpo } from "@/components/Conceito";
import { CONCEITOS, ORDEM_CONCEITOS, contextoPessoal } from "@/lib/conceitos";

/** Conceitos explicados na prática, com exemplos montados com os seus números. */
export default function ConceitosPage() {
  const { state, ready } = useApp();
  const ctx = ready ? contextoPessoal(state) : {};
  return (
    <main className="motion-fade-up px-5 pb-10 pt-8">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">Entenda o treino</p>
      <h1 className="mb-2 text-2xl font-bold">Conceitos na prática</h1>
      <p className="mb-4 text-sm text-muted">
        RM, RIR, série válida e o resto, explicados do jeito que você usa no treino.
        {ctx.exercicio ? ` Os exemplos usam os seus números no ${ctx.exercicio}.` : " Quando você tiver treinos registrados, os exemplos passam a usar os seus números."}
      </p>
      <div className="space-y-2">
        {ORDEM_CONCEITOS.map((id, i) => (
          <details key={id} className="card-motion rounded-[var(--radius-card)] bg-card p-4" open={i < 2}>
            <summary className="cursor-pointer text-base font-semibold">{CONCEITOS[id].termo}</summary>
            <div className="mt-3">
              <ConceitoCorpo id={id} ctx={ctx} />
            </div>
          </details>
        ))}
      </div>
      <Link href="/treino" className="mt-6 block text-center text-sm font-semibold text-accent">
        Voltar pro treino →
      </Link>
    </main>
  );
}
