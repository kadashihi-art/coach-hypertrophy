/**
 * Cadeia grátis de LLM: Tokia → Groq (grátis) → Gemini (grátis) → null (o chamador usa a resposta pronta).
 * - Etapa sem chave é pulada.
 * - Cada falha é classificada (cota | erro | invalido) e a cadeia segue.
 * - A LLM só lê: quem chama descarta qualquer kg/reps/séries vindos daqui.
 * - Log interno só com etapa/status/ms; nunca chave, nunca na tela.
 */

export type EtapaLlm = "tokia" | "groq" | "gemini";
export type FalhaLlm = "cota" | "erro" | "invalido" | "pulada";

export type MensagemLlm = { role: "system" | "user" | "assistant"; content: unknown };

export type PedidoLlm = {
  messages: MensagemLlm[];
  temperature?: number;
  max_tokens?: number;
  json?: boolean;
  /** Modelo da etapa Tokia (as outras usam GROQ_MODEL / GEMINI_MODEL). */
  modeloTokia?: string;
  /** Timeout da etapa Tokia (as grátis usam 18 s). */
  timeoutTokiaMs?: number;
  /** Retorna true se o texto serve; senão a cadeia passa pra próxima etapa. */
  validar?: (texto: string) => boolean;
  /** Rótulo do ponto de uso, só pro log. */
  ponto?: string;
  /** TEMPORÁRIO (diagnóstico de uso único): usa só esta etapa; "nenhuma" = nenhuma IA. */
  forcarEtapa?: EtapaLlm | "nenhuma";
  /** TEMPORÁRIO (diagnóstico): modelo da etapa forçada. */
  forcarModelo?: string;
  /** Só pra testes. */
  fetchImpl?: typeof fetch;
};

export type RespostaLlm = { texto: string; etapa: EtapaLlm; modelo: string };

export type TentativaLlm = { etapa: EtapaLlm; resultado: "ok" | FalhaLlm; status?: number; ms?: number; modelo?: string; detalhe?: string };

export const GROQ_MODEL_PADRAO = "llama-3.3-70b-versatile";
export const GEMINI_MODEL_PADRAO = "gemini-flash-latest";
export const TIMEOUT_GRATIS_MS = 18_000;
export const COACH_SEM_IA_MSG = "O Coach está sem IA agora; seus números seguem calculados normalmente.";

type Etapa = { etapa: EtapaLlm; url: string; key: string; modelo: string; timeoutMs: number; tentativas: number };

function etapas(p: PedidoLlm): Etapa[] {
  const env = process.env;
  const out: Etapa[] = [];
  const tk = env.COACH_LLM_API_KEY?.trim();
  const tb = env.COACH_LLM_BASE_URL?.trim();
  if (tk && tb)
    out.push({
      etapa: "tokia",
      url: `${tb.replace(/\/$/, "")}/chat/completions`,
      key: tk,
      modelo: p.modeloTokia || env.COACH_LLM_MODEL?.trim() || "openrouter/anthropic/claude-opus-5",
      timeoutMs: p.timeoutTokiaMs ?? 55_000,
      tentativas: 1,
    });
  const gk = env.GROQ_API_KEY?.trim();
  if (gk)
    out.push({
      etapa: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: gk,
      modelo: env.GROQ_MODEL?.trim() || GROQ_MODEL_PADRAO,
      timeoutMs: TIMEOUT_GRATIS_MS,
      tentativas: 2,
    });
  const mk = env.GEMINI_API_KEY?.trim();
  if (mk)
    out.push({
      etapa: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: mk,
      modelo: env.GEMINI_MODEL?.trim() || GEMINI_MODEL_PADRAO,
      timeoutMs: TIMEOUT_GRATIS_MS,
      tentativas: 2,
    });
  if (p.forcarEtapa)
    return out.filter((e) => e.etapa === p.forcarEtapa).map((e) => (p.forcarModelo ? { ...e, modelo: p.forcarModelo, tentativas: 1 } : e));
  return out;
}

/** Há alguma etapa de IA configurada? */
export function algumaIaConfigurada(): boolean {
  const e = process.env;
  return !!((e.COACH_LLM_API_KEY?.trim() && e.COACH_LLM_BASE_URL?.trim()) || e.GROQ_API_KEY?.trim() || e.GEMINI_API_KEY?.trim());
}

export function classificarStatus(status: number, corpo = ""): FalhaLlm {
  if (status === 402 || status === 429) return "cota";
  if (/quota|rate.?limit|insufficient|credit|saldo|exhausted/i.test(corpo)) return "cota";
  return "erro";
}

function textoDe(c: unknown): string {
  if (typeof c === "string") return c.trim();
  if (Array.isArray(c)) return c.map((x) => (x as { text?: string }).text ?? "").join("").trim();
  return "";
}

/** Tira cercas ```json e devolve o primeiro objeto JSON, ou null. */
export function extrairJson(raw: string): unknown | null {
  const s = raw.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** Último diagnóstico (rotas usam pra logar/decidir; não vai pra tela). */
export let ultimaCadeia: TentativaLlm[] = [];

export async function chamarCadeia(p: PedidoLlm): Promise<RespostaLlm | null> {
  const log: TentativaLlm[] = [];
  const lista = etapas(p);
  for (const nome of ["tokia", "groq", "gemini"] as EtapaLlm[])
    if (!lista.some((e) => e.etapa === nome)) log.push({ etapa: nome, resultado: "pulada" });
  let resp: RespostaLlm | null = null;
  for (const e of lista) {
    for (let t = 0; t < e.tentativas && !resp; t++) {
      const t0 = Date.now();
      let falha: FalhaLlm = "erro";
      let status = 0;
      let detalhe: string | undefined;
      try {
        const res = await (p.fetchImpl ?? fetch)(e.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${e.key}` },
          body: JSON.stringify({
            model: e.modelo,
            temperature: p.temperature ?? 0.3,
            ...(p.max_tokens ? { max_tokens: p.max_tokens } : {}),
            ...(p.json ? { response_format: { type: "json_object" } } : {}),
            messages: p.messages,
          }),
          signal: AbortSignal.timeout(e.timeoutMs),
        });
        status = res.status;
        if (!res.ok) {
          const corpo = await res.text().catch(() => "");
          falha = classificarStatus(res.status, corpo);
          // TEMPORÁRIO (diagnóstico): trecho do erro, sem chave
          if (p.forcarEtapa) detalhe = corpo.split(e.key).join("***").replace(/AIza[\w-]+|gsk_\w+/g, "***").slice(0, 300);
        } else {
          const j = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
          const texto = textoDe(j?.choices?.[0]?.message?.content);
          if (texto && (!p.validar || p.validar(texto))) resp = { texto, etapa: e.etapa, modelo: e.modelo };
          else falha = "invalido";
        }
      } catch {
        falha = "erro";
      }
      log.push({ etapa: e.etapa, resultado: resp ? "ok" : falha, status, ms: Date.now() - t0, ...(p.forcarEtapa ? { modelo: e.modelo, detalhe } : {}) });
      // cota ou resposta inválida: não adianta repetir a mesma etapa
      if (resp || falha === "cota" || falha === "invalido") break;
    }
    if (resp) break;
  }
  ultimaCadeia = log;
  console.info("[llm/cadeia]", JSON.stringify({ ponto: p.ponto ?? "?", respondeu: resp?.etapa ?? "pronta", tentativas: log }));
  return resp;
}

/** TEMPORÁRIO (diagnóstico): ids de modelo que a chave enxerga (sem custo de tokens). */
export async function listarModelosDiag(etapa: "groq" | "gemini"): Promise<{ status: number; ids: string[] }> {
  const k = (etapa === "groq" ? process.env.GROQ_API_KEY : process.env.GEMINI_API_KEY)?.trim();
  if (!k) return { status: 0, ids: [] };
  const url = etapa === "groq" ? "https://api.groq.com/openai/v1/models" : "https://generativelanguage.googleapis.com/v1beta/openai/models";
  const r = await fetch(url, { headers: { Authorization: `Bearer ${k}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!r) return { status: 0, ids: [] };
  const j = (await r.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;
  return { status: r.status, ids: (j?.data ?? []).map((m) => String(m.id ?? "")).filter(Boolean) };
}
