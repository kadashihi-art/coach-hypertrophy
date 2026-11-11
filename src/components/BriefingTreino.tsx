"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { ExplicaConceito } from "@/components/Conceito";
import { RecuperacaoPreTreino } from "@/components/FeedbackMusculos";
import type { GrupoMuscular } from "@/lib/domain";
import type { Briefing } from "@/lib/inteligencia/briefing";

/** Antes de começar: como os músculos chegaram, ajustes do dia e a meta de cada exercício. */
export function BriefingTreino({
  briefing,
  grupos,
  ajustes,
  trocar,
}: {
  briefing: Briefing;
  grupos: GrupoMuscular[];
  /** Frases dos ajustes do dia (feedback por músculo). */
  ajustes: string[];
  /** Nomes de exercícios que incomodaram a articulação na última vez. */
  trocar: string[];
}) {
  const [aberto, setAberto] = useState(false);
  const itens = aberto ? briefing.itens : briefing.itens.slice(0, 3);
  return (
    <section data-testid="briefing-treino" aria-label="Plano do treino de hoje">
      <Card className="mb-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-accent">{briefing.cabecalho}</p>
            <p className="font-semibold">Seu treino de hoje, exercício por exercício</p>
          </div>
          <ExplicaConceito id="progressao" />
        </div>

        <RecuperacaoPreTreino grupos={grupos} />

        {ajustes.length > 0 ? (
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Ajustei pra hoje</p>
            <ul className="space-y-1">
              {ajustes.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {trocar.length > 0 ? (
          <p className="rounded-xl border border-warn/40 bg-[rgba(255,184,60,.08)] p-3 text-sm text-warn">
            {trocar.join(", ")} incomodou a articulação da última vez. Se incomodar de novo, troque no Plano (botão Trocar):
            o mesmo músculo, outro ângulo.
          </p>
        ) : null}

        <ol className="space-y-3">
          {itens.map((it) => (
            <li key={it.prescricao_id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{it.nome}</span>
                <span className="load-num shrink-0 text-xs text-muted">
                  {it.series} {it.series === 1 ? "série" : "séries"}
                  {it.delta_series !== 0 ? (
                    <span className={it.delta_series > 0 ? "text-accent" : "text-warn"}> ({it.delta_series > 0 ? "+" : "−"}{Math.abs(it.delta_series)})</span>
                  ) : null}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-bone-50">{it.meta}</p>
              {it.ultima ? <p className="text-xs text-muted">{it.ultima}</p> : null}
              {it.porque ? <p className="mt-0.5 text-xs text-muted">Por quê: {it.porque}</p> : null}
              {it.prep ? <p className="mt-0.5 text-[11px] text-accent">{it.prep}</p> : null}
            </li>
          ))}
        </ol>
        {briefing.itens.length > 3 ? (
          <button type="button" className="text-xs font-semibold text-accent" onClick={() => setAberto((v) => !v)}>
            {aberto ? "Mostrar menos" : `Ver os outros ${briefing.itens.length - 3}`}
          </button>
        ) : null}
      </Card>
    </section>
  );
}
