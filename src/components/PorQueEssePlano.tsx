"use client";

import { Card } from "@/components/ui";
import type { PlanoRacional } from "@/lib/domain";

/** Card "Por que esse plano/treino": mesmo racional determinístico do motor. animado = entrada escalonada (onboarding). */
export function PorQueEssePlano({ racional, animado = false, compacto = false }: { racional: PlanoRacional; animado?: boolean; compacto?: boolean }) {
  const blocos = [
    <div key="split">
      <p className="text-sm font-semibold text-bone-50">{racional.split.nome}</p>
      {racional.split.porque.slice(0, 3).map((t, i) => (
        <p key={i}>{t}</p>
      ))}
    </div>,
    racional.frequencia_por_musculo.length ? (
      <p key="freq">
        <span className="text-muted">Frequência/sem: </span>
        {racional.frequencia_por_musculo.map((f) => `${f.grupo} ${f.vezes_semana}×`).join(" · ")}
      </p>
    ) : null,
    ...racional.fases.map((f) => (
      <div key={f.id} className="rounded-lg bg-white/5 p-2">
        <p className="font-semibold">{f.nome} · {f.semanas}</p>
        <p className="text-muted">{f.microciclo}</p>
        {f.descanso.slice(0, 3).map((d, i) => (
          <p key={i} className="text-faint">{d}</p>
        ))}
        {f.troca ? <p className="text-accent">{f.troca}</p> : null}
      </div>
    )),
    racional.acordos?.length ? (
      <div key="acordos" className="rounded-lg border border-accent/30 p-2">
        <p className="font-semibold text-accent">Condições acordadas</p>
        {racional.acordos.map((a, i) => (
          <p key={i}>• {a}</p>
        ))}
      </div>
    ) : null,
    racional.volume_semanal.length ? (
      <p key="vol">
        <span className="text-muted">Séries diretas/sem (fase 1): </span>
        {racional.volume_semanal.map((v) => `${v.grupo} ${v.series_diretas} (${v.faixa_alvo[0]}–${v.faixa_alvo[1]})`).join(" · ")}
      </p>
    ) : null,
    ...(compacto ? [] : racional.alternativas.slice(0, 3).map((a) => (
      <p key={a.divisao} className="text-faint">
        <span className="text-muted">{a.nome}:</span> {a.por_que_nao}. Faz sentido se: {a.quando_faria_sentido}.
      </p>
    ))),
    !compacto ? (
      <p key="fonte" className="text-[10px] text-faint">Fonte: {racional.fonte === "motor" ? "análise do coach (salva na montagem)" : "derivado do plano atual"}.</p>
    ) : null,
  ].filter(Boolean);
  return (
    <Card className={`mb-4 space-y-2 text-[12px] leading-snug text-bone-200 ${animado ? "motion-stagger" : ""}`}>{blocos}</Card>
  );
}
