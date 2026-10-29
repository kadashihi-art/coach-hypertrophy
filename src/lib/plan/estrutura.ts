/**
 * Estrutura do plano: fases (periodização) × microciclo de 7 dias com tipo de sessão.
 * Descanso inteligente determinístico: posiciona dias off minimizando sobreposição
 * muscular em dias seguidos, com bônus para descanso após pernas / fim de bloco PPL.
 */
import type { AppState, FasePlano, GrupoMuscular, Plano, TipoDia } from "@/lib/domain";

export const MUSCULOS_POR_TIPO: Record<TipoDia, GrupoMuscular[]> = {
  push: ["peito", "ombros", "triceps"],
  pull: ["costas", "biceps", "trapezio"],
  legs: ["quadriceps", "isquiotibiais", "gluteos", "panturrilhas"],
  upper: ["peito", "costas", "ombros", "biceps", "triceps"],
  lower: ["quadriceps", "isquiotibiais", "gluteos", "panturrilhas"],
  full: ["peito", "costas", "ombros", "quadriceps", "isquiotibiais", "gluteos"],
  descanso: [],
};

export const NOME_TIPO: Record<TipoDia, string> = {
  push: "Push", pull: "Pull", legs: "Legs", upper: "Upper", lower: "Lower", full: "Full Body", descanso: "Descanso",
};

function overlap(a: TipoDia, b: TipoDia): GrupoMuscular[] {
  const sb = new Set(MUSCULOS_POR_TIPO[b]);
  return MUSCULOS_POR_TIPO[a].filter((g) => sb.has(g));
}

function combos(n: number, k: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === k) { out.push([...acc]); return; }
    for (let i = start; i < n; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}

/**
 * Mantém a ORDEM dos treinos e escolhe onde entram os descansos (7 - n) na semana.
 * Score (menor = melhor): sobreposição muscular entre dias consecutivos (circular)
 * ×3 para grandes grupos; −2 por descanso logo após legs/lower/full; −1 por descanso
 * fechando bloco PPL (após 3 dias seguidos); +2 por 3+ dias seguidos de treino
 * além de 3 (fadiga sistêmica). Empate → primeira combinação (dia 0 sempre treino).
 */
export function posicionarDescanso(treinos: TipoDia[], fixosIn: number[] = []): { dias: TipoDia[]; porque: string[] } {
  const n = Math.min(7, treinos.length);
  const rests = 7 - n;
  if (rests <= 0) return { dias: treinos.slice(0, 7), porque: ["7 treinos/semana: sem dia off (não recomendado para natural)."] };
  const fixos = [...new Set(fixosIn.filter((d) => d >= 0 && d <= 6))].slice(0, rests);
  let best: { dias: TipoDia[]; score: number } | null = null;
  const candidatos = fixos.length ? combos(7, rests).filter((c) => fixos.every((f) => c.includes(f))).map((c) => c.map((i) => i - 1)) : combos(6, rests);
  for (const c of candidatos) {
    const restIdx = new Set(c.map((i) => i + 1)); // sem fixos: dia 0 sempre treino
    const dias: TipoDia[] = [];
    let t = 0;
    for (let d = 0; d < 7; d++) dias.push(restIdx.has(d) ? "descanso" : treinos[t++]);
    let score = 0;
    let streak = 0;
    for (let d = 0; d < 7; d++) {
      const a = dias[d];
      const b = dias[(d + 1) % 7];
      if (a !== "descanso" && b !== "descanso") score += overlap(a, b).length * 3;
      if (a !== "descanso" && b === "descanso") {
        if (a === "legs" || a === "lower" || a === "full") score -= 2;
        if (d >= 2 && dias[d - 1] !== "descanso" && dias[d - 2] !== "descanso") score -= 1;
      }
      streak = a === "descanso" ? 0 : streak + 1;
      if (streak > 3) score += 2;
    }
    if (!best || score < best.score) best = { dias, score };
  }
  const dias = best!.dias;
  const porque: string[] = fixos.length ? [`Descanso fixo pedido por você: ${fixos.map((f) => `dia ${f + 1}`).join(", ")} da semana do plano.`] : [];
  for (let d = 0; d < 7; d++) {
    if (dias[d] !== "descanso") continue;
    const prev = dias[(d + 6) % 7];
    const next = dias[(d + 1) % 7];
    const motivos: string[] = [];
    if (prev === "legs" || prev === "lower" || prev === "full") motivos.push(`depois de ${NOME_TIPO[prev]} (pernas/sistêmico pede mais recuperação)`);
    if (prev !== "descanso" && next !== "descanso") {
      const ov = overlap(prev, next);
      if (ov.length) motivos.push(`evita ${NOME_TIPO[prev]}→${NOME_TIPO[next]} em dias seguidos (mesmos músculos: ${ov.join(", ")})`);
      else motivos.push(`quebra a sequência de treinos para controlar fadiga sistêmica`);
    }
    if (!motivos.length) motivos.push("folga extra da semana (recuperação geral)");
    porque.push(`Dia ${d + 1} off: ${motivos.join("; ")}.`);
  }
  return { dias, porque };
}

/** Semana atual (1-based) do plano: por data_inicio se houver, senão mesociclo.semana_atual. */
export function semanaAtualPlano(plano: Plano, hojeIso?: string | null): number {
  const di = plano.mesociclo?.data_inicio;
  if (di && hojeIso) {
    const ms = Date.parse(hojeIso + "T12:00:00Z") - Date.parse(di + "T12:00:00Z");
    if (Number.isFinite(ms)) return Math.max(1, Math.floor(ms / 86400000 / 7) + 1);
  }
  return plano.mesociclo?.semana_atual ?? 1;
}

/** Fase ativa (planos antigos sem estrutura → null = 1 fase implícita). */
export function faseAtiva(plano: Plano | null | undefined, hojeIso?: string | null): FasePlano | null {
  const fases = plano?.estrutura?.fases;
  if (!plano || !fases?.length) return null;
  const sem = semanaAtualPlano(plano, hojeIso);
  let atual = fases[0];
  for (const f of fases) if (sem >= f.semana_inicio) atual = f;
  return atual;
}

export function faseAtivaDoState(state: AppState, hojeIso?: string | null): FasePlano | null {
  return faseAtiva(state.plano, hojeIso);
}

export function microcicloTexto(dias: TipoDia[]): string {
  return dias.map((t) => NOME_TIPO[t]).join(" → ");
}
