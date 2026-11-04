/**
 * Limites de entrada (item 3 da auditoria).
 *
 * Valem SÓ na digitação/edição na UI e na validação de registros NOVOS ou alterados no servidor.
 * O schema de leitura do estado (AppStateSchema) não muda: dados antigos fora destes limites
 * continuam carregando normalmente.
 */
import type { Padrao } from "./enums";
import type { AppState, Exercicio, RegistroSerie } from "./index";

/** Carga máxima plausível (kg) por padrão de movimento. Generoso: só barra o impossível. */
export const CARGA_MAX_POR_PADRAO: Record<string, number> = {
  agachamento: 500,
  dobradica_quadril: 500,
  flexao_plantar: 400,
  empurrar_horizontal: 300,
  empurrar_inclinado: 300,
  puxar_horizontal: 300,
  puxar_vertical: 300,
  empurrar_vertical: 200,
  extensao_joelho: 250,
  flexao_joelho: 250,
  abducao_ombro: 120,
  flexao_cotovelo: 120,
  extensao_cotovelo: 120,
  flexao_ombro: 120,
  rotacao_externa: 60,
};
export const CARGA_MAX_PADRAO_DESCONHECIDO = 300;

export const LIMITES_ENTRADA = {
  reps_min_logger: 1,
  reps_max: 100,
  peso_min_kg: 35,
  peso_max_kg: 250,
  altura_min_cm: 130,
  altura_max_cm: 230,
  /** Aviso de salto de carga: acima disto (fração) sobre a última carga real, pede confirmação. */
  salto_aviso: 0.4,
} as const;

export function cargaMaxKg(padrao: Padrao | string | undefined | null): number {
  return (padrao && CARGA_MAX_POR_PADRAO[padrao]) || CARGA_MAX_PADRAO_DESCONHECIDO;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

/** null = ok; string = mensagem de bloqueio em PT-BR. */
export function validarCarga(kg: number, padrao?: Padrao | string | null): string | null {
  if (!Number.isFinite(kg)) return "Digite um número válido de kg.";
  if (kg < 0) return "A carga não pode ser negativa.";
  const max = cargaMaxKg(padrao);
  if (kg > max) return `${fmt(kg)} kg não parece possível nesse exercício. O limite é ${max} kg.`;
  return null;
}

export function validarReps(reps: number, min: number = LIMITES_ENTRADA.reps_min_logger): string | null {
  if (!Number.isFinite(reps)) return "Digite um número válido de reps.";
  if (!Number.isInteger(reps)) return "Reps precisam ser um número inteiro.";
  if (reps < min) return min === 1 ? "Faça pelo menos 1 rep pra registrar a série." : `O mínimo é ${min} reps.`;
  if (reps > LIMITES_ENTRADA.reps_max) return `${reps} reps numa série não parece possível. O limite é ${LIMITES_ENTRADA.reps_max}.`;
  return null;
}

export function validarFaixaReps(min: number, max: number): string | null {
  if (!Number.isInteger(min) || !Number.isInteger(max)) return "A faixa de reps precisa de números inteiros.";
  if (min > max) return "O mínimo de reps não pode ser maior que o máximo.";
  return null;
}

export function validarPeso(kg: number): string | null {
  if (!Number.isFinite(kg)) return "Digite um peso válido.";
  if (kg < LIMITES_ENTRADA.peso_min_kg || kg > LIMITES_ENTRADA.peso_max_kg)
    return `O peso precisa ficar entre ${LIMITES_ENTRADA.peso_min_kg} e ${LIMITES_ENTRADA.peso_max_kg} kg.`;
  return null;
}

export function validarAltura(cm: number): string | null {
  if (!Number.isFinite(cm)) return "Digite uma altura válida.";
  if (cm < LIMITES_ENTRADA.altura_min_cm || cm > LIMITES_ENTRADA.altura_max_cm)
    return `A altura precisa ficar entre ${LIMITES_ENTRADA.altura_min_cm} e ${LIMITES_ENTRADA.altura_max_cm} cm.`;
  return null;
}

/** Aviso (não bloqueia) quando a carga passa de +40% da última carga real. */
export function avisoSaltoCarga(kg: number, ultimaRealKg: number | null | undefined): string | null {
  if (!ultimaRealKg || ultimaRealKg <= 0 || !Number.isFinite(kg)) return null;
  const pct = (kg - ultimaRealKg) / ultimaRealKg;
  if (pct <= LIMITES_ENTRADA.salto_aviso) return null;
  return `Isso é ${Math.round(pct * 100)}% acima da sua última carga (${fmt(ultimaRealKg)} kg). Confirma?`;
}

/**
 * Validação de servidor: só registros novos ou com kg/reps alterados em relação ao estado salvo,
 * e peso/altura só se mudaram. Dados antigos fora dos limites passam intactos.
 */
export function validarEntradasNovas(anterior: AppState | null, novo: AppState): string | null {
  const antes = new Map<string, RegistroSerie>((anterior?.registros ?? []).map((r) => [r.id, r]));
  const exs = new Map<string, Exercicio>(novo.exercicios.map((e) => [e.id, e]));
  for (const r of novo.registros) {
    const a = antes.get(r.id);
    if (a && a.carga_kg === r.carga_kg && a.reps === r.reps) continue;
    const padrao = exs.get(r.exercicio_id)?.padrao;
    if (!a || a.carga_kg !== r.carga_kg) {
      const e = validarCarga(r.carga_kg, padrao);
      if (e) return e;
    }
    if (!a || a.reps !== r.reps) {
      const e = validarReps(r.reps, 0);
      if (e) return e;
    }
  }
  const p = novo.perfil;
  const pa = anterior?.perfil;
  if (p) {
    if (!pa || pa.peso_kg !== p.peso_kg) { const e = validarPeso(p.peso_kg); if (e) return e; }
    if (!pa || pa.altura_cm !== p.altura_cm) { const e = validarAltura(p.altura_cm); if (e) return e; }
  }
  return null;
}
