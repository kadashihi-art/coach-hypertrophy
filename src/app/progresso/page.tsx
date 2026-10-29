"use client";

import { VolumeBar } from "@/components/VolumeBar";
import { labelGrupo } from "@/lib/labels";
import { semCodigoRegra } from "@/lib/llm/tom";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import {
  Badge,
  Card,
  EvidenciaBadge,
  ProgressBar,
  SectionTitle,
  Stat,
} from "@/components/ui";
import { VOLUME_MAX, VOLUME_MIN } from "@/lib/domain";
import { currentIsoWeek } from "@/lib/engine/volume";

/** T7 — e1RM, PRs, volume 10–20, consistência. ZERO fake — só registros reais. */
export default function ProgressoPage() {
  const { state } = useApp();
  const temHistorico = state.registros.length > 0;

  const [semanaAtual, setSemanaAtual] = useState("2026-W44");
  const [barsOn, setBarsOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarsOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    setSemanaAtual(currentIsoWeek());
  }, []);

  const vols = temHistorico
    ? state.volumes_semanais.filter((v) => v.semana_iso === semanaAtual)
    : [];

  const alertasVolume = useMemo(() => {
    if (!temHistorico) return [];
    return state.alertas.filter(
      (a) =>
        !a.resolvido &&
        (a.motivo.includes("[R10:") || a.motivo.includes("[R11:")),
    );
  }, [state.alertas, temHistorico]);

  // e1RM/PR só com sessão real ancorada
  const estadosReais = temHistorico
    ? state.estados.filter(
        (e) =>
          e.ultima_sessao_em != null ||
          (e.pr_reps > 0 && e.origem_carga === "historico") ||
          state.registros.some((r) => r.exercicio_id === e.exercicio_id),
      )
    : [];

  const concluidas = state.sessoes.filter((s) => s.status === "concluida").length;
  const planejadas4sem = (state.plano?.dias_por_semana ?? 4) * 4;
  const consistenciaPct = temHistorico
    ? Math.min(
        100,
        Math.round((concluidas / Math.max(planejadas4sem, 1)) * 100),
      )
    : 0;

  return (
    <main className="motion-fade-up motion-stagger px-5 pb-8 pt-8">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
        Progresso
      </p>
      <h1 className="mb-4 text-2xl font-bold">Evolução real</h1>

      {!temHistorico ? (
        <Card className="mb-6 border border-accent/20 bg-accent/5">
          <p className="text-sm font-semibold text-accent">Sem dados ainda</p>
          <p className="mt-1 text-sm text-muted">
            Complete um treino e registre séries — volume, e1RM e PRs sobem só
            com o que você fez de verdade.
          </p>
          <Link
            href="/hoje"
            className="mt-3 inline-block text-sm font-semibold text-accent underline"
          >
            Ir para Hoje →
          </Link>
        </Card>
      ) : null}

      <SectionTitle title="Volume semanal efetivo" />
      <p className="mb-3 text-xs text-muted">
        Faixa alvo {VOLUME_MIN}–{VOLUME_MAX} séries efetivas (diretas +
        0,5×indiretas)
      </p>
      <Card className="card-motion mb-6 space-y-4 motion-stagger">
        {vols.length === 0 && (
          <p className="text-sm text-muted">
            Sem dados ainda — complete um treino.
          </p>
        )}
        {vols.map((v, vi) => {
          const faixa =
            v.series_efetivas < VOLUME_MIN
              ? "abaixo"
              : v.series_efetivas > VOLUME_MAX
                ? "acima"
                : "na faixa";
          const tone =
            faixa === "na faixa" ? "go" : faixa === "abaixo" ? "warn" : "danger";
          const barTone = faixa === "na faixa" ? "go" : "warn";
          return (
            <div key={v.grupo}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span>{labelGrupo(v.grupo)}</span>
                <div className="flex items-center gap-2">
                  <Badge tone={tone}>
                    {faixa === "abaixo"
                      ? "abaixo"
                      : faixa === "acima"
                        ? "acima"
                        : "na faixa"}
                  </Badge>
                  <span className="load-num">
                    {v.series_efetivas}
                    <span className="text-muted">
                      {" "}
                      / {VOLUME_MIN}–{VOLUME_MAX}
                    </span>
                  </span>
                </div>
              </div>
              {barsOn ? (
                <VolumeBar
                  label={labelGrupo(v.grupo)}
                  valor={v.series_efetivas}
                  max={24}
                  faixa={[VOLUME_MIN, VOLUME_MAX]}
                  index={vi}
                  tom={barTone}
                  cabecalho={false}
                  unidade="séries efetivas/semana"
                />
              ) : (
                <div className="vb-track mt-1 h-2" aria-hidden />
              )}
            </div>
          );
        })}
      </Card>

      {alertasVolume.length > 0 && (
        <>
          <SectionTitle title="Alertas de volume" />
          <div className="mb-6 space-y-3 motion-stagger">
            {alertasVolume.map((a) => {
              const isR10 = a.motivo.includes("[R10:");
              return (
                <Card key={a.id}>
                  <div className="mb-1 flex flex-wrap gap-2">
                    <Badge tone={isR10 ? "warn" : "danger"}>
                      {isR10 ? "Abaixo da faixa" : "Acima da faixa"}
                    </Badge>
                    <Badge tone="muted">N1</Badge>
                  </div>
                  <p className="text-sm">
                    {semCodigoRegra(a.motivo.replace(/\[[^\]]+\]\s*/, ""))}
                  </p>
                  <p className="mt-1 text-xs text-accent">{a.recomendacao}</p>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <SectionTitle title="e1RM e PRs" />
      <div className="mb-6 space-y-3 motion-stagger">
        {estadosReais.length === 0 && (
          <Card>
            <p className="text-sm text-muted">
              Sem dados ainda — complete um treino.
            </p>
          </Card>
        )}
        {estadosReais.map((e, i) => {
          const ex = state.exercicios.find((x) => x.id === e.exercicio_id);
          return (
            <Card
              key={e.exercicio_id}
              className={`flex items-center justify-between gap-3 ${i === 0 ? "pr-pop" : ""}`}
            >
              <div>
                <p className="font-semibold">{ex?.nome ?? e.exercicio_id}</p>
                <p className="text-xs text-muted">
                  PR {e.pr_carga_kg} kg × {e.pr_reps} · carga atual{" "}
                  {e.carga_atual_kg} kg
                </p>
              </div>
              <Stat label="e1RM" value={`${e.e1rm_estimado_kg}`} mono />
            </Card>
          );
        })}
      </div>

      <SectionTitle title="Consistência (4 semanas)" />
      <Card className="mb-6">
        <div className="mb-2 flex justify-between text-sm">
          <span>Sessões vs planejado</span>
          <span className="load-num font-semibold">{consistenciaPct}%</span>
        </div>
        <ProgressBar value={consistenciaPct} max={100} tone="accent" />
        <p className="mt-2 text-xs text-muted">
          {temHistorico
            ? `${concluidas} concluída(s) nesta janela · sem streak punitivo.`
            : "Sem dados ainda — complete um treino."}
        </p>
      </Card>

      <SectionTitle title="Decisões recentes" />
      <div className="motion-stagger space-y-3">
        {state.decisoes.length === 0 && (
          <Card>
            <p className="text-sm text-muted">
              Sem decisões ainda — o coach registra a decisão de cada exercício após cada sessão.
            </p>
          </Card>
        )}
        {[...state.decisoes].reverse().slice(0, 6).map((d) => {
          const ex = state.exercicios.find((e) => e.id === d.exercicio_id);
          return (
            <Card key={d.id}>
              <div className="mb-1 flex flex-wrap gap-2">
                <Badge tone="accent">{d.regra}</Badge>
                <Badge tone="muted">{d.acao.replace(/_/g, " ")}</Badge>
                <EvidenciaBadge evidencia={d.evidencia} />
              </div>
              <p className="text-sm">
                {ex?.nome} ·{" "}
                <span className="load-num">
                  {d.carga_anterior_kg}→{d.nova_carga_kg} kg
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">{semCodigoRegra(d.motivo)}</p>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
