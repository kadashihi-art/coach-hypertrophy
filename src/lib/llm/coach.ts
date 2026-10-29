/**
 * Camada coach explicativa — LLM read-only.
 * Narrativa sobre saída do motor. Nunca grava Blob/AppState.
 */
import { TOM_COACH } from "./tom";
import { visaoHabilitada } from "@/lib/flags";
import { AJUSTAR_PLANO_NOME } from "@/lib/nav";
import {
  CONTRATO_VERSAO,
  validarContratoLlm,
  type LlmResponseEnvelope,
} from "@/lib/llm/contract";
import type {
  DecisaoProgressao,
  EstadoExercicio,
  Prescricao,
  VolumePorGrupo,
} from "@/lib/domain";
import { resumoSonoCheckin } from "@/lib/domain/sono";
import type { CoachContext } from "@/lib/llm/coach-context";
import {
  buildCoachSystemWithArsenal,
  getResearchArsenal,
} from "@/lib/llm/research-arsenal";

export type CoachPosTreinoInput = {
  sessao_nome?: string;
  decisoes: Array<
    Pick<
      DecisaoProgressao,
      | "exercicio_id"
      | "regra"
      | "acao"
      | "carga_anterior_kg"
      | "nova_carga_kg"
      | "faixa_reps_reiniciada"
      | "motivo"
      | "evidencia"
    > & { nome?: string }
  >;
  volume?: Array<Pick<VolumePorGrupo, "grupo" | "planejado" | "realizado">>;
};

export type CoachPrescricaoInput = {
  exercicio_nome?: string;
  presc: Pick<
    Prescricao,
    "exercicio_id" | "series" | "faixa_reps" | "rir_alvo" | "tecnica" | "carga"
  >;
  estado?: Pick<
    EstadoExercicio,
    | "carga_atual_kg"
    | "rir_alvo"
    | "ultimo_top_kg"
    | "ultimo_back_off_kg"
    | "ultimo_rir"
    | "origem_carga"
    | "primeira_sessao"
    | "alvo_proxima_sessao"
  > | null;
};

export type CoachMidiaFrame = { data_url: string; t_seg?: number };
export type CoachMidia = {
  tipo: "imagem" | "video";
  frames: CoachMidiaFrame[];
  duracao_seg?: number;
};

export type CoachConversarInput = {
  midia?: CoachMidia;
  mensagem: string;
  contexto: CoachContext;
  historico?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
};

export interface CoachProvider {
  explicarPosTreino(input: CoachPosTreinoInput): Promise<LlmResponseEnvelope>;
  explicarPrescricao(input: CoachPrescricaoInput): Promise<LlmResponseEnvelope>;
  conversar(input: CoachConversarInput): Promise<LlmResponseEnvelope>;
}

function mirrorDecisoes(decisoes: CoachPosTreinoInput["decisoes"]) {
  return decisoes.map((d) => ({
    exercicio_id: d.exercicio_id,
    regra: d.regra,
    acao: d.acao,
    carga_anterior_kg: d.carga_anterior_kg,
    nova_carga_kg: d.nova_carga_kg,
    faixa_reps_reiniciada: d.faixa_reps_reiniciada ?? false,
    motivo: d.motivo,
    evidencia: d.evidencia,
  }));
}

function labelEx(
  d: CoachPosTreinoInput["decisoes"][number],
): string {
  return d.nome?.trim() || d.exercicio_id;
}

function narrarAcao(
  d: CoachPosTreinoInput["decisoes"][number],
): string {
  const nome = labelEx(d);
  const kg = `${d.carga_anterior_kg}→${d.nova_carga_kg} kg`;
  switch (d.acao) {
    case "subir_carga":
      return `${nome}: ${d.regra} sobe carga (${kg}). RIR/reps no alvo — estímulo progressivo sem inventar número.`;
    case "manter_carga":
      return `${nome}: ${d.regra} mantém ${d.nova_carga_kg} kg. Ainda há margem na faixa antes de subir.`;
    case "manter_e_checar":
      return `${nome}: ${d.regra} mantém e checa (${kg}). Próxima sessão decide com mais dados.`;
    case "reduzir_carga":
      return `${nome}: ${d.regra} reduz (${kg}). Reps/RIR abaixo do piso — protege qualidade da série.`;
    case "deload":
      return `${nome}: ${d.regra} deload (${kg}). Fadiga acumulada — volume/intensidade caem de propósito.`;
    case "suspender":
      return `${nome}: ${d.regra} suspende. Dor/risco — troca de padrão até reavaliar.`;
    default:
      return `${nome}: ${d.regra} · ${d.acao} (${kg}).`;
  }
}

/** Templates determinísticos pós-treino a partir do motor. */
export function buildAnalisePosTreinoStub(
  input: CoachPosTreinoInput,
): LlmResponseEnvelope {
  const decisoes = input.decisoes ?? [];
  const volume = input.volume ?? [];
  const nome = input.sessao_nome?.trim() || "Sessão";

  const fortes: string[] = [];
  const fracos: string[] = [];
  const ajustes: string[] = [];

  const subidas = decisoes.filter((d) => d.acao === "subir_carga");
  const reduzem = decisoes.filter((d) =>
    ["reduzir_carga", "deload", "suspender"].includes(d.acao),
  );
  const mantem = decisoes.filter((d) =>
    ["manter_carga", "manter_e_checar"].includes(d.acao),
  );

  if (subidas.length) {
    fortes.push(
      `Progressão objetiva em ${subidas.length} exercício(s) — apliquei as regras de progressão com base nas séries.`,
    );
    for (const d of subidas) fortes.push(narrarAcao(d));
  } else if (decisoes.length) {
    fortes.push(
      "Sessão registrada com decisão por exercício. Os números vêm só das regras de progressão.",
    );
  } else {
    fortes.push(
      "Sessão concluída. Sem séries de trabalho suficientes para decisão de carga — próximo logger ancora o estado.",
    );
  }

  if (mantem.length && !subidas.length) {
    fortes.push(
      `Carga estável em ${mantem.length} movimento(s) — acumular reps na faixa antes de subir.`,
    );
  }

  for (const d of reduzem) {
    fracos.push(narrarAcao(d));
    ajustes.push(
      `${labelEx(d)}: respeitar ${d.nova_carga_kg} kg na próxima; se dor persistir, trocar padrão.`,
    );
  }

  const under = volume.filter((v) => v.realizado < v.planejado * 0.8);
  const over = volume.filter((v) => v.realizado > v.planejado * 1.2);
  for (const v of under) {
    fracos.push(
      `Volume ${v.grupo}: ${v.realizado}/${v.planejado} séries — abaixo do planejado.`,
    );
    ajustes.push(
      `Priorizar completar séries de ${v.grupo} na próxima sessão do ciclo.`,
    );
  }
  for (const v of over) {
    fracos.push(
      `Volume ${v.grupo}: ${v.realizado}/${v.planejado} — acima do planejado; monitorar recuperação.`,
    );
  }

  if (!fracos.length) {
    fracos.push("Nenhum alerta de fadiga ou dor nesta leitura.");
  }
  if (!ajustes.length) {
    ajustes.push(
      "Manter a prescrição pré-preenchida do EstadoExercicio; kg/RIR só mudam pelas regras de progressão.",
    );
  }

  const volumeLines = volume
    .slice(0, 4)
    .map((v) => `${v.grupo} ${v.realizado}/${v.planejado}`)
    .join(" · ");

  const resumoRegras = decisoes.length
    ? decisoes
        .slice(0, 4)
        .map(
          (d) =>
            `${labelEx(d)} ${d.regra} ${d.carga_anterior_kg}→${d.nova_carga_kg} kg`,
        )
        .join("; ")
    : "sem decisão de carga";

  const mensagem_usuario = [
    `${nome} fechada.`,
    decisoes.length
      ? `Análise: ${resumoRegras}.`
      : "Sem decisão de progressão nesta sessão.",
    volumeLines ? `Volume: ${volumeLines}.` : null,
    "Eu só explico o que foi calculado das suas séries — não invento carga.",
  ]
    .filter(Boolean)
    .join(" ");

  const envelope: LlmResponseEnvelope = {
    contrato_versao: CONTRATO_VERSAO,
    tipo_resposta: "analise_pos_treino",
    analise_pos_treino: {
      volume_realizado_vs_planejado: volume.map((v) => ({
        grupo: v.grupo,
        planejado: v.planejado,
        realizado: v.realizado,
        delta: v.realizado - v.planejado,
      })),
      pontos_fortes: fortes,
      pontos_fracos: fracos,
      ajustes,
      alertas_programacao: reduzem
        .filter((d) => d.acao === "suspender" || d.acao === "deload")
        .map((d) => `${labelEx(d)}: ${d.regra} · ${d.acao}`),
    },
    decisoes_progressao: mirrorDecisoes(decisoes),
    mensagem_usuario,
  };

  const v = validarContratoLlm(envelope);
  if (!v.ok) {
    throw new Error(`Stub coach envelope inválido: ${v.errors.join("; ")}`);
  }
  return v.data;
}

/** Narrativa curta: porquê da carga/RIR de um exercício. */
export function buildPrescricaoStub(
  input: CoachPrescricaoInput,
): LlmResponseEnvelope {
  const nome = input.exercicio_nome?.trim() || input.presc.exercicio_id;
  const p = input.presc;
  const e = input.estado;
  const trabalho =
    e?.alvo_proxima_sessao?.carga_kg ??
    e?.carga_atual_kg ??
    p.carga.trabalho_kg;
  const top = p.carga.top_set_kg ?? e?.ultimo_top_kg ?? null;
  const rir = e?.rir_alvo ?? p.rir_alvo;
  const origem = e?.origem_carga ?? p.carga.origem;

  const porques: string[] = [];
  if (e?.primeira_sessao || origem === "estimativa_conservadora") {
    porques.push(
      "Primeira âncora conservadora — calibra na sessão sem forçar PR.",
    );
  } else if (origem === "historico") {
    porques.push(
      "Carga vem do EstadoExercicio (último top/trabalho + regra R#).",
    );
  } else if (origem === "usuario") {
    porques.push("Carga ajustada por você; eu só reavalio após as séries.");
  } else {
    porques.push(`Origem da carga: ${origem}.`);
  }

  if (p.tecnica === "top_set_backoff" && top != null) {
    porques.push(
      `Top set ~${top} kg; back-off ~85–90% do top (sugiro ~87,5%).`,
    );
  }

  porques.push(
    `Alvo ${p.series}×${p.faixa_reps[0]}–${p.faixa_reps[1]} @ RIR ${rir} com trabalho ~${trabalho} kg.`,
  );

  if (e?.ultimo_rir != null) {
    porques.push(
      `Último RIR registrado: ${e.ultimo_rir}. RIR≤1 na faixa alta → sobe; reps baixas → mantém/reduz.`,
    );
  }

  const mensagem_usuario = `${nome}: ${porques[0]} Trabalho prescrito ~${trabalho} kg @ RIR ${rir}.`;

  const envelope: LlmResponseEnvelope = {
    contrato_versao: CONTRATO_VERSAO,
    tipo_resposta: "resposta_conversacional",
    mensagem_usuario,
    analise_pos_treino: undefined,
  };

  // resposta_conversacional só exige mensagem — validar
  const withMsg = {
    ...envelope,
    mensagem_usuario: `${mensagem_usuario} ${porques.slice(1).join(" ")}`.trim(),
  };
  const v = validarContratoLlm(withMsg);
  if (!v.ok) {
    throw new Error(`Stub presc envelope inválido: ${v.errors.join("; ")}`);
  }
  return v.data;
}

/** Linha curta client-safe (sem Promise) para chips do plano. */
export function narrarCargaPrescricao(input: CoachPrescricaoInput): string {
  return buildPrescricaoStub(input).mensagem_usuario ?? "";
}


/** T9 — stub conversacional: cita só números do contexto; não inventa kg. */
export function buildConversarStub(
  input: CoachConversarInput,
): LlmResponseEnvelope {
  const msg = (input.mensagem || "").trim();
  const ctx = input.contexto;
  const lower = msg.toLowerCase();

  const e0 = ctx.estados[0];
  const carga =
    e0?.alvo_proxima_sessao?.carga_kg ??
    e0?.carga_atual_kg ??
    ctx.proxima_sessao?.prescricoes[0]?.carga_trabalho_kg ??
    null;
  const vol = ctx.volumes_semanais[0];
  const ck = ctx.checkin_hoje;
  const meso = ctx.plano?.mesociclo;
  const alvo = e0?.alvo_proxima_sessao?.carga_kg ?? null;

  const pedeCargaNova =
    /\b(quant[oa]s?\s*kg|nova\s*carga|sobe\s*(pra|para)|me\s*passa\s*\d|invent|99\s*kg)\b/i.test(
      msg,
    ) || /quanto\s+(devo|coloco|carreg)/i.test(lower);

  const partes: string[] = [];

  const perguntaSplit =
    /(por\s*que|porque|pq|motivo|raz[aã]o|explica).*(ppl|upper|lower|full|split|divis|plano|treino|descanso|fase)|(ppl|upper.?lower|full.?body|h[ií]brido).*(ou|vs|x|em vez)/i.test(msg);
  if (perguntaSplit && ctx.racional) {
    const r = ctx.racional;
    partes.push(`Eu montei seu plano como ${r.split.nome}. ${r.split.porque.slice(0, 2).join(" ")}`);
    const freq = r.frequencia_por_musculo.slice(0, 6).map((f) => `${f.grupo} ${f.vezes_semana}×`).join(", ");
    if (freq) partes.push(`Hoje cada músculo cai assim na semana: ${freq}.`);
    const f0 = r.fases[0];
    if (f0) partes.push(`Sua semana fica ${f0.microciclo}.`);
    partes.push(`Se preferir outro formato, posso ajustar — dá pra ver em ${AJUSTAR_PLANO_NOME} e só muda se você confirmar. Quer que eu te mostre?\n[[sugestao: Ver outras divisões]]`);
  }

  if (pedeCargaNova) {
    partes.push(
      "Eu não invento carga. A carga é recalculada no fim da sessão, a partir das suas séries.",
    );
    if (alvo != null) {
      partes.push(
        `Alvo já no estado: ~${alvo} kg na próxima (alvo_proxima_sessao).`,
      );
    } else if (carga != null) {
      partes.push(`Carga atual no histórico: ~${carga} kg.`);
    }
  } else if (/deload|recuper|sono|prontid/i.test(lower)) {
    if (ck) {
      partes.push(
        `Check-in de hoje: sono ${resumoSonoCheckin(ck)}, prontidão ${ck.prontidao}/5` +
          (ck.agua_ml != null ? `, água ${ck.agua_ml} ml` : "") +
          ".",
      );
      if (ck.sono_h < 6 || ck.prontidao <= 2) {
        partes.push(
          "Sono baixo ou prontidão ≤2 → eu tendo a cortar 1 série nos compostos (deload/check-in).",
        );
      } else {
        partes.push(
          "Prontidão ok — sem corte automático de volume por check-in.",
        );
      }
    } else {
      partes.push(
        "Sem check-in de hoje no contexto. Registre sono/prontidão pra eu avaliar deload.",
      );
    }
    if (meso) {
      partes.push(
        `Meso: semana ${meso.semana_atual}/${meso.total_semanas} · foco ${meso.foco}.`,
      );
    }
  } else if (
    /por\s*que|carga|rir|prescri| Progressive| progressive/i.test(lower) ||
    /por que essa carga/i.test(lower)
  ) {
    if (e0 && carga != null) {
      partes.push(
        `${e0.nome || e0.exercicio_id}: carga atual ~${carga} kg` +
          (e0.ultimo_top_kg != null
            ? ` (último top ${e0.ultimo_top_kg} kg)`
            : "") +
          (e0.ultimo_rir != null ? `, último RIR ${e0.ultimo_rir}` : "") +
          `. Origem: ${e0.origem_carga}.`,
      );
      if (alvo != null) {
        partes.push(`Alvo próxima sessão ~${alvo} kg (calculado das suas séries).`);
      }
      partes.push(
        "RIR≤1 na faixa alta → sobe; reps baixas → mantém/reduz. Eu só explico — não gravo kg.",
      );
    } else {
      partes.push(
        "Sem EstadoExercicio no contexto pra explicar a carga. Treine e ancore no logger.",
      );
    }
  } else if (/par-?q|eparmed|triagem|liberad|aptid[aã]o|m[eé]dic/i.test(lower)) {
    const a = getResearchArsenal();
    partes.push(
      "PAR-Q+ é o gate mínimo pré-participação: qualquer SIM bloqueia plano/sessão e direciona a avaliação profissional (ePARmed-X+).",
    );
    if (a.acsm_parq) {
      partes.push(
        "Base ACSM/PAR-Q no arsenal (pode estar PARTIAL). Números ACSM vêm de divulgação até ler MSSE completo — não invento kg nem Rx clínica.",
      );
    }
    partes.push("Eu só explico a evidência e as regras do plano; não libero treino se o gate estiver fechado.");
  } else if (/acsm|s[eé]ries\s*por\s*semana|10\s*s[eé]ries|falha\s*obrigat|dose-?resposta/i.test(lower)) {
    const a = getResearchArsenal();
    if (a.acsm_params) {
      partes.push(
        "ACSM 2026 (resumo oficial/divulgação): hipertrofia dose-resposta ≥10 séries/grupo/semana como ponto de partida; força ≥80% 1RM, ≥2×/semana; falha NÃO muda resultado de forma consistente — app não exige falha.",
      );
    } else {
      partes.push("Arsenal ACSM params indisponível neste runtime; use o volume do plano (~10) sem inventar kg.");
    }
    if (vol) {
      partes.push(
        `No seu histórico: ${vol.grupo} ${vol.semana_iso} = ${vol.series_efetivas} séries efetivas.`,
      );
    }
    partes.push("Limite: sem MSSE integral; RIR não é norma ACSM; eu não invento números.");
  } else if (
    /peito|costas|ombro|b[ií]ceps|tr[ií]ceps|quadriceps|volume|semana/i.test(
      lower,
    )
  ) {
    if (vol) {
      const grupoLabel = ctx.filtro.grupo ?? vol.grupo;
      const volsGrupo = ctx.volumes_semanais.filter(
        (v) => v.grupo === (ctx.filtro.grupo ?? vol.grupo),
      );
      const linhas = volsGrupo
        .slice(0, 4)
        .map((v) => `${v.semana_iso}: ${v.series_efetivas} efetivas`)
        .join("; ");
      partes.push(
        `Volume ${grupoLabel} (últimas semanas no histórico): ${linhas || `${vol.semana_iso} ${vol.series_efetivas} efetivas`}.`,
      );
      partes.push(
        "Alvo típico 10–20 séries efetivas/semana; abaixo/acima disso eu te aviso.",
      );
    } else {
      partes.push(
        "Sem volume semanal no contexto ainda — complete sessões pra acumular histórico 4–8 sem.",
      );
    }
    if (carga != null && e0) {
      partes.push(
        `${e0.nome || e0.exercicio_id}: carga atual ~${carga} kg` +
          (e0.ultimo_rir != null ? `, último RIR ${e0.ultimo_rir}` : "") +
          ".",
      );
    }
  } else {
    // Generic: cite what's in context
    if (e0 && carga != null) {
      partes.push(
        `${e0.nome || e0.exercicio_id}: ~${carga} kg no estado` +
          (e0.ultimo_top_kg != null ? ` (último top ${e0.ultimo_top_kg} kg)` : "") +
          (e0.ultimo_rir != null ? `, RIR ${e0.ultimo_rir}` : "") +
          ".",
      );
    }
    if (vol) {
      partes.push(
        `Volume ${vol.grupo} ${vol.semana_iso}: ${vol.series_efetivas} séries efetivas.`,
      );
    }
    if (ck) {
      partes.push(
        `Check-in hoje: sono ${resumoSonoCheckin(ck)} · prontidão ${ck.prontidao}/5.`,
      );
    }
    if (meso) {
      partes.push(
        `Plano: semana ${meso.semana_atual}/${meso.total_semanas}, foco ${meso.foco}.`,
      );
    }
    if (!partes.length) {
      partes.push(
        "Contexto ainda magro (sem estado/volume/check-in). Eu só explico os números do seu plano — não invento kg.",
      );
    } else {
      partes.push(
        "Números acima vêm do seu histórico/EstadoExercicio. Qualquer kg novo só entra pelas regras de progressão.",
      );
    }
  }

  // Recent decisão snippet if useful
  const d0 = ctx.decisoes_progressao[0];
  if (d0 && !pedeCargaNova) {
    partes.push(
      `Última decisão: ${d0.nome || d0.exercicio_id} ${d0.regra} ${d0.carga_anterior_kg}→${d0.nova_carga_kg} kg (${d0.acao}).`,
    );
  }

  const mensagem_usuario = partes.join(" ").trim();
  const envelope: LlmResponseEnvelope = {
    contrato_versao: CONTRATO_VERSAO,
    tipo_resposta: "resposta_conversacional",
    mensagem_usuario,
    analise_pos_treino: undefined,
  };
  const v = validarContratoLlm(envelope);
  if (!v.ok) {
    throw new Error(`Stub conversar envelope inválido: ${v.errors.join("; ")}`);
  }
  if (!v.data.mensagem_usuario?.trim()) {
    throw new Error("Stub conversar sem mensagem_usuario");
  }
  return v.data;
}

export class StubCoachProvider implements CoachProvider {
  async explicarPosTreino(
    input: CoachPosTreinoInput,
  ): Promise<LlmResponseEnvelope> {
    return buildAnalisePosTreinoStub(input);
  }

  async explicarPrescricao(
    input: CoachPrescricaoInput,
  ): Promise<LlmResponseEnvelope> {
    return buildPrescricaoStub(input);
  }

  async conversar(input: CoachConversarInput): Promise<LlmResponseEnvelope> {
    return buildConversarStub(input);
  }
}

type HttpConfig = {
  apiKey: string;
  baseUrl: string;
  model?: string;
  visionModel?: string;
};

export const COACH_CHAT_SYSTEM = [
  "Você é o Coach: treinador com PhD em hipertrofia natural (sem anabolizantes). Você montou o plano dessa pessoa e conversa com ela.",
  TOM_COACH,
  "Responda QUALQUER pergunta sobre treino, técnica, nutrição esportiva básica, sono, recuperação e fisiologia — não se limite aos dados do app. Nunca recuse só porque não está no contexto.",
  "Use o CONTEXTO (plano, racional, fase, volume, check-in) quando for relevante, sem despejar tudo. Cite números exatamente como estão.",
  "Carga: kg/RIR/séries da pessoa vêm só do que eu (plano) calculei no CONTEXTO. Nunca invente kg; se pedirem carga nova, explique que eu ajusto ao fim da sessão com base no que ela registrar.",
  "Você não grava nada nem remonta o plano. Pode sugerir alternativas (outro split, fase 2, deload) quando fizerem sentido pra essa pessoa; nenhum estilo é padrão — só muda se a pessoa confirmar.",
  "\"Por que esse plano / por que PPL e não UL\": explique com o racional (motivo do split, frequência por músculo, descansos), em conversa, e ofereça a alternativa se fizer sentido. Se algum grande grupo estiver 1×/semana, mencione o trade-off com naturalidade. Não puxe estilos híbridos como sugestão (só fale deles se a pessoa perguntar); prefira as alternativas mais simples do racional.",
  "Segurança: dor aguda, dor no peito, tontura, sintomas neurológicos, lesão recente, gestação, condição cardíaca → peça pra parar e procurar médico/fisioterapeuta. Não diagnostique.",
].join("\n");

/** Modelos Tokia com visão, em ordem de preferência, se o principal recusar imagem. */
export const VISION_GATEWAY_DEFAULT = ["anthropic/claude-opus-5", "google/gemini-2.5-pro", "openai/gpt-5"];
export function visionGatewayModels(): string[] {
  const env = process.env.COACH_VISION_GATEWAY_MODELS?.split(",").map((x) => x.trim()).filter(Boolean);
  return env?.length ? env : VISION_GATEWAY_DEFAULT;
}
export const VISION_FALLBACKS = [
  "gpt-4o",
  "openrouter/openai/gpt-4o",
  "openrouter/google/gemini-2.5-flash",
  "gpt-4o-mini",
  "openrouter/openai/gpt-4o-mini",
  "openrouter/anthropic/claude-sonnet-4.5",
  "openrouter/google/gemini-2.5-pro",
  "openrouter/qwen/qwen2.5-vl-72b-instruct",
  "gemini-flash",
];

export const COACH_VISION_SYSTEM = [
  "A pessoa mandou foto ou frames de vídeo da execução. Olhe com calma e responda como treinador no WhatsApp.",
  "Diga qual exercício você vê (ou pergunte se não der pra saber), o que está bom e o que ajustar: setup, trajetória, amplitude, controle (pela sequência de frames), compensações (lombar, joelhos, ombros, punhos, quadril) e risco.",
  "Sem headers nem seções formais: 3–6 frases curtas, no máximo 3 cues práticas pra próxima série.",
  "Uma ressalva curta e natural: é de um ângulo só, não substitui ver ao vivo.",
  "Se a imagem não mostra exercício, diga o que vê e peça um ângulo melhor (lateral, corpo inteiro, boa luz).",
].join("\n");

/**
 * POST opcional para Abacus/OpenAI-compat.
 * Em qualquer falha → StubCoachProvider.
 * Nunca grava estado.
 */
export class HttpCoachProvider implements CoachProvider {
  private stub = new StubCoachProvider();

  constructor(private cfg: HttpConfig) {}

  private async post(
    system: string,
    user: string,
  ): Promise<LlmResponseEnvelope | null> {
    try {
      const url = this.cfg.baseUrl.replace(/\/$/, "");
      const res = await fetch(`${url}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: this.cfg.model || "openrouter/anthropic/claude-opus-5",
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = json.choices?.[0]?.message?.content;
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      const v = validarContratoLlm(parsed);
      return v.ok ? v.data : null;
    } catch {
      return null;
    }
  }

  async explicarPosTreino(
    input: CoachPosTreinoInput,
  ): Promise<LlmResponseEnvelope> {
    const stub = await this.stub.explicarPosTreino(input);
    const system = buildCoachSystemWithArsenal([
      "Você é o coach PhD de hipertrofia natural que montou o plano dessa pessoa.",
      TOM_COACH,
      "NUNCA invente cargas/RIR: só explique os números do JSON que você recebeu, em primeira pessoa (\"eu subi\", \"eu mantive\").",
      `Devolva JSON no contrato ${CONTRATO_VERSAO} tipo_resposta=analise_pos_treino`,
      "com analise_pos_treino + mensagem_usuario. Pode espelhar decisoes_progressao do input.",
    ]);
    const fromHttp = await this.post(
      system,
      JSON.stringify({ motor: input, espelho_stub: stub }),
    );
    return fromHttp ?? stub;
  }

  async explicarPrescricao(
    input: CoachPrescricaoInput,
  ): Promise<LlmResponseEnvelope> {
    const stub = await this.stub.explicarPrescricao(input);
    const system = buildCoachSystemWithArsenal([
      "Você é o coach PhD de hipertrofia natural que montou o plano dessa pessoa.",
      TOM_COACH,
      "Explique em primeira pessoa por que eu escolhi essa carga/RIR, sem inventar números.",
      `JSON contrato ${CONTRATO_VERSAO} tipo_resposta=resposta_conversacional com mensagem_usuario.`,
    ]);
    const fromHttp = await this.post(
      system,
      JSON.stringify({ presc: input, espelho_stub: stub }),
    );
    return fromHttp ?? stub;
  }

  /** Chat livre (texto ou multimodal). Retorna texto do modelo ou null + diagnóstico. */
  private async chat(args: {
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: unknown }>;
    model: string;
    timeoutMs: number;
    baseUrl?: string;
    apiKey?: string;
  }): Promise<{ text: string | null; status: number; erro?: string }> {
    try {
      const url = (args.baseUrl ?? this.cfg.baseUrl).replace(/\/$/, "");
      const res = await fetch(`${url}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${args.apiKey ?? this.cfg.apiKey}` },
        body: JSON.stringify({
          model: args.model,
          temperature: 0.3,
          max_tokens: 1800,
          messages: [{ role: "system", content: args.system }, ...args.messages],
        }),
        signal: AbortSignal.timeout(args.timeoutMs),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { text: null, status: res.status, erro: t.slice(0, 300) };
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
      const c = json.choices?.[0]?.message?.content;
      const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (x as { text?: string }).text ?? "").join("") : null;
      return { text: text?.trim() || null, status: res.status };
    } catch (e) {
      return { text: null, status: 0, erro: e instanceof Error ? e.message : "fetch_error" };
    }
  }

  /** Último diagnóstico de visão (exposto pela rota para debug). */
  public lastVision: { modelo: string; ok: boolean; status: number; erro?: string; tentativas?: string[] } | null = null;

  async conversar(input: CoachConversarInput): Promise<LlmResponseEnvelope> {
    const stub = await this.stub.conversar(input);
    if (!visaoHabilitada()) input = { ...input, midia: undefined };
    const system = buildCoachSystemWithArsenal([
      COACH_CHAT_SYSTEM,
      input.midia ? COACH_VISION_SYSTEM : "Você não recebe foto nem vídeo neste app: nunca peça ou ofereça analisar foto/vídeo; peça descrição em palavras se precisar.",
      "CONTEXTO DO USUÁRIO (JSON do cálculo do app — nunca diga \"motor\"; use quando relevante, cite números exatamente):",
      JSON.stringify(input.contexto).slice(0, 14000),
    ].filter(Boolean));
    const hist = (input.historico ?? [])
      .filter((h) => h.role !== "system" && h.content?.trim())
      .slice(-10)
      .map((h) => ({ role: h.role as "user" | "assistant", content: h.content.slice(0, 4000) }));

    let userContent: unknown = input.mensagem;
    const vision = !!input.midia?.frames?.length;
    if (vision && input.midia) {
      const m = input.midia;
      const parts: unknown[] = [
        {
          type: "text",
          text:
            `${input.mensagem}\n\n[Mídia anexada: ${m.tipo === "video" ? `vídeo de ~${Math.round(m.duracao_seg ?? 0)} s, ${m.frames.length} frames extraídos em ordem` : "foto"}]`,
        },
      ];
      m.frames.forEach((f, i) => {
        if (m.tipo === "video") parts.push({ type: "text", text: `Frame ${i + 1}/${m.frames.length} — t=${(f.t_seg ?? 0).toFixed(1)} s` });
        parts.push({ type: "image_url", image_url: { url: f.data_url } });
      });
      userContent = parts;
    }
    const modelText = this.cfg.model || "openrouter/anthropic/claude-opus-5";
    // Visão: só ela vai pelo Vercel AI Gateway (OIDC do projeto), em cadeia configurável.
    let gw: { baseUrl: string; apiKey: string } | null = null;
    if (vision) {
      try {
        const { getVercelOidcToken } = await import("@vercel/oidc");
        const tok = await getVercelOidcToken();
        if (tok) gw = { baseUrl: "https://ai-gateway.vercel.sh/v1", apiKey: tok };
      } catch (e) {
        this.lastVision = { modelo: "gateway", ok: false, status: 0, erro: `oidc_indisponivel:${e instanceof Error ? e.message.slice(0, 120) : ""}` };
      }
    }
    const candidatos = vision ? (gw ? visionGatewayModels() : []) : [modelText];
    let r: { text: string | null; status: number; erro?: string } = { text: null, status: 0 };
    const t0 = Date.now();
    const tentativas: string[] = [];
    for (const m of candidatos) {
      const restante = 110_000 - (Date.now() - t0);
      if (restante < 15_000) break;
      r = await this.chat({
        system,
        messages: [...hist, { role: "user", content: userContent }],
        model: m,
        timeoutMs: vision ? Math.min(85_000, restante) : 55_000,
        ...(vision && gw ? gw : {}),
      });
      tentativas.push(`${m}:${r.status}${r.text ? "" : `:${(r.erro ?? "").replace(/\s+/g, " ").slice(0, 160)}`}`);
      if (vision) this.lastVision = { modelo: m, ok: !!r.text, status: r.status, ...(r.erro ? { erro: r.erro } : {}), ...(tentativas.length > 1 ? { tentativas } : {}) } as typeof this.lastVision;
      if (r.text || !vision) break;
      if (!(r.status >= 400 && r.status < 500)) break;
    }
    if (r.text) {
      const env: LlmResponseEnvelope = {
        contrato_versao: CONTRATO_VERSAO,
        tipo_resposta: "resposta_conversacional",
        mensagem_usuario: r.text.slice(0, 12000),
        analise_pos_treino: undefined,
      };
      const v = validarContratoLlm(env);
      if (v.ok) return v.data;
    }
    if (vision) {
      return {
        ...stub,
        mensagem_usuario:
          "Não consegui analisar a mídia agora (modelo de visão indisponível ou tempo esgotado). Tente de novo com menos frames ou uma foto. " +
          (stub.mensagem_usuario ?? ""),
      };
    }
    return stub;
  }
}

/** Http se COACH_LLM_API_KEY + COACH_LLM_BASE_URL; senão stub. */
export function getCoachProvider(): CoachProvider {
  const apiKey = process.env.COACH_LLM_API_KEY?.trim();
  const baseUrl = process.env.COACH_LLM_BASE_URL?.trim();
  if (apiKey && baseUrl) {
    return new HttpCoachProvider({
      apiKey,
      baseUrl,
      model: process.env.COACH_LLM_MODEL?.trim() || undefined,
      visionModel: process.env.COACH_LLM_VISION_MODEL?.trim() || undefined,
    });
  }
  return new StubCoachProvider();
}
