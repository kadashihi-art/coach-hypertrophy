/**
 * Volume autorregulado por músculo (determinístico, ajuste só do dia).
 *
 * Cada vez que um músculo é treinado, o usuário diz em 2 toques:
 *  - depois do treino ("pos"): estímulo (fraco / bom / muito forte) e se incomodou articulação;
 *  - antes do treino seguinte daquele músculo ("pre"): como chegou (recuperado / um pouco / bem dolorido).
 * Cada ocorrência vira um delta de séries:
 *  - incomodou articulação → −1 (e sugere trocar o exercício);
 *  - chegou bem dolorido → −1 (ainda não recuperou: mais volume atrapalha);
 *  - chegou recuperado e o estímulo foi fraco → +1 (sobra recuperação, falta estímulo);
 *  - demais combinações → 0 (a rampa do bloco já cuida da subida gradual).
 * O ajuste do músculo é a soma das últimas ocorrências do bloco, limitada a −2…+2.
 * Ele entra por cima da rampa, no exercício principal do músculo no treino de hoje, com as mesmas travas:
 * 2 a 5 séries no exercício, teto semanal do grupo, deload/check-in ruim só deixam reduzir.
 * Nada aqui grava: quem aplica é o início do treino (ajuste_series_dia), e a base do plano não muda.
 */
import type { Checkin, Exercicio, FeedbackMusculo, GrupoMuscular, Mesociclo, Prescricao, Sessao } from "@/lib/domain";
import { faixaVolume, GRUPOS_OPCIONAIS } from "@/lib/domain";
import { ehSemanaDeload } from "@/lib/plan/mesociclo";
import { baseSemanal, SERIES_MAX_EXERCICIO, seriesBase } from "@/lib/engine/rampa-volume";

export const AJUSTE_MIN = -2;
export const AJUSTE_MAX = 2;
/** Quantas ocorrências recentes entram na soma. */
export const JANELA_OCORRENCIAS = 4;
const SERIES_MIN_EXERCICIO = 2;

export type OcorrenciaMusculo = {
  data: string;
  sessao_id: string | null;
  estimulo: number | null;
  articulacao: boolean;
  /** Recuperação relatada antes do treino seguinte (null = não respondeu). */
  dor_muscular: number | null;
  delta: number;
  motivo: string | null;
};

function deltaDaOcorrencia(o: Omit<OcorrenciaMusculo, "delta" | "motivo">): { delta: number; motivo: string | null } {
  if (o.articulacao) return { delta: -1, motivo: "incomodou a articulação no último treino" };
  if (o.dor_muscular === 2) return { delta: -1, motivo: "você chegou bem dolorido, ainda recuperando" };
  if (o.dor_muscular === 0 && o.estimulo === 0) return { delta: 1, motivo: "você chegou recuperado e o estímulo foi fraco" };
  return { delta: 0, motivo: null };
}

/** Ocorrências do músculo (pós-treino pareado com a recuperação relatada depois dele), da mais antiga à mais nova. */
export function ocorrenciasDoMusculo(
  feedbacks: FeedbackMusculo[],
  grupo: GrupoMuscular,
  desde?: string | null,
): OcorrenciaMusculo[] {
  const doGrupo = feedbacks
    .filter((f) => f.grupo === grupo && (!desde || f.data >= desde))
    .sort((a, b) => a.data.localeCompare(b.data) || a.registrado_em.localeCompare(b.registrado_em));
  const pos = doGrupo.filter((f) => f.momento === "pos");
  const pre = doGrupo.filter((f) => f.momento === "pre");
  return pos.map((p, i) => {
    const prox = pos[i + 1];
    // Recuperação: o primeiro "pre" depois deste treino e antes (ou no dia) do próximo treino do músculo.
    const r = pre.find((x) => x.registrado_em > p.registrado_em && (!prox || x.registrado_em <= prox.registrado_em));
    const base = {
      data: p.data,
      sessao_id: p.sessao_id,
      estimulo: p.estimulo ?? null,
      articulacao: !!p.articulacao,
      dor_muscular: r?.dor_muscular ?? null,
    };
    return { ...base, ...deltaDaOcorrencia(base) };
  });
}

export type AjusteMusculo = { grupo: GrupoMuscular; ajuste: number; motivo: string | null; ocorrencias: number };

/** Ajuste acumulado do músculo (−2…+2) e o motivo mais recente. */
export function ajusteDoMusculo(
  feedbacks: FeedbackMusculo[],
  grupo: GrupoMuscular,
  desde?: string | null,
): AjusteMusculo {
  const oc = ocorrenciasDoMusculo(feedbacks, grupo, desde).slice(-JANELA_OCORRENCIAS);
  const soma = oc.reduce((a, o) => a + o.delta, 0);
  const ajuste = Math.max(AJUSTE_MIN, Math.min(AJUSTE_MAX, soma));
  const ultimoComMotivo = [...oc].reverse().find((o) => o.delta !== 0);
  return { grupo, ajuste, motivo: ultimoComMotivo?.motivo ?? null, ocorrencias: oc.length };
}

export type AjusteAutorregulado = {
  prescricao_id: string;
  exercicio_id: string;
  grupo: GrupoMuscular;
  series_antes: number;
  series_depois: number;
  motivo: string;
};

export type ResultadoAutorregulado = {
  prescricoes: Prescricao[];
  ajustes: AjusteAutorregulado[];
  /** Músculos que pediriam mudança mas esbarraram numa trava (texto curto). */
  travas: { grupo: GrupoMuscular; motivo: string }[];
  /** Exercícios que incomodaram articulação na última vez (sugestão de troca). */
  trocar: { exercicio_id: string; grupo: GrupoMuscular }[];
};

export function aplicarVolumeAutorregulado(args: {
  /** Prescrições de hoje DEPOIS da rampa. */
  prescricoes: Prescricao[];
  exercicios: Exercicio[];
  feedbacks: FeedbackMusculo[] | undefined;
  mesociclo: Mesociclo | null | undefined;
  checkin?: Pick<Checkin, "sono_h" | "prontidao"> | null;
  sessoesDaSemana: Sessao[];
}): ResultadoAutorregulado {
  const { prescricoes, exercicios } = args;
  const nada: ResultadoAutorregulado = { prescricoes, ajustes: [], travas: [], trocar: [] };
  const feedbacks = args.feedbacks ?? [];
  if (!feedbacks.length) return nada;
  const desde = args.mesociclo?.data_inicio ?? null;
  const soReduz =
    ehSemanaDeload(args.mesociclo) || !!(args.checkin && (args.checkin.prontidao <= 2 || args.checkin.sono_h < 6));
  const { efetivo, frequencia } = baseSemanal(args.sessoesDaSemana, exercicios);

  const principal = new Map<GrupoMuscular, Prescricao>();
  for (const p of [...prescricoes].sort((a, b) => a.ordem - b.ordem)) {
    const ex = exercicios.find((e) => e.id === p.exercicio_id);
    if (!ex || GRUPOS_OPCIONAIS.includes(ex.grupo_primario)) continue;
    if (!principal.has(ex.grupo_primario)) principal.set(ex.grupo_primario, p);
  }

  const novas = new Map<string, number>();
  const ajustes: AjusteAutorregulado[] = [];
  const travas: ResultadoAutorregulado["travas"] = [];
  const trocar: ResultadoAutorregulado["trocar"] = [];
  for (const [grupo, p] of principal) {
    const a = ajusteDoMusculo(feedbacks, grupo, desde);
    // Sugestão de troca: articulação incomodou na ocorrência mais recente, neste mesmo exercício.
    const oc = ocorrenciasDoMusculo(feedbacks, grupo, desde);
    const ult = oc[oc.length - 1];
    if (ult?.articulacao) trocar.push({ exercicio_id: p.exercicio_id, grupo });
    if (a.ajuste === 0 || !a.motivo) continue;
    let delta = a.ajuste;
    if (delta > 0 && soReduz) {
      travas.push({ grupo, motivo: "hoje não é dia de subir volume (deload ou recuperação baixa)" });
      continue;
    }
    if (delta > 0) {
      const freq = Math.max(1, frequencia.get(grupo) ?? 1);
      const extraRampa = Math.max(0, p.series - seriesBase(p));
      const folga = Math.floor((faixaVolume(grupo).max - (efetivo.get(grupo) ?? 0)) / freq + 1e-9) - extraRampa;
      delta = Math.min(delta, folga, SERIES_MAX_EXERCICIO - p.series);
      if (delta <= 0) {
        travas.push({ grupo, motivo: "o volume da semana já está no teto" });
        continue;
      }
    } else {
      delta = Math.max(delta, SERIES_MIN_EXERCICIO - p.series);
      if (delta >= 0) {
        travas.push({ grupo, motivo: "o exercício já está no mínimo de séries" });
        continue;
      }
    }
    novas.set(p.id, p.series + delta);
    ajustes.push({
      prescricao_id: p.id,
      exercicio_id: p.exercicio_id,
      grupo,
      series_antes: p.series,
      series_depois: p.series + delta,
      motivo: a.motivo,
    });
  }
  return {
    prescricoes: prescricoes.map((p) => (novas.has(p.id) ? { ...p, series: novas.get(p.id)! } : p)),
    ajustes,
    travas,
    trocar,
  };
}

/** Frases curtas pro /hoje (uma por músculo ajustado). */
export function textosAutorregulado(r: ResultadoAutorregulado, exercicios: Exercicio[]): string[] {
  return r.ajustes.map((a) => {
    const ex = exercicios.find((e) => e.id === a.exercicio_id);
    const d = a.series_depois - a.series_antes;
    const qtd = `${d > 0 ? "+" : "−"}${Math.abs(d)} ${Math.abs(d) === 1 ? "série" : "séries"}`;
    return `${qtd} em ${ex?.nome ?? a.exercicio_id}: ${a.motivo}.`;
  });
}

/** Grupos principais do treino (pra perguntar a recuperação antes de começar). */
export function gruposPrincipaisDoTreino(prescricoes: Pick<Prescricao, "exercicio_id" | "ordem">[], exercicios: Exercicio[]): GrupoMuscular[] {
  const out: GrupoMuscular[] = [];
  for (const p of [...prescricoes].sort((a, b) => a.ordem - b.ordem)) {
    const g = exercicios.find((e) => e.id === p.exercicio_id)?.grupo_primario;
    if (g && !GRUPOS_OPCIONAIS.includes(g) && !out.includes(g)) out.push(g);
  }
  return out;
}

/** Já existe um "pos" deste músculo (faz sentido perguntar como chegou)? */
export function jaTreinouComFeedback(feedbacks: FeedbackMusculo[] | undefined, grupo: GrupoMuscular): boolean {
  return (feedbacks ?? []).some((f) => f.grupo === grupo && f.momento === "pos");
}
