/**
 * Fim do treino (só leitura): recordes da sessão e o que muda no próximo treino, em linguagem de academia.
 * Recorde = melhor força estimada (Epley) de um exercício maior que a de todos os treinos anteriores.
 * Primeira vez num exercício não conta como recorde (não há com o que comparar).
 */
import type { AppState, Sessao } from "@/lib/domain";
import { ehSeriePreparatoria, type AcaoProgressao } from "@/lib/domain/enums";
import { e1rmEpley } from "@/lib/engine/e1rm";

export type MelhorSerie = { carga_kg: number; reps: number; e1rm: number };
export type Recorde = { exercicio_id: string; atual: MelhorSerie; antes: MelhorSerie };

function melhorSerie(series: AppState["registros"]): MelhorSerie | null {
  let best: MelhorSerie | null = null;
  for (const r of series) {
    if (ehSeriePreparatoria(r.tipo_serie)) continue;
    const e = e1rmEpley(r.carga_kg, r.reps);
    if (e > 0 && (!best || e > best.e1rm)) best = { carga_kg: r.carga_kg, reps: r.reps, e1rm: e };
  }
  return best;
}

export function recordesDaSessao(state: Pick<AppState, "registros">, sessao: Pick<Sessao, "id" | "finalizada_em">): Recorde[] {
  const daSessao = state.registros.filter((r) => r.sessao_id === sessao.id);
  const fim = sessao.finalizada_em ?? "9999";
  const out: Recorde[] = [];
  for (const exId of [...new Set(daSessao.map((r) => r.exercicio_id))]) {
    const atual = melhorSerie(daSessao.filter((r) => r.exercicio_id === exId));
    if (!atual) continue;
    const primeiro = daSessao.filter((r) => r.exercicio_id === exId).map((r) => r.executado_em).sort()[0] ?? fim;
    const antes = melhorSerie(state.registros.filter((r) => r.exercicio_id === exId && r.sessao_id !== sessao.id && r.executado_em < primeiro));
    if (antes && atual.e1rm > antes.e1rm) out.push({ exercicio_id: exId, atual, antes });
  }
  return out.sort((a, b) => b.atual.e1rm / b.antes.e1rm - a.atual.e1rm / a.antes.e1rm);
}

/** "subir_carga" → "sobe" (sem nome de regra). */
export function textoAcao(acao: AcaoProgressao): { texto: string; tom: "go" | "warn" | "danger" | "muted" } {
  switch (acao) {
    case "subir_carga":
      return { texto: "sobe", tom: "go" };
    case "manter_carga":
      return { texto: "mantém", tom: "muted" };
    case "manter_e_checar":
      return { texto: "mantém e confere", tom: "muted" };
    case "reduzir_carga":
      return { texto: "desce um pouco", tom: "warn" };
    case "deload":
      return { texto: "semana leve", tom: "warn" };
    case "suspender":
      return { texto: "pausa", tom: "danger" };
  }
}

export const kgTexto = (n: number) => String(n).replace(".", ",");
