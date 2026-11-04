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

/** Noite anterior p/ regularidade: só o horário de dormir conta (mesma regra do resumo semanal). */
export type NoiteHistorico = number | { sono_h: number; sono_inicio?: string | null };

/** Mesma régua do resumo semanal (lote 8): desvio do horário de dormir > 60 min, com pelo menos 3 noites. */
export const IRREGULAR_DORMIR_MIN = 60;
export const NOITES_MIN_REGULARIDADE = 3;

function eixoNoite(hhmm: string): number | null {
  const m = minutosDesdeMeiaNoite(hhmm);
  if (m == null) return null;
  return m >= 12 * 60 ? m - 12 * 60 : m + 12 * 60;
}

/** Desvio padrão do horário de dormir (min) nas noites com horário; null se houver menos de 3. */
export function variacaoHorarioDormir(inicios: Array<string | null | undefined>): number | null {
  const xs = inicios.map((x) => (x ? eixoNoite(x) : null)).filter((x): x is number => x != null);
  if (xs.length < NOITES_MIN_REGULARIDADE) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

/**
 * Feedback em PT a partir da duração (+ opcional histórico recente).
 * Regularidade segue a regra do resumo semanal: só o horário de dormir conta
 * (duração variando não marca "irregular"). Não altera o treino, só copy de UI.
 * `inicioHoje` é o horário de dormir da noite avaliada.
 */
export function feedbackSono(
  duracaoH: number,
  historico?: NoiteHistorico[],
  inicioHoje?: string | null,
): FeedbackSono {
  const r9_sono = duracaoH < 6;
  let base: FeedbackSono;

  if (duracaoH < 6) {
    base = {
      nivel: "baixo",
      titulo: "Sono curto",
      dica: "Menos de 6 h: o treino de hoje fica mais leve, com 1 série a menos nos exercícios principais. Tente deitar mais cedo hoje.",
      r9_sono,
    };
  } else if (duracaoH < 7) {
    base = {
      nivel: "ok_leve",
      titulo: "Sono ok, com ressalva",
      dica: "Entre 6 e 7 h funciona, mas o ideal pra recuperar fica entre 7 e 9 h.",
      r9_sono,
    };
  } else if (duracaoH <= 9) {
    base = {
      nivel: "ok",
      titulo: "Sono na faixa boa",
      dica: "De 7 a 9 h é a melhor faixa pra recuperar e render no treino.",
      r9_sono,
    };
  } else {
    base = {
      nivel: "longo",
      titulo: "Sono longo",
      dica: "Mais de 9 h pode ser o corpo compensando noites curtas. Se for frequente, vale olhar a rotina.",
      r9_sono,
    };
  }

  // Sono curto tem prioridade (muda o treino do dia). Só olha regularidade com duração ok.
  if (base.nivel !== "baixo" && historico && historico.length) {
    const inicios = [
      ...historico.slice(0, 6).map((h) => (typeof h === "number" ? null : h.sono_inicio ?? null)),
      inicioHoje ?? null,
    ];
    const v = variacaoHorarioDormir(inicios);
    if (v != null && v > IRREGULAR_DORMIR_MIN) {
      return {
        nivel: "inconsistente",
        titulo: "Horário de dormir irregular",
        dica:
          base.dica +
          " O horário em que você deita tem variado mais de 1 hora entre as noites. Deitar sempre perto do mesmo horário ajuda a acordar disposto.",
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
