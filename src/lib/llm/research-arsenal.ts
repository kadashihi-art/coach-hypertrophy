/**
 * Knowledge arsenal for Coach LLM (T9/explain) + T5 base.
 * Baked texts (research-arsenal-data) — no node:fs (client-safe import graph).
 * Read-only; never invents kg; never clinical Rx.
 */
import {
  BAKED_TECNICA,
  BAKED_ACSM_PARQ,
  BAKED_ACSM_PARAMS,
} from "@/lib/llm/research-arsenal-data";

export type ResearchArsenal = {
  tecnica: string;
  acsm_parq: string;
  acsm_params: string;
  excerptForPrompt: (maxChars?: number) => string;
  buildSystemRules: () => string;
};

function takeSections(src: string, needles: string[], budget: number): string {
  if (!src || budget <= 0) return "";
  const lower = src.toLowerCase();
  const chunks: string[] = [];
  let used = 0;
  for (const n of needles) {
    const i = lower.indexOf(n.toLowerCase());
    if (i < 0) continue;
    const slice = src.slice(i, i + Math.min(1800, budget - used));
    if (!slice.trim()) continue;
    chunks.push(slice.trim());
    used += slice.length;
    if (used >= budget) break;
  }
  if (!chunks.length && src) {
    return src.slice(0, budget);
  }
  return chunks.join("\n\n---\n\n").slice(0, budget);
}

export function getResearchArsenal(): ResearchArsenal {
  const tecnica = BAKED_TECNICA || "";
  const acsm_parq = BAKED_ACSM_PARQ || "";
  const acsm_params = BAKED_ACSM_PARAMS || "";

  const excerptForPrompt = (maxChars = 14000): string => {
    const parts: string[] = [];
    let remaining = maxChars;

    const push = (label: string, body: string, prefer: number) => {
      if (!body || remaining <= 0) return;
      const take = Math.min(prefer, remaining, body.length);
      parts.push(`### ${label}\n${body.slice(0, take)}`);
      remaining -= take;
    };

    // Priority: tecnica (T5 cues) + ACSM params + PAR-Q
    if (tecnica) {
      const tecChunk = takeSections(
        tecnica,
        [
          "Parte A",
          "Parte D",
          "Sumário",
          "Cues",
          "cue",
          "Agachamento",
          "Supino",
          "Remada",
          "Segurança",
          "segurança",
          "Limitações",
          "Resumo",
        ],
        Math.min(7000, remaining),
      );
      push(
        "Tecnica / biomecanica (PRIMARY T5)",
        tecChunk || tecnica,
        Math.min(7000, remaining),
      );
    } else {
      parts.push("### Tecnica / biomecanica\n[ausente]");
    }
    push(
      "ACSM 2026 params (divulgação — não MSSE integral)",
      acsm_params,
      4000,
    );
    push("ACSM / PAR-Q+ base (STATUS no header)", acsm_parq, remaining);

    return parts.join("\n\n").slice(0, maxChars);
  };

  const buildSystemRules = () =>
    [
      "REGRAS DO ARSENAL (obrigatórias):",
      "1. Read-only: você NÃO grava AppState/Blob; NÃO altera kg/RIR/séries.",
      "2. NUNCA invente kg — só cite números presentes no CONTEXT (cálculo do app) (EstadoExercicio / alvo_proxima_sessao).",
      "3. NUNCA faça prescrição clínica; sintomas/condições → profissional (ePARmed-X+).",
      "4. Cite limites: números ACSM 2026 vêm de divulgação/resumos até ler MSSE completo; PAR-Q base pode estar PARTIAL.",
      "5. Se PAR-Q+ tiver qualquer SIM → não liberar plano; redirecionar avaliação profissional.",
      "6. Jayme = processo individualizado, NÃO dogma; cues = síntese técnica, NÃO falas dele.",
      "7. Falha muscular NÃO é obrigatória; volume ~10 séries/grupo = ponto de partida.",
      "8. Prefira cues/técnica do arquivo tecnica completo; ACSM params e PAR-Q complementam.",
    ].join("\n");

  return { tecnica, acsm_parq, acsm_params, excerptForPrompt, buildSystemRules };
}

/** Helper for smoke / Http system string assembly. */
export function buildCoachSystemWithArsenal(
  baseLines: string[],
  maxChars = 14000,
): string {
  const a = getResearchArsenal();
  return [
    ...baseLines,
    a.buildSystemRules(),
    "--- ARSENAL ---",
    a.excerptForPrompt(maxChars),
  ].join("\n");
}
