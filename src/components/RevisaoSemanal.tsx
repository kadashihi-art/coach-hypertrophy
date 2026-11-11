"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import type { RevisaoSemanal } from "@/lib/inteligencia/revisao-semanal";

function Bloco({ titulo, itens, cor }: { titulo: string; itens: string[]; cor: string }) {
  if (!itens.length) return null;
  return (
    <div>
      <p className={`mb-1 text-xs font-semibold uppercase tracking-wide ${cor}`}>{titulo}</p>
      <ul className="space-y-1 text-sm">
        {itens.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/** Revisão da semana completa (Progresso). */
export function RevisaoSemanalCard({ r }: { r: RevisaoSemanal }) {
  return (
    <section id="revisao" data-testid="revisao-semanal" aria-label="Revisão da semana">
      <Card className="mb-6 space-y-4 border border-accent/25">
        <div>
          <p className="text-xs uppercase tracking-wide text-accent">Semana de {r.rotulo}</p>
          <p className="text-lg font-bold">
            {r.treinos.feitos}/{r.treinos.planejados} treinos · {r.series.valeram}/{r.series.total} séries que valeram
          </p>
        </div>
        <Bloco titulo="O que foi bem" itens={r.destaques} cor="text-go" />
        <Bloco titulo="Pede atenção" itens={r.atencao} cor="text-warn" />
        <Bloco titulo="Semana que vem" itens={r.proxima} cor="text-accent" />
        <p className="text-[11px] text-muted">
          Os ajustes de séries do dia entram sozinhos. Mudança no plano só acontece em Plano → Ajustar, com a sua confirmação.
        </p>
      </Card>
    </section>
  );
}

/** Versão curta pro /hoje (domingo e segunda). */
export function RevisaoSemanalResumo({ r }: { r: RevisaoSemanal }) {
  return (
    <Card className="mb-4 flex items-center justify-between gap-3 border border-accent/25">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-accent">Revisão da semana</p>
        <p className="text-sm">{r.resumo}</p>
      </div>
      <Link href="/progresso#revisao" className="shrink-0 text-xs font-semibold text-accent">
        Ver →
      </Link>
    </Card>
  );
}
