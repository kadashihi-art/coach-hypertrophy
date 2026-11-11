"use client";

import { useApp } from "@/components/AppProvider";
import { Card } from "@/components/ui";
import type { GrupoMuscular, Sessao } from "@/lib/domain";
import { ehSeriePreparatoria, GRUPOS_OPCIONAIS } from "@/lib/domain";
import { labelGrupo } from "@/lib/labels";
import { hojeIsoSaoPaulo } from "@/lib/plan/proxima-sessao";

const ESTIMULO = [
  { v: 0, label: "Fraco" },
  { v: 1, label: "Bom" },
  { v: 2, label: "Muito forte" },
] as const;

const DOR = [
  { v: 0, label: "Recuperado" },
  { v: 1, label: "Um pouco dolorido" },
  { v: 2, label: "Bem dolorido" },
] as const;

/** Pós-treino: como cada músculo respondeu (estímulo + articulação). Ajusta as séries das próximas vezes. */
export function FeedbackPosTreino({ sessao }: { sessao: Sessao }) {
  const { state, registrarFeedbackMusculo } = useApp();
  const grupos: GrupoMuscular[] = [];
  for (const r of state.registros) {
    if (r.sessao_id !== sessao.id || ehSeriePreparatoria(r.tipo_serie)) continue;
    const g = state.exercicios.find((e) => e.id === r.exercicio_id)?.grupo_primario;
    if (g && !GRUPOS_OPCIONAIS.includes(g) && !grupos.includes(g)) grupos.push(g);
  }
  if (grupos.length === 0) return null;
  const data = sessao.data ?? hojeIsoSaoPaulo();
  const atual = (g: GrupoMuscular) =>
    (state.feedbacks_musculo ?? []).find((f) => f.grupo === g && f.momento === "pos" && f.sessao_id === sessao.id);

  return (
    <section data-testid="feedback-musculos"><Card className="mb-4 space-y-4">
      <div>
        <p className="font-semibold">Como cada músculo respondeu?</p>
        <p className="mt-1 text-xs text-muted">
          Dois toques por músculo. Com isso eu acerto quantas séries cada um recebe nas próximas vezes.
        </p>
      </div>
      {grupos.map((g) => {
        const fb = atual(g);
        return (
          <div key={g}>
            <p className="mb-1.5 text-sm font-semibold">{labelGrupo(g)}</p>
            <div className="flex flex-wrap gap-2">
              {ESTIMULO.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  aria-pressed={fb?.estimulo === o.v}
                  className={`chip-motion text-xs ${fb?.estimulo === o.v ? "on" : ""}`}
                  onClick={() => registrarFeedbackMusculo({ grupo: g, momento: "pos", sessao_id: sessao.id, data, estimulo: o.v, articulacao: fb?.articulacao ?? false })}
                >
                  {o.label}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={!!fb?.articulacao}
                className={`chip-motion text-xs ${fb?.articulacao ? "on" : ""}`}
                onClick={() => registrarFeedbackMusculo({ grupo: g, momento: "pos", sessao_id: sessao.id, data, estimulo: fb?.estimulo, articulacao: !fb?.articulacao })}
              >
                Incomodou articulação
              </button>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-muted">
        Estímulo é a sensação no músculo: pump, queimação, fadiga local. Fraco e chegando recuperado = mais 1 série na próxima.
      </p>
    </Card></section>
  );
}

/** Antes do treino: como os músculos de hoje chegaram (recuperação desde a última vez). */
export function RecuperacaoPreTreino({ grupos }: { grupos: GrupoMuscular[] }) {
  const { state, registrarFeedbackMusculo } = useApp();
  const hoje = hojeIsoSaoPaulo();
  const comHistorico = grupos.filter((g) => (state.feedbacks_musculo ?? []).some((f) => f.grupo === g && f.momento === "pos"));
  if (comHistorico.length === 0) return null;
  const atual = (g: GrupoMuscular) => (state.feedbacks_musculo ?? []).find((f) => f.grupo === g && f.momento === "pre" && f.data === hoje);
  return (
    <div className="space-y-3" data-testid="recuperacao-pre">
      <p className="text-sm font-semibold">Como esses músculos chegaram hoje?</p>
      {comHistorico.map((g) => {
        const fb = atual(g);
        return (
          <div key={g}>
            <p className="mb-1 text-xs text-muted">{labelGrupo(g)}</p>
            <div className="flex flex-wrap gap-2">
              {DOR.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  aria-pressed={fb?.dor_muscular === o.v}
                  className={`chip-motion text-xs ${fb?.dor_muscular === o.v ? "on" : ""}`}
                  onClick={() => registrarFeedbackMusculo({ grupo: g, momento: "pre", sessao_id: null, data: hoje, dor_muscular: o.v })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
