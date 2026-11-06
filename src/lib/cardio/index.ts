/**
 * Cardio: minutos da semana contra o ideal (`perfil.cardio_min_semana`).
 * Só leitura do que a pessoa registrou — não mexe em carga, séries nem progressão.
 * A semana é a mesma seg–dom (ISO) usada no calendário, no fuso de São Paulo.
 *
 * O ideal semanal é dividido nos 7 dias (a soma dos dias bate exatamente a meta),
 * então dá pra ver o que falta em cada dia sem inventar número: quem registra é a pessoa.
 */
import type { AppState, Cardio, IntensidadeCardio, TipoCardio } from "@/lib/domain";
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

export const INTENSIDADES_CARDIO: { valor: IntensidadeCardio; label: string }[] = [
  { valor: "leve", label: "Leve" },
  { valor: "moderada", label: "Moderada" },
  { valor: "forte", label: "Forte" },
];

export function rotuloIntensidade(intensidade: IntensidadeCardio | null | undefined): string | null {
  return INTENSIDADES_CARDIO.find((i) => i.valor === intensidade)?.label ?? null;
}

/** 90 → "1h30"; 45 → "45 min"; 120 → "2h". */
export function formatarMinutos(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}

/** 5.2 → "5,2 km"; 10 → "10 km"; 0 → null (nada informado). */
export function formatarKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km <= 0) return null;
  const v = Math.round(km * 10) / 10;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
  return `${s} km`;
}

/** 320 → "320 kcal"; 0 → null (nada informado). */
export function formatarKcal(kcal: number | null | undefined): string | null {
  if (kcal == null || !Number.isFinite(kcal) || kcal <= 0) return null;
  return `${Math.round(kcal)} kcal`;
}

/** "30 min · 5,2 km · 320 kcal · moderada" (só o que foi informado). */
export function detalheCardio(c: Cardio): string {
  return [
    formatarMinutos(c.minutos),
    formatarKm(c.distancia_km),
    formatarKcal(c.calorias_kcal),
    rotuloIntensidade(c.intensidade)?.toLowerCase() ?? null,
  ]
    .filter((p): p is string => Boolean(p))
    .join(" · ");
}

/** "2026-11-03" + "2026-11-09" → "03–09/11"; vira o mês → "28/10–03/11". */
export function semanaLabel(inicio: string, fim: string): string {
  const dd = (iso: string) => iso.slice(8, 10);
  const mm = (iso: string) => iso.slice(5, 7);
  if (mm(inicio) === mm(fim)) return `${dd(inicio)}–${dd(fim)}/${mm(fim)}`;
  return `${dd(inicio)}/${mm(inicio)}–${dd(fim)}/${mm(fim)}`;
}

export const ROTULOS_DIA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

/**
 * Divide o ideal semanal nos 7 dias sem perder minuto: 90 → [13,13,13,13,13,13,12].
 * A soma sempre bate `metaMin` (0 quando não há meta).
 */
export function metaPorDia(metaMin: number): number[] {
  const meta = Math.max(0, Math.round(metaMin));
  const base = Math.floor(meta / 7);
  const resto = meta % 7;
  return Array.from({ length: 7 }, (_, i) => base + (i < resto ? 1 : 0));
}

export type ResumoDiaCardio = {
  data: string;
  /** 0 = segunda … 6 = domingo. */
  indice: number;
  rotulo: string;
  registros: Cardio[];
  minutos: number;
  meta_min: number;
  restante_min: number;
  pct: number;
  batido: boolean;
  hoje: boolean;
  /** Depois de hoje: ainda não dá pra registrar. */
  futuro: boolean;
  distancia_km: number;
  calorias_kcal: number;
};

export type ResumoCardioSemana = {
  inicio: string;
  fim: string;
  semana_iso: string;
  registros: Cardio[];
  minutos: number;
  meta_min: number;
  /** Fatia do ideal que cabe em cada dia (soma = meta_min). */
  meta_dia_min: number[];
  /** Os 7 dias da semana, segunda → domingo. */
  por_dia: ResumoDiaCardio[];
  restante_min: number;
  /** 0–100; 0 quando ainda não há meta. */
  pct: number;
  batido: boolean;
  distancia_km: number;
  calorias_kcal: number;
  /** Dias com pelo menos um registro. */
  dias_ativos: number;
};

function somarKm(cardios: Cardio[]): number {
  return Math.round(cardios.reduce((n, c) => n + (c.distancia_km ?? 0), 0) * 10) / 10;
}

function somarKcal(cardios: Cardio[]): number {
  return cardios.reduce((n, c) => n + (c.calorias_kcal ?? 0), 0);
}

function resumoDe(
  cardios: Cardio[] | undefined,
  metaMin: number,
  inicio: string,
  hojeIso: string,
): ResumoCardioSemana {
  const fim = somarDias(inicio, 6);
  const registros = (cardios ?? [])
    .filter((c) => c.data >= inicio && c.data <= fim)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criado_em.localeCompare(a.criado_em));
  const minutos = registros.reduce((n, c) => n + c.minutos, 0);
  const meta = Math.max(0, Math.round(metaMin));
  const metas = metaPorDia(meta);
  const por_dia: ResumoDiaCardio[] = metas.map((metaDia, i) => {
    const data = somarDias(inicio, i);
    const doDia = registros
      .filter((c) => c.data === data)
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    const min = doDia.reduce((n, c) => n + c.minutos, 0);
    return {
      data,
      indice: i,
      rotulo: ROTULOS_DIA[i]!,
      registros: doDia,
      minutos: min,
      meta_min: metaDia,
      restante_min: Math.max(0, metaDia - min),
      pct: metaDia > 0 ? Math.min(100, Math.round((min / metaDia) * 100)) : 0,
      batido: metaDia > 0 && min >= metaDia,
      hoje: data === hojeIso,
      futuro: data > hojeIso,
      distancia_km: somarKm(doDia),
      calorias_kcal: somarKcal(doDia),
    };
  });
  return {
    inicio,
    fim,
    semana_iso: semanaIsoDaData(inicio),
    registros,
    minutos,
    meta_min: meta,
    meta_dia_min: metas,
    por_dia,
    restante_min: Math.max(0, meta - minutos),
    pct: meta > 0 ? Math.min(100, Math.round((minutos / meta) * 100)) : 0,
    batido: meta > 0 && minutos >= meta,
    distancia_km: somarKm(registros),
    calorias_kcal: somarKcal(registros),
    dias_ativos: por_dia.filter((d) => d.registros.length > 0).length,
  };
}

export function resumoCardioSemana(
  cardios: Cardio[] | undefined,
  metaMin: number,
  hojeIso: string,
): ResumoCardioSemana {
  return resumoDe(cardios, metaMin, inicioDaSemana(hojeIso), hojeIso);
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
  if (!primeiro) return [resumoDe(lista, metaMin, atual, hojeIso)];
  const out: ResumoCardioSemana[] = [];
  for (let i = 0; i < Math.max(1, maxSemanas); i++) {
    const inicio = somarDias(atual, -7 * i);
    if (primeiro && somarDias(inicio, 6) < primeiro) break;
    out.push(resumoDe(lista, metaMin, inicio, hojeIso));
  }
  return out;
}

export type EntradaCardio = {
  minutos: number;
  tipo: TipoCardio;
  data: string;
  distancia_km?: number | null;
  calorias_kcal?: number | null;
  intensidade?: IntensidadeCardio | null;
  id?: string;
  criado_em?: string;
};

/** Distância em km: 0/negativo/vazio vira "não informado". */
export function normalizarKm(km: number | null | undefined): number | undefined {
  if (km == null || !Number.isFinite(km) || km <= 0) return undefined;
  return Math.min(500, Math.round(km * 100) / 100);
}

/** Calorias: 0/negativo/vazio vira "não informado". */
export function normalizarKcal(kcal: number | null | undefined): number | undefined {
  if (kcal == null || !Number.isFinite(kcal) || kcal <= 0) return undefined;
  return Math.min(5000, Math.round(kcal));
}

/** Cria o registro normalizando minutos (1–600), km, kcal e intensidade. */
export function criarCardio(e: EntradaCardio): Cardio {
  return {
    id: e.id ?? `cardio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    data: e.data,
    minutos: Math.min(600, Math.max(1, Math.round(e.minutos))),
    tipo: e.tipo,
    distancia_km: normalizarKm(e.distancia_km),
    calorias_kcal: normalizarKcal(e.calorias_kcal),
    intensidade: e.intensidade ?? undefined,
    criado_em: e.criado_em ?? new Date().toISOString(),
  };
}

export function adicionarCardio(state: AppState, entrada: EntradaCardio): AppState {
  return { ...state, cardios: [...(state.cardios ?? []), criarCardio(entrada)] };
}

export function removerCardio(state: AppState, id: string): AppState {
  return { ...state, cardios: (state.cardios ?? []).filter((c) => c.id !== id) };
}
