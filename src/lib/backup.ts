/**
 * Cópia dos seus dados (exportar/importar), lida do próprio aparelho.
 * Funciona sem o servidor: serve pra levar o histórico pra outro aparelho ou outro endereço do app.
 * Importar só troca os dados com confirmação na tela.
 */
import { AppStateSchema, type AppState } from "@/lib/domain";

const APP = "coach-hypertrophy";
const VERSAO = 1;

export type ResumoBackup = {
  treinos_feitos: number;
  series: number;
  ultimo_treino: string | null;
  plano: string | null;
};

export function resumoDoEstado(s: AppState): ResumoBackup {
  const feitos = s.sessoes.filter((x) => (x.status === "concluida" || x.status === "parcial") && !!x.data);
  const datas = feitos.map((x) => x.data!).sort();
  return {
    treinos_feitos: feitos.length,
    series: s.registros.length,
    ultimo_treino: datas[datas.length - 1] ?? null,
    plano: s.plano ? `${s.plano.dias_por_semana}x por semana` : null,
  };
}

export function gerarBackup(s: AppState, agora = new Date()): string {
  return JSON.stringify({ app: APP, versao: VERSAO, exportado_em: agora.toISOString(), state: s });
}

export function nomeDoArquivo(hoje: string): string {
  return `${APP}-${hoje}.json`;
}

export type LeituraBackup =
  | { ok: true; state: AppState; resumo: ResumoBackup; exportado_em: string | null }
  | { ok: false; erro: string };

export function lerBackup(texto: string): LeituraBackup {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, erro: "O arquivo não é uma cópia do app (não abriu como JSON)." };
  }
  const obj = bruto as { app?: unknown; state?: unknown; exportado_em?: unknown } | null;
  if (!obj || typeof obj !== "object" || obj.app !== APP || !obj.state) {
    return { ok: false, erro: "Esse arquivo não é uma cópia do Coach Hypertrophy." };
  }
  const p = AppStateSchema.safeParse(obj.state);
  if (!p.success) return { ok: false, erro: "A cópia está incompleta ou foi alterada. Nada foi trocado." };
  return {
    ok: true,
    state: { ...p.data, active_sessao_id: null, logger_prescricao_id: null },
    resumo: resumoDoEstado(p.data),
    exportado_em: typeof obj.exportado_em === "string" ? obj.exportado_em : null,
  };
}
