"use client";

import { useMemo, useState } from "react";
import { Button, Card } from "@/components/ui";
import { CATALOG_EXERCICIOS } from "@/lib/catalog/exercicios";
import type { AppState, GrupoMuscular, Perfil } from "@/lib/domain";
import { GRUPOS_PRINCIPAIS } from "@/lib/plan/equilibrar-volume";
import {
  MAX_PRIORIDADES,
  MOTIVOS_PRIORIDADE,
  nomeGrupo,
  previaPrioridades,
  sugerirPrioridades,
  type MotivoPrioridade,
} from "@/lib/plan/prioridades";

/**
 * Prioridade muscular: o usuário escolhe até 3 músculos (com ajuda da sugestão do histórico),
 * vê o efeito no volume semanal e só então confirma. O motor remonta; nada é salvo antes.
 */
export function PrioridadeMuscularCard(props: {
  state: AppState;
  perfil: Perfil;
  busy: boolean;
  bloqueado: boolean;
  onConfirmar: (patch: Pick<Perfil, "prioridades_musculares" | "prioridade_motivo">) => void;
}) {
  const { state, perfil } = props;
  const [sel, setSel] = useState<GrupoMuscular[]>(perfil.prioridades_musculares ?? []);
  const [motivo, setMotivo] = useState<MotivoPrioridade>(perfil.prioridade_motivo ?? "dificil_desenvolver");
  const catalog = state.exercicios.length ? state.exercicios : CATALOG_EXERCICIOS;

  const sugestoes = useMemo(() => sugerirPrioridades(state), [state]);
  const previa = useMemo(() => {
    try {
      return previaPrioridades(perfil, sel, catalog);
    } catch {
      return null;
    }
  }, [perfil, sel, catalog]);

  const salvo = JSON.stringify([...(perfil.prioridades_musculares ?? [])].sort()) === JSON.stringify([...sel].sort()) &&
    (perfil.prioridade_motivo ?? "dificil_desenvolver") === motivo;
  const dica = MOTIVOS_PRIORIDADE.find((m) => m.id === motivo)?.dica;
  const mudou = previa?.linhas.filter((l) => l.antes !== l.depois) ?? [];

  function toggle(g: GrupoMuscular) {
    setSel((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : prev.length >= MAX_PRIORIDADES ? prev : [...prev, g]));
  }

  return (
    <Card className="mb-4 space-y-3">
      <p className="text-sm text-muted">
        Escolha até {MAX_PRIORIDADES} músculos pra crescer mais neste bloco. Eles ganham séries extras (sem passar de 20 por semana)
        e vêm primeiro no treino, quando você está mais descansado.
      </p>

      {sugestoes.length > 0 ? (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">O que seus treinos mostram</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {sugestoes.map((s) => (
              <li key={s.grupo}>
                <span className="font-semibold">{nomeGrupo(s.grupo)}</span>
                <span className="text-muted">: {s.motivos[0]}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-accent"
            onClick={() => setSel(sugestoes.map((s) => s.grupo).slice(0, MAX_PRIORIDADES))}
          >
            Usar essa sugestão
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-muted">
          Ainda não tenho histórico suficiente pra sugerir. Escolha o que você vê ficando pra trás no espelho ou nas fotos,
          ou o músculo que mais demora a responder.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {GRUPOS_PRINCIPAIS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => toggle(g)}
            aria-pressed={sel.includes(g)}
            disabled={!sel.includes(g) && sel.length >= MAX_PRIORIDADES}
            className={`chip-motion ${sel.includes(g) ? "on" : ""} disabled:opacity-40`}
          >
            {nomeGrupo(g)}
          </button>
        ))}
      </div>

      {sel.length > 0 ? (
        <>
          <p className="text-[11px] uppercase tracking-wide text-muted">Por quê?</p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_PRIORIDADE.map((m) => (
              <button key={m.id} type="button" onClick={() => setMotivo(m.id)} className={`chip-motion ${motivo === m.id ? "on" : ""}`}>
                {m.label}
              </button>
            ))}
          </div>
          {dica ? <p className="text-[11px] text-muted">{dica}</p> : null}
        </>
      ) : null}

      {previa && mudou.length > 0 ? (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Séries que valem por semana</p>
          <ul className="space-y-1 text-sm">
            {mudou.map((l) => (
              <li key={l.grupo} className="flex justify-between gap-2">
                <span className={l.prioritario ? "font-semibold text-accent" : "text-muted"}>{nomeGrupo(l.grupo)}</span>
                <span className="tabular-nums">
                  {l.antes} → <span className={l.depois > l.antes ? "font-semibold text-accent" : ""}>{l.depois}</span>
                </span>
              </li>
            ))}
          </ul>
          {mudou.some((l) => !l.prioritario && l.depois < l.antes) ? (
            <p className="mt-2 text-[11px] text-muted">
              Pra caber no seu tempo, tirei séries de grupos que continuam dentro da faixa ideal.
            </p>
          ) : null}
          {previa.notas.map((n) => (
            <p key={n} className="mt-2 text-[11px] text-muted">{n}</p>
          ))}
        </div>
      ) : sel.length > 0 && previa ? (
        <p className="text-[11px] text-muted">
          Esses músculos já estão perto do máximo útil no seu plano (ou não sobra tempo nos treinos). Mais tempo por sessão abre espaço.
        </p>
      ) : null}

      <Button
        disabled={props.busy || props.bloqueado || salvo}
        onClick={() => props.onConfirmar({ prioridades_musculares: sel, prioridade_motivo: sel.length ? motivo : undefined })}
      >
        {props.busy ? "Remontando…" : salvo ? "Prioridades em uso" : sel.length ? "Confirmar e remontar" : "Tirar prioridades e remontar"}
      </Button>
      <p className="text-center text-[11px] text-muted">Seu plano só muda depois que você confirma. Histórico e cargas continuam.</p>
    </Card>
  );
}
