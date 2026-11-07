/**
 * Duração do bloco de treino. Todo plano novo/remontado tem sempre 6 semanas no total.
 * A fase 2, quando existe, ocupa o fim desse mesmo bloco (padrão 3 + 3).
 */
export const SEMANAS_MESOCICLO = 6;

export type SemanasFases = { fase1: number; fase2: number };

function clampFase(n: number): number {
  return Math.min(SEMANAS_MESOCICLO - 1, Math.max(1, Math.round(n)));
}

/**
 * Divide as 6 semanas entre fase 1 e fase 2.
 * - Sem fase 2: 6 semanas na fase 1.
 * - Com fase 2 e só uma duração informada: a outra recebe o restante.
 * - Com as duas: a fase 1 tem prioridade e a fase 2 completa as 6 semanas.
 * - Sem duração: 3 + 3.
 */
export function dividirSemanasDoPlano(opts: {
  fase1?: number | null;
  fase2?: number | null;
  temFase2: boolean;
}): SemanasFases {
  if (!opts.temFase2) return { fase1: SEMANAS_MESOCICLO, fase2: 0 };

  let fase1: number;
  if (opts.fase1 != null && Number.isFinite(opts.fase1)) {
    fase1 = clampFase(opts.fase1);
  } else if (opts.fase2 != null && Number.isFinite(opts.fase2)) {
    fase1 = SEMANAS_MESOCICLO - clampFase(opts.fase2);
  } else {
    fase1 = Math.ceil(SEMANAS_MESOCICLO / 2);
  }

  return { fase1, fase2: SEMANAS_MESOCICLO - fase1 };
}
