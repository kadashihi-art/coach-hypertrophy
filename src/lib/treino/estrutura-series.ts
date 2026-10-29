/**
 * Estrutura de séries por posição no treino (pedido do iury).
 * - Aquecimento por grupo muscular: um exercício ganha aquecimento → aproximação (feeder)
 *   quando é o primeiro da sessão cujo músculo primário ainda não foi aquecido.
 *   Aquecidos = primário + secundários de compostos anteriores; isolador anterior aquece só o primário.
 *   O 1º exercício sempre tem. Os demais vão direto nas séries de trabalho.
 * As preparatórias são EXTRAS: não consomem `presc.series`, não contam volume nem progressão.
 * Não altera kg/reps/RIR (motor continua dono dos números) — só a sequência de fases.
 */
import type { Exercicio, Prescricao, TipoSerie } from "@/lib/domain";
import { ehSeriePreparatoria } from "@/lib/domain/enums";

/** Fases de trabalho conforme a prescrição atual (inalteradas). */
export function fasesDeTrabalho(presc: Pick<Prescricao, "series" | "tecnica">): TipoSerie[] {
  const n = Math.max(0, presc.series);
  // Ordem das séries que valem (pedido do iury): N−2 de trabalho → 1 top → 1 back-off.
  // Só em top_set_backoff com N ≥ 2 — nas outras técnicas o motor não tem carga de top/back-off
  // (ver conflitos no PR), então ficam como estavam.
  if (presc.tecnica === "top_set_backoff" && n >= 2) {
    return [...Array<TipoSerie>(n - 2).fill("trabalho"), "top_set", "back_off"];
  }
  if (presc.tecnica === "top_set_backoff" && n === 1) return ["top_set"];
  return Array<TipoSerie>(n).fill("trabalho");
}

type ExMusc = Pick<Exercicio, "id" | "grupo_primario" | "grupos_secundarios" | "composto">;

/** Para cada prescrição da sessão: precisa de aquecimento + aproximação? (regra por grupo muscular) */
export function preparatoriasDaSessao(
  prescricoes: Pick<Prescricao, "exercicio_id">[],
  exercicios: ExMusc[],
): boolean[] {
  const aquecidos = new Set<string>();
  return prescricoes.map((p, i) => {
    const ex = exercicios.find((e) => e.id === p.exercicio_id);
    if (!ex) return i === 0;
    const precisa = i === 0 || !aquecidos.has(ex.grupo_primario);
    aquecidos.add(ex.grupo_primario);
    if (ex.composto) for (const g of ex.grupos_secundarios ?? []) aquecidos.add(g);
    return precisa;
  });
}

/** `prep`: boolean (regra por grupo) ou número da posição (legado: só posição 0). */
function comPrep(prep: boolean | number): boolean {
  return typeof prep === "number" ? prep === 0 : prep;
}

/** Sequência completa de fases para a prescrição. */
export function estruturaSeries(
  presc: Pick<Prescricao, "series" | "tecnica">,
  prep: boolean | number,
): TipoSerie[] {
  const trabalho = fasesDeTrabalho(presc);
  return comPrep(prep) ? ["aquecimento", "feeder", ...trabalho] : trabalho;
}

export function temPreparatorias(prep: boolean | number): boolean {
  return comPrep(prep);
}

/** % do aquecimento (inalterado: 60% da carga de hoje). */
export const PCT_AQUECIMENTO = 0.6;

/** Carga de aquecimento exibida/pré-preenchida: 60% da carga de hoje, arredondada pra baixo ao step do exercício (conservador; mín. 1 step). */
export function cargaAquecimento(cargaHojeKg: number, stepKg: number): number {
  if (!(cargaHojeKg > 0)) return 0;
  const bruto = cargaHojeKg * PCT_AQUECIMENTO;
  const r = stepKg > 0 ? Math.floor(bruto / stepKg + 1e-9) * stepKg : Math.round(bruto * 10) / 10;
  return Math.max(stepKg > 0 ? stepKg : 0, Math.round(r * 100) / 100);
}

export function textoAquecimento(cargaHojeKg: number, stepKg: number): string {
  const kg = cargaAquecimento(cargaHojeKg, stepKg);
  return `Aquecimento: ${String(kg).replace(".", ",")} kg (cerca de 60% da carga de hoje)`;
}

/** Próxima fase a executar dado o que já foi logado (por contagem de preparatórias e de trabalho). */
export function proximaFase(
  presc: Pick<Prescricao, "series" | "tecnica">,
  prep: boolean | number,
  logados: { tipo_serie: TipoSerie }[],
): TipoSerie | null {
  const est = estruturaSeries(presc, prep);
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
