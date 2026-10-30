"use client";

import { VolumeBar } from "@/components/VolumeBar";
import { semCodigoRegra } from "@/lib/llm/tom";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import {
  AlertaBanner,
  Button,
  Card,
  EvidenciaBadge,
} from "@/components/ui";
import { addDaysIso } from "@/lib/plan/calendario";
import {
  hojeIsoSaoPaulo,
  proximaSessao,
  sessoesDoPlano,
} from "@/lib/plan/proxima-sessao";
import { faseAtiva } from "@/lib/plan/estrutura";
import { alvoEditarHoje } from "@/lib/plan/hoje-editar";
import { EditarTreinoSheet } from "@/components/EditarTreinoSheet";
import {
  avaliarCheckinDeload,
  resumoAjusteDeload,
} from "@/lib/engine/checkin-deload";
import {
  feedbackSono,
  resumoSonoCheckin,
} from "@/lib/domain/sono";
import {
  PARQ_BLOQUEIO_MSG,
  precisaResponderParq,
  parqBloqueiaPrescricao,
} from "@/lib/plan/parq";

export default function HojePage() {
  const { state, ready, startSession } = useApp();
  const router = useRouter();
  // escolha manual vale só enquanto a sugerida não muda (ex.: acabou de concluir)
  const [picked, setPicked] = useState<{ id: string; sug: string | null } | null>(null);
  const [alertaFechado, setAlertaFechado] = useState(false);
  const [editar, setEditar] = useState<string | null>(null);
  const [avisoEdicao, setAvisoEdicao] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!state.perfil?.onboarding_concluido) {
      router.replace("/onboarding");
    }
  }, [ready, state.perfil, router]);

  const hojeSP = ready ? hojeIsoSaoPaulo() : null;
  const ciclo = useMemo(() => sessoesDoPlano(state, hojeSP), [state, hojeSP]);
  const sugerida = useMemo(() => proximaSessao(state), [state]);
  const fase = useMemo(() => faseAtiva(state.plano, hojeSP), [state.plano, hojeSP]);

  const pickedId = picked && picked.sug === (sugerida?.id ?? null) ? picked.id : (sugerida?.id ?? null);
  const setPickedId = (id: string) => setPicked({ id, sug: sugerida?.id ?? null });

  const sess =
    ciclo.find((s) => s.id === pickedId) ??
    sugerida ??
    ciclo[0];

  const plano = state.plano;
  // ready só é true no cliente (estado hidratado), então dá pra ler a data direto
  const agora = ready ? new Date() : null;
  const hojeIso = agora ? agora.toISOString().slice(0, 10) : null;
  const hojeLabel = agora
    ? agora.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "short",
        timeZone: "America/Sao_Paulo",
      })
    : "";
  const alerta =
    state.alertas.find((a) => !a.resolvido) ??
    state.alertas.find((a) => a.nivel !== "N0") ??
    state.alertas[0];
  const ck = hojeIso
    ? state.checkins.find((c) => c.data === hojeIso)
    : undefined;

  const deloadPreview = useMemo(() => {
    if (!sess || !hojeIso) return null;
    // Sessão já em andamento: prescricoes já podem estar ajustadas —
    // ainda assim mostramos resumo a partir do check-in/meso/estados.
    return avaliarCheckinDeload({
      checkin: ck ?? null,
      mesociclo: state.plano?.mesociclo,
      estados: state.estados,
      prescricoes: sess.prescricoes,
      exercicios: state.exercicios,
      data: hojeIso,
    });
  }, [sess, ck, state.plano?.mesociclo, state.estados, state.exercicios, hojeIso]);

  const deloadResumo = deloadPreview
    ? resumoAjusteDeload(deloadPreview)
    : null;

  const parqBloqueado = parqBloqueiaPrescricao(state.perfil);
  const parqPendente = precisaResponderParq(state.perfil);

  function iniciar() {
    if (!sess) return;
    if (parqBloqueado) {
      if (parqPendente) router.push("/onboarding");
      return;
    }
    startSession(sess.id);
    router.push("/treino");
  }

  if (!ready || !state.perfil?.onboarding_concluido) {
    return (
      <main className="motion-fade-up flex min-h-dvh items-center justify-center p-6">
        <p className="text-sm text-muted">Carregando…</p>
      </main>
    );
  }


  const ultimaDecisao = state.decisoes
    .filter((d) => sess && d.exercicio_id && sess.prescricoes.some((p) => p.exercicio_id === d.exercicio_id))
    .slice(-1)[0];

  // Hero: 4 estados (não iniciado · em andamento · feito · descanso)
  const totalSeries = sess ? sess.prescricoes.reduce((n, p) => n + p.series, 0) : 0;
  const feitas = sess ? state.registros.filter((r) => r.sessao_id === sess.id).length : 0;
  const hoje = hojeSP ?? hojeIso;
  const temAgenda = state.sessoes.some((s) => !!s.data);
  const sessHoje = hoje ? state.sessoes.find((s) => s.data === hoje && s.status !== "pulada") : undefined;
  const estadoHero: "andamento" | "feito" | "descanso" | "novo" =
    sess?.status === "em_andamento"
      ? "andamento"
      : sess?.status === "concluida" && (!hoje || sess.data === hoje || !sess.data)
        ? "feito"
        : temAgenda && hoje && !sessHoje
          ? "descanso"
          : "novo";
  const proxData = sugerida?.data
    ? new Date(`${sugerida.data}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" })
    : null;

  // Semana strip (seg→dom da semana atual, fuso SP)
  const semana = (() => {
    if (!hoje) return [] as { iso: string; label: string; st: "feito" | "planejado" | "pulado" | "vazio"; hoje: boolean }[];
    const dow = (new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7; // 0=seg
    const seg = addDaysIso(hoje, -dow);
    const L = ["S", "T", "Q", "Q", "S", "S", "D"];
    return L.map((label, i) => {
      const iso = addDaysIso(seg, i);
      const ss = state.sessoes.filter((x) => x.data === iso);
      const st = ss.some((x) => x.status === "concluida")
        ? ("feito" as const)
        : ss.some((x) => x.status === "pulada") && !ss.some((x) => x.status === "planejada")
          ? ("pulado" as const)
          : ss.length
            ? ("planejado" as const)
            : ("vazio" as const);
      return { iso, label, st, hoje: iso === hoje };
    });
  })();
  const consistencia = (() => {
    if (!hoje) return null;
    const ini = addDaysIso(hoje, -27);
    const janela = state.sessoes.filter((x) => x.data && x.data >= ini && x.data <= hoje);
    if (!janela.length) return null;
    return { feitos: janela.filter((x) => x.status === "concluida").length, total: janela.length };
  })();

  // Alerta único (prioridade: PAR-Q > alerta do plano > ajuste do check-in)
  const alertaUnico = parqBloqueado
    ? "parq"
    : alerta && alerta.nivel !== "N0"
      ? "alerta"
      : deloadResumo
        ? "deload"
        : null;

  const alvoEdicao = alvoEditarHoje(state, sess?.id);
  const botaoEdicao = alvoEdicao ? (
    <button
      type="button"
      data-testid="hoje-editar-treino"
      onClick={() => {
        if (alvoEdicao.modo === "bloqueado") setAvisoEdicao(alvoEdicao.motivo);
        else { setAvisoEdicao(null); setEditar(alvoEdicao.sessaoId); }
      }}
      className="motion-press mt-2 min-h-11 w-full rounded-2xl border border-accent/40 text-sm font-semibold text-accent"
    >
      {alvoEdicao.label}
    </button>
  ) : null;

  const ctaDisabled = !sess || !!plano?.bloqueado || sess.prescricoes.length === 0 || parqBloqueado;
  const coachPergunta = sess
    ? `Por que ${sess.nome} hoje com esse volume?`
    : "Por que meu plano está montado assim?";

  return (
    <main className="motion-fade-up motion-stagger px-5 pb-28 pt-8">
      {editar ? (
        <EditarTreinoSheet sessaoId={editar} onClose={() => setEditar(null)} onSalvo={(m) => setAvisoEdicao(m)} />
      ) : null}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted capitalize">
            {hojeLabel || "Hoje"}
          </p>
          <h1 className="text-2xl font-bold">Bora treinar</h1>
          {plano ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted">
                Meso · sem <span className="num text-go">{plano.mesociclo.semana_atual}</span>/{plano.mesociclo.total_semanas}
              </span>
              <div className="w-20">
                <VolumeBar
                  label="Mesociclo"
                  valor={plano.mesociclo.semana_atual}
                  max={plano.mesociclo.total_semanas}
                  faixa={null}
                  cabecalho={false}
                  unidade={`de ${plano.mesociclo.total_semanas} semanas`}
                  fina
                />
              </div>
            </div>
          ) : null}
          {fase && (state.plano?.estrutura?.fases.length ?? 0) > 1 ? (
            <p className="mt-1 text-xs opacity-70">{fase.nome} · semanas {fase.semana_inicio}–{fase.semana_inicio + fase.semanas - 1}</p>
          ) : null}
        </div>
        <span className="pill-offline">Offline</span>
      </div>

      {alertaUnico && !alertaFechado ? (
        <div className="motion-swap relative mb-4">
          {alertaUnico === "parq" ? (
            <Card className="border-danger/40 bg-danger/10 text-sm">
              <p className="mb-1 font-bold text-danger">PAR-Q+ · bloqueio N2</p>
              <p className="mb-2 text-muted">{PARQ_BLOQUEIO_MSG}</p>
              {parqPendente ? (
                <Link href="/onboarding" className="text-xs font-semibold text-accent underline">
                  Responder triagem PAR-Q+
                </Link>
              ) : (
                <a href="https://eparmedx.com/" target="_blank" rel="noreferrer" className="text-xs font-semibold text-accent underline">
                  eparmedx.com
                </a>
              )}
            </Card>
          ) : alertaUnico === "alerta" && alerta ? (
            <AlertaBanner nivel={alerta.nivel} motivo={semCodigoRegra(alerta.motivo)} recomendacao={alerta.recomendacao} />
          ) : (
            <div className="rounded-2xl border border-accent/30 bg-[rgba(184,255,60,.08)] px-4 py-3 pr-10 text-sm text-accent">
              {deloadResumo}
            </div>
          )}
          {alertaUnico !== "parq" ? (
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => setAlertaFechado(true)}
              className="motion-press absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full text-muted"
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Hero: Treino do dia */}
      {sess && (
        <Card className="motion-press mb-4 border border-accent/25 p-5">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-xs uppercase text-muted">
              {estadoHero === "descanso" ? "Hoje é descanso" : estadoHero === "feito" ? "Treino de hoje" : "Treino do dia"}
            </div>
            {sess.prescricoes[0] && <EvidenciaBadge evidencia={sess.prescricoes[0].evidencia} />}
          </div>
          {estadoHero === "descanso" ? (
            <>
              <h2 className="text-3xl font-bold tracking-tight">Descanso</h2>
              <p className="mt-2 text-sm text-bone-300">
                Próximo: <span className="font-semibold">{sess.nome}</span>
                {proxData ? <span className="capitalize"> · {proxData}</span> : null}
              </p>
            </>
          ) : estadoHero === "feito" ? (
            <>
              <h2 className="pr-pop text-3xl font-bold tracking-tight">Treino feito ✓</h2>
              <p className="mt-2 text-sm text-bone-300">
                {sess.nome} · <span className="num">{feitas}</span> séries registradas
              </p>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold tracking-tight">{sess.nome}</h2>
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-bone-300">
                <span className="num">~{sess.duracao_estimada_min} min</span>
                <span>·</span>
                <span>{sess.grupos.slice(0, 4).join(" · ")}</span>
              </div>
            </>
          )}
          {estadoHero === "andamento" && totalSeries > 0 ? (
            <div className="bar-track mt-3">
              <div className="bar-fill h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.round((feitas / totalSeries) * 100))}%`, height: "100%" }} />
            </div>
          ) : null}
          {ultimaDecisao && sugerida?.id === sess.id && estadoHero === "novo" && (
            <p className="mt-3 text-xs text-muted">
              {semCodigoRegra(ultimaDecisao.motivo).slice(0, 120)}
              {ultimaDecisao.motivo.length > 120 ? "…" : ""}
            </p>
          )}
          {estadoHero === "novo" || estadoHero === "andamento" ? (
            <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
              {sess.prescricoes.slice(0, 5).map((p) => {
                const ex = state.exercicios.find((e) => e.id === p.exercicio_id);
                const est = state.estados.find((e) => e.exercicio_id === p.exercicio_id);
                const carga = est?.alvo_proxima_sessao.carga_kg ?? p.carga.trabalho_kg;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{ex?.nome ?? p.exercicio_id}</span>
                    <span className="load-num shrink-0 text-muted">
                      {carga} kg · {p.series}×{p.faixa_reps[0]}–{p.faixa_reps[1]}
                    </span>
                  </li>
                );
              })}
              {sess.prescricoes.length > 5 ? (
                <li className="text-xs text-faint">+{sess.prescricoes.length - 5} exercícios</li>
              ) : null}
            </ul>
          ) : null}
          <div className="mt-4">
            {estadoHero === "feito" ? (
              <Link href="/progresso" className="motion-press block rounded-[14px] bg-white/5 py-3 text-center text-sm font-semibold text-accent">
                Ver progresso →
              </Link>
            ) : estadoHero === "descanso" ? (
              <Link href="/plano/calendario" className="motion-press block rounded-[14px] bg-white/5 py-3 text-center text-sm font-semibold text-accent">
                Ver semana →
              </Link>
            ) : (
              <Button onClick={iniciar} disabled={ctaDisabled} className="motion-cta-glow min-h-14 py-5 text-lg">
                {estadoHero === "andamento"
                  ? `Continuar · série ${Math.min(feitas + 1, totalSeries || 1)}/${totalSeries}`
                  : `Começar · ${sess.nome} · ~${sess.duracao_estimada_min} min`}
              </Button>
            )}
            {botaoEdicao}
            {avisoEdicao ? (
              <p role="status" className="mt-2 text-xs text-muted">{avisoEdicao}</p>
            ) : null}
          </div>
        </Card>
      )}

      {/* Escolher outro dia do ciclo */}
      {ciclo.length > 1 ? (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {ciclo.map((s) => {
            const on = s.id === sess?.id;
            const done = s.status === "concluida";
            const live = s.status === "em_andamento";
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => { setPickedId(s.id); setAvisoEdicao(null); }}
                className={`chip-motion shrink-0 rounded-[14px] border px-3 py-2 text-left ${
                  on ? "on border-accent bg-[rgba(184,255,60,.12)]" : "border-border bg-surface"
                }`}
              >
                <div className="text-[10px] uppercase tracking-wide text-faint">
                  Dia {s.ordem}
                  {live ? " · agora" : done ? " · ok" : ""}
                </div>
                <div className={`text-sm font-semibold ${on ? "text-accent" : ""}`}>{s.nome}</div>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Check-in: entrada única */}
      {ck ? (
        <Link href="/checkin" className="motion-press mb-4 block">
          <Card>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">Check-in de hoje · toque pra editar</p>
              <span className="text-xs font-semibold text-go">feito</span>
            </div>
            <p className="mt-1 text-sm">
              Prontidão <span className="num">{ck.prontidao}</span>/5 · Sono {resumoSonoCheckin(ck)}
              {typeof ck.agua_ml === "number" ? ` · Água ${ck.agua_ml} ml` : ""}
            </p>
            {(() => {
              const hist = state.checkins
                .filter((c) => c.data !== ck.data)
                .sort((a, b) => b.data.localeCompare(a.data))
                .slice(0, 5)
                .map((c) => c.sono_h);
              const fb = feedbackSono(ck.sono_h, hist);
              return (
                <p className={`mt-1 text-xs ${fb.nivel === "baixo" || fb.nivel === "inconsistente" ? "text-warn" : fb.nivel === "ok" ? "text-go" : "text-muted"}`}>
                  {fb.titulo}. {fb.dica}
                </p>
              );
            })()}
            {ck.prontidao <= 2 || ck.sono_h < 6 ? (
              <p className="mt-1 text-xs text-warn">Sessão do dia ajustada: −1 série nos compostos (carga mantida).</p>
            ) : null}
          </Card>
        </Link>
      ) : (
        <Link
          href="/checkin"
          className="motion-press mb-4 flex min-h-12 items-center justify-between rounded-2xl border border-accent/60 px-4 py-3 text-sm"
        >
          <span className="font-semibold text-accent">Check-in 30s</span>
          <span className="text-xs text-muted">sono, energia, dor →</span>
        </Link>
      )}

      {/* Semana strip → calendário */}
      {semana.length ? (
        <Link href="/plano/calendario" className="motion-press mb-4 block">
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase text-muted">Semana</p>
              <span className="text-xs font-semibold text-accent">Calendário →</span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {semana.map((d) => (
                <div key={d.iso} className="flex flex-col items-center gap-1">
                  <span className={`text-[10px] ${d.hoje ? "font-bold text-accent" : "text-faint"}`}>{d.label}</span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      d.st === "feito"
                        ? "bg-accent"
                        : d.st === "planejado"
                          ? "border border-accent/70"
                          : d.st === "pulado"
                            ? "bg-warn/50"
                            : "bg-ink-800"
                    } ${d.hoje ? "ring-2 ring-accent/40 ring-offset-1 ring-offset-transparent" : ""}`}
                  />
                </div>
              ))}
            </div>
            {consistencia ? (
              <p className="mt-2 text-xs text-muted">
                Últimas 4 semanas: <span className="num text-bone-50">{consistencia.feitos}</span> de {consistencia.total} treinos agendados
              </p>
            ) : !temAgenda ? (
              <p className="mt-2 text-xs text-muted">Defina a data de início em Plano › Ajustar pra agendar a semana.</p>
            ) : null}
          </Card>
        </Link>
      ) : null}

      {/* Atalho coach contextual */}
      <Link href="/coach" className="motion-press mb-2 block">
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase text-muted">Pergunta pro coach</p>
            <p className="truncate text-sm font-semibold">{coachPergunta}</p>
          </div>
          <span className="text-accent">→</span>
        </Card>
      </Link>
    </main>
  );
}
