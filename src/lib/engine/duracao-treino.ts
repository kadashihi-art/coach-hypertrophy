/**
 * Duração do treino e descanso real, derivados só dos horários das séries (executado_em).
 * Não toca em carga, reps, RIR nem progressão — é leitura/apresentação.
 *
 * Regras (documentadas também em docs/duracao-treino.md):
 * - Ordena as séries da sessão por horário; precisa de pelo menos 2 horários válidos.
 * - Intervalo entre séries > PAUSA_MAX_MIN (30 min) é pausa (ex.: treino aberto e retomado
 *   no dia seguinte): não entra na duração nem no descanso.
 * - Duração = soma dos intervalos válidos + MARGEM_MIN (4 min: aquecimento/ajuste antes da
 *   1ª série e execução da última, que não têm horário próprio). Limite de 240 min.
 * - Descanso real = média dos intervalos entre 15 s e 15 min (abaixo de 15 s é registro em
 *   lote; acima de 15 min é troca longa/conversa, não descanso).
 */
import type { RegistroSerie } from "@/lib/domain";

export const PAUSA_MAX_MIN = 30;
export const MARGEM_MIN = 4;
export const DURACAO_MAX_MIN = 240;
export const DESCANSO_MIN_S = 15;
export const DESCANSO_MAX_S = 15 * 60;

export type DuracaoTreino = {
  duracao_min: number;
  descanso_medio_s: number | null;
  pausas_ignoradas: number;
  series: number;
};

export function calcularDuracaoTreino(
  registros: Pick<RegistroSerie, "executado_em">[],
): DuracaoTreino | null {
  const ts = registros
    .map((r) => Date.parse(r.executado_em))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (ts.length < 2) return null;
  let ativoMs = 0;
  let pausas = 0;
  const descansos: number[] = [];
  for (let i = 1; i < ts.length; i++) {
    const gap = ts[i]! - ts[i - 1]!;
    if (gap > PAUSA_MAX_MIN * 60_000) { pausas++; continue; }
    ativoMs += gap;
    const s = gap / 1000;
    if (s >= DESCANSO_MIN_S && s <= DESCANSO_MAX_S) descansos.push(s);
  }
  const duracao = Math.min(DURACAO_MAX_MIN, Math.round(ativoMs / 60_000) + MARGEM_MIN);
  const descanso = descansos.length
    ? Math.round(descansos.reduce((a, b) => a + b, 0) / descansos.length)
    : null;
  return { duracao_min: duracao, descanso_medio_s: descanso, pausas_ignoradas: pausas, series: ts.length };
}

/** Duração para exibir: a gravada vence; senão calcula na hora (sessões antigas), sem gravar. */
export function duracaoDaSessao(
  sessao: { id: string; duracao_real_min?: number | null },
  registros: Pick<RegistroSerie, "sessao_id" | "executado_em">[],
): DuracaoTreino | null {
  const calc = calcularDuracaoTreino(registros.filter((r) => r.sessao_id === sessao.id));
  if (sessao.duracao_real_min != null && sessao.duracao_real_min > 0) {
    return {
      duracao_min: sessao.duracao_real_min,
      descanso_medio_s: calc?.descanso_medio_s ?? null,
      pausas_ignoradas: calc?.pausas_ignoradas ?? 0,
      series: calc?.series ?? 0,
    };
  }
  return calc;
}

export function formatarDescanso(s: number): string {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${String(r).padStart(2, "0")} s` : `${m} min`;
}

/** Frase curta comparando com a meta de tempo (minutos_por_sessao). */
export function comparacaoMeta(duracao: number, meta: number | null | undefined): string | null {
  if (!meta || meta <= 0) return null;
  const d = duracao - meta;
  if (Math.abs(d) <= 5) return `Dentro da sua meta de ${meta} min.`;
  if (d > 0) return `${d} min acima da sua meta de ${meta} min.`;
  return `${-d} min abaixo da sua meta de ${meta} min.`;
}

export function resumoDuracao(dt: DuracaoTreino): string {
  const partes = [`${dt.duracao_min} min de treino`];
  if (dt.descanso_medio_s != null) partes.push(`descanso médio de ${formatarDescanso(dt.descanso_medio_s)}`);
  return partes.join(" · ");
}
