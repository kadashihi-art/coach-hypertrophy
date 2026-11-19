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
  ProgressBar,
  SectionTitle,
} from "@/components/ui";
import { comparacaoMeta, duracaoDaSessao, formatarDescanso } from "@/lib/engine/duracao-treino";
import type { LlmResponseEnvelope } from "@/lib/llm/contract";
import { textoCarga } from "@/lib/catalog/tipo-carga";
import { useModoCarga } from "@/lib/use-modo-carga";
import { kgTexto, recordesDaSessao, textoAcao } from "@/lib/treino/fim-do-treino";
import { hojeIsoSaoPaulo, proximaSessao } from "@/lib/plan/proxima-sessao";
import { agendaEfetiva } from "@/lib/plan/pendente";
import { projetarOcorrencias } from "@/lib/plan/projecao";
import { useClientValue } from "@/lib/use-client-value";

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

  const recordes = lastSess ? recordesDaSessao(state, lastSess) : [];
  // Dia de São Paulo só no cliente (no build não há "hoje").
  const hojeSP = useClientValue<string | null>(hojeIsoSaoPaulo, null);
  const proximo = (() => {
    if (!hojeSP) return null;
    const p = proximaSessao(state, hojeSP);
    if (!p) return null;
    const data = projetarOcorrencias(state, hojeSP, agendaEfetiva(state, hojeSP))
      .filter((x) => x.status === "planejada" && !!x.data && x.data >= hojeSP && x.id.split("#")[0] === p.id)
      .map((x) => x.data!)
      .sort()[0];
    const dia = data
      ? data === hojeSP
        ? "hoje"
        : new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "numeric" })
      : null;
    return { nome: p.nome, dia };
  })();
  const dt = lastSess ? duracaoDaSessao(lastSess, state.registros) : null;
  const metaTempo = dt ? comparacaoMeta(dt.duracao_min, state.perfil?.minutos_por_sessao) : null;
  const nomeEx = (id: string) => state.exercicios.find((e) => e.id === id);

  return (
    <main className="motion-fade-up motion-stagger px-5 pb-8 pt-8">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">Fim do treino</p>
      <h1 className="text-2xl font-bold">Treino feito ✓</h1>
      <p className="mb-4 text-sm text-muted">{lastSess?.nome ?? "Sessão"}</p>

      <section data-testid="duracao-treino" aria-label="Resumo do treino">
        <Card className="mb-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="load-num text-2xl font-bold">{dt ? `${dt.duracao_min}` : "—"}<span className="text-sm font-normal text-muted"> min</span></p>
              <p className="text-xs text-muted">duração</p>
            </div>
            <div>
              <p className="load-num text-2xl font-bold">{seriesCount}</p>
              <p className="text-xs text-muted">{seriesCount === 1 ? "série de trabalho" : "séries de trabalho"}</p>
            </div>
            <div>
              <p className="load-num text-2xl font-bold">{dt?.descanso_medio_s != null ? formatarDescanso(dt.descanso_medio_s) : "—"}</p>
              <p className="text-xs text-muted">descanso médio</p>
            </div>
          </div>
          {metaTempo ? <p className="mt-3 text-center text-xs text-muted">{metaTempo}</p> : null}
          {dt && dt.pausas_ignoradas > 0 ? (
            <p className="mt-1 text-center text-xs text-muted">
              {dt.pausas_ignoradas === 1 ? "Uma pausa longa ficou fora da conta." : `${dt.pausas_ignoradas} pausas longas ficaram fora da conta.`}
            </p>
          ) : null}
        </Card>
      </section>

      {recordes.length ? (
        <section data-testid="recordes" aria-label="Recordes">
          <Card className="mb-4 border border-go/35">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Recordes de hoje</p>
              <Badge tone="go">{recordes.length === 1 ? "1 novo" : `${recordes.length} novos`}</Badge>
            </div>
            <ul className="space-y-2">
              {recordes.map((r) => {
                const ex = nomeEx(r.exercicio_id);
                return (
                  <li key={r.exercicio_id} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{ex?.nome ?? r.exercicio_id}</span>
                    <span className="load-num shrink-0 text-right">
                      <span className="text-go">{kgTexto(r.atual.carga_kg)} kg × {r.atual.reps}</span>
                      <span className="block text-xs text-muted">antes {kgTexto(r.antes.carga_kg)} × {r.antes.reps}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted">Comparado pela força estimada: mais carga ou mais reps na mesma carga.</p>
          </Card>
        </section>
      ) : null}

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
              ⚠️ {bits.join(" e ")}. Já ajustei os próximos treinos. Veja os detalhes em Evolução.
            </p>
          </Card>
        );
      })()}

      {lastSess ? <FeedbackPosTreino sessao={lastSess} /> : null}

      {proximo ? (
        <section data-testid="proximo-treino" aria-label="Próximo treino">
          <Card className="mb-4 border border-accent/30">
            <p className="text-xs uppercase tracking-wide text-muted">Próximo treino</p>
            <p className="text-lg font-bold">
              {proximo.nome}
              {proximo.dia ? <span className="text-sm font-normal capitalize text-muted"> · {proximo.dia}</span> : null}
            </p>
          </Card>
        </section>
      ) : null}

      <SectionTitle title="O que muda na próxima vez" />
      <div className="mb-4">
        <Card>
          {decisoes.length === 0 ? (
            <p className="text-sm text-muted">Sem séries de trabalho registradas, então as cargas ficam como estavam.</p>
          ) : (
            <ul className="divide-y divide-border">
              {decisoes.map((d) => {
                const ex = nomeEx(d.exercicio_id);
                const a = textoAcao(d.acao);
                return (
                  <li key={d.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold">{ex?.nome ?? d.exercicio_id}</span>
                      <Badge tone={a.tom}>{a.texto}</Badge>
                    </div>
                    <p className="load-num mt-0.5 text-sm text-bone-200">
                      {d.nova_carga_kg !== d.carga_anterior_kg ? `${kgTexto(d.carga_anterior_kg)} → ` : ""}
                      {textoCarga(d.nova_carga_kg, ex, alternado(ex?.id))}
                      {d.faixa_reps_reiniciada ? " · reps voltam pro começo da faixa" : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{semCodigoRegra(d.motivo)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <details className="mb-4 rounded-2xl border border-border bg-surface px-4 py-3" data-testid="volume-vs-planejado">
        <summary className="cursor-pointer text-sm font-semibold">Séries por músculo: feito × planejado</summary>
        <div className="mt-3 space-y-3">
          {volumeVs.length === 0 && <p className="text-sm text-muted">Sem séries registradas.</p>}
          {volumeVs.map((v) => (
            <div key={v.grupo}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{labelGrupo(v.grupo)}</span>
                <span className="load-num text-muted">{v.realizado}/{v.planejado}</span>
              </div>
              <ProgressBar value={v.realizado} max={Math.max(v.planejado, 1)} tone={v.realizado >= v.planejado ? "go" : "accent"} />
            </div>
          ))}
        </div>
      </details>

      <SectionTitle title="O coach sobre o treino" />
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

        <p className="mb-2 text-sm font-semibold text-go">O que foi bem</p>
        <ul className="mb-3 list-disc pl-4 text-sm text-muted">
          {useApiCoach ? (
            analise.pontos_fortes.map((t, i) => <li key={`f-${i}`}>{t}</li>)
          ) : (
            <>
              {decisoes.some((d) => d.acao === "subir_carga") ? (
                <li>Carga subiu onde as suas séries mostraram margem.</li>
              ) : (
                <li>
                  Treino registrado. Cada exercício com série de trabalho foi avaliado.
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
                      {ex?.nome}: {kgTexto(d.carga_anterior_kg)} → {textoCarga(d.nova_carga_kg, ex, alternado(ex?.id))}
                    </li>
                  );
                })}
            </>
          )}
        </ul>
        <p className="mb-2 text-sm font-semibold text-warn">O que ajustar</p>
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
                      {ex?.nome}: {textoAcao(d.acao).texto}. {semCodigoRegra(d.motivo)}
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
            O coach não respondeu agora. Este é o resumo do próprio app, e as cargas continuam calculadas normalmente.
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
        Ver evolução →
      </Link>
    </main>
  );
}
