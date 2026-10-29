/**
 * Sono inteligente — horários HH:MM → duração decimal.
 * `sono_h` no Checkin continua sendo a duração calculada (alimenta R9 <6h).
 * `sono_inicio` / `sono_fim` são opcionais (migração de check-ins antigos).
 */

/** Hora do dia no formato 24h `HH:MM` (ex. "23:30", "06:45"). */
export type HoraHHMM = string;

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseHoraHHMM(s: string): { h: number; m: number } | null {
  const m = HHMM_RE.exec(s.trim());
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

export function minutosDesdeMeiaNoite(s: string): number | null {
  const p = parseHoraHHMM(s);
  if (!p) return null;
  return p.h * 60 + p.m;
}

/**
 * Duração em horas decimais. Se fim <= início, assume virada de noite (+24h).
 * Ex.: 23:30 → 06:45 = 7.25
 */
export function calcularDuracaoSono(inicio: string, fim: string): number {
  const a = minutosDesdeMeiaNoite(inicio);
  const b = minutosDesdeMeiaNoite(fim);
  if (a == null || b == null) return 0;
  let delta = b - a;
  if (delta <= 0) delta += 24 * 60;
  // arredonda a 2 casas (minutos → horas)
  return Math.round((delta / 60) * 100) / 100;
}

/** Formata horas decimais como `7h15` / `7h` / `6h30`. */
export function formatarDuracaoSono(horas: number): string {
  if (!Number.isFinite(horas) || horas < 0) return "—";
  const totalMin = Math.round(horas * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export type FeedbackSonoNivel =
  | "baixo"
  | "ok_leve"
  | "ok"
  | "longo"
  | "inconsistente";

export type FeedbackSono = {
  nivel: FeedbackSonoNivel;
  titulo: string;
  dica: string;
  /** true quando duração < 6h (mesmo limiar R9) */
  r9_sono: boolean;
};

/**
 * Feedback em PT a partir da duração (+ opcional histórico recente).
 * Não altera o motor — só copy de UI.
 */
export function feedbackSono(
  duracaoH: number,
  historicoDuracoes?: number[],
): FeedbackSono {
  const r9_sono = duracaoH < 6;
  let base: FeedbackSono;

  if (duracaoH < 6) {
    base = {
      nivel: "baixo",
      titulo: "Sono curto",
      dica: "Menos de 6h — o coach pode cortar 1 série nos compostos hoje (R9). Tente antecipar a hora de dormir.",
      r9_sono,
    };
  } else if (duracaoH < 7) {
    base = {
      nivel: "ok_leve",
      titulo: "Sono ok, com ressalva",
      dica: "Entre 6–7h funciona, mas o ideal pra recuperação fica perto de 7–9h.",
      r9_sono,
    };
  } else if (duracaoH <= 9) {
    base = {
      nivel: "ok",
      titulo: "Sono na faixa boa",
      dica: "7–9h — boa janela pra recuperar e render no treino.",
      r9_sono,
    };
  } else {
    base = {
      nivel: "longo",
      titulo: "Sono longo",
      dica: "Mais de 9h — pode ser catch-up. Se for frequente, vale olhar a rotina (não é alerta de volume).",
      r9_sono,
    };
  }

  const hist = (historicoDuracoes ?? []).filter(
    (h) => Number.isFinite(h) && h > 0,
  );
  if (hist.length >= 2) {
    const recent = [...hist.slice(-3), duracaoH];
    const min = Math.min(...recent);
    const max = Math.max(...recent);
    if (max - min >= 1.75) {
      return {
        nivel: "inconsistente",
        titulo: base.titulo + " · horário irregular",
        dica:
          base.dica +
          " Sua duração tem variado bastante noite a noite — tentar horários mais estáveis ajuda a prontidão.",
        r9_sono,
      };
    }
  }

  return base;
}

/** Resumo curto p/ /hoje e coach: "23:30–06:45 (7h15)" ou só "7h15". */
export function resumoSonoCheckin(ck: {
  sono_h: number;
  sono_inicio?: string | null;
  sono_fim?: string | null;
}): string {
  const dur = formatarDuracaoSono(ck.sono_h);
  if (ck.sono_inicio && ck.sono_fim) {
    return `${ck.sono_inicio}–${ck.sono_fim} (${dur})`;
  }
  return dur;
}
