/**
 * Cronômetro de descanso — lógica pura (sem React/DOM).
 * Baseado em timestamp (endAt): o tempo restante é sempre endAt − agora,
 * então continua certo com o app em background e retoma ao voltar.
 * Só LÊ o descanso que o plano/motor já prescreveu (presc.descanso_seg); não altera regras.
 */
export type FaseSerie = "aquecimento" | "top_set" | "back_off" | "trabalho" | "drop";

export type RestTimerState = {
  /** epoch ms em que o descanso termina */
  endAt: number;
  /** duração total atual (ms), usada pro anel de progresso */
  totalMs: number;
  startedAt: number;
  /** encerrado manualmente (Pular) */
  pulado?: boolean;
  rotulo: string;
};

export const REST_STORAGE_KEY = "coach-hypertrophy:rest-timer";
export const PASSO_AJUSTE_S = 15;

/** Padrão quando não há prescrição: composto descansa mais que isolado. */
export const DESCANSO_PADRAO_S = { composto: 150, isolado: 90 } as const;

const ROTULO: Record<FaseSerie, string> = {
  aquecimento: "Descanso do aquecimento",
  top_set: "Descanso depois da série principal",
  back_off: "Descanso entre as séries de trabalho",
  trabalho: "Descanso entre as séries",
  drop: "Respira e segue",
};

const arred5 = (s: number) => Math.round(s / 5) * 5;

/**
 * Descanso sugerido (s) a partir do que o plano prescreveu.
 * - aquecimento: curto (~40% do prescrito; 45–75 s composto, 30–60 s isolado)
 * - top set: mais longo (+25%, até 5 min no composto, 3 min no isolado)
 * - back-off / trabalho: o prescrito pelo plano
 * - drop: mínimo (15 s)
 */
export function descansoSugerido(args: { fase: FaseSerie; composto: boolean; prescritoSeg?: number | null }): number {
  const base = args.prescritoSeg && args.prescritoSeg > 0 ? args.prescritoSeg : args.composto ? DESCANSO_PADRAO_S.composto : DESCANSO_PADRAO_S.isolado;
  switch (args.fase) {
    case "aquecimento": {
      const [lo, hi] = args.composto ? [45, 75] : [30, 60];
      return Math.min(hi, Math.max(lo, arred5(base * 0.4)));
    }
    case "top_set":
      return Math.min(args.composto ? 300 : 180, arred5(base * 1.25));
    case "drop":
      return 15;
    default:
      return base;
  }
}

export function rotuloFase(fase: FaseSerie): string {
  return ROTULO[fase] ?? "Descanso";
}

export function iniciar(segundos: number, fase: FaseSerie, agora = Date.now()): RestTimerState {
  const ms = Math.max(0, Math.round(segundos)) * 1000;
  return { endAt: agora + ms, totalMs: ms, startedAt: agora, rotulo: rotuloFase(fase) };
}

export function restanteMs(t: RestTimerState | null, agora = Date.now()): number {
  if (!t || t.pulado) return 0;
  return Math.max(0, t.endAt - agora);
}

export function restanteSeg(t: RestTimerState | null, agora = Date.now()): number {
  return Math.ceil(restanteMs(t, agora) / 1000);
}

export function terminou(t: RestTimerState | null, agora = Date.now()): boolean {
  return !!t && restanteMs(t, agora) === 0;
}

/** Progresso 0→1 (1 = acabou). */
export function progresso(t: RestTimerState | null, agora = Date.now()): number {
  if (!t || t.totalMs <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - restanteMs(t, agora) / t.totalMs));
}

/** ±N segundos sobre o restante, com piso em 0. Se já acabou, +15 recomeça a contar de agora. */
export function ajustar(t: RestTimerState, deltaSeg: number, agora = Date.now()): RestTimerState {
  const novoRestante = Math.max(0, restanteMs(t, agora) + deltaSeg * 1000);
  const endAt = agora + novoRestante;
  const decorrido = Math.max(0, agora - t.startedAt);
  return { ...t, pulado: false, endAt, totalMs: Math.max(decorrido + novoRestante, 1) };
}

export function pular(t: RestTimerState, agora = Date.now()): RestTimerState {
  return { ...t, pulado: true, endAt: Math.min(t.endAt, agora) };
}

export function formatar(seg: number): string {
  const s = Math.max(0, seg);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Serializa/retoma do localStorage (retomada pelo endAt). */
export function serializar(t: RestTimerState | null): string | null {
  return t ? JSON.stringify(t) : null;
}
export function retomar(raw: string | null | undefined): RestTimerState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<RestTimerState>;
    if (typeof o.endAt !== "number" || typeof o.totalMs !== "number" || typeof o.startedAt !== "number") return null;
    return { endAt: o.endAt, totalMs: o.totalMs, startedAt: o.startedAt, pulado: !!o.pulado, rotulo: typeof o.rotulo === "string" ? o.rotulo : "Descanso" };
  } catch {
    return null;
  }
}
