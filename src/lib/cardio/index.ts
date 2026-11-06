/**
 * Cardio: minutos da semana contra o ideal (`perfil.cardio_min_semana`).
 * Só leitura do que a pessoa registrou — não mexe em carga, séries nem progressão.
 * A semana é a mesma seg–dom (ISO) usada no calendário, no fuso de São Paulo.
 */
import type { AppState, Cardio, TipoCardio } from "@/lib/domain";
import { isoWeekDe } from "@/lib/engine/volume";

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

function diaUtc(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** "2026-11-04" + 3 → "2026-11-07" (calendário puro, sem fuso). */
export function somarDias(iso: string, n: number): string {
  const d = diaUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Segunda-feira da semana de `iso` (seg–dom). */
export function inicioDaSemana(iso: string): string {
  const dow = diaUtc(iso).getUTCDay(); // 0 = domingo
  return somarDias(iso, -((dow + 6) % 7));
}

/** Domingo da semana de `iso`. */
export function fimDaSemana(iso: string): string {
  return somarDias(inicioDaSemana(iso), 6);
}

/** Semana ISO de um dia "YYYY-MM-DD" (mesma conta de currentIsoWeek). */
export function semanaIsoDaData(iso: string): string {
  return isoWeekDe(new Date(`${iso}T12:00:00`));
}

export const TIPOS_CARDIO: { tipo: TipoCardio; label: string; emoji: string }[] = [
  { tipo: "caminhada", label: "Caminhada", emoji: "🚶" },
  { tipo: "corrida", label: "Corrida", emoji: "🏃" },
  { tipo: "bike", label: "Bike", emoji: "🚴" },
  { tipo: "eliptico", label: "Elíptico", emoji: "🏋️" },
  { tipo: "natacao", label: "Natação", emoji: "🏊" },
  { tipo: "remo", label: "Remo", emoji: "🚣" },
  { tipo: "escada", label: "Escada", emoji: "🪜" },
  { tipo: "outro", label: "Outro", emoji: "➕" },
];

export function rotuloTipoCardio(tipo: TipoCardio | null | undefined): string {
  return TIPOS_CARDIO.find((t) => t.tipo === tipo)?.label ?? "Cardio";
}

export function emojiTipoCardio(tipo: TipoCardio | null | undefined): string {
  return TIPOS_CARDIO.find((t) => t.tipo === tipo)?.emoji ?? "➕";
}

/** 90 → "1h30"; 45 → "45 min"; 120 → "2h". */
export function formatarMinutos(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}

/** "2026-11-03" + "2026-11-09" → "03–09/11"; vira o mês → "28/10–03/11". */
export function semanaLabel(inicio: string, fim: string): string {
  const dd = (iso: string) => iso.slice(8, 10);
  const mm = (iso: string) => iso.slice(5, 7);
  if (mm(inicio) === mm(fim)) return `${dd(inicio)}–${dd(fim)}/${mm(fim)}`;
  return `${dd(inicio)}/${mm(inicio)}–${dd(fim)}/${mm(fim)}`;
}

export type ResumoCardioSemana = {
  inicio: string;
  fim: string;
  semana_iso: string;
  registros: Cardio[];
  minutos: number;
  meta_min: number;
  restante_min: number;
  /** 0–100; 0 quando ainda não há meta. */
  pct: number;
  batido: boolean;
};

function resumoDe(cardios: Cardio[] | undefined, metaMin: number, inicio: string): ResumoCardioSemana {
  const fim = somarDias(inicio, 6);
  const registros = (cardios ?? [])
    .filter((c) => c.data >= inicio && c.data <= fim)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criado_em.localeCompare(a.criado_em));
  const minutos = registros.reduce((n, c) => n + c.minutos, 0);
  const meta = Math.max(0, Math.round(metaMin));
  return {
    inicio,
    fim,
    semana_iso: semanaIsoDaData(inicio),
    registros,
    minutos,
    meta_min: meta,
    restante_min: Math.max(0, meta - minutos),
    pct: meta > 0 ? Math.min(100, Math.round((minutos / meta) * 100)) : 0,
    batido: meta > 0 && minutos >= meta,
  };
}

export function resumoCardioSemana(
  cardios: Cardio[] | undefined,
  metaMin: number,
  hojeIso: string,
): ResumoCardioSemana {
  return resumoDe(cardios, metaMin, inicioDaSemana(hojeIso));
}

/**
 * Semanas fechadas + a atual, da mais recente para a mais antiga.
 * Para quando chega na semana anterior ao primeiro registro (não inventa histórico vazio).
 */
export function historicoCardio(
  cardios: Cardio[] | undefined,
  hojeIso: string,
  metaMin: number,
  maxSemanas = 8,
): ResumoCardioSemana[] {
  const lista = (cardios ?? []).filter((c) => ISO_DIA.test(c.data));
  const atual = inicioDaSemana(hojeIso);
  const primeiro = lista.reduce<string | null>((min, c) => (min == null || c.data < min ? c.data : min), null);
  if (!primeiro) return [resumoDe(lista, metaMin, atual)];
  const out: ResumoCardioSemana[] = [];
  for (let i = 0; i < Math.max(1, maxSemanas); i++) {
    const inicio = somarDias(atual, -7 * i);
    if (primeiro && somarDias(inicio, 6) < primeiro) break;
    out.push(resumoDe(lista, metaMin, inicio));
  }
  return out;
}

export type EntradaCardio = {
  minutos: number;
  tipo: TipoCardio;
  data: string;
  id?: string;
  criado_em?: string;
};

/** Cria o registro normalizando os minutos para 1–600. */
export function criarCardio(e: EntradaCardio): Cardio {
  return {
    id: e.id ?? `cardio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    data: e.data,
    minutos: Math.min(600, Math.max(1, Math.round(e.minutos))),
    tipo: e.tipo,
    criado_em: e.criado_em ?? new Date().toISOString(),
  };
}

export function adicionarCardio(state: AppState, entrada: EntradaCardio): AppState {
  return { ...state, cardios: [...(state.cardios ?? []), criarCardio(entrada)] };
}

export function removerCardio(state: AppState, id: string): AppState {
  return { ...state, cardios: (state.cardios ?? []).filter((c) => c.id !== id) };
}
