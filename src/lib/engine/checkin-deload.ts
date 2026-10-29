/**
 * Deload / autoregulação a partir do check-in (R9) + soft R5/R6 no dia.
 * Ajusta a sessão de hoje de forma determinística. LLM NÃO grava.
 */
import type {
  AlertaSeguranca,
  Checkin,
  EstadoExercicio,
  Exercicio,
  Mesociclo,
  Prescricao,
} from "@/lib/domain";
import { incrementoCargaKg } from "@/lib/domain";
import { roundToStep } from "@/lib/engine/ancorar-carga";

export const AGUA_MIN_ML = 1500;

export type RegraCheckinDeload = "R9" | "R5" | "R6" | "AGUA";

export type AjusteCheckinDeload = {
  prescricao_id: string;
  exercicio_id: string;
  series_antes: number;
  series_depois: number;
  carga_antes_kg: number;
  carga_depois_kg: number;
  regras: RegraCheckinDeload[];
};

export type ResultadoCheckinDeload = {
  prescricoes: Prescricao[];
  ajustes: AjusteCheckinDeload[];
  alertas: Omit<AlertaSeguranca, "id" | "resolvido" | "origem_sessao_id">[];
  motivo: string;
  regras: RegraCheckinDeload[];
  aplicado: boolean;
};

function isR9(ck: Checkin | null | undefined): boolean {
  if (!ck) return false;
  return ck.prontidao <= 2 || ck.sono_h < 6;
}

function isR6(meso: Mesociclo | null | undefined): boolean {
  if (!meso) return false;
  return (
    meso.semana_atual >= meso.total_semanas - 1 &&
    (meso.foco === "acumulo" || meso.foco === "intensificacao")
  );
}

function idsPrincipais(
  prescricoes: Prescricao[],
  exercicios: Exercicio[],
): Set<string> {
  const compostos = prescricoes.filter((p) => {
    const ex = exercicios.find((e) => e.id === p.exercicio_id);
    return ex?.composto === true;
  });
  if (compostos.length > 0) {
    return new Set(compostos.map((p) => p.id));
  }
  const sorted = [...prescricoes].sort((a, b) => a.ordem - b.ordem);
  const half = Math.max(1, Math.ceil(sorted.length / 2));
  return new Set(sorted.slice(0, half).map((p) => p.id));
}

function reduzirCarga10(
  kg: number,
  grupo: Exercicio["grupo_primario"] | undefined,
): number {
  const step = grupo ? incrementoCargaKg(grupo) : 2.5;
  return roundToStep(kg * 0.9, step);
}

/**
 * Avalia check-in + meso + platôs e devolve prescrições do dia já ajustadas.
 * `seriesJaFeitas` faz clamp: series_depois >= séries já logadas.
 */
export function avaliarCheckinDeload(args: {
  checkin?: Checkin | null;
  mesociclo?: Mesociclo | null;
  estados?: EstadoExercicio[];
  prescricoes: Prescricao[];
  exercicios: Exercicio[];
  seriesJaFeitas?: Record<string, number>;
  /** Data ISO p/ alertas (default: checkin.data ou hoje). */
  data?: string;
}): ResultadoCheckinDeload {
  const {
    checkin,
    mesociclo,
    estados = [],
    prescricoes,
    exercicios,
    seriesJaFeitas = {},
  } = args;
  const data = args.data ?? checkin?.data ?? "";

  const r9 = isR9(checkin);
  const r6 = isR6(mesociclo);
  const aguaBaixa =
    typeof checkin?.agua_ml === "number" && checkin.agua_ml < AGUA_MIN_ML;

  const principais = r9 ? idsPrincipais(prescricoes, exercicios) : new Set<string>();
  const platôIds = new Set(
    estados
      .filter((e) => e.sessoes_sem_progresso >= 3)
      .map((e) => e.exercicio_id),
  );

  const regras: RegraCheckinDeload[] = [];
  if (r9) regras.push("R9");
  if (r6) regras.push("R6");
  if (platôIds.size > 0) {
    const hit = prescricoes.some((p) => platôIds.has(p.exercicio_id));
    if (hit) regras.push("R5");
  }
  if (aguaBaixa) regras.push("AGUA");

  const ajustes: AjusteCheckinDeload[] = [];
  const next: Prescricao[] = prescricoes.map((p) => {
    const ex = exercicios.find((e) => e.id === p.exercicio_id);
    const regrasP: RegraCheckinDeload[] = [];
    let series = p.series;
    let trabalho = p.carga.trabalho_kg;
    let top = p.carga.top_set_kg;

    if (r9 && principais.has(p.id)) {
      series = Math.max(1, series - 1);
      regrasP.push("R9");
    }

    const ja = seriesJaFeitas[p.id] ?? 0;
    if (ja > 0) {
      series = Math.max(series, ja);
    }

    // R6 soft (−10% cargas do dia) e R5 soft (−10% nos platôs).
    // Não empilha −10% duas vezes no mesmo exercício.
    const applyR6 = r6;
    const applyR5 = platôIds.has(p.exercicio_id);
    if (applyR6 || applyR5) {
      trabalho = reduzirCarga10(trabalho, ex?.grupo_primario);
      if (top != null) {
        top = reduzirCarga10(top, ex?.grupo_primario);
      }
      if (applyR6) regrasP.push("R6");
      if (applyR5) regrasP.push("R5");
    }

    const mudou =
      series !== p.series ||
      trabalho !== p.carga.trabalho_kg ||
      top !== p.carga.top_set_kg;

    if (mudou || regrasP.length > 0) {
      ajustes.push({
        prescricao_id: p.id,
        exercicio_id: p.exercicio_id,
        series_antes: p.series,
        series_depois: series,
        carga_antes_kg: p.carga.trabalho_kg,
        carga_depois_kg: trabalho,
        regras: regrasP,
      });
    }

    if (!mudou) return p;
    return {
      ...p,
      series,
      carga: {
        ...p.carga,
        trabalho_kg: trabalho,
        top_set_kg: top,
      },
    };
  });

  const alertas: ResultadoCheckinDeload["alertas"] = [];
  if (r9 && checkin) {
    alertas.push({
      data,
      nivel: "N1",
      motivo: `Check-in: prontidão ${checkin.prontidao}/5, sono ${checkin.sono_h}h.`,
      recomendacao:
        "R9 — manter carga; sessão do dia ajustada: −1 série nos exercícios principais.",
    });
  }
  if (aguaBaixa && checkin) {
    alertas.push({
      data,
      nivel: "N1",
      motivo: `Hidratação baixa: ${checkin.agua_ml} ml (< ${AGUA_MIN_ML} ml).`,
      recomendacao:
        "Beber água antes/durante o treino. Não corta séries sozinho.",
    });
  }
  if (r6 && mesociclo) {
    alertas.push({
      data,
      nivel: "N1",
      motivo: `Semana ${mesociclo.semana_atual}/${mesociclo.total_semanas} (foco ${mesociclo.foco}) — deload programado.`,
      recomendacao: "R6 soft — cargas de trabalho/top −10% hoje.",
    });
  }
  if (regras.includes("R5")) {
    alertas.push({
      data,
      nivel: "N1",
      motivo: "Platô: 3+ sessões sem progressão em exercício(s) de hoje.",
      recomendacao: "R5 soft — −10% na carga desses exercícios hoje.",
    });
  }

  const partes: string[] = [];
  if (r9) partes.push("−1 série nos compostos (R9; carga mantida)");
  if (r6) partes.push("−10% carga (R6 deload)");
  if (regras.includes("R5")) partes.push("−10% carga nos platôs (R5)");
  if (aguaBaixa) partes.push("alerta de hidratação");

  const motivo =
    partes.length > 0
      ? `Sessão ajustada: ${partes.join("; ")}.`
      : "Check-in ok — sem ajuste de deload.";

  const aplicado = ajustes.some(
    (a) =>
      a.series_depois !== a.series_antes ||
      a.carga_depois_kg !== a.carga_antes_kg,
  );

  return {
    prescricoes: next,
    ajustes,
    alertas,
    motivo,
    regras,
    aplicado,
  };
}

/** Preview curto p/ UI (Hoje / Check-in). */
export function resumoAjusteDeload(r: ResultadoCheckinDeload): string | null {
  if (!r.aplicado && !r.regras.includes("AGUA")) return null;
  if (r.regras.includes("R9")) {
    return "Sessão ajustada: −1 série nos compostos";
  }
  if (r.regras.includes("R6") || r.regras.includes("R5")) {
    return "Sessão ajustada: cargas de deload (−10%)";
  }
  if (r.regras.includes("AGUA")) {
    return "Hidratação baixa — beba água (sem corte de séries)";
  }
  return r.motivo;
}
