"use client";

import { ehSeriePreparatoria } from "@/lib/domain/enums";
import { alertaVolumeValido } from "@/lib/engine/alertas-volume";
import { inicioDeUso } from "@/lib/inicio";
import { semCodigoRegra } from "@/lib/llm/tom";
import { labelGrupo } from "@/lib/labels";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { FeedbackPosTreino } from "@/components/FeedbackMusculos";
import {
  Badge,
  Button,
  Card,
  EvidenciaBadge,
  ProgressBar,
  SectionTitle,
} from "@/components/ui";
import { comparacaoMeta, duracaoDaSessao, formatarDescanso } from "@/lib/engine/duracao-treino";
import type { LlmResponseEnvelope } from "@/lib/llm/contract";
import { textoCarga } from "@/lib/catalog/tipo-carga";
import { useModoCarga } from "@/lib/use-modo-carga";

/** T6 — Análise pós-treino com evidência, R# e volume vs planejado */
export default function FeedbackPage() {
  const { state } = useApp();
  const { alternado } = useModoCarga();
  const lastSess = [...state.sessoes]
    .filter((s) => s.status === "concluida")
    .sort((a, b) =>
      (b.finalizada_em ?? "").localeCompare(a.finalizada_em ?? ""),
    )[0];

  const decisoes = lastSess
    ? state.decisoes.filter((d) => d.sessao_id === lastSess.id)
    : [];

  const volumeVs = lastSess?.volume_por_grupo ?? [];
  const seriesCount = lastSess
    ? state.registros.filter(
        (r) =>
          r.sessao_id === lastSess.id && !ehSeriePreparatoria(r.tipo_serie),
      ).length
    : 0;

  const coachKey = lastSess
    ? `${lastSess.id}:${decisoes.map((d) => d.id).join(",")}:${volumeVs
        .map((v) => `${v.grupo}-${v.realizado}`)
        .join(",")}`
    : "";

  const [coach, setCoach] = useState<LlmResponseEnvelope | null>(null);
  const [semIa, setSemIa] = useState(false);
  const [coachStatus, setCoachStatus] = useState<"idle" | "loading" | "ok" | "err">(
    "idle",
  );

  useEffect(() => {
    if (!lastSess || !coachKey) return;
    const body = {
      tipo: "pos_treino" as const,
      sessao_id: lastSess.id,
      sessao_nome: lastSess.nome,
      decisoes: decisoes.map((d) => {
        const ex = state.exercicios.find((e) => e.id === d.exercicio_id);
        return {
          exercicio_id: d.exercicio_id,
          nome: ex?.nome,
          regra: d.regra,
          acao: d.acao,
          carga_anterior_kg: d.carga_anterior_kg,
          nova_carga_kg: d.nova_carga_kg,
          faixa_reps_reiniciada: d.faixa_reps_reiniciada,
          motivo: d.motivo,
          evidencia: d.evidencia,
        };
      }),
      volume: volumeVs.map((v) => ({
        grupo: v.grupo,
        planejado: v.planejado,
        realizado: v.realizado,
      })),
    };
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- estado de carregamento da busca ao Coach (sincroniza com a API externa)
    setCoachStatus("loading");
    setSemIa(false);
    fetch("/api/coach/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as LlmResponseEnvelope & { sem_ia?: boolean };
      })
      .then((data) => {
        if (cancelled) return;
        setCoach(data);
        setSemIa(data.sem_ia === true);
        setCoachStatus("ok");
      })
      .catch(() => {
        if (cancelled) return;
        setCoach(null);
        setCoachStatus("err");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- coachKey captura sessão/decisões
  }, [coachKey]);

  const analise = coach?.analise_pos_treino;
  const useApiCoach = coachStatus === "ok" && analise;

  return (
    <main className="motion-fade-up motion-stagger px-5 pb-8 pt-8">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
        Pós-treino
      </p>
      <h1 className="mb-1 text-2xl font-bold">
        {lastSess?.nome ?? "Sessão"} concluída
      </h1>
      <p className="mb-4 text-sm text-muted">
        {seriesCount} {seriesCount === 1 ? "série" : "séries"} de trabalho · regras de progressão aplicadas
      </p>

      {(() => {
        const dt = lastSess ? duracaoDaSessao(lastSess, state.registros) : null;
        if (!dt) return null;
        const meta = comparacaoMeta(dt.duracao_min, state.perfil?.minutos_por_sessao);
        return (
          <section data-testid="duracao-treino" aria-label="Duração do treino"><Card className="mb-4">
            <div className="flex justify-around text-center">
              <div>
                <p className="load-num text-2xl font-bold">{dt.duracao_min} min</p>
                <p className="text-xs text-muted">Duração</p>
              </div>
              <div>
                <p className="load-num text-2xl font-bold">
                  {dt.descanso_medio_s != null ? formatarDescanso(dt.descanso_medio_s) : "—"}
                </p>
                <p className="text-xs text-muted">Descanso médio real</p>
              </div>
            </div>
            {meta ? <p className="mt-3 text-center text-sm text-muted">{meta}</p> : null}
            {dt.pausas_ignoradas > 0 ? (
              <p className="mt-1 text-center text-xs text-muted">
                {dt.pausas_ignoradas === 1 ? "Uma pausa longa ficou fora da conta." : `${dt.pausas_ignoradas} pausas longas ficaram fora da conta.`}
              </p>
            ) : null}
          </Card></section>
        );
      })()}

      {(() => {
        const volAlerts = state.alertas.filter(
          (a) =>
            !a.resolvido &&
            lastSess &&
            a.origem_sessao_id === lastSess.id &&
            (a.motivo.includes("[R10:") || a.motivo.includes("[R11:")) &&
            alertaVolumeValido(a.motivo, inicioDeUso(state)),
        );
        if (volAlerts.length === 0) return null;
        const r10 = volAlerts.filter((a) => a.motivo.includes("[R10:")).length;
        const r11 = volAlerts.filter((a) => a.motivo.includes("[R11:")).length;
        const bits = [
          r10 ? `${r10 === 1 ? "1 músculo ficou" : `${r10} músculos ficaram`} com pouco volume` : null,
          r11 ? `${r11 === 1 ? "1 músculo passou" : `${r11} músculos passaram`} do volume ideal` : null,
        ].filter(Boolean);
        return (
          <Card className="mb-4 border-warn/40 bg-[rgba(255,184,60,.08)]">
            <p className="text-sm text-warn">
              ⚠️ {bits.join(" e ")}. Já ajustei os próximos treinos. Veja os detalhes em Progresso.
            </p>
          </Card>
        );
      })()}

      {lastSess ? <FeedbackPosTreino sessao={lastSess} /> : null}

      <SectionTitle title="Volume vs planejado" />
      <Card className="card-motion mb-4 space-y-3">
        {volumeVs.length === 0 && (
          <p className="text-sm text-muted">
            Sem volume registrado — conclua séries no logger.
          </p>
        )}
        {volumeVs.map((v) => (
          <div key={v.grupo}>
            <div className="mb-1 flex justify-between text-sm">
              <span>{labelGrupo(v.grupo)}</span>
              <span className="load-num text-muted">
                {v.realizado}/{v.planejado}
              </span>
            </div>
            <ProgressBar
              value={v.realizado}
              max={Math.max(v.planejado, 1)}
              tone={v.realizado >= v.planejado ? "go" : "accent"}
            />
          </div>
        ))}
      </Card>

      <SectionTitle title="Decisões de progressão" />
      <div className="mb-4 space-y-3 motion-stagger">
        {decisoes.length === 0 && (
          <Card>
            <p className="text-sm text-muted">
              Nenhuma decisão nesta sessão (registre séries no logger).
            </p>
          </Card>
        )}
        {decisoes.map((d) => {
          const ex = state.exercicios.find((e) => e.id === d.exercicio_id);
          return (
            <Card key={d.id} className="card-motion">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="accent">{d.regra}</Badge>
                <Badge
                  tone={
                    d.acao === "subir_carga"
                      ? "go"
                      : d.acao === "reduzir_carga" || d.acao === "deload"
                        ? "warn"
                        : d.acao === "suspender"
                          ? "danger"
                          : "muted"
                  }
                >
                  {d.acao.replace(/_/g, " ")}
                </Badge>
                <EvidenciaBadge evidencia={d.evidencia} />
              </div>
              <p className="font-semibold">{ex?.nome ?? d.exercicio_id}</p>
              <p className="load-num mt-1 text-lg">
                {String(d.carga_anterior_kg).replace(".", ",")} → {textoCarga(d.nova_carga_kg, ex, alternado(ex?.id))}
                {d.faixa_reps_reiniciada ? " · faixa reiniciada" : ""}
              </p>
              <p className="mt-2 text-sm text-muted">{semCodigoRegra(d.motivo)}</p>
            </Card>
          );
        })}
      </div>

      <SectionTitle title="Pontos (coach)" />
      <Card className="mb-4">
        {coachStatus === "loading" && (
          <p className="mb-3 text-sm text-muted">Coach analisando a sessão…</p>
        )}
        {semIa ? (
          <p className="mb-3 text-xs text-muted">O Coach está sem IA agora; seus números seguem calculados normalmente.</p>
        ) : null}
        {useApiCoach && coach?.mensagem_usuario ? (
          <p className="mb-3 text-sm leading-relaxed text-bone-50">
            {coach.mensagem_usuario}
          </p>
        ) : null}

        <p className="mb-2 text-sm font-semibold text-go">Fortes</p>
        <ul className="mb-3 list-disc pl-4 text-sm text-muted">
          {useApiCoach ? (
            analise.pontos_fortes.map((t, i) => <li key={`f-${i}`}>{t}</li>)
          ) : (
            <>
              {decisoes.some((d) => d.acao === "subir_carga") ? (
                <li>Progressão aplicada — carga sobe com base nas suas séries.</li>
              ) : (
                <li>
                  Sessão registrada. O coach avaliou cada exercício com séries.
                </li>
              )}
              {decisoes
                .filter((d) => d.acao === "subir_carga")
                .map((d) => {
                  const ex = state.exercicios.find(
                    (e) => e.id === d.exercicio_id,
                  );
                  return (
                    <li key={d.id}>
                      {ex?.nome}: {String(d.carga_anterior_kg).replace(".", ",")}→{textoCarga(d.nova_carga_kg, ex, alternado(ex?.id))} (
                      {d.regra})
                    </li>
                  );
                })}
            </>
          )}
        </ul>
        <p className="mb-2 text-sm font-semibold text-warn">Fracos / ajustes</p>
        <ul className="list-disc pl-4 text-sm text-muted">
          {useApiCoach ? (
            <>
              {analise.pontos_fracos.map((t, i) => (
                <li key={`w-${i}`}>{t}</li>
              ))}
              {analise.ajustes.map((t, i) => (
                <li key={`a-${i}`}>{t}</li>
              ))}
            </>
          ) : (
            <>
              {decisoes
                .filter((d) =>
                  [
                    "reduzir_carga",
                    "deload",
                    "suspender",
                    "manter_e_checar",
                  ].includes(d.acao),
                )
                .map((d) => {
                  const ex = state.exercicios.find(
                    (e) => e.id === d.exercicio_id,
                  );
                  return (
                    <li key={d.id}>
                      {ex?.nome}: {d.regra} — {d.acao.replace(/_/g, " ")}
                    </li>
                  );
                })}
              {decisoes.every((d) =>
                ["subir_carga", "manter_carga"].includes(d.acao),
              ) && <li>Nenhum alerta de fadiga ou dor nesta sessão.</li>}
            </>
          )}
        </ul>
        {coachStatus === "err" && (
          <p className="mt-3 text-xs text-muted">
            Coach indisponível agora — resumo local (as cargas continuam
            calculadas pelo app).
          </p>
        )}
      </Card>

      <Link href="/hoje">
        <Button>Voltar ao Hoje</Button>
      </Link>
      <Link
        href="/progresso"
        className="mt-3 block text-center text-sm text-muted"
      >
        Ver progresso →
      </Link>
    </main>
  );
}
