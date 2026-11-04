/**
 * e1RM e PR derivados só dos registros reais (séries de trabalho/top/back-off).
 * Aquecimento e aproximação ficam de fora. Sem registro → zeros ("sem dados").
 * Como é recalculado a partir dos registros, uma correção também pode baixar os números.
 */
import { ehSeriePreparatoria } from "@/lib/domain/enums";
import type { AppState, EstadoExercicio, Prescricao, RegistroSerie } from "@/lib/domain";
import { e1rmEpley } from "./e1rm";

export type Recorde = { e1rm_estimado_kg: number; pr_carga_kg: number; pr_reps: number };
export const RECORDE_VAZIO: Recorde = { e1rm_estimado_kg: 0, pr_carga_kg: 0, pr_reps: 0 };

/** Melhor série de trabalho por e1RM (empate: mais carga, depois mais reps). */
export function recordeDasSeries(series: Array<Pick<RegistroSerie, "carga_kg" | "reps" | "tipo_serie">>): Recorde {
  let best: Recorde = RECORDE_VAZIO;
  for (const s of series) {
    if (ehSeriePreparatoria(s.tipo_serie)) continue;
    if (!(s.carga_kg > 0) || !(s.reps > 0)) continue;
    const e = e1rmEpley(s.carga_kg, s.reps);
    if (
      e > best.e1rm_estimado_kg ||
      (e === best.e1rm_estimado_kg && (s.carga_kg > best.pr_carga_kg || (s.carga_kg === best.pr_carga_kg && s.reps > best.pr_reps)))
    ) {
      best = { e1rm_estimado_kg: e, pr_carga_kg: s.carga_kg, pr_reps: s.reps };
    }
  }
  return best;
}

/**
 * Séries de uma prescrição: pelo prescricao_id; se nenhuma prescrição da sessão
 * reconhece o prescricao_id do registro (id velho depois de Ocupado/troca/edição),
 * casa pelo exercicio_id — só com a 1ª prescrição daquele exercício, sem duplicar.
 */
export function seriesDaPrescricao(regsSessao: RegistroSerie[], prescricoes: Prescricao[], p: Prescricao): RegistroSerie[] {
  const ids = new Set(prescricoes.map((x) => x.id));
  const primeiraDoEx = prescricoes.find((x) => x.exercicio_id === p.exercicio_id);
  return regsSessao.filter(
    (r) =>
      r.prescricao_id === p.id ||
      (!ids.has(r.prescricao_id) && r.exercicio_id === p.exercicio_id && primeiraDoEx?.id === p.id),
  );
}

/** Registros que contam: sessões concluídas (+ ids extras, ex.: a que está sendo concluída). */
export function registrosValidos(state: Pick<AppState, "sessoes" | "registros">, extras: string[] = []): RegistroSerie[] {
  const ok = new Set([...state.sessoes.filter((s) => s.status === "concluida").map((s) => s.id), ...extras]);
  return state.registros.filter((r) => ok.has(r.sessao_id));
}

export function recordeDoExercicio(registros: RegistroSerie[], exercicioId: string): Recorde {
  return recordeDasSeries(registros.filter((r) => r.exercicio_id === exercicioId));
}

/** Aplica e1RM/PR derivados nos estados (só e1RM/PR; carga e alvo não mudam). */
export function aplicarRecordes(estados: EstadoExercicio[], registros: RegistroSerie[], so?: Set<string>): EstadoExercicio[] {
  return estados.map((e) => {
    if (so && !so.has(e.exercicio_id)) return e;
    const r = recordeDoExercicio(registros, e.exercicio_id);
    if (r.e1rm_estimado_kg === e.e1rm_estimado_kg && r.pr_carga_kg === e.pr_carga_kg && r.pr_reps === e.pr_reps) return e;
    return { ...e, ...r };
  });
}

export type LinhaRecalculo = {
  exercicio_id: string;
  antes: Recorde & { carga_atual_kg: number };
  depois: Recorde & { carga_atual_kg: number };
  mudou: boolean;
  variacao_carga_pct: number;
};

/**
 * Recálculo único (puro). Não grava nada: devolve o estado novo e a tabela antes/depois.
 * Carga atual: o seed falso nunca entrou na decisão de carga, então ela fica como o Coach deixou.
 */
export function recalcularRecordesConta(state: AppState): { state: AppState; linhas: LinhaRecalculo[] } {
  const regs = registrosValidos(state);
  const novos = aplicarRecordes(state.estados, regs);
  const linhas = state.estados.map((e, i) => {
    const n = novos[i]!;
    const antes = { e1rm_estimado_kg: e.e1rm_estimado_kg, pr_carga_kg: e.pr_carga_kg, pr_reps: e.pr_reps, carga_atual_kg: e.carga_atual_kg };
    const depois = { e1rm_estimado_kg: n.e1rm_estimado_kg, pr_carga_kg: n.pr_carga_kg, pr_reps: n.pr_reps, carga_atual_kg: n.carga_atual_kg };
    return {
      exercicio_id: e.exercicio_id,
      antes,
      depois,
      mudou: n !== e,
      variacao_carga_pct: e.carga_atual_kg > 0 ? Math.abs(n.carga_atual_kg - e.carga_atual_kg) / e.carga_atual_kg * 100 : 0,
    };
  });
  return { state: { ...state, estados: novos }, linhas };
}
