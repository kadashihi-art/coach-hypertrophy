/**
 * Calendário do mesociclo: data_inicio + agendar sessões + marcar feito/pulado.
 * Preferimos sessao.data + status (planejada|concluida|pulada).
 */
import type { AppState, Plano, Sessao } from "@/lib/domain";

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
  // Dias já ocupados por sessão concluída/em andamento (histórico intocado).
  // Se o início cair num desses dias (ex.: "Começar hoje" num dia já Feito), o plano
  // novo começa no próximo dia livre, mantendo o espaçamento; colisões posteriores
  // empurram só aquela sessão pro próximo dia livre.
  const fixa = (s: Sessao) => s.status === "concluida" || s.status === "em_andamento";
  const primeiraId = [...sessoes]
    .filter((s) => plano.sessoes.includes(s.id) || s.plano_id === plano.id)
    .sort((a, b) => a.ordem - b.ordem)[0]?.id;
  const ocupados = new Set<string>();
  for (const s of sessoes) {
    if (s.data && fixa(s) && !(primeiraId === s.id && s.data === dataInicio)) ocupados.add(s.data);
  }
  while (ocupados.has(dataInicio)) dataInicio = addDaysIso(dataInicio, 1);
  const livre = (s: Sessao, data: string) => {
    if (fixa(s)) return data;
    while (ocupados.has(data)) data = addDaysIso(data, 1);
    ocupados.add(data);
    return data;
  };

  const fases = plano.estrutura?.fases;
  if (fases?.length) {
    const dateByIdF = new Map<string, string>();
    for (const f of fases) {
      const start = addDaysIso(dataInicio, (f.semana_inicio - 1) * 7);
      for (const d of f.microciclo) {
        if (d.sessao_id) dateByIdF.set(d.sessao_id, addDaysIso(start, d.dia));
      }
    }
    const ordF = [...sessoes]
      .filter((s) => dateByIdF.has(s.id))
      .sort((a, b) => (dateByIdF.get(a.id)! < dateByIdF.get(b.id)! ? -1 : 1));
    for (const s of ordF) dateByIdF.set(s.id, livre(s, dateByIdF.get(s.id)!));
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
    dateById.set(ordered[idx].id, livre(ordered[idx], addDaysIso(dataInicio, daysFromStart)));
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
  status: "planejado" | "feito" | "pulado" | "vazio" | "em_andamento" | "limpo";
  nome?: string;
};

/** Derive month calendar cells from sessoes[].data + status. */
export function derivarCalendario(
  sessoes: Sessao[],
  year: number,
  month0: number,
  diasLimpos: string[] = [],
): CalendarioDiaView[] {
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const datas = Array.from({ length: daysInMonth }, (_, i) => toIsoDate(new Date(Date.UTC(year, month0, i + 1, 12))));
  return derivarDias(sessoes, datas, diasLimpos);
}

/** Mesma regra do calendário para qualquer lista de dias (chips da semana em Hoje usam esta). */
export function derivarDias(sessoes: Sessao[], datas: string[], diasLimpos: string[] = []): CalendarioDiaView[] {
  const limpos = new Set(diasLimpos);
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
  for (const iso of datas) {
    const s = byDate.get(iso);
    if (!s) {
      out.push({ data: iso, sessao_id: null, status: limpos.has(iso) ? "limpo" : "vazio" });
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

export type ResultadoLimpar =
  | { ok: true; state: AppState; tirado: string | null }
  | { ok: false; motivo: "feito" | "em_andamento" };

/**
 * Limpar dia (só depois do usuário confirmar). Nunca apaga série registrada nem treino feito.
 * - Treino feito ou em andamento no dia: não limpa (o app manda para "Corrigir registro").
 * - Treino planejado ou pulado no dia: sai do dia SEM sumir do plano. Volta para a fila
 *   (planejado, sem data) e a agenda o coloca no próximo dia de treino livre, na ordem do plano.
 * - O dia fica marcado como limpo: a agenda do pendente não põe treino nele.
 */
export function limparDia(state: AppState, data: string, sessaoId: string | null): ResultadoLimpar {
  const s = sessaoId ? state.sessoes.find((x) => x.id === sessaoId) : undefined;
  if (s?.status === "concluida" || s?.status === "parcial") return { ok: false, motivo: "feito" };
  if (s?.status === "em_andamento") return { ok: false, motivo: "em_andamento" };
  const limpos = [...new Set([...(state.dias_limpos ?? []), data])].sort();
  return {
    ok: true,
    tirado: s ? s.nome : null,
    state: {
      ...state,
      dias_limpos: limpos,
      sessoes: s
        ? state.sessoes.map((x) => (x.id === s.id ? { ...x, data: null, status: "planejada" as const, data_manual: undefined } : x))
        : state.sessoes,
    },
  };
}

/** Desfaz a limpeza do dia (o dia volta a poder receber treino). */
export function desfazerLimpeza(state: AppState, data: string): AppState {
  return { ...state, dias_limpos: (state.dias_limpos ?? []).filter((d) => d !== data) };
}

/** Chips da semana (seg→dom) em Hoje: mesma regra e mesmos status do calendário. */
export function semanaDoCalendario(sessoes: Sessao[], hoje: string, diasLimpos: string[] = []) {
  const h = parseIsoDate(hoje);
  const dow = (h.getUTCDay() + 6) % 7;
  const datas = Array.from({ length: 7 }, (_, i) => toIsoDate(new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate() - dow + i, 12))));
  const L = ["S", "T", "Q", "Q", "S", "S", "D"];
  return derivarDias(sessoes, datas, diasLimpos).map((d, i) => ({ iso: d.data, label: L[i]!, st: d.status, nome: d.nome, hoje: d.data === hoje }));
}
