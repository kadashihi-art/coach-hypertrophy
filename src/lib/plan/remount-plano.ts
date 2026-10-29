/**
 * Remount plan from perfil patch.
 * Always: gerarPlanoFromPerfil (motor).
 * Optionally: Tokia/OpenAI-compat via COACH_LLM_* (+ COACH_LLM_PLAN_MODEL)
 * may suggest split notes / exercise preference / justificativa within catalog.
 * LLM MUST NOT invent kg into EstadoExercicio — loads stay from motor.
 */
import { semMotor } from "@/lib/llm/tom";
import type {
  EstadoExercicio,
  Exercicio,
  Perfil,
  Plano,
  Sessao,
  VolumeSemanal,
} from "@/lib/domain";
import { gerarPlanoFromPerfil } from "@/lib/plan/gerar-plano";
import { derivarRacional } from "@/lib/plan/racional";
import { mergeEstadosPreservados } from "@/lib/plan/calendario";
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
  return Boolean(
    process.env.COACH_LLM_API_KEY?.trim() &&
      process.env.COACH_LLM_BASE_URL?.trim(),
  );
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
  const apiKey = process.env.COACH_LLM_API_KEY!.trim();
  const baseUrl = process.env.COACH_LLM_BASE_URL!.trim().replace(/\/$/, "");
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
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(18_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LlmPlanSuggestion;
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
  /** Skip LLM even if configured (smoke / client offline) */
  skipLlm?: boolean;
}): Promise<RemountResult> {
  if (parqBloqueiaPrescricao(args.perfil)) {
    throw new Error(PARQ_BLOQUEIO_MSG);
  }

  const gerado = gerarPlanoFromPerfil(args.perfil, args.catalog);
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
      e1rm_estimado_kg: Math.round(carga * (1 + faixa[1] / 30) * 10) / 10,
      pr_carga_kg: carga,
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

  const estados = mergeEstadosPreservados(args.estadosAnteriores, baseNovos);

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
