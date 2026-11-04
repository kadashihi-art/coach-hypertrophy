"use client";

import { VolumeBar } from "@/components/VolumeBar";
import { alertaVolumeValido } from "@/lib/engine/alertas-volume";
import { inicioDeUso } from "@/lib/inicio";
import { semCodigoRegra } from "@/lib/llm/tom";
import { apresentarAlerta } from "@/lib/alertas/apresentar";
import { labelGrupo } from "@/lib/labels";
import { proximoTreinoParaAlerta } from "@/lib/alertas/proximo-treino";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import {
  AlertaCard,
  Button,
  Card,
  EvidenciaBadge,
} from "@/components/ui";
import { addDaysIso, semanaDoCalendario } from "@/lib/plan/calendario";
import {
  hojeIsoSaoPaulo,
  proximaSessao,
  sessoesDoPlano,
} from "@/lib/plan/proxima-sessao";
import { agendaEfetiva, avisoPendente, sessoesDoCalendario } from "@/lib/plan/pendente";
import { faixaDeDias, TEXTO_STATUS, type StatusFaixa } from "@/lib/plan/faixa";
import { DiaAcoes } from "@/components/DiaAcoes";
import { faseAtiva } from "@/lib/plan/estrutura";
import { alvoEditarHoje } from "@/lib/plan/hoje-editar";
import { EditarTreinoSheet } from "@/components/EditarTreinoSheet";
import { ReavaliacaoNivelCard } from "@/components/ReavaliacaoNivelCard";
import {
  avaliarCheckinDeload,
  resumoAjusteDeload,
} from "@/lib/engine/checkin-deload";
import {
  feedbackSono,
  resumoSonoCheckin,
} from "@/lib/domain/sono";
import { SonoAguaResumo } from "@/components/SonoAgua";
import {
  precisaResponderParq,
  parqBloqueiaPrescricao,
} from "@/lib/plan/parq";
import { textoCarga } from "@/lib/catalog/tipo-carga";
import { useModoCarga } from "@/lib/use-modo-carga";

const COR_STATUS: Record<StatusFaixa, string> = {
  feito: "text-go",
  pendente: "text-warn",
  planejado: "text-accent",
  folga: "text-faint",
  pulado: "text-warn/80",
  limpo: "text-faint",
  em_andamento: "text-accent",
};

export default function HojePage() {
  const { state, ready, startSession } = useApp();
  const { alternado } = useModoCarga();
  const router = useRouter();
  // escolha manual vale só enquanto a sugerida não muda (ex.: acabou de concluir)
  const [picked, setPicked] = useState<{ id: string; sug: string | null } | null>(null);
  const [alertaFechado, setAlertaFechado] = useState(false);
  const [editar, setEditar] = useState<string | null>(null);
  const [avisoEdicao, setAvisoEdicao] = useState<string | null>(null);
  // Faixa de dias: dia aberto no painel + rolagem inicial até hoje (uma vez).
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const rolouFaixa = useRef(false);
  const faixaRef = useCallback((el: HTMLDivElement | null) => {
    if (!el || rolouFaixa.current) return;
    const hojeEl = el.querySelector<HTMLElement>("[data-hoje='1']");
    if (!hojeEl) return;
    rolouFaixa.current = true;
    el.scrollLeft = Math.max(0, hojeEl.offsetLeft - el.offsetLeft - 20);
  }, []);

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
  const inicioUso = inicioDeUso(state);
  const alertasVisiveis = state.alertas.filter((a) => alertaVolumeValido(a.motivo, inicioUso));
  const alerta =
    alertasVisiveis.find((a) => !a.resolvido) ??
    alertasVisiveis.find((a) => a.nivel !== "N0") ??
    alertasVisiveis[0];
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
  // Agenda efetiva (só leitura): treino não feito não é pulado, a sequência anda por treino.
  const agenda = agendaEfetiva(state, hoje);
  const agendaSess = agenda.sessoes;
  const aviso = hoje ? avisoPendente(agenda.pendentes, hoje) : null;
  const dataEfetiva = (id: string | undefined) => agendaSess.find((x) => x.id === id)?.data ?? null;
  const temAgenda = state.sessoes.some((s) => !!s.data);
  const faixa = faixaDeDias(state, hoje);
  const diaSel = faixa.find((f) => f.dia.data === diaAberto) ?? null;
  const sessHoje = hoje ? agendaSess.find((s) => s.data === hoje && s.status !== "pulada") : undefined;
  const estadoHero: "andamento" | "feito" | "descanso" | "novo" =
    sess?.status === "em_andamento"
      ? "andamento"
      : sess?.status === "concluida" && (!hoje || sess.data === hoje || !sess.data)
        ? "feito"
        : temAgenda && hoje && !sessHoje
          ? "descanso"
          : "novo";
  const proxData = dataEfetiva(sess?.id)
    ? new Date(`${dataEfetiva(sess?.id)}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" })
    : null;

  // Semana strip (seg→dom da semana atual, fuso SP)
  const semana = hoje ? semanaDoCalendario(sessoesDoCalendario(agenda), hoje, state.dias_limpos ?? []) : [];
  const consistencia = (() => {
    if (!hoje) return null;
    const ini = addDaysIso(hoje, -27);
    const janela = agendaSess.filter((x) => x.data && x.data >= ini && x.data <= hoje);
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
              <p className="mb-1 font-bold text-danger">⛔ Plano pausado por segurança</p>
              <p className="mb-2 text-muted">Uma resposta do questionário de saúde pede liberação profissional antes de treinar com progressão. Procure um médico ou profissional de saúde.</p>
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
            (() => {
              const ap = apresentarAlerta(alerta);
              const alvo = ap.acao?.tipo === "revisar_treino" ? proximoTreinoParaAlerta(state, ap.acao.grupo) : null;
              return (
                <AlertaCard
                  alerta={ap}
                  onAcao={alvo ? () => { setAvisoEdicao(null); setEditar(alvo); } : undefined}
                />
              );
            })()
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

      <ReavaliacaoNivelCard />

      {aviso && sess?.id === agenda.pendentes[0]?.sessao_id ? (
        <Card className="mb-4 border border-warn/40 bg-[rgba(255,184,60,.08)]" data-testid="aviso-pendente">
          <p className="text-sm font-semibold text-warn">{aviso.titulo}</p>
          <p className="mt-1 text-sm text-muted">{aviso.texto}</p>
        </Card>
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
                {sess.id === sugerida?.id ? "Próximo" : sess.status === "concluida" ? "Feito" : "Escolhido"}: <span className="font-semibold">{sess.nome}</span>
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
                <span>{sess.grupos.slice(0, 4).map((g) => labelGrupo(g).toLowerCase()).join(" · ")}</span>
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
                    <span className="truncate">{ex?.nome ?? "Exercício"}</span>
                    <span className="load-num shrink-0 text-muted">
                      {textoCarga(carga, ex, alternado(ex?.id))} · {p.series}×{p.faixa_reps[0]}–{p.faixa_reps[1]}
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

      {/* Faixa de dias: mesma agenda do calendário (datas reais). Tocar abre as ações do dia aqui. */}
      {faixa.length ? (
        <section aria-label="Seus dias de treino" className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase text-muted">Seus dias</p>
            <Link href="/plano/calendario" className="text-xs font-semibold text-accent">Abrir calendário →</Link>
          </div>
          <div
            ref={faixaRef}
            data-testid="faixa-dias"
            className="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {faixa.map((f) => {
              const aberto = diaAberto === f.dia.data;
              return (
                <button
                  key={f.dia.data}
                  type="button"
                  data-dia={f.dia.data}
                  data-status={f.status}
                  data-hoje={f.hoje ? "1" : undefined}
                  aria-pressed={aberto}
                  aria-label={`${f.rotulo}${f.hoje ? ", hoje" : ""}: ${f.dia.nome ?? "sem treino"}, ${TEXTO_STATUS[f.status]}`}
                  onClick={() => setDiaAberto(aberto ? null : f.dia.data)}
                  className={`chip-motion w-[92px] shrink-0 snap-start rounded-[14px] border px-2.5 py-2 text-left ${
                    aberto ? "border-accent bg-[rgba(184,255,60,.12)]" : f.hoje ? "border-accent/70 bg-surface" : "border-border bg-surface"
                  }`}
                >
                  <div className={`text-[10px] uppercase tracking-wide ${f.hoje ? "font-bold text-accent" : "text-faint"}`}>
                    {f.hoje ? "Hoje" : f.rotulo.split(" ")[0]} · {f.rotulo.split(" ")[1]}
                  </div>
                  <div className="truncate text-sm font-semibold">{f.dia.nome ?? "—"}</div>
                  <div className={`text-[11px] font-semibold ${COR_STATUS[f.status]}`}>{TEXTO_STATUS[f.status]}</div>
                </button>
              );
            })}
          </div>
          {diaSel ? (
            <div data-testid="painel-dia"><Card className="mt-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">
                  {diaSel.rotulo}
                  {diaSel.dia.nome ? ` · ${diaSel.dia.nome}` : ""}
                </p>
                <span className={`text-xs font-semibold ${COR_STATUS[diaSel.status]}`}>{TEXTO_STATUS[diaSel.status]}</span>
              </div>
              <DiaAcoes key={diaSel.dia.data} dia={diaSel.dia} />
              <div className="mt-3 flex gap-2">
                {diaSel.dia.sessao_id && !diaSel.dia.sessao_id.includes("#") && diaSel.status !== "feito" && diaSel.dia.sessao_id !== sess?.id ? (
                  <Button variant="ghost" className="min-h-11 flex-1 text-sm" onClick={() => { setPickedId(diaSel.dia.sessao_id!); setAvisoEdicao(null); }}>
                    Ver este treino
                  </Button>
                ) : null}
                <Link href={`/plano/calendario?dia=${diaSel.dia.data}`} className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-semibold text-accent">
                  Abrir calendário
                </Link>
                <Button variant="ghost" className="min-h-11 text-sm" aria-label="Fechar" onClick={() => setDiaAberto(null)}>
                  ✕
                </Button>
              </div>
            </Card></div>
          ) : null}
        </section>
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
                .slice(0, 6);
              const fb = feedbackSono(ck.sono_h, hist, ck.sono_inicio);
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

      <SonoAguaResumo />

      {/* Semana strip → calendário */}
      {semana.length ? (
        <div className="mb-4 block">
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase text-muted">Semana</p>
              <Link href="/plano/calendario" className="text-xs font-semibold text-accent">Calendário →</Link>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {semana.map((d) => (
                <Link
                  key={d.iso}
                  href={`/plano/calendario?dia=${d.iso}`}
                  data-testid={`chip-${d.iso}`}
                  aria-label={`${d.iso.slice(8)}/${d.iso.slice(5, 7)}${d.nome ? ` · ${d.nome}` : ""}: abrir no calendário`}
                  className="motion-press flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg"
                >
                  <span className={`text-[10px] ${d.hoje ? "font-bold text-accent" : "text-faint"}`}>{d.label}</span>
                  <span
                    data-status={d.st}
                    title={d.nome ?? undefined}
                    className={`h-2.5 w-2.5 rounded-full ${
                      d.st === "feito"
                        ? "bg-accent"
                        : d.st === "planejado"
                          ? "border border-accent/70"
                          : d.st === "em_andamento"
                            ? "bg-accent/60"
                            : d.st === "pulado"
                              ? "bg-warn/50"
                              : d.st === "limpo"
                                ? "border border-dashed border-ink-600"
                                : "bg-ink-800"
                    } ${d.hoje ? "ring-2 ring-accent/40 ring-offset-1 ring-offset-transparent" : ""}`}
                  />
                </Link>
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
        </div>
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
