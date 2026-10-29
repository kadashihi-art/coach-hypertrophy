/**
 * T9 — Context builder for Coach chat.
 * Copies ONLY numbers/facts from AppState (motor). Never invents loads.
 */
import { AJUSTAR_PLANO_HREF } from "@/lib/nav";
import type {
  AppState,
  Checkin,
  DecisaoProgressao,
  EstadoExercicio,
  GrupoMuscular,
  VolumeSemanal,
} from "@/lib/domain";
import { GrupoMuscularSchema } from "@/lib/domain";
import { hojeIsoSaoPaulo as hojeIsoSP, proximaSessao } from "@/lib/plan/proxima-sessao";
import { racionalDoPlano } from "@/lib/plan/racional";
import { faseAtiva } from "@/lib/plan/estrutura";
import type { PlanoRacional } from "@/lib/domain";

export type CoachContextOpts = {
  grupo?: GrupoMuscular;
  exercicio_id?: string;
  mensagem?: string;
  /** ISO weeks to keep (default 8, clamp 4–8) */
  semanas?: number;
  /** Max decisoes (default 12) */
  max_decisoes?: number;
  /** Max estados when unfiltered (default 8) */
  max_estados?: number;
};

export type CoachContextEstado = {
  exercicio_id: string;
  nome?: string;
  grupo?: GrupoMuscular;
  carga_atual_kg: number;
  ultimo_top_kg: number | null;
  ultimo_back_off_kg: number | null;
  ultimo_rir: number | null;
  rir_alvo: number;
  alvo_proxima_sessao: {
    carga_kg: number;
    faixa_reps: [number, number];
    rir_alvo: number;
  };
  ultima_sessao_em: string | null;
  origem_carga: string;
  primeira_sessao: boolean;
};

export type CoachContextPrescSnap = {
  exercicio_id: string;
  nome?: string;
  series: number;
  faixa_reps: [number, number];
  rir_alvo: number;
  carga_trabalho_kg: number;
  top_set_kg: number | null;
};

export type CoachContext = {
  gerado_em: string;
  filtro: { grupo?: GrupoMuscular; exercicio_id?: string };
  checkin_hoje: Checkin | null;
  plano: {
    objetivo?: string;
    divisao?: string;
    dias_por_semana?: number;
    mesociclo?: {
      total_semanas: number;
      semana_atual: number;
      foco: string;
    };
  } | null;
  estados: CoachContextEstado[];
  volumes_semanais: VolumeSemanal[];
  decisoes_progressao: Array<{
    data: string;
    exercicio_id: string;
    nome?: string;
    regra: string;
    acao: string;
    carga_anterior_kg: number;
    nova_carga_kg: number;
    motivo: string;
  }>;
  proxima_sessao: {
    id: string;
    nome: string;
    grupos: GrupoMuscular[];
    prescricoes: CoachContextPrescSnap[];
  } | null;
  mensagem_usuario?: string;
  /** Racional determinístico do motor (salvo ou derivado). */
  racional?: PlanoRacional | null;
  fase_ativa?: { id: string; nome: string; estilo: string; semanas: string; microciclo: string } | null;
  /** Opções que o usuário pode escolher em /meu-treino (remontar é ação explícita do usuário). */
  opcoes_remontagem?: { url: string; estilos: string[]; fases: string };
};

function hojeIsoSaoPaulo(): string {
  // America/Sao_Paulo calendar day
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseGrupo(raw?: string): GrupoMuscular | undefined {
  if (!raw) return undefined;
  const p = GrupoMuscularSchema.safeParse(raw);
  return p.success ? p.data : undefined;
}

function nomeExercicio(state: AppState, id: string): string | undefined {
  return state.exercicios.find((e) => e.id === id)?.nome;
}

function grupoExercicio(
  state: AppState,
  id: string,
): GrupoMuscular | undefined {
  return state.exercicios.find((e) => e.id === id)?.grupo_primario;
}

function weekRank(iso: string): number {
  // "2026-W44" → sortable int
  const m = /^(\d{4})-W(\d{2})$/.exec(iso);
  if (!m) return 0;
  return Number(m[1]) * 100 + Number(m[2]);
}

function lastNWeeks(
  volumes: VolumeSemanal[],
  n: number,
  grupo?: GrupoMuscular,
): VolumeSemanal[] {
  const filtered = grupo
    ? volumes.filter((v) => v.grupo === grupo)
    : volumes;
  const weeks = [...new Set(filtered.map((v) => v.semana_iso))].sort(
    (a, b) => weekRank(b) - weekRank(a),
  );
  const keep = new Set(weeks.slice(0, n));
  return filtered
    .filter((v) => keep.has(v.semana_iso))
    .sort((a, b) => weekRank(b.semana_iso) - weekRank(a.semana_iso));
}

function mapEstado(
  state: AppState,
  e: EstadoExercicio,
): CoachContextEstado {
  return {
    exercicio_id: e.exercicio_id,
    nome: nomeExercicio(state, e.exercicio_id),
    grupo: grupoExercicio(state, e.exercicio_id),
    carga_atual_kg: e.carga_atual_kg,
    ultimo_top_kg: e.ultimo_top_kg ?? null,
    ultimo_back_off_kg: e.ultimo_back_off_kg ?? null,
    ultimo_rir: e.ultimo_rir ?? null,
    rir_alvo: e.rir_alvo,
    alvo_proxima_sessao: {
      carga_kg: e.alvo_proxima_sessao.carga_kg,
      faixa_reps: e.alvo_proxima_sessao.faixa_reps,
      rir_alvo: e.alvo_proxima_sessao.rir_alvo,
    },
    ultima_sessao_em: e.ultima_sessao_em ?? null,
    origem_carga: e.origem_carga,
    primeira_sessao: e.primeira_sessao,
  };
}

/**
 * Build serializable coach context from AppState.
 * Prefer calling on the client from useApp().state so the API stays write-free.
 */
export function buildCoachContext(
  state: AppState,
  opts: CoachContextOpts = {},
): CoachContext {
  const grupo = parseGrupo(opts.grupo) ?? opts.grupo;
  const exercicio_id = opts.exercicio_id?.trim() || undefined;
  const semanas = Math.min(8, Math.max(4, opts.semanas ?? 8));
  const maxDec = opts.max_decisoes ?? 12;
  const maxEst = opts.max_estados ?? 8;

  const hoje = hojeIsoSaoPaulo();
  const checkin_hoje =
    state.checkins.find((c) => c.data === hoje) ?? null;

  let estadosSrc = state.estados;
  if (exercicio_id) {
    estadosSrc = estadosSrc.filter((e) => e.exercicio_id === exercicio_id);
  } else if (grupo) {
    estadosSrc = estadosSrc.filter(
      (e) => grupoExercicio(state, e.exercicio_id) === grupo,
    );
  } else {
    // Top relevant: most recently updated / with history
    estadosSrc = [...estadosSrc].sort((a, b) =>
      (b.atualizado_em || "").localeCompare(a.atualizado_em || ""),
    );
  }
  const estados = (exercicio_id || grupo
    ? estadosSrc
    : estadosSrc.slice(0, maxEst)
  ).map((e) => mapEstado(state, e));

  // Volumes: if grupo set, that grupo; else union of grupos from estados / next session
  const gruposVol = new Set<GrupoMuscular>();
  if (grupo) gruposVol.add(grupo);
  else {
    for (const e of estados) {
      if (e.grupo) gruposVol.add(e.grupo);
    }
  }
  let volumes_semanais: VolumeSemanal[];
  if (gruposVol.size === 0) {
    volumes_semanais = lastNWeeks(state.volumes_semanais, semanas);
  } else {
    volumes_semanais = [];
    for (const g of gruposVol) {
      volumes_semanais.push(
        ...lastNWeeks(state.volumes_semanais, semanas, g),
      );
    }
    volumes_semanais.sort(
      (a, b) => weekRank(b.semana_iso) - weekRank(a.semana_iso),
    );
  }

  let decisoesSrc: DecisaoProgressao[] = [...state.decisoes].sort((a, b) =>
    b.data.localeCompare(a.data),
  );
  if (exercicio_id) {
    decisoesSrc = decisoesSrc.filter((d) => d.exercicio_id === exercicio_id);
  } else if (grupo) {
    decisoesSrc = decisoesSrc.filter(
      (d) => grupoExercicio(state, d.exercicio_id) === grupo,
    );
  }
  const decisoes_progressao = decisoesSrc.slice(0, maxDec).map((d) => ({
    data: d.data,
    exercicio_id: d.exercicio_id,
    nome: nomeExercicio(state, d.exercicio_id),
    regra: d.regra,
    acao: d.acao,
    carga_anterior_kg: d.carga_anterior_kg,
    nova_carga_kg: d.nova_carga_kg,
    motivo: d.motivo,
  }));

  const plano = state.plano
    ? {
        objetivo: state.plano.objetivo,
        divisao: state.plano.divisao,
        dias_por_semana: state.plano.dias_por_semana,
        mesociclo: {
          total_semanas: state.plano.mesociclo.total_semanas,
          semana_atual: state.plano.mesociclo.semana_atual,
          foco: state.plano.mesociclo.foco,
        },
      }
    : null;

  let racional: PlanoRacional | null = null;
  let fase_ativa: CoachContext["fase_ativa"] = null;
  if (state.plano) {
    try {
      racional = racionalDoPlano({ plano: state.plano, sessoes: state.sessoes, perfil: state.perfil, catalog: state.exercicios });
    } catch {
      racional = null;
    }
    const f = faseAtiva(state.plano, hojeIsoSP());
    if (f) {
      fase_ativa = {
        id: f.id,
        nome: f.nome,
        estilo: f.estilo,
        semanas: `${f.semana_inicio}–${f.semana_inicio + f.semanas - 1}`,
        microciclo: f.microciclo.map((d) => d.tipo).join(" → "),
      };
    }
  }

  const next = proximaSessao(state, hojeIsoSP());
  let proxima_sessao: CoachContext["proxima_sessao"] = null;
  if (next) {
    const prescricoes: CoachContextPrescSnap[] = next.prescricoes
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .filter((p) => {
        if (exercicio_id) return p.exercicio_id === exercicio_id;
        if (grupo) {
          return grupoExercicio(state, p.exercicio_id) === grupo;
        }
        return true;
      })
      .slice(0, 8)
      .map((p) => ({
        exercicio_id: p.exercicio_id,
        nome: nomeExercicio(state, p.exercicio_id),
        series: p.series,
        faixa_reps: p.faixa_reps,
        rir_alvo: p.rir_alvo,
        // From motor/prescrição already anchored on EstadoExercicio
        carga_trabalho_kg: p.carga.trabalho_kg,
        top_set_kg: p.carga.top_set_kg ?? null,
      }));
    proxima_sessao = {
      id: next.id,
      nome: next.nome,
      grupos: next.grupos,
      prescricoes,
    };
  }

  return {
    gerado_em: new Date().toISOString(),
    filtro: {
      ...(grupo ? { grupo } : {}),
      ...(exercicio_id ? { exercicio_id } : {}),
    },
    checkin_hoje,
    plano,
    estados,
    volumes_semanais,
    decisoes_progressao,
    proxima_sessao,
    racional,
    fase_ativa,
    opcoes_remontagem: {
      url: AJUSTAR_PLANO_HREF,
      estilos: ["auto (coach escolhe)", "na resposta use só os nomes humanos, nunca o id com underline", "full_body = Full Body", "upper_lower = Upper/Lower", "ppl = Push/Pull/Legs", "hibrido_ppl_ul = Híbrido PPL + Upper/Lower", "hibrido_fb_ul = Híbrido Full Body + Upper/Lower"],
      fases: "Fase 2 opcional: outro estilo após N semanas",
    },
    ...(opts.mensagem ? { mensagem_usuario: opts.mensagem } : {}),
  };
}
