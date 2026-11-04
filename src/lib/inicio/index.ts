/**
 * Início real de uso de cada pessoa: o PRIMEIRO treino ou check-in registrado.
 * Gráficos, Progresso, alertas de volume, sono/água e reavaliação contam só a partir daqui.
 * Nada é apagado: dados anteriores continuam salvos, só ficam fora das contas.
 *
 * Semana parcial: a semana ISO do primeiro registro só conta como "cheia" se ele cair na segunda-feira.
 * Escolha: ignorar (não proporcionalizar) a semana parcial nos alertas de pouco volume, porque
 * proporcionalizar inventaria séries que a pessoa ainda não teve chance de fazer.
 */
type SessaoLike = { status: string; data?: string | null; iniciada_em?: string; finalizada_em?: string };
type RegistroLike = { executado_em?: string };
type CheckinLike = { data: string };

export type FonteInicio = {
  sessoes?: SessaoLike[];
  registros?: RegistroLike[];
  checkins?: CheckinLike[];
};

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Dia (YYYY-MM-DD) em America/Sao_Paulo de um timestamp ISO ou de uma data simples. */
export function diaSP(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (ISO_DIA.test(iso)) return iso;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t - 3 * 3600_000).toISOString().slice(0, 10);
}

/** Primeiro dia com treino (concluído/parcial ou série registrada) ou check-in. null = sem registros. */
export function inicioDeUso(s: FonteInicio): string | null {
  const dias: string[] = [];
  for (const x of s.sessoes ?? []) {
    if (x.status !== "concluida" && x.status !== "parcial") continue;
    const d = diaSP(x.data ?? x.iniciada_em ?? x.finalizada_em);
    if (d) dias.push(d);
  }
  for (const r of s.registros ?? []) {
    const d = diaSP(r.executado_em);
    if (d) dias.push(d);
  }
  for (const c of s.checkins ?? []) {
    const d = diaSP(c.data);
    if (d) dias.push(d);
  }
  return dias.length ? dias.sort()[0]! : null;
}

/** Segunda-feira (YYYY-MM-DD) da semana ISO "YYYY-Www". */
export function segundaDaSemana(semanaIso: string): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(semanaIso);
  if (!m) return null;
  const y = Number(m[1]);
  const w = Number(m[2]);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const seg = new Date(jan4.getTime() + ((w - 1) * 7 - (dow - 1)) * 86400_000);
  return seg.toISOString().slice(0, 10);
}

function somaDias(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
}

/** Semana inteira antes do início (domingo < início). Sem início = nada é anterior. */
export function semanaAntesDoInicio(semanaIso: string, inicio: string | null): boolean {
  if (!inicio) return false;
  const seg = segundaDaSemana(semanaIso);
  return seg != null && somaDias(seg, 6) < inicio;
}

/** Semana cheia de uso: começa no dia do início ou depois. Sem início = nenhuma semana cheia. */
export function semanaCheia(semanaIso: string, inicio: string | null): boolean {
  if (!inicio) return false;
  const seg = segundaDaSemana(semanaIso);
  return seg != null && seg >= inicio;
}

/** Dia (YYYY-MM-DD) já dentro do período de uso. */
export function desdeInicio(dia: string | null | undefined, inicio: string | null): boolean {
  if (!inicio) return true;
  const d = diaSP(dia ?? null);
  return d != null && d >= inicio;
}
