/**
 * Sinais do histórico para sugerir exercícios (determinístico, só leitura).
 *
 * Usado pela troca de exercício (ranking das alternativas) e pelo gerador do plano
 * (desempate entre exercícios do mesmo slot ao refazer o plano):
 * - já fez e vem evoluindo → sobe na lista (a carga já é conhecida, progressão contínua);
 * - travado há 3+ treinos ou caindo → desce um pouco (variar ajuda a destravar);
 * - dor marcada nos últimos 30 dias → vai pro fim, com aviso.
 */
import type { EstadoExercicio, Exercicio, RegistroSerie } from "@/lib/domain";
import { incrementoCargaKg } from "@/lib/domain";
import { diaSP } from "@/lib/inicio";
import { resumirExercicio, textoTendencia, textoUltimaVez, type MemoriaExercicio } from "@/lib/engine/memoria-carga";

export const DIAS_DOR_SUGESTAO = 30;

export type SinalHistorico = {
  memoria: MemoriaExercicio | null;
  /** Último dia (YYYY-MM-DD) com dor marcada dentro da janela, ou null. */
  dor_em: string | null;
  travado: boolean;
};

export type FonteHistorico = {
  registros: RegistroSerie[];
  estados?: EstadoExercicio[];
  hojeIso?: string | null;
};

export function sinalDoExercicio(ex: Exercicio, fonte: FonteHistorico): SinalHistorico {
  const memoria = resumirExercicio(fonte.registros, ex.id, { stepKg: incrementoCargaKg(ex.grupo_primario) });
  const hoje = diaSP(fonte.hojeIso ?? null);
  const limite = hoje
    ? new Date(Date.parse(hoje + "T12:00:00Z") - DIAS_DOR_SUGESTAO * 86400000).toISOString().slice(0, 10)
    : null;
  let dor_em: string | null = null;
  for (const r of fonte.registros) {
    if (r.exercicio_id !== ex.id || !r.dor) continue;
    const d = diaSP(r.executado_em);
    if (!d || (limite && d < limite)) continue;
    if (!dor_em || d > dor_em) dor_em = d;
  }
  const est = fonte.estados?.find((e) => e.exercicio_id === ex.id);
  return { memoria, dor_em, travado: !!est && est.sessoes_sem_progresso >= 3 };
}

/** Pontos do histórico (somados ao ranking). 0 sem histórico. */
export function pontosHistorico(s: SinalHistorico | null | undefined): number {
  if (!s) return 0;
  if (s.dor_em) return -40;
  let p = 0;
  const m = s.memoria;
  if (m && m.sessoes > 0) {
    p += m.sessoes >= 2 ? 8 : 4;
    if (m.tendencia_pct != null && m.tendencia_pct >= 0.5) p += 4;
    if (m.tendencia_pct != null && m.tendencia_pct <= -2) p -= 6;
  }
  if (s.travado) p -= 6;
  return p;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Linha curta do que o app lembra desse exercício. null se nunca foi feito. */
export function textoMemoria(s: SinalHistorico | null | undefined, ex: Exercicio): string | null {
  if (!s) return null;
  if (s.dor_em) return `Você marcou dor nele em ${ddmm(s.dor_em)}.`;
  const ult = textoUltimaVez(s.memoria, ex);
  if (!ult) return null;
  const tend = textoTendencia(s.memoria);
  const extra = s.travado ? " · parado há 3+ treinos" : tend ? ` · ${tend}` : "";
  return `Você já fez: ${ult}${extra}.`;
}

/** Mapa id → pontos, para o gerador do plano. */
export function pontosHistoricoPorExercicio(catalog: Exercicio[], fonte: FonteHistorico): Map<string, number> {
  const out = new Map<string, number>();
  const feitos = new Set(fonte.registros.map((r) => r.exercicio_id));
  for (const ex of catalog) {
    if (!feitos.has(ex.id)) continue;
    const p = pontosHistorico(sinalDoExercicio(ex, fonte));
    if (p !== 0) out.set(ex.id, p);
  }
  return out;
}
