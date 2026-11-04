/**
 * Explicação curta (texto) das alternativas de troca via LLM — read-only.
 * A LLM só reescreve texto; qualquer número/id/enum na saída descarta o item (fica o texto por regra).
 */
import { algumaIaConfigurada, chamarCadeia, extrairJson } from "@/lib/llm/cadeia";
import { limparSaidaCoach } from "@/lib/llm/tom";

export type ItemExplicar = { id: string; nome: string; equipamento: string; texto_base: string };

/** Valida a saída da LLM: só texto humano, sem números, sem snake_case, sem "motor". */
export function saidaLlmValida(t: string): boolean {
  if (!t || t.length < 8 || t.length > 260) return false;
  if (/\d/.test(t)) return false;
  if (/[a-z]+_[a-z]+/i.test(t)) return false;
  if (/\bmotor\b/i.test(t)) return false;
  return true;
}

export function filtrarExplicacoes(
  raw: unknown,
  itens: ItemExplicar[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  const ids = new Set(itens.map((i) => i.id));
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ids.has(k) || typeof v !== "string") continue;
    const t = limparSaidaCoach(v.trim()).texto;
    if (saidaLlmValida(t)) out[k] = t;
  }
  return out;
}

export async function explicarComLlm(args: {
  de: string;
  itens: ItemExplicar[];
  restricoes: string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ explicacoes: Record<string, string>; fonte: "llm" | "regra"; erro?: string }> {
  if (!algumaIaConfigurada()) return { explicacoes: {}, fonte: "regra", erro: "sem_llm" };
  try {
    const sys =
      "Você é um coach de musculação falando em PT-BR, primeira pessoa, tom de WhatsApp. " +
      "Para cada alternativa, escreva UMA frase curta (até 200 caracteres) dizendo por que ela é uma boa troca. " +
      "Proibido: números, kg, séries, reps, RIR, ids técnicos, a palavra motor. " +
      'Responda só JSON: {"<id>": "frase", ...} usando os ids recebidos.';
    const user = JSON.stringify({
      trocar: args.de,
      restricoes: args.restricoes,
      alternativas: args.itens.map((i) => ({ id: i.id, nome: i.nome, equipamento: i.equipamento, base: i.texto_base })),
    });
    const r = await chamarCadeia({
      ponto: "trocar/explicar",
      json: true,
      temperature: 0.4,
      timeoutTokiaMs: args.timeoutMs ?? 15000,
      fetchImpl: args.fetchImpl,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      validar: (t) => {
        const j = extrairJson(t);
        return !!j && Object.keys(filtrarExplicacoes(j, args.itens)).length > 0;
      },
    });
    if (!r) return { explicacoes: {}, fonte: "regra", erro: "sem_ia" };
    const ex = filtrarExplicacoes(extrairJson(r.texto), args.itens);
    return { explicacoes: ex, fonte: Object.keys(ex).length ? "llm" : "regra" };
  } catch (e) {
    return { explicacoes: {}, fonte: "regra", erro: e instanceof Error ? e.name : "erro" };
  }
}
