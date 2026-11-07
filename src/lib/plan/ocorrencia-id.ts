/**
 * Marcador das ocorrências projetadas do calendário (semanas futuras).
 * Fica num módulo próprio para o calendário ler sem depender da projeção.
 */
const MARCA = "#prev-w";

export function marcaProjecao(id: string, semana: number): string {
  return `${id}${MARCA}${semana}`;
}

/** Id de ocorrência projetada (não é uma sessão real do plano). */
export function ehOcorrenciaProjetada(id: string | null | undefined): boolean {
  return /#prev-w\d+$/.test(id ?? "");
}

/**
 * Registro avulso: treino do plano marcado como feito num dia que já passou, quando esse
 * treino já consta como feito em outro dia. Fica salvo como sessão própria (sem prescrições),
 * para não mover a data do treino original.
 */
const AVULSO = "#feito-";

export function marcaAvulso(id: string, data: string): string {
  return `${id}${AVULSO}${data}`;
}

export function ehRegistroAvulso(id: string | null | undefined): boolean {
  return /#feito-\d{4}-\d{2}-\d{2}$/.test(id ?? "");
}

/** Semana (1-based) de uma ocorrência projetada. */
export function semanaDaOcorrenciaProjetada(id: string | null | undefined): number | null {
  const m = /#prev-w(\d+)$/.exec(id ?? "");
  return m ? Number(m[1]) : null;
}
