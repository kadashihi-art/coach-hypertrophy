"use client";

import { labelSplit, humanizarSplits } from "@/lib/plan/split-label";
import { acentuar, labelGrupo } from "@/lib/labels";
import { VolumeBar } from "@/components/VolumeBar";
import { semCodigoRegra } from "@/lib/llm/tom";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { PlanoTabs } from "@/components/PlanoTabs";
import {
  Badge,
  Button,
  Card,
  EvidenciaBadge,
  SectionTitle,
} from "@/components/ui";
import { proximaSessao } from "@/lib/plan/proxima-sessao";
import { VOLUME_MAX } from "@/lib/domain";
import { narrarCargaPrescricao } from "@/lib/llm/coach";
import { TrocarExercicioSheet } from "@/components/TrocarExercicioSheet";
import { preparatoriasDaSessao, rotuloOrdemSeries } from "@/lib/treino/estrutura-series";

/** T8 — Split visual + mesociclo · plano gerado do perfil */
export default function PlanoPage() {
  const { state, startSession } = useApp();
  const router = useRouter();
  const plano = state.plano;
  const next = proximaSessao(state);
  const [banner, setBanner] = useState(false);
  const [barsOn, setBarsOn] = useState(false);
  const [trocar, setTrocar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!plano) return;
    const key = `coach-hypertrophy:plano-visto:${plano.id}`;
    try {
      if (!sessionStorage.getItem(key)) {
        setBanner(true);
        sessionStorage.setItem(key, "1");
      }
    } catch {
      setBanner(true);
    }
    const t = requestAnimationFrame(() => setBarsOn(true));
    return () => cancelAnimationFrame(t);
  }, [plano]);

  const volumeRows = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of state.volumes_semanais) {
      map.set(v.grupo, (map.get(v.grupo) ?? 0) + v.series_efetivas);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([grupo, sets]) => ({ grupo, sets }));
  }, [state.volumes_semanais]);

  if (!plano) {
    return (
      <main className="p-5 pt-10">
        <p className="text-muted">Nenhum plano. Conclua o onboarding.</p>
      </main>
    );
  }

  const sessoes = plano.sessoes
    .map((id) => state.sessoes.find((s) => s.id === id))
    .filter(Boolean);

  const perfil = state.perfil;

  function iniciar(id: string) {
    startSession(id);
    router.push("/treino");
  }

  return (
    <main className="motion-fade-up px-5 pb-8 pt-8">
      <PlanoTabs />
      {aviso ? (
        <div role="status" className="motion-swap mb-4 rounded-2xl border border-go/40 bg-go/10 px-4 py-3 text-sm text-bone-50">
          {aviso}
        </div>
      ) : null}
      {trocar ? (
        <TrocarExercicioSheet deId={trocar} onClose={() => setTrocar(null)} onTrocado={setAviso} />
      ) : null}
      {banner ? (
        <div className="motion-swap mb-4 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-bone-50">
          <p className="font-bold text-accent">Plano gerado</p>
          <p className="text-xs text-muted">
            Montado a partir do seu perfil — revise o split e a justificativa.
          </p>
        </div>
      ) : null}

      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
        Plano
      </p>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold capitalize">
          {labelSplit(plano.divisao)}
        </h1>
      </div>
      <p className="mb-3 text-sm text-muted">
        {plano.dias_por_semana}×/semana · {plano.minutos_por_sessao} min ·{" "}
        {plano.objetivo}
        {plano.mesociclo.data_inicio
          ? ` · início ${plano.mesociclo.data_inicio}`
          : ""}
      </p>

      {perfil ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {perfil.equipamentos.map((e) => (
            <span key={e} className="chip-motion on text-[11px] !px-2.5 !py-1">
              {e.replace("_", " ")}
            </span>
          ))}
          {perfil.restricoes.map((r) => (
            <span
              key={r}
              className="rounded-full border border-warn/50 bg-warn/10 px-2.5 py-1 text-[11px] font-semibold capitalize text-warn"
            >
              {r}
            </span>
          ))}
        </div>
      ) : null}

      <Card className="mb-4 card-motion">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">Mesociclo</p>
            <p className="font-semibold">
              Semana {plano.mesociclo.semana_atual}/{plano.mesociclo.total_semanas}
            </p>
          </div>
          <Badge tone="accent">{plano.mesociclo.foco}</Badge>
        </div>
        <div className="mt-3 flex gap-1">
          {Array.from({ length: plano.mesociclo.total_semanas }).map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full ${
                i + 1 < plano.mesociclo.semana_atual
                  ? "bg-accent/40"
                  : i + 1 === plano.mesociclo.semana_atual
                    ? "bg-accent"
                    : "bg-ink-700"
              }`}
            />
          ))}
        </div>
      </Card>

      <Card className="mb-4">
        <p className="text-sm leading-relaxed text-muted">{acentuar(humanizarSplits(semCodigoRegra(plano.justificativa.texto)))}</p>
        <div className="mt-2">
          <EvidenciaBadge evidencia={plano.justificativa.evidencia} />
        </div>
        {next?.prescricoes[0] ? (
          <p className="mt-3 text-xs leading-relaxed text-muted">
            <span className="font-semibold text-accent">Coach · </span>
            {narrarCargaPrescricao({
              exercicio_nome:
                state.exercicios.find(
                  (e) => e.id === next.prescricoes[0].exercicio_id,
                )?.nome,
              presc: next.prescricoes[0],
              estado:
                state.estados.find(
                  (e) => e.exercicio_id === next.prescricoes[0].exercicio_id,
                ) ?? null,
            })}
          </p>
        ) : null}
        {plano.bloqueado && (
          <p className="mt-3 text-sm text-danger">Plano bloqueado (alerta N2).</p>
        )}
        {next && (
          <p className="mt-3 text-xs text-accent">Próximo do ciclo: {next.nome}</p>
        )}
      </Card>

      {volumeRows.length > 0 ? (
        <div className="vol-chart mb-4 motion-stagger">
          <div className="vol-head">
            <span className="vol-title">Volume / semana</span>
            <span className="vol-hint">séries efetivas · alvo 10–20</span>
          </div>
          {volumeRows.map(({ grupo, sets }, gi) => {
            return (
              <div key={grupo} className="vol-row">
                <span className="vol-label">{labelGrupo(grupo)}</span>
                <div className="flex-1">
                  {barsOn ? (
                    <VolumeBar label={labelGrupo(grupo)} valor={Math.round(sets)} max={VOLUME_MAX + 4} faixa={[10, 20]} index={gi} cabecalho={false} fina />
                  ) : (
                    <div className="vb-track mt-1 h-1.5" aria-hidden />
                  )}
                </div>
                <span className="vol-num">{Math.round(sets)}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      <SectionTitle title={`Split · ${sessoes.length} dias`} />
      <div className="motion-stagger space-y-3">
        {sessoes.map((s) => (
          <Card key={s!.id} className="card-motion">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {s!.ordem}. {s!.nome}
                  {next?.id === s!.id ? (
                    <span className="ml-2 text-[10px] font-bold uppercase text-accent">
                      próximo
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted">
                  {s!.grupos.join(" · ") || "—"} · ~{s!.duracao_estimada_min} min ·{" "}
                  {s!.prescricoes.length} ex.
                </p>
              </div>
              <Badge
                tone={
                  s!.status === "concluida"
                    ? "go"
                    : s!.status === "em_andamento"
                      ? "accent"
                      : "muted"
                }
              >
                {s!.status.replace("_", " ")}
              </Badge>
            </div>
            {s!.prescricoes.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {s!.prescricoes.map((p, i) => {
                  const ex = state.exercicios.find((e) => e.id === p.exercicio_id);
                  const est = state.estados.find(
                    (e) => e.exercicio_id === p.exercicio_id,
                  );
                  const carga =
                    est?.alvo_proxima_sessao.carga_kg ?? p.carga.trabalho_kg;
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span>
                        {ex?.nome} · {p.series}×{p.faixa_reps[0]}–{p.faixa_reps[1]} @{" "}
                        {carga} kg
                        {rotuloOrdemSeries(p) ? ` · ${rotuloOrdemSeries(p)}` : ""}
                        {preparatoriasDaSessao(s!.prescricoes, state.exercicios)[i] ? (
                          <span className="text-accent"> · aquece + aproximação antes</span>
                        ) : null}
                      </span>
                      {s!.status !== "em_andamento" ? (
                        <button
                          type="button"
                          aria-label={`Trocar ${ex?.nome ?? "exercício"}`}
                          onClick={() => setTrocar(p.exercicio_id)}
                          className="shrink-0 rounded-full border border-border bg-ink-900 px-2.5 py-1 text-[10px] font-semibold text-accent"
                        >
                          Trocar
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <Button
              className="motion-press mt-3 min-h-11 text-sm"
              variant={next?.id === s!.id ? "primary" : "ghost"}
              disabled={s!.prescricoes.length === 0 || !!plano.bloqueado}
              onClick={() => iniciar(s!.id)}
            >
              {s!.status === "em_andamento"
                ? "Continuar"
                : s!.status === "concluida"
                  ? "Treinar de novo"
                  : "Iniciar"}
            </Button>
          </Card>
        ))}
      </div>
    </main>
  );
}
