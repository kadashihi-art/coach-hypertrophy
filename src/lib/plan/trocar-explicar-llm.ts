/**
 * Explicação curta (texto) das alternativas de troca via LLM — read-only.
 * A LLM só reescreve texto; qualquer número/id/enum na saída descarta o item (fica o texto por regra).
 */
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
  const apiKey = process.env.COACH_LLM_API_KEY?.trim();
  const baseUrl = process.env.COACH_LLM_BASE_URL?.trim();
  if (!apiKey || !baseUrl) return { explicacoes: {}, fonte: "regra", erro: "sem_llm" };
  const f = args.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 15000);
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
    const res = await f(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.COACH_LLM_MODEL?.trim() || "openrouter/anthropic/claude-opus-5",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.4,
      }),
    });
    if (!res.ok) return { explicacoes: {}, fonte: "regra", erro: `http_${res.status}` };
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const c = json.choices?.[0]?.message?.content;
    const txt = typeof c === "string" ? c : "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return { explicacoes: {}, fonte: "regra", erro: "sem_json" };
    const ex = filtrarExplicacoes(JSON.parse(m[0]), args.itens);
    return { explicacoes: ex, fonte: Object.keys(ex).length ? "llm" : "regra" };
  } catch (e) {
    return { explicacoes: {}, fonte: "regra", erro: e instanceof Error ? e.name : "erro" };
  } finally {
    clearTimeout(to);
  }
}
