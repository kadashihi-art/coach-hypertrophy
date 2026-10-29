"use client";

import { cargaDoEstado, resolverAlternativa } from "@/lib/plan/alternativa"
import { guiaPorPadrao } from "@/lib/plan/guia-por-padrao";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import {
  Button,
  Card,
  EvidenciaBadge,
  NumStepper,
} from "@/components/ui";
import type { TipoSerie } from "@/lib/domain";
import { incrementoCargaKg } from "@/lib/domain";
import { proximaSessao } from "@/lib/plan/proxima-sessao";
import { RestTimerPill, useRestTimer } from "@/components/RestTimer";
import { descansoSugerido } from "@/lib/treino/rest-timer";
import { cargaAproximacao, cargaAquecimento, cargaPrimeiraTrabalho, cargasDaEstrutura, estruturaSeries, preparatoriasDaSessao, proximaFase, textoAquecimento } from "@/lib/treino/estrutura-series";

const FASE_META: Record<
  TipoSerie,
  { label: string; hint: string }
> = {
  aquecimento: {
    label: "Aquece",
    hint: "Carga leve pra preparar",
  },
  feeder: {
    label: "Aproximação",
    hint: "Poucas reps perto da carga de trabalho, sem cansar",
  },
  top_set: {
    label: "Top",
    hint: "Série mais pesada do dia",
  },
  back_off: {
    label: "Back",
    hint: "Um pouco mais leve depois do top",
  },
  trabalho: {
    label: "Trabalho",
    hint: "Volume",
  },
  drop: {
    label: "Drop",
    hint: "Mesma série, carga reduzida",
  },
};

const FASE_ORDEM: TipoSerie[] = [
  "aquecimento",
  "feeder",
  "trabalho",
  "top_set",
  "back_off",
];

/**
 * T4 Logger — brief §9 + look HTML WD
 * Pré-fill EstadoExercicio · colapso após concluir · timer sticky ·
 * CTA thumb-zone · ± 2,5/5 kg · RIR chips 0–4 (go) · ocupado (F4) · dor (F5)
 */
export default function TreinoPage() {
  const {
    state,
    startSession,
    setLoggerPrescricao,
    logSerie,
    finishSession,
  } = useApp();
  const router = useRouter();

  const sess =
    state.sessoes.find((s) => s.id === state.active_sessao_id) ??
    state.sessoes.find((s) => s.status === "em_andamento") ??
    proximaSessao(state);

  const prescricoes = sess?.prescricoes ?? [];
  const prescId = state.logger_prescricao_id ?? prescricoes[0]?.id ?? null;
  const prescIdx = Math.max(
    0,
    prescricoes.findIndex((p) => p.id === prescId),
  );
  const presc = prescricoes[prescIdx];
  const exercise = state.exercicios.find((e) => e.id === presc?.exercicio_id);
  const estado = state.estados.find(
    (e) => e.exercicio_id === presc?.exercicio_id,
  );
  const altEx = presc ? resolverAlternativa(presc, state.exercicios) : null;
  const guiaSeed = state.guias.find((g) => g.id === presc?.guia_id);
  const guia =
    guiaSeed ??
    (presc
      ? guiaPorPadrao(presc.padrao, presc.exercicio_id)
      : undefined);

  const seriesDone = state.registros.filter(
    (r) => r.sessao_id === sess?.id && r.prescricao_id === presc?.id,
  );

  const stepKg = exercise ? incrementoCargaKg(exercise.grupo_primario) : 2.5;

  const prefillCarga =
    presc?.carga.trabalho_kg ??
    estado?.alvo_proxima_sessao.carga_kg ??
    0;
  const prefillReps =
    estado?.alvo_proxima_sessao.faixa_reps[0] ?? presc?.faixa_reps[0] ?? 8;

  // Aquecimento por grupo muscular (primeiro exercício de cada músculo ainda não aquecido).
  const prepFlags = preparatoriasDaSessao(prescricoes, state.exercicios);
  const prep = prepFlags[prescIdx] ?? prescIdx === 0;
  const cargaTop = presc?.carga.top_set_kg ?? prefillCarga;
  /** kg pré-preenchido por fase (motor/âncora define top/trabalho; aquecimento = 60% arredondado ao step). */
  const usaOrdem = presc ? estruturaSeries(presc, false).includes("back_off") : false;
  /** kg pré-preenchido por fase: top = motor; trabalho 80% / back-off 90% do top (arredondado); aquecimento 60%. */
  const cargaDaFase = (f: TipoSerie | null, topKg: number = cargaTop): number => {
    if (f === "aquecimento") return cargaAquecimento(topKg, stepKg);
    if (f === "feeder" && presc) {
      const primeira = cargaPrimeiraTrabalho(presc, topKg, prefillCarga, stepKg);
      return cargaAproximacao(primeira, stepKg, cargaAquecimento(topKg, stepKg));
    }
    if (usaOrdem && (f === "trabalho" || f === "top_set" || f === "back_off")) {
      return cargasDaEstrutura(topKg, stepKg)[f];
    }
    return f === "top_set" ? topKg : prefillCarga;
  };

  const [carga, setCarga] = useState(prefillCarga);
  const [reps, setReps] = useState(prefillReps);
  const [rir, setRir] = useState(presc?.rir_alvo ?? 2);
  // Fase automática pela estrutura (1º exercício: aquece → aproximação → trabalho; demais: só trabalho).
  const [tipoManual, setTipoManual] = useState<TipoSerie | null>(null);
  const faseAuto = presc ? proximaFase(presc, prep, seriesDone) : null;
  const fasesDoExercicio = presc ? new Set(estruturaSeries(presc, prep)) : new Set<TipoSerie>();
  const tipo: TipoSerie =
    tipoManual && fasesDoExercicio.has(tipoManual) ? tipoManual : (faseAuto ?? "trabalho");
  const setTipo = (t: TipoSerie | null) => setTipoManual(t);
  const exercicioPendente = faseAuto !== null;
  const [showMenu, setShowMenu] = useState(false);
  const [dor, setDor] = useState(false);
  const [showGuia, setShowGuia] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [cargasToast, setCargasToast] = useState<string | null>(null);
  const [anchorPulse, setAnchorPulse] = useState(false);
  const [hitFlash, setHitFlash] = useState(false);
  const anchorTimer = useRef<number | null>(null);
  const hitTimer = useRef<number | null>(null);

  const faseInicial = presc ? proximaFase(presc, prep, seriesDone) : null;
  const cargaInicial = cargaDaFase(faseInicial);
  useEffect(() => {
    setCarga(cargaInicial);
    setReps(prefillReps);
    setRir(presc?.rir_alvo ?? 2);
    setTipoManual(null);
    setDor(false);
    setOcupado(false);
    setAnchorPulse(false);
    setHitFlash(false);
  }, [presc?.id, cargaInicial, prefillReps, presc?.rir_alvo, presc?.tecnica]);

  useEffect(() => {
    return () => {
      if (anchorTimer.current) window.clearTimeout(anchorTimer.current);
      if (hitTimer.current) window.clearTimeout(hitTimer.current);
    };
  }, []);

  const rt = useRestTimer();

  // Pílula do cronômetro ancorada no topo real do "Concluir série" (qualquer altura de tela).
  useEffect(() => {
    const sync = () => {
      const tz = document.querySelector(".thumb-zone");
      const gap = tz ? Math.max(0, window.innerHeight - tz.getBoundingClientRect().top) : 0;
      document.body.style.setProperty("--thumb-gap", `${Math.round(gap)}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(document.body);
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      document.body.style.removeProperty("--thumb-gap");
    };
  }, []);

  const alvoLabel = presc
    ? `Alvo: ${presc.series}×${presc.faixa_reps[0]}–${presc.faixa_reps[1]}, RIR ${presc.rir_alvo}${prep ? " · antes: aquecimento + aproximação" : ""}`
    : "";

  if (!sess) {
    return (
      <main className="p-5 pt-10">
        <p className="text-muted">Nenhuma sessão com exercícios.</p>
        <Link href="/hoje" className="mt-4 block text-accent">
          Voltar ao Hoje
        </Link>
      </main>
    );
  }

  if (sess.status !== "em_andamento") {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
          Treino
        </p>
        <h1 className="mb-2 text-2xl font-bold">{sess.nome}</h1>
        <p className="mb-2 text-sm text-muted">
          {sess.prescricoes.length} exercícios · ~{sess.duracao_estimada_min}{" "}
          min
        </p>
        {sess.status === "concluida" && (
          <p className="mb-4 text-xs text-go">
            Sessão já concluída — reiniciar aplica cargas do EstadoExercicio.
          </p>
        )}
        <Button
          onClick={() => {
            startSession(sess.id);
          }}
        >
          {sess.status === "concluida" ? "Treinar de novo" : "Iniciar treino"}
        </Button>
        <Link
          href="/hoje"
          className="mt-4 text-center text-sm text-muted"
        >
          ← Hoje
        </Link>
      </main>
    );
  }

  if (!presc || !exercise) {
    return (
      <main className="p-5 pt-10">
        <p className="text-muted">Sem prescrições.</p>
      </main>
    );
  }

  const exercicioAtivo = ocupado && altEx ? altEx : exercise;

  function toggleOcupado() {
    if (!presc || !exercise) return;
    if (!ocupado && altEx) {
      setOcupado(true);
      setCarga(cargaDoEstado(state.estados, altEx.id, carga));
      setCargasToast(`Usando ${altEx.nome} · carga do histórico da alternativa`);
    } else {
      setOcupado(false);
      setCarga(cargaDoEstado(state.estados, exercise.id, prefillCarga));
      setCargasToast(`De volta: ${exercise.nome}`);
    }
    window.setTimeout(() => setCargasToast(null), 2200);
  }

  function pulseAnchor() {
    if (tipo !== "trabalho" && tipo !== "top_set") return;
    setAnchorPulse(true);
    if (anchorTimer.current) window.clearTimeout(anchorTimer.current);
    anchorTimer.current = window.setTimeout(() => setAnchorPulse(false), 300);
  }

  function handleCargaChange(n: number) {
    setCarga(n);
    pulseAnchor();
  }

  function concluirSerie() {
    if (!sess || !presc) return;
    const numero = seriesDone.length + 1;
    const inReps =
      reps >= presc.faixa_reps[0] && reps <= presc.faixa_reps[1];
    const inRir = rir <= presc.rir_alvo;
    const result = logSerie({
      sessao_id: sess.id,
      prescricao_id: presc.id,
      exercicio_id: exercicioAtivo.id,
      numero,
      tipo_serie: tipo,
      carga_kg: carga,
      reps,
      rir_percebido: rir,
      dor,
    }, { ancorar: false });
    const proxima = proximaFase(presc, prep, [...seriesDone, { tipo_serie: tipo }]);
    if (inReps && inRir && tipo !== "aquecimento" && tipo !== "feeder") {
      setHitFlash(true);
      if (hitTimer.current) window.clearTimeout(hitTimer.current);
      hitTimer.current = window.setTimeout(() => setHitFlash(false), 300);
    }
    rt.iniciar(descansoSugerido({ fase: tipo, composto: exercicioAtivo?.composto ?? true, prescritoSeg: presc.descanso_seg }), tipo);
    // Avanço automático: próxima fase já com o kg sugerido (back-off sai do top que você fez).
    setTipo(null);
    setCarga(cargaDaFase(proxima, tipo === "top_set" && carga > 0 ? carga : cargaTop));
    setReps(prefillReps);

    // Adaptação ao vivo: toast + prefill carga (presc.series já atualizado no state)
    const adapt = result.adaptacao;
    if (adapt?.aplicada) {
      if (typeof adapt.carga_sugerida_kg === "number") {
        setCarga(adapt.carga_sugerida_kg);
      }
      setCargasToast(adapt.motivo);
      window.setTimeout(() => setCargasToast(null), 2800);
    } else if (adapt && !adapt.aplicada && adapt.motivo.includes("Dor marcada")) {
      setCargasToast(adapt.motivo);
      window.setTimeout(() => setCargasToast(null), 2200);
    }
    setDor(false);
  }

  function proximoExercicio() {
    const next = prescricoes[prescIdx + 1];
    if (next) setLoggerPrescricao(next.id);
  }

  function exercicioAnterior() {
    const prev = prescricoes[prescIdx - 1];
    if (prev) setLoggerPrescricao(prev.id);
  }

  function finalizar() {
    finishSession();
    router.push("/treino/feedback");
  }


  return (
    <main className="motion-fade-up flex min-h-dvh flex-col pb-8">
      {cargasToast ? (
        <div className="motion-swap mx-4 mt-2 rounded-xl border border-accent/40 bg-accent/15 px-3 py-2 text-center text-xs font-semibold text-accent">
          {cargasToast}
        </div>
      ) : null}
      <div className="px-4 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <Link href="/hoje" className="text-sm text-muted">
            ← {sess.nome}
          </Link>
          <div className="flex items-center gap-2">
            <span className="pill-offline">Offline</span>
            <span className="num text-xs text-faint">
              {prescIdx + 1}/{prescricoes.length}
            </span>
          </div>
        </div>

        <div className="mb-1 flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold leading-tight">
            {exercicioAtivo.nome}
            {ocupado && (
              <span className="ml-2 text-xs font-normal text-accent">
                (alternativa)
              </span>
            )}
          </h1>
          <button
            type="button"
            onClick={() => setShowGuia(!showGuia)}
            className="shrink-0 rounded-[14px] border border-border px-3 py-1.5 text-xs text-muted"
          >
            Guia
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="text-sm text-muted">{alvoLabel}</div>
          <EvidenciaBadge evidencia={presc.evidencia} />
        </div>

        {altEx && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-[14px] border border-border px-3 py-2 text-xs text-muted">
            <span>
              {ocupado ? "Usando" : "Sugestão"}:{" "}
              <b className="text-accent">{ocupado ? altEx.nome : altEx.nome}</b>{" "}
              (mesmo padrão {altEx.padrao.replace(/_/g, " ")})
            </span>
            <button type="button" onClick={toggleOcupado} className="shrink-0 text-accent">
              {ocupado ? "Voltar" : "Trocar"}
            </button>
          </div>
        )}
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={toggleOcupado}
            disabled={!altEx}
            className={`flex-1 rounded-[14px] border py-2.5 text-xs ${
              ocupado
                ? "border-accent bg-[rgba(184,255,60,.12)] text-accent"
                : "border-border text-muted"
            } disabled:opacity-40`}
          >
            {ocupado ? "Usando alternativa" : "Ocupado"}
          </button>
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="rounded-[14px] border border-border px-3 py-2.5 text-xs text-muted"
          >
            ⋯
          </button>
        </div>

        {showMenu && (
          <div className="mb-3 flex flex-wrap gap-2 rounded-2xl border border-border bg-surface p-3">
            <button
              type="button"
              onClick={() => setDor(!dor)}
              className={`rounded-full px-3 py-1.5 text-xs ${
                dor ? "bg-danger/20 text-danger" : "bg-white/5 text-muted"
              }`}
            >
              {dor ? "Dor marcada" : "Marcar dor (F5)"}
            </button>
          </div>
        )}

        {showGuia && guia && (
          <Card className="mb-3 text-sm">
            {guia.setup?.length > 0 && (
              <>
                <p className="mb-1 text-xs font-bold uppercase text-accent">Setup</p>
                <ul className="mb-2 list-disc pl-4 text-muted">
                  {guia.setup.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {guia.execucao?.length > 0 && (
              <>
                <p className="mb-1 text-xs font-bold uppercase text-accent">Execução</p>
                <ul className="mb-2 list-disc pl-4 text-muted">
                  {guia.execucao.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {guia.erros_comuns?.length > 0 && (
              <>
                <p className="mb-1 text-xs font-bold uppercase text-warn">
                  Erros comuns
                </p>
                <ul className="mb-2 list-disc pl-4 text-muted">
                  {guia.erros_comuns.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {guia.cues?.length > 0 && (
              <>
                <p className="mb-1 text-xs font-bold uppercase text-accent">Cues</p>
                <ul className="mb-2 list-disc pl-4 text-muted">
                  {guia.cues.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {guia.amplitude && (
              <p className="mb-2 text-muted">
                <span className="text-xs font-bold uppercase text-accent">Amplitude · </span>
                {guia.amplitude}
              </p>
            )}
            {guia.respiracao && (
              <p className="mb-2 text-muted">
                <span className="text-xs font-bold uppercase text-accent">Respiração · </span>
                {guia.respiracao}
              </p>
            )}
            {guia.contraindicacoes?.length > 0 && (
              <>
                <p className="mb-1 text-xs font-bold uppercase text-danger">
                  Contraindicações
                </p>
                <ul className="mb-2 list-disc pl-4 text-muted">
                  {guia.contraindicacoes.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-2 border-t border-border pt-2 text-[10px] text-faint">
              Cues = síntese técnica (não citação de treinador). Educativo.
            </p>
          </Card>
        )}

        {/* Séries — colapsadas + ativa expandida */}
        <div className="space-y-3">
          {seriesDone.map((s, idx) => (
            <div
              key={s.id}
              className={`set-card collapsed motion-collapse flex items-center justify-between px-3 py-2.5 text-sm ${
                s.tipo_serie === "top_set" || s.tipo_serie === "back_off"
                  ? "border-l-[3px] border-l-accent"
                  : ""
              } ${
                s.tipo_serie === "aquecimento" && anchorPulse
                  ? "set-anchor-pulse"
                  : ""
              } ${
                hitFlash && idx === seriesDone.length - 1 ? "hit-flash" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-faint">
                  S{s.numero}
                </span>
                <span className="text-[10px] uppercase text-faint">
                  {FASE_META[s.tipo_serie]?.label ?? s.tipo_serie}
                </span>
                {s.dor && <span className="text-xs text-warn">dor</span>}
              </div>
              <span className="num text-sm font-bold">
                {s.carga_kg} kg · {s.reps} reps · RIR {s.rir_percebido}
              </span>
            </div>
          ))}

          {/* Preview aquecimento — pulsa quando âncora muda; % math fica pro motor */}
          {exercicioPendente && prep && tipo !== "aquecimento" && !seriesDone.some((r) => r.tipo_serie === "aquecimento") && (
            <div
              className={`set-card flex items-center justify-between px-3 py-2 text-sm opacity-70 ${
                anchorPulse ? "set-anchor-pulse" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-faint">Aq.</span>
                <span className="text-sm text-muted">{textoAquecimento(carga, stepKg)}</span>
              </div>
            </div>
          )}

          {exercicioPendente && (
            <div key={`active-${presc.id}-${seriesDone.length}`} className="set-card expanded motion-expand p-4">
              <div className="mb-1 flex flex-wrap gap-2">
                {FASE_ORDEM.filter((t) => fasesDoExercicio.has(t)).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTipo(t);
                      if (t !== tipo && (t === "aquecimento" || tipo === "aquecimento")) setCarga(cargaDaFase(t));
                    }}
                    title={FASE_META[t].hint}
                    className={`chip-motion text-xs ${tipo === t ? "on" : ""}`}
                  >
                    {FASE_META[t].label}
                  </button>
                ))}
              </div>
              <p className="mb-3 text-[11px] leading-snug text-muted">
                <span className="font-semibold text-bone-50/90">
                  {FASE_META[tipo].label}
                </span>
                {" · "}
                {FASE_META[tipo].hint}
              </p>

              <div
                className={
                  tipo === "trabalho" || tipo === "top_set" ? "is-anchor" : ""
                }
              >
                <NumStepper
                  value={carga}
                  onChange={handleCargaChange}
                  step={stepKg}
                  unit="kg"
                  min={0}
                  label={`Carga (kg) · ±${stepKg}`}
                  flash="load"
                />
              </div>
              <div className="my-4" />
              <NumStepper
                value={reps}
                onChange={setReps}
                step={1}
                min={1}
                label="Reps"
                flash="num"
                hint={`Sugestão de reps: ${prefillReps}`}
              />

              <div className="mb-2 mt-4 flex items-baseline justify-center gap-2">
                <p className="text-[10px] uppercase tracking-wide text-muted">
                  RIR
                </p>
                <p className="text-[11px] text-muted">
                  reps em reserva (quantas ainda conseguiria)
                </p>
              </div>
              <div className="flex justify-center gap-2">
                {[0, 1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRir(n)}
                    className={`chip-rir flex h-11 w-11 items-center justify-center ${
                      rir === n ? "on" : ""
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {!exercicioPendente && (
          <Card className="mt-4 text-center">
            <p className="font-semibold text-go">Séries concluídas</p>
            <div className="mt-3 flex gap-2">
              {prescIdx < prescricoes.length - 1 ? (
                <Button onClick={proximoExercicio}>Próximo exercício</Button>
              ) : (
                <Button onClick={finalizar}>Finalizar sessão</Button>
              )}
            </div>
          </Card>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={prescIdx === 0}
            onClick={exercicioAnterior}
            className="flex-1 rounded-[14px] border border-border py-3 text-sm text-muted disabled:opacity-30"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={prescIdx >= prescricoes.length - 1}
            onClick={proximoExercicio}
            className="flex-1 rounded-[14px] border border-border py-3 text-sm text-muted disabled:opacity-30"
          >
            Próximo ex.
          </button>
        </div>

        <button
          type="button"
          onClick={finalizar}
          className="btn btn-primary motion-press mt-3 w-full py-4 text-base"
        >
          Finalizar sessão
        </button>
      </div>

      {/* CTA thumb-zone — terço inferior, sem tabbar no logger */}
      {/* reserva espaço pro cronômetro: nada fica embaixo da pílula */}
      {rt.timer ? <div aria-hidden className="rt-spacer-logger" /> : null}
      {exercicioPendente && (
        <div className="thumb-zone mt-auto">
          <Button onClick={concluirSerie} className="motion-press motion-cta-glow min-h-14 text-base">
            Concluir série
          </Button>
        </div>
      )}
      <RestTimerPill rt={rt} />
    </main>
  );
}
