/**
 * Semana efetiva do mesociclo. `plano.mesociclo.semana_atual` é gravado como 1 na geração
 * e nunca é atualizado; a semana real vem do calendário (data de início do bloco).
 *
 * Início do bloco: `data_inicio` do calendário; sem ela, o primeiro treino registrado
 * desde que o plano foi criado. Sem nenhum dos dois, fica a semana salva.
 * A semana pode passar de `total_semanas` (bloco terminou e o plano não foi refeito).
 */
import type { AppState, Mesociclo, Plano } from "@/lib/domain";
import { diaSP } from "@/lib/inicio";

type FonteMeso = { plano: Plano | null | undefined; registros?: AppState["registros"] };

/** Dia (YYYY-MM-DD) em que o bloco começou, ou null se ainda não dá pra saber. */
export function inicioDoBloco(fonte: FonteMeso): string | null {
  const plano = fonte.plano;
  if (!plano) return null;
  if (plano.mesociclo?.data_inicio) return plano.mesociclo.data_inicio;
  const criado = diaSP(plano.criado_em);
  let min: string | null = null;
  for (const r of fonte.registros ?? []) {
    const d = diaSP(r.executado_em);
    if (!d || (criado && d < criado)) continue;
    if (!min || d < min) min = d;
  }
  return min;
}

/** Semana (1-based) do bloco em `hojeIso`. */
export function semanaDoBloco(fonte: FonteMeso, hojeIso: string | null | undefined): number {
  const salva = fonte.plano?.mesociclo?.semana_atual ?? 1;
  const inicio = inicioDoBloco(fonte);
  const dia = hojeIso ? diaSP(hojeIso) : null;
  if (!inicio || !dia) return salva;
  const ms = Date.parse(dia + "T12:00:00Z") - Date.parse(inicio + "T12:00:00Z");
  if (!Number.isFinite(ms)) return salva;
  return Math.max(1, Math.floor(ms / 86400000 / 7) + 1);
}

/** Mesociclo do plano com `semana_atual` calculada para `hojeIso`. null sem plano. */
export function mesocicloEfetivo(fonte: FonteMeso, hojeIso: string | null | undefined): Mesociclo | null {
  const meso = fonte.plano?.mesociclo;
  if (!meso) return null;
  return { ...meso, semana_atual: semanaDoBloco(fonte, hojeIso) };
}

/**
 * Semana de deload programado (R6): só a ÚLTIMA semana do bloco, em blocos de acúmulo
 * ou intensificação. Depois do fim do bloco não há deload programado (o R5 segue valendo).
 */
export function ehSemanaDeload(
  meso: { semana_atual: number; total_semanas: number; foco: string } | null | undefined,
): boolean {
  if (!meso) return false;
  return (
    meso.semana_atual === meso.total_semanas &&
    (meso.foco === "acumulo" || meso.foco === "intensificacao")
  );
}

/** Foco do dia: "deload" na semana de deload programado (ou se o plano já é deload). */
export function focoDoDia(meso: Mesociclo | null | undefined): string | null {
  if (!meso) return null;
  return ehSemanaDeload(meso) ? "deload" : meso.foco;
}
