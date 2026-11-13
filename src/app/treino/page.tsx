"use client";

import { ExercicioImagem } from "@/components/ExercicioImagem";
import { cargaParaExercicio, resolverAlternativa } from "@/lib/plan/alternativa"
import { labelPadrao } from "@/lib/labels";
import { parseRestricoes } from "@/lib/plan/restricoes";
import { resumirExercicio, textoUltimaVez, textoTendencia } from "@/lib/engine/memoria-carga";
import { alternativaCarga, rotuloCarga, textoCarga } from "@/lib/catalog/tipo-carga";
import { useModoCarga } from "@/lib/use-modo-carga";
import { guiaPorPadrao } from "@/lib/plan/guia-por-padrao";
import { useEffect, useRef, useState } from "react";
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
import { avisoSaltoCarga, cargaMaxKg, LIMITES_ENTRADA, validarCarga, validarReps } from "@/lib/domain/limites";
import { hojeIsoSaoPaulo, proximaSessao } from "@/lib/plan/proxima-sessao";
import { treinoAbertoAntigo } from "@/lib/treino/sessao-aberta";
import { RestTimerPill, useRestTimer } from "@/components/RestTimer";
import { EditarDuranteTreinoSheet } from "@/components/EditarDuranteTreinoSheet";
import { Passo } from "@/components/EditarTreinoSheet";
import { TecnicaNaSerie } from "@/components/TecnicaPicker";
import { exercicioAceitaTecnica, nomeTecnica, parceiroBiSet, planoTecnica } from "@/lib/engine/tecnicas";
import { ehSeriePreparatoria } from "@/lib/domain/enums";
import { podeDesfazerAoVivo } from "@/lib/treino/editar-durante-treino";
import { calibrarSessao, e1rmReferencia, feedbackSerie, rirAlvoDoDia } from "@/lib/engine/proximidade-falha";
import { useClientValue } from "@/lib/use-client-value";
import { focoDoDia, mesocicloEfetivo } from "@/lib/plan/mesociclo";
import { descansoSugerido } from "@/lib/treino/rest-timer";
import { ExplicaConceito } from "@/components/Conceito";
import { lerDia } from "@/lib/inteligencia/leitura-dia";
import { ativos } from "@/lib/inteligencia/tempo-curto";
import type { ConceitoId } from "@/lib/conceitos";
import { cargaAproximacao, cargaAquecimento, cargaPrimeiraTrabalho, cargasDaEstrutura, estruturaSeries, preparacaoDaSessao, proximaFase, repsSugeridasFase, textoAquecimento, type PrepNivel } from "@/lib/treino/estrutura-series";

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
    hint: "Série mais pesada do dia, no RIR alvo",
  },
  back_off: {
    label: "Back",
    hint: "~10% mais leve, mesmo RIR: sai com mais reps",
  },
  trabalho: {
    label: "Trabalho",
    hint: "Série que vale, no RIR alvo",
  },
  drop: {
    label: "Drop",
    hint: "Mesma série, carga reduzida",
  },
};

/** Conceito que explica cada fase (botão "?" ao lado da dica). */
const CONCEITO_DA_FASE: Partial<Record<TipoSerie, ConceitoId>> = {
  aquecimento: "aquecimento",
  feeder: "aproximacao",
  top_set: "top_backoff",
  back_off: "top_backoff",
  trabalho: "serie_valida",
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
    desfazerAoVivo,
    responderLeituraDia,
  } = useApp();
  const router = useRouter();
  const { alternado, alternar } = useModoCarga();
  const exPorId = (id: string | undefined) => state.exercicios.find((e) => e.id === id);

  const sess =
    state.sessoes.find((s) => s.id === state.active_sessao_id) ??
    state.sessoes.find((s) => s.status === "em_andamento") ??
    proximaSessao(state);

  // Tempo curto: exercícios pulados hoje ficam fora do treino (voltam na semana seguinte).
  const prescricoes = ativos(sess?.prescricoes ?? []);
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
  const altEx = presc
    ? resolverAlternativa(presc, state.exercicios, {
        restr: parseRestricoes(state.perfil?.restricoes ?? []),
        excludeIds: prescricoes.map((p) => p.exercicio_id),
      })
    : null;
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

  // Memória do exercício: última vez e tendência, ignorando a sessão em andamento.
  const memoriaExercicio = exercise
    ? resumirExercicio(state.registros, exercise.id, {
        stepKg,
        excluirSessaoId: sess?.id,
      })
    : null;
  const linhaUltimaVez = textoUltimaVez(memoriaExercicio, exercise, alternado(exercise?.id));
  const linhaTendencia = textoTendencia(memoriaExercicio);

  // Aquecimento por grupo muscular (primeiro exercício de cada músculo ainda não aquecido).
  // Composto livre de padrão novo com o músculo já aquecido: só 1 aproximação.
  const prepFlags = preparacaoDaSessao(prescricoes, state.exercicios);
  const prep: PrepNivel = prepFlags[prescIdx] ?? (prescIdx === 0 ? "completa" : "nenhuma");
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

  // RIR alvo do dia: padrão de movimento, fase do bloco, nível, deload e recuperação (determinístico).
  // Dia de São Paulo (o UTC já vira amanhã às 21h).
  const hojeIso = useClientValue(() => hojeIsoSaoPaulo(), "");
  // Hora cheia: valor estável entre leituras (o snapshot não pode mudar a cada chamada).
  const agoraMs = useClientValue(() => Math.floor(Date.now() / 3600_000) * 3600_000, 0);
  // Treino esquecido aberto de outro dia: não continua com as séries antigas, começa do zero.
  const abertoAntigo = agoraMs > 0 && treinoAbertoAntigo(sess, agoraMs);
  const ckHoje = hojeIso ? state.checkins.find((c) => c.data === hojeIso) ?? null : null;
  // Semana real do bloco: aperta o RIR ao longo do meso e solta na semana de deload.
  const mesoHoje = mesocicloEfetivo(state, hojeIso || null);
  const rirDia = rirAlvoDoDia({
    exercicio: exercise,
    experiencia: state.perfil?.experiencia,
    foco: focoDoDia(mesoHoje),
    semana_atual: mesoHoje?.semana_atual,
    total_semanas: mesoHoje?.total_semanas,
    checkin: ckHoje,
  });
  const alvoRir = rirDia.alvo;
  const e1rmRef = exercise ? e1rmReferencia(state.registros, sess?.id)[exercise.id] ?? null : null;
  // Leitura do dia: compara a 1ª série pesada com o normal recente e propõe ajustar o resto (só com confirmação).
  const leituraDia = sess && sess.status === "em_andamento" ? lerDia({ sessao: sess, registros: state.registros, exercicios: state.exercicios }) : null;

  const [carga, setCarga] = useState(prefillCarga);
  /** Salto de carga > +40%: valor já confirmado pelo usuário nesta série (null = nenhum). */
  const [saltoConfirmado, setSaltoConfirmado] = useState<number | null>(null);
  const [saltoPendente, setSaltoPendente] = useState<string | null>(null);
  const [reps, setReps] = useState(prefillReps);
  const [rir, setRir] = useState(alvoRir);
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
  const [editarAberto, setEditarAberto] = useState(false);
  const [avisoEdicao, setAvisoEdicao] = useState<string | null>(null);
  const [tecFeita, setTecFeita] = useState(true);
  const [tecEdit, setTecEdit] = useState<{ key: string; reps: number[] }>({ key: "", reps: [] });
  /** Exercício (prescrição) que disparou o descanso atual: se ele sair do treino, o descanso é cancelado. */
  const timerPresc = useRef<string | null>(null);
  const anchorTimer = useRef<number | null>(null);
  const hitTimer = useRef<number | null>(null);

  const faseInicial = presc ? proximaFase(presc, prep, seriesDone) : null;
  const cargaInicial = cargaDaFase(faseInicial);
  /** Reps do top já feito neste exercício (base da sugestão do back-off). */
  const repsTopFeitas = seriesDone.filter((r) => r.tipo_serie === "top_set").at(-1)?.reps ?? null;
  const faixaPresc: [number, number] = presc ? [presc.faixa_reps[0], presc.faixa_reps[1]] : [prefillReps, prefillReps];
  const repsDaFase = (f: TipoSerie | null, repsTop: number | null = repsTopFeitas) =>
    repsSugeridasFase(f, faixaPresc, prefillReps, repsTop);
  const repsInicial = repsDaFase(faseInicial);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia os campos do logger quando muda o exercício/fase; reescrever exigiria remontar o componente
    setCarga(cargaInicial);
    setReps(repsInicial);
    setRir(alvoRir);
    setTipoManual(null);
    setDor(false);
    setOcupado(false);
    setAnchorPulse(false);
    setHitFlash(false);
  }, [presc?.id, cargaInicial, repsInicial, alvoRir, presc?.tecnica]);

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
    ? `Alvo: ${presc.series}×${presc.faixa_reps[0]}–${presc.faixa_reps[1]}, RIR ${alvoRir}${prep === "completa" ? " · antes: aquecimento + aproximação" : prep === "aproximacao" ? " · antes: 1 aproximação (movimento novo)" : ""}${presc.tecnica_final ? ` · última série: ${nomeTecnica(presc.tecnica_final)}` : ""}`
    : "";

  if (!sess) {
    return (
      <main className="p-5 pt-10">
        <p className="text-muted">Nenhum treino com exercícios ainda.</p>
        <Link href="/hoje" className="mt-4 block text-accent">
          Voltar ao Hoje
        </Link>
      </main>
    );
  }

  if (sess.status !== "em_andamento" || abertoAntigo) {
    const feitoHoje = (sess.status === "concluida" || sess.status === "parcial") && !!hojeIso && sess.data === hojeIso;
    const diaTxt = (iso: string | null | undefined) =>
      iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "") : null;
    return (
      <main className="flex min-h-dvh flex-col justify-center px-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
          Treino
        </p>
        <h1 className="mb-2 text-2xl font-bold">{sess.nome}</h1>
        <p className="mb-2 text-sm text-muted">
          {prescricoes.length} exercícios · ~{sess.duracao_estimada_min}{" "}
          min
        </p>
        {abertoAntigo ? (
          <p className="mb-4 text-xs text-muted">
            Esse treino ficou aberto{diaTxt(sess.data) ? ` desde ${diaTxt(sess.data)}` : ""} sem finalizar. As séries daquele dia ficam guardadas nele e o de hoje começa do zero.
          </p>
        ) : feitoHoje ? (
          <p className="mb-4 text-xs text-warn">
            Você já fez esse treino hoje. Treinar de novo apaga as séries de hoje e começa do zero.
          </p>
        ) : (sess.status === "concluida" || sess.status === "parcial") && diaTxt(sess.data) ? (
          <p className="mb-4 text-xs text-muted">
            Última vez: {diaTxt(sess.data)}. Essa execução fica guardada no dia dela.
          </p>
        ) : null}
        <Button
          onClick={() => {
            startSession(sess.id);
          }}
        >
          {feitoHoje ? "Treinar de novo" : "Iniciar treino"}
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
        <p className="text-muted">Esse treino ainda não tem exercícios.</p>
      </main>
    );
  }

  const exercicioAtivo = ocupado && altEx ? altEx : exercise;
  const trabalhoFeitas = seriesDone.filter((r) => !ehSeriePreparatoria(r.tipo_serie)).length;
  const parBiSet = presc.tecnica_final === "bi_set" ? parceiroBiSet(sess, presc.id) : null;
  const planoTec =
    presc.tecnica_final && exercicioPendente && !ehSeriePreparatoria(tipo) && trabalhoFeitas === presc.series - 1 && exercicioAceitaTecnica(exercicioAtivo)
      ? planoTecnica(
          presc.tecnica_final,
          carga,
          exercicioAtivo,
          presc.faixa_reps,
          parBiSet ? state.exercicios.find((e) => e.id === parBiSet.exercicio_id)?.nome : undefined,
        )
      : null;
  // Feedback da última série (só leitura: calibra o RIR relatado com e1RM e queda de reps).
  const trabalhoSessao = seriesDone.filter((r) => !ehSeriePreparatoria(r.tipo_serie));
  const calsSessao = calibrarSessao(seriesDone, e1rmRef);
  const ultimaSerie = seriesDone[seriesDone.length - 1];
  const fbSerie = ultimaSerie
    ? (() => {
        const ehTrab = !ehSeriePreparatoria(ultimaSerie.tipo_serie);
        const cal = ehTrab ? calsSessao[calsSessao.length - 1]! : { rir_estimado: null, rir_interpretado: ultimaSerie.rir_percebido, desvio: 0, fonte: "relatado" as const };
        const fb = feedbackSerie({ serie: ultimaSerie, faixa: presc.faixa_reps, alvo: rirDia, cal, ultima: !exercicioPendente });
        // A queda de reps só aparece quando a série seguinte entra: avisa sobre a anterior.
        const ant = calsSessao.length >= 2 ? calsSessao[calsSessao.length - 2]! : null;
        const serieAnt = trabalhoSessao[trabalhoSessao.length - 2];
        const calAnt =
          ehTrab && !fb.calibracao && ant && serieAnt && ant.rir_estimado != null && Math.abs(ant.desvio) >= 2
            ? feedbackSerie({ serie: serieAnt, faixa: presc.faixa_reps, alvo: rirDia, cal: ant, ultima: false }).calibracao
            : null;
        return { ...fb, calibracao: fb.calibracao ?? (calAnt ? calAnt.replace(/^Você marcou/, "Na série anterior você marcou") : null) };
      })()
    : null;
  const tecKey = planoTec ? `${presc.id}-${planoTec.tipo}-${planoTec.campos.length}` : "";
  // Sugestões do Coach como ponto de partida; o usuário ajusta pro que fez.
  const tecReps = planoTec ? (tecEdit.key === tecKey ? tecEdit.reps : planoTec.campos.map((c) => c.sugestao)) : [];
  const setTecReps = (reps: number[]) => setTecEdit({ key: tecKey, reps });

  function toggleOcupado() {
    if (!presc || !exercise) return;
    if (!ocupado && altEx) {
      setOcupado(true);
      setCarga(cargaParaExercicio(state, altEx.id, carga).carga_kg);
      setCargasToast(`Usando ${altEx.nome} · carga do histórico da alternativa`);
    } else {
      setOcupado(false);
      setCarga(cargaParaExercicio(state, exercise.id, prefillCarga).carga_kg);
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
    setSaltoPendente(null);
    pulseAnchor();
  }

  function concluirSerie() {
    if (!sess || !presc) return;
    // Limites de entrada: valores impossíveis não viram registro.
    const erroLimite = validarCarga(carga, exercicioAtivo?.padrao) ?? validarReps(reps);
    if (erroLimite) {
      setSaltoPendente(null);
      setCargasToast(erroLimite);
      window.setTimeout(() => setCargasToast(null), 3200);
      return;
    }
    const ultimaReal = exercicioAtivo
      ? resumirExercicio(state.registros, exercicioAtivo.id, { stepKg, excluirSessaoId: sess.id })?.ultima_carga_kg ?? null
      : null;
    const aviso = avisoSaltoCarga(carga, ultimaReal);
    if (aviso && saltoConfirmado !== carga) {
      setSaltoPendente(aviso);
      return;
    }
    setSaltoPendente(null);
    setSaltoConfirmado(null);
    const numero = seriesDone.length + 1;
    const inReps =
      reps >= presc.faixa_reps[0] && reps <= presc.faixa_reps[1];
    const inRir = rir <= alvoRir + 1;
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
      ...(planoTec && (planoTec.campos.length === 0 || tecFeita)
        ? {
            tecnica: {
              tipo: planoTec.tipo,
              carga_extra_kg: planoTec.tipo === "drop_set" ? planoTec.carga_kg : null,
              reps_extra: planoTec.campos.length ? tecReps.slice(0, planoTec.campos.length) : [],
            },
          }
        : {}),
    }, { ancorar: false });
    const proxima = proximaFase(presc, prep, [...seriesDone, { tipo_serie: tipo }]);
    if (inReps && inRir && tipo !== "aquecimento" && tipo !== "feeder") {
      setHitFlash(true);
      if (hitTimer.current) window.clearTimeout(hitTimer.current);
      hitTimer.current = window.setTimeout(() => setHitFlash(false), 300);
    }
    timerPresc.current = presc.id;
    const semDescanso = !!planoTec?.sem_descanso && !!parBiSet;
    setTecFeita(true);
    setTecEdit({ key: "", reps: [] });
    if (semDescanso && parBiSet) {
      setCargasToast(planoTec!.texto);
      window.setTimeout(() => setCargasToast(null), 3200);
      setLoggerPrescricao(parBiSet.id);
    } else rt.iniciar(descansoSugerido({ fase: tipo, composto: exercicioAtivo?.composto ?? true, prescritoSeg: presc.descanso_seg }), tipo);
    // Avanço automático: próxima fase já com o kg sugerido (back-off sai do top que você fez).
    setTipo(null);
    setCarga(cargaDaFase(proxima, tipo === "top_set" && carga > 0 ? carga : cargaTop));
    // Back-off: mesmo RIR com ~10% menos carga → mais reps (base: o que você fez no top).
    setReps(repsDaFase(proxima, tipo === "top_set" ? reps : repsTopFeitas));

    // Adaptação ao vivo: toast + prefill carga (presc.series já atualizado no state)
    const adapt = result.adaptacao;
    if (adapt?.aplicada) {
      if (typeof adapt.carga_sugerida_kg === "number") {
        setCarga(adapt.carga_sugerida_kg);
      }
      const alt = adapt.sugerir_alternativa;
      const nomeAlt = alt ? state.exercicios.find((e) => e.id === alt)?.nome ?? alt.replace(/_/g, " ") : null;
      setCargasToast(alt && nomeAlt ? adapt.motivo.replace(alt, nomeAlt) : adapt.motivo);
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
      {avisoEdicao ? (
        <div data-testid="aovivo-toast" className="motion-swap mx-4 mt-2 flex items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent/15 px-3 py-2 text-xs font-semibold text-accent">
          <span>{avisoEdicao}</span>
          <span className="flex shrink-0 gap-3">
            {podeDesfazerAoVivo(state) ? (
              <button
                type="button"
                onClick={() => {
                  const res = desfazerAoVivo();
                  setAvisoEdicao(res.ok ? null : res.erro);
                  if (res.ok) {
                    setCargasToast("Edição desfeita. O treino voltou como estava.");
                    window.setTimeout(() => setCargasToast(null), 2200);
                  }
                }}
                className="underline"
              >
                Desfazer
              </button>
            ) : null}
            <button type="button" aria-label="Fechar aviso" onClick={() => setAvisoEdicao(null)}>✕</button>
          </span>
        </div>
      ) : null}
      {editarAberto ? (
        <EditarDuranteTreinoSheet
          onClose={() => setEditarAberto(false)}
          onSalvo={({ removidas }) => {
            if (rt.timer && timerPresc.current && removidas.includes(timerPresc.current)) {
              rt.pular();
              timerPresc.current = null;
            }
            setAvisoEdicao("Treino atualizado.");
          }}
        />
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
          <ExercicioImagem ex={exercicioAtivo} size={44} />
          <h1 className="flex-1 text-xl font-bold leading-tight">
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
        {rirDia.motivos.length > 0 ? (
          <p data-testid="rir-do-dia" className="-mt-2 mb-3 text-[11px] leading-snug text-muted">
            RIR {alvoRir} hoje: {rirDia.motivos.join(" ")}
          </p>
        ) : null}

        {altEx && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-[14px] border border-border px-3 py-2 text-xs text-muted">
            <span>
              {ocupado ? "Usando" : "Sugestão"}:{" "}
              <b className="text-accent">{ocupado ? altEx.nome : altEx.nome}</b>{" "}
              (mesmo padrão: {labelPadrao(altEx.padrao)})
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
            data-testid="logger-editar"
            onClick={() => setEditarAberto(true)}
            className="rounded-[14px] border border-border px-3 py-2.5 text-xs text-muted"
          >
            Editar
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
              {dor ? "Dor marcada" : "Marcar dor"}
            </button>
          </div>
        )}

        {showGuia && guia && (
          <Card className="mb-3 text-sm">
            <div className="mb-3 flex items-center gap-3">
              <ExercicioImagem ex={exercicioAtivo} size={88} />
              <p className="text-[11px] text-muted">Toque na imagem para ampliar.</p>
            </div>
            {guia.setup?.length > 0 && (
              <>
                <p className="mb-1 text-xs font-bold uppercase text-accent">Posição</p>
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
                <p className="mb-1 text-xs font-bold uppercase text-accent">Dicas rápidas</p>
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
                {s.tecnica ? <span className="text-[10px] font-semibold text-accent">{nomeTecnica(s.tecnica.tipo)}</span> : null}
              </div>
              <span className="num text-sm font-bold">
                {textoCarga(s.carga_kg, exPorId(s.exercicio_id), alternado(s.exercicio_id))} · {s.reps} reps · RIR {s.rir_percebido}
                {s.tecnica?.reps_extra.length ? ` + ${s.tecnica.carga_extra_kg ? `${String(s.tecnica.carga_extra_kg).replace(".", ",")} kg × ` : ""}${s.tecnica.reps_extra.join("+")}` : ""}
              </span>
            </div>
          ))}

          {fbSerie ? (
            <div
              data-testid="feedback-falha"
              className={`motion-swap rounded-xl border px-3 py-2 text-xs leading-snug ${
                fbSerie.zona === "efetiva"
                  ? "border-go/40 bg-go/10 text-go"
                  : fbSerie.zona === "aquecimento"
                    ? "border-border text-muted"
                    : "border-warn/40 bg-warn/10 text-warn"
              }`}
            >
              <p className="font-semibold">{fbSerie.texto}</p>
              {fbSerie.calibracao ? <p className="mt-1 text-bone-50/80">{fbSerie.calibracao}</p> : null}
            </div>
          ) : null}

          {leituraDia && sess ? (
            <div data-testid="leitura-dia" className={`motion-swap rounded-xl border p-3 text-sm ${leituraDia.tipo === "ruim" ? "border-warn/40 bg-warn/10" : "border-go/40 bg-go/10"}`}>
              <p className={`font-semibold ${leituraDia.tipo === "ruim" ? "text-warn" : "text-go"}`}>{leituraDia.titulo}</p>
              <p className="mt-1 text-bone-50/90">{leituraDia.texto}</p>
              <ul className="mt-2 space-y-0.5 text-xs text-muted">
                {leituraDia.mudancas.map((m) => (
                  <li key={m.prescricao_id}>
                    {exPorId(m.exercicio_id)?.nome ?? m.exercicio_id}: {m.de} → {m.para} séries
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button type="button" className="motion-press min-h-10 flex-1 rounded-[12px] bg-accent text-sm font-semibold text-ink-950" onClick={() => responderLeituraDia(sess.id, leituraDia, true)}>
                  {leituraDia.tipo === "ruim" ? "Ajustar o resto" : "Fazer +1 série"}
                </button>
                <button type="button" className="motion-press min-h-10 flex-1 rounded-[12px] bg-white/5 text-sm font-semibold" onClick={() => responderLeituraDia(sess.id, leituraDia, false)}>
                  Manter como está
                </button>
              </div>
            </div>
          ) : null}

          {/* Preview aquecimento — pulsa quando âncora muda; % math fica pro motor */}
          {exercicioPendente && prep === "completa" && tipo !== "aquecimento" && !seriesDone.some((r) => r.tipo_serie === "aquecimento") && (
            <div
              className={`set-card flex items-center justify-between px-3 py-2 text-sm opacity-70 ${
                anchorPulse ? "set-anchor-pulse" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-faint">Aq.</span>
                <span className="text-sm text-muted">{textoAquecimento(carga, stepKg, exercicioAtivo, alternado(exercicioAtivo?.id))}</span>
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
                {CONCEITO_DA_FASE[tipo] ? (
                  <>
                    {" "}
                    <ExplicaConceito
                      id={CONCEITO_DA_FASE[tipo]!}
                      ctx={{ exercicio: exercicioAtivo?.nome, carga_kg: cargaTop, reps: prefillReps, rir_alvo: alvoRir, e1rm_kg: e1rmRef }}
                      className="align-middle"
                    />
                  </>
                ) : null}
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
                  max={cargaMaxKg(exercicioAtivo?.padrao)}
                  validar={(n) => validarCarga(n, exercicioAtivo?.padrao)}
                  label={`Carga (kg${rotuloCarga(exercicioAtivo) ? ` ${rotuloCarga(exercicioAtivo)}` : ""}) · ±${stepKg}`}
                  flash="load"
                />
                {exercicioAtivo && alternativaCarga(exercicioAtivo) ? (
                  <button
                    type="button"
                    data-testid="alternar-carga"
                    className="mx-auto mt-1 block text-[11px] text-muted underline decoration-dotted underline-offset-2"
                    onClick={() => alternar(exercicioAtivo.id)}
                  >
                    {alternado(exercicioAtivo.id)
                      ? `Na tela: ${textoCarga(carga, exercicioAtivo, true)} · voltar para ${rotuloCarga(exercicioAtivo)}`
                      : `= ${textoCarga(carga, exercicioAtivo, true)} · mostrar assim`}
                  </button>
                ) : null}
              </div>
              {(linhaUltimaVez || linhaTendencia) && (
                <p className="mt-2 text-center text-[11px] leading-snug text-muted">
                  {linhaUltimaVez ? (
                    <>
                      Última vez:{" "}
                      <span className="text-bone-50/90">{linhaUltimaVez}</span>
                    </>
                  ) : (
                    "Sem histórico ainda nesse exercício"
                  )}
                  {linhaTendencia ? (
                    <>
                      {" · "}
                      <span className="text-bone-50/90">{linhaTendencia}</span>
                    </>
                  ) : null}
                </p>
              )}
              <div className="my-4" />
              <NumStepper
                value={reps}
                onChange={setReps}
                step={1}
                min={1}
                max={LIMITES_ENTRADA.reps_max}
                inteiro
                validar={(n) => validarReps(n)}
                label="Reps"
                flash="num"
                hint={`Sugestão de reps: ${repsDaFase(tipo)}`}
              />

              <div className="mb-2 mt-4 flex items-baseline justify-center gap-2">
                <p className="text-[10px] uppercase tracking-wide text-muted">
                  RIR
                </p>
                <p className="text-[11px] text-muted">
                  reps em reserva (quantas ainda conseguiria)
                </p>
                <ExplicaConceito
                  id="rir"
                  ctx={{ exercicio: exercicioAtivo?.nome, carga_kg: carga, reps, rir_alvo: alvoRir, e1rm_kg: e1rmRef }}
                  className="self-center"
                />
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
              {planoTec ? (
                <TecnicaNaSerie plano={planoTec} feita={tecFeita} onFeita={setTecFeita} reps={tecReps} onReps={setTecReps} Passo={Passo} />
              ) : null}
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
          {saltoPendente ? (
            <div role="alertdialog" data-testid="salto-carga" className="mb-2 rounded-2xl border border-accent/40 bg-ink-900 p-3 text-sm">
              <p className="mb-2 text-bone-50">{saltoPendente}</p>
              <div className="flex gap-2">
                <button type="button" className="min-h-11 flex-1 rounded-full border border-border px-3 text-sm font-semibold" onClick={() => setSaltoPendente(null)}>
                  Corrigir
                </button>
                <button type="button" data-testid="salto-confirmar" className="min-h-11 flex-1 rounded-full bg-accent px-3 text-sm font-semibold text-ink-950" onClick={() => { setSaltoConfirmado(carga); setSaltoPendente(null); }}>
                  Confirmo, está certo
                </button>
              </div>
            </div>
          ) : null}
          <Button onClick={concluirSerie} className="motion-press motion-cta-glow min-h-14 text-base">
            Concluir série
          </Button>
        </div>
      )}
      <RestTimerPill rt={rt} />
    </main>
  );
}
