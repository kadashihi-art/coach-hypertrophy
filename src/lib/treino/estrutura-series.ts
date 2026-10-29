/**
 * Estrutura de séries por posição no treino (pedido do iury).
 * - 1º exercício da sessão: aquecimento → aproximação (feeder) → séries de trabalho.
 * - Do 2º em diante: direto nas séries de trabalho.
 * As preparatórias são EXTRAS: não consomem `presc.series`, não contam volume nem progressão.
 * Não altera kg/reps/RIR (motor continua dono dos números) — só a sequência de fases.
 */
import type { Prescricao, TipoSerie } from "@/lib/domain";
import { ehSeriePreparatoria } from "@/lib/domain/enums";

/** Fases de trabalho conforme a prescrição atual (inalteradas). */
export function fasesDeTrabalho(presc: Pick<Prescricao, "series" | "tecnica">): TipoSerie[] {
  const n = Math.max(0, presc.series);
  if (presc.tecnica === "top_set_backoff" && n > 0) {
    return ["top_set", ...Array<TipoSerie>(n - 1).fill("back_off")];
  }
  return Array<TipoSerie>(n).fill("trabalho");
}

/** Sequência completa de fases para a prescrição na posição `posicao` (0 = 1º exercício). */
export function estruturaSeries(
  presc: Pick<Prescricao, "series" | "tecnica">,
  posicao: number,
): TipoSerie[] {
  const trabalho = fasesDeTrabalho(presc);
  return posicao === 0 ? ["aquecimento", "feeder", ...trabalho] : trabalho;
}

export function temPreparatorias(posicao: number): boolean {
  return posicao === 0;
}

/** Próxima fase a executar dado o que já foi logado (por contagem de preparatórias e de trabalho). */
export function proximaFase(
  presc: Pick<Prescricao, "series" | "tecnica">,
  posicao: number,
  logados: { tipo_serie: TipoSerie }[],
): TipoSerie | null {
  const est = estruturaSeries(presc, posicao);
  const prepFeitas = logados.filter((l) => ehSeriePreparatoria(l.tipo_serie));
  const trabFeitas = logados.length - prepFeitas.length;
  const prepPlan = est.filter((f) => ehSeriePreparatoria(f));
  const trabPlan = est.filter((f) => !ehSeriePreparatoria(f));
  if (trabFeitas === 0) {
    for (const f of prepPlan) {
      if (!prepFeitas.some((l) => l.tipo_serie === f)) return f;
    }
  }
  return trabPlan[trabFeitas] ?? null;
}

/** Séries de trabalho já feitas (para checar conclusão contra presc.series). */
export function seriesTrabalhoFeitas(logados: { tipo_serie: TipoSerie }[]): number {
  return logados.filter((l) => !ehSeriePreparatoria(l.tipo_serie)).length;
}
