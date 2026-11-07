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

/** Semana (1-based) de uma ocorrência projetada. */
export function semanaDaOcorrenciaProjetada(id: string | null | undefined): number | null {
  const m = /#prev-w(\d+)$/.exec(id ?? "");
  return m ? Number(m[1]) : null;
}
