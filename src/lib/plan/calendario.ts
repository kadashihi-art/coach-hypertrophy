/**
 * Calendário do mesociclo: data_inicio + agendar sessões + marcar feito/pulado.
 * Preferimos sessao.data + status (planejada|concluida|pulada).
 */
import type { Plano, Sessao } from "@/lib/domain";

/** Parse YYYY-MM-DD as UTC noon (avoid TZ flip). */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/**
 * Weekday offsets Mon=0…Sun=6 within a week for N training days.
 */
export function weekdayOffsets(diasPorSemana: number): number[] {
  const n = Math.min(6, Math.max(2, diasPorSemana));
  const presets: Record<number, number[]> = {
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
    6: [0, 1, 2, 3, 4, 5],
  };
  return presets[n] ?? Array.from({ length: n }, (_, i) => i);
}

/**
 * Assign dates to sessions in plan order from data_inicio.
 * Session 0 lands on data_inicio; later sessions follow weekdayOffsets pattern.
 * Does NOT overwrite concluida/em_andamento.
 */
export function agendarSessoes(
  sessoes: Sessao[],
  plano: Plano,
  dataInicio: string,
): Sessao[] {
  const fases = plano.estrutura?.fases;
  if (fases?.length) {
    const dateByIdF = new Map<string, string>();
    for (const f of fases) {
      const start = addDaysIso(dataInicio, (f.semana_inicio - 1) * 7);
      for (const d of f.microciclo) {
        if (d.sessao_id) dateByIdF.set(d.sessao_id, addDaysIso(start, d.dia));
      }
    }
    return sessoes.map((s) => {
      const data = dateByIdF.get(s.id);
      if (!data) return s;
      if (s.status === "concluida" || s.status === "em_andamento") return s;
      const reset = s.status === "pulada" || s.status === "parcial" || s.status === "abandonada";
      return { ...s, data, status: reset ? ("planejada" as const) : s.status };
    });
  }
  const offsets = weekdayOffsets(plano.dias_por_semana);
  const ordered = [...sessoes]
    .filter((s) => plano.sessoes.includes(s.id) || s.plano_id === plano.id)
    .sort((a, b) => a.ordem - b.ordem);

  const dateById = new Map<string, string>();
  const off0 = offsets[0] ?? 0;
  for (let idx = 0; idx < ordered.length; idx++) {
    const weekIdx = Math.floor(idx / offsets.length);
    const within = idx % offsets.length;
    const offN = offsets[within] ?? 0;
    let gap = offN - off0;
    if (gap < 0) gap += 7;
    const daysFromStart = weekIdx * 7 + gap;
    dateById.set(ordered[idx].id, addDaysIso(dataInicio, daysFromStart));
  }

  return sessoes.map((s) => {
    const data = dateById.get(s.id);
    if (!data) return s;
    if (s.status === "concluida" || s.status === "em_andamento") return s;
    const resetStatus =
      s.status === "pulada" ||
      s.status === "parcial" ||
      s.status === "abandonada";
    return {
      ...s,
      data,
      status: resetStatus ? ("planejada" as const) : s.status,
    };
  });
}

export function marcarPulada(sessoes: Sessao[], sessaoId: string): Sessao[] {
  return sessoes.map((s) =>
    s.id === sessaoId &&
    s.status !== "em_andamento" &&
    s.status !== "concluida"
      ? { ...s, status: "pulada" as const }
      : s,
  );
}

export function desmarcarPulada(sessoes: Sessao[], sessaoId: string): Sessao[] {
  return sessoes.map((s) =>
    s.id === sessaoId && s.status === "pulada"
      ? { ...s, status: "planejada" as const }
      : s,
  );
}

export type CalendarioDiaView = {
  data: string;
  sessao_id: string | null;
  status: "planejado" | "feito" | "pulado" | "vazio" | "em_andamento";
  nome?: string;
};

/** Derive month calendar cells from sessoes[].data + status. */
export function derivarCalendario(
  sessoes: Sessao[],
  year: number,
  month0: number,
): CalendarioDiaView[] {
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const byDate = new Map<string, Sessao>();
  for (const s of sessoes) {
    if (!s.data) continue;
    const prev = byDate.get(s.data);
    if (!prev) {
      byDate.set(s.data, s);
      continue;
    }
    const rank = (x: Sessao) =>
      x.status === "em_andamento"
        ? 4
        : x.status === "concluida"
          ? 3
          : x.status === "pulada"
            ? 2
            : 1;
    if (rank(s) >= rank(prev)) byDate.set(s.data, s);
  }

  const out: CalendarioDiaView[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = toIsoDate(new Date(Date.UTC(year, month0, d, 12)));
    const s = byDate.get(iso);
    if (!s) {
      out.push({ data: iso, sessao_id: null, status: "vazio" });
      continue;
    }
    let status: CalendarioDiaView["status"] = "planejado";
    if (s.status === "concluida") status = "feito";
    else if (s.status === "pulada") status = "pulado";
    else if (s.status === "em_andamento") status = "em_andamento";
    out.push({ data: iso, sessao_id: s.id, status, nome: s.nome });
  }
  return out;
}

/** Prefer previous EstadoExercicio when exercise remains in new plan. */
export function mergeEstadosPreservados<
  T extends { exercicio_id: string },
>(anteriores: T[], novos: T[]): T[] {
  const prev = new Map(anteriores.map((e) => [e.exercicio_id, e]));
  return novos.map((n) => prev.get(n.exercicio_id) ?? n);
}
