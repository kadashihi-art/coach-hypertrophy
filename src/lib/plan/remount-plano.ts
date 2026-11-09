/**
 * Remount plan from perfil patch.
 * Always: gerarPlanoFromPerfil (motor).
 * Optionally: Tokia/OpenAI-compat via COACH_LLM_* (+ COACH_LLM_PLAN_MODEL)
 * may suggest split notes / exercise preference / justificativa within catalog.
 * LLM MUST NOT invent kg into EstadoExercicio — loads stay from motor.
 */
import { algumaIaConfigurada, chamarCadeia, extrairJson } from "@/lib/llm/cadeia";
import { semMotor } from "@/lib/llm/tom";
import type {
  EstadoExercicio,
  Exercicio,
  Perfil,
  Plano,
  RegistroSerie,
  Sessao,
  VolumeSemanal,
} from "@/lib/domain";
import { cargaSugeridaParaExercicio } from "@/lib/engine/memoria-carga";
import { pontosHistoricoPorExercicio } from "@/lib/plan/sugestao-exercicio";
import { gerarPlanoFromPerfil } from "@/lib/plan/gerar-plano";
import { derivarRacional } from "@/lib/plan/racional";
import { parqBloqueiaPrescricao, PARQ_BLOQUEIO_MSG } from "@/lib/plan/parq";
import { buildCoachSystemWithArsenal } from "@/lib/llm/research-arsenal";

export type RemountResult = {
  plano: Plano;
  sessoes: Sessao[];
  estados: EstadoExercicio[];
  volumes_semanais: VolumeSemanal[];
  justificativa_llm?: string;
  fonte: "motor" | "motor+llm";
};

export type LlmPlanSuggestion = {
  justificativa?: string;
  /** Soft hints — applied only if exercise ids exist in catalog + new plan */
  prefer_exercicio_ids?: string[];
  notas?: string;
};

function planModel(): string | undefined {
  return (
    process.env.COACH_LLM_PLAN_MODEL?.trim() ||
    process.env.COACH_LLM_MODEL?.trim() ||
    undefined
  );
}

function llmConfigured(): boolean {
  return algumaIaConfigurada();
}

/** Ask LLM for structure/copy only. Never trust kg from response. */
export async function sugerirPlanoLlm(args: {
  perfil: Perfil;
  motorJustificativa: string;
  catalogIds: string[];
  divisao: string;
  sessoesResumo: Array<{ nome: string; exercicios: string[] }>;
}): Promise<LlmPlanSuggestion | null> {
  if (!llmConfigured()) return null;
  const model = planModel() || "openrouter/anthropic/claude-opus-5";

  const system = buildCoachSystemWithArsenal(
    [
      "Você auxilia a MONTAGEM estrutural de um plano de hipertrofia (split/exercícios/justificativa).",
      "O cálculo determinístico do app já gerou o plano base (nunca chame isso de \"motor\" com o usuário). Você só sugere copy/justificativa e preferências de exercício DENTRO do catálogo.",
      "NUNCA invente kg, RIR, séries numéricas novas, nem IDs fora do catálogo.",
      "NUNCA faça prescrição clínica. PAR-Q+ já foi validado no servidor.",
      "Responda JSON: { justificativa?: string, prefer_exercicio_ids?: string[], notas?: string }",
      "PT-BR, tom direto/técnico, clean.",
    ],
    10000,
  );

  const user = JSON.stringify({
    perfil: {
      peso_kg: args.perfil.peso_kg,
      altura_cm: args.perfil.altura_cm,
      experiencia: args.perfil.experiencia,
      dias_por_semana: args.perfil.dias_por_semana,
      minutos_por_sessao: args.perfil.minutos_por_sessao,
      cardio_min_semana: args.perfil.cardio_min_semana,
      equipamentos: args.perfil.equipamentos,
      restricoes: args.perfil.restricoes,
      objetivo: args.perfil.objetivo,
    },
    motor: {
      divisao: args.divisao,
      justificativa: args.motorJustificativa,
      sessoes: args.sessoesResumo,
    },
    catalog_ids_sample: args.catalogIds.slice(0, 80),
  });

  try {
    const r = await chamarCadeia({
      ponto: "remount-plano",
      json: true,
      temperature: 0.2,
      modeloTokia: model,
      timeoutTokiaMs: 18_000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      validar: (t) => {
        const j = extrairJson(t);
        return !!j && typeof j === "object" && !Array.isArray(j);
      },
    });
    if (!r) return null;
    const parsed = extrairJson(r.texto) as LlmPlanSuggestion;
    if (!parsed || typeof parsed !== "object") return null;
    // Sanitize prefer ids to catalog
    const allowed = new Set(args.catalogIds);
    if (Array.isArray(parsed.prefer_exercicio_ids)) {
      parsed.prefer_exercicio_ids = parsed.prefer_exercicio_ids.filter(
        (id) => typeof id === "string" && allowed.has(id),
      );
    }
    if (parsed.justificativa && typeof parsed.justificativa !== "string") {
      delete parsed.justificativa;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Apply soft LLM preferences: if a preferred exercise shares the same padrao
 * as a prescription and exists in catalog, swap exercicio_id (keep carga from motor).
 */
export function aplicarSugestaoLlm(
  sessoes: Sessao[],
  plano: Plano,
  catalog: Exercicio[],
  sug: LlmPlanSuggestion,
): { sessoes: Sessao[]; plano: Plano } {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const prefs = sug.prefer_exercicio_ids ?? [];
  if (!prefs.length && !sug.justificativa) {
    return { sessoes, plano };
  }

  let nextSessoes = sessoes;
  if (prefs.length) {
    const used = new Set<string>();
    nextSessoes = sessoes.map((sess) => ({
      ...sess,
      prescricoes: sess.prescricoes.map((p) => {
        const cur = byId.get(p.exercicio_id);
        if (!cur) return p;
        const alt = prefs.find((id) => {
          if (used.has(id)) return false;
          const ex = byId.get(id);
          return ex && ex.padrao === cur.padrao && id !== p.exercicio_id;
        });
        if (!alt) return p;
        used.add(alt);
        const ex = byId.get(alt)!;
        // Keep motor carga / series / rir — only swap movement id + guia
        return {
          ...p,
          exercicio_id: ex.id,
          padrao: ex.padrao,
          guia_id: ex.guia_id ?? p.guia_id,
        };
      }),
    }));
  }

  let nextPlano = plano;
  if (sug.justificativa?.trim()) {
    const extra = semMotor(sug.justificativa.trim()).slice(0, 1200);
    nextPlano = {
      ...plano,
      justificativa: {
        ...plano.justificativa,
        texto: `${plano.justificativa.texto} [Coach] ${extra}`,
        evidencia: plano.justificativa.evidencia,
      },
    };
  }

  return { sessoes: nextSessoes, plano: nextPlano };
}

/**
 * Full remount: motor always; LLM optional; preserve estados for remaining exercises.
 */
export async function remountPlano(args: {
  perfil: Perfil;
  catalog: Exercicio[];
  estadosAnteriores: EstadoExercicio[];
  /** Série registradas: memória de carga para exercícios novos/trocados. */
  registros?: RegistroSerie[];
  /** Skip LLM even if configured (smoke / client offline) */
  skipLlm?: boolean;
}): Promise<RemountResult> {
  if (parqBloqueiaPrescricao(args.perfil)) {
    throw new Error(PARQ_BLOQUEIO_MSG);
  }

  // Refazer o plano lembra do que você já fez: exercício conhecido e evoluindo tem preferência.
  const historico = args.registros?.length
    ? pontosHistoricoPorExercicio(args.catalog, { registros: args.registros, estados: args.estadosAnteriores, hojeIso: new Date().toISOString() })
    : undefined;
  const gerado = gerarPlanoFromPerfil(args.perfil, args.catalog, { historico });
  let plano = gerado.plano;
  let sessoes = gerado.sessoes;
  let fonte: RemountResult["fonte"] = "motor";
  let justificativa_llm: string | undefined;

  if (!args.skipLlm) {
    const sug = await sugerirPlanoLlm({
      perfil: args.perfil,
      motorJustificativa: plano.justificativa.texto,
      catalogIds: args.catalog.map((e) => e.id),
      divisao: plano.divisao,
      sessoesResumo: sessoes.map((s) => ({
        nome: s.nome,
        exercicios: s.prescricoes.map((p) => p.exercicio_id),
      })),
    });
    if (sug) {
      const applied = aplicarSugestaoLlm(sessoes, plano, args.catalog, sug);
      sessoes = applied.sessoes;
      plano = applied.plano;
      fonte = "motor+llm";
      justificativa_llm = semMotor(sug.justificativa?.trim() || sug.notas?.trim() || "") || undefined;
    }
  }

  // Racional: recomputa determinístico após eventual troca de exercícios (LLM só narra)
  if (plano.racional) {
    const recomputado = derivarRacional({
      plano,
      sessoes,
      perfil: args.perfil,
      catalog: args.catalog,
      fonte: "motor",
      whyPorFase: plano.racional.fases.map((f) => f.porque[0] ?? ""),
    });
    plano = {
      ...plano,
      racional: {
        ...recomputado,
        split: { ...recomputado.split, porque: plano.racional.split.porque },
        ...(justificativa_llm ? { narrativa_llm: justificativa_llm.slice(0, 1200) } : {}),
      },
    };
  }

  // Rebuild estados from motor for new exercises; preserve history for kept ones
  const motorEstados = gerado.estados;
  // After LLM swap, ensure estado exists for each presc exercicio_id
  const needed = new Set<string>();
  for (const s of sessoes) {
    for (const p of s.prescricoes) needed.add(p.exercicio_id);
  }
  const baseNovos = motorEstados.filter((e) => needed.has(e.exercicio_id));

  // Memória de carga: exercício sem estado anterior (novo no plano) herda o
  // histórico exato ou o de um exercício equivalente (mesmo padrão/músculo).
  const registros = args.registros ?? [];
  const anterioresIds = new Set(args.estadosAnteriores.map((e) => e.exercicio_id));
  for (const e of baseNovos) {
    if (anterioresIds.has(e.exercicio_id)) continue;
    const sugerida = cargaSugeridaParaExercicio(
      { estados: [], registros, exercicios: args.catalog },
      e.exercicio_id,
      e.carga_atual_kg,
    );
    if (sugerida.origem !== "historico" && sugerida.origem !== "mesmo_padrao") continue;
    if (!(sugerida.carga_kg > 0)) continue;
    e.carga_atual_kg = sugerida.carga_kg;
    e.alvo_proxima_sessao = { ...e.alvo_proxima_sessao, carga_kg: sugerida.carga_kg };
    e.origem_carga = "historico";
    e.primeira_sessao = false;
  }

  // Add placeholders for swapped-in exercises missing from motor estados
  const have = new Set(baseNovos.map((e) => e.exercicio_id));
  const agora = new Date().toISOString();
  for (const id of needed) {
    if (have.has(id)) continue;
    // Find carga from a prescription using this id
    let carga = 20;
    let faixa: [number, number] = [8, 12];
    let rir = 2;
    for (const s of sessoes) {
      const p = s.prescricoes.find((x) => x.exercicio_id === id);
      if (p) {
        carga = p.carga.trabalho_kg;
        faixa = p.faixa_reps;
        rir = p.rir_alvo;
        break;
      }
    }
    baseNovos.push({
      exercicio_id: id,
      carga_atual_kg: carga,
      faixa_reps: faixa,
      rir_alvo: rir,
      alvo_proxima_sessao: {
        carga_kg: carga,
        faixa_reps: faixa,
        rir_alvo: rir,
      },
      sessoes_sem_progresso: 0,
      ultima_progressao_em: null,
      e1rm_estimado_kg: 0, // sem dados até o 1º treino real
      pr_carga_kg: 0,
      pr_reps: 0,
      origem_carga: "estimativa_conservadora",
      primeira_sessao: true,
      ultimo_top_kg: null,
      ultimo_back_off_kg: null,
      ultimo_rir: null,
      ultima_sessao_em: null,
      atualizado_em: agora,
    });
  }

  // Placeholders também consultam a memória (troca sugerida pela LLM).
  for (const e of baseNovos) {
    if (anterioresIds.has(e.exercicio_id) || !e.primeira_sessao) continue;
    const sugerida = cargaSugeridaParaExercicio(
      { estados: [], registros, exercicios: args.catalog },
      e.exercicio_id,
      e.carga_atual_kg,
    );
    if (sugerida.origem !== "historico" && sugerida.origem !== "mesmo_padrao") continue;
    if (!(sugerida.carga_kg > 0)) continue;
    e.carga_atual_kg = sugerida.carga_kg;
    e.alvo_proxima_sessao = { ...e.alvo_proxima_sessao, carga_kg: sugerida.carga_kg };
    e.origem_carga = "historico";
    e.primeira_sessao = false;
  }

  // Memória de carga: preserva histórico, PRs e e1RM; adota faixa/RIR do plano novo.
  const anterioresPorId = new Map(
    args.estadosAnteriores.map((e) => [e.exercicio_id, e]),
  );
  const estados = baseNovos.map((novo) => {
    const anterior = anterioresPorId.get(novo.exercicio_id);
    if (!anterior) return novo;
    return {
      ...anterior,
      faixa_reps: novo.faixa_reps,
      rir_alvo: novo.rir_alvo,
      alvo_proxima_sessao: {
        carga_kg: anterior.alvo_proxima_sessao.carga_kg,
        faixa_reps: novo.alvo_proxima_sessao.faixa_reps,
        rir_alvo: novo.alvo_proxima_sessao.rir_alvo,
      },
      atualizado_em: novo.atualizado_em,
    };
  });

  // Preserve data_inicio if perfil remount shouldn't clear calendar — caller decides
  return {
    plano,
    sessoes,
    estados,
    volumes_semanais: gerado.volumes_semanais,
    justificativa_llm,
    fonte,
  };
}
