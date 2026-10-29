import { ehSeriePreparatoria } from "@/lib/domain/enums";
/**
 * e1RM — fórmula de Epley (só no motor, nunca inventada pela IA).
 * e1RM = carga × (1 + reps / 30)
 * Usado para PRs e tracking de progressão.
 */
export function e1rmEpley(cargaKg: number, reps: number): number {
  if (reps <= 0 || cargaKg <= 0) return 0;
  if (reps === 1) return cargaKg;
  return Math.round(cargaKg * (1 + reps / 30) * 10) / 10;
}

/** Melhor e1RM a partir de uma lista de séries (trabalho/top/back-off). */
export function melhorE1rm(
  series: Array<{ carga_kg: number; reps: number; tipo_serie?: string }>,
): number {
  let best = 0;
  // Com top set registrado, o e1RM vem do top (estrutura trabalho → top → back-off).
  const tops = series.filter((s) => s.tipo_serie === "top_set");
  for (const s of tops.length > 0 ? tops : series) {
    if (ehSeriePreparatoria(s.tipo_serie)) continue;
    const e = e1rmEpley(s.carga_kg, s.reps);
    if (e > best) best = e;
  }
  return best;
}
