/**
 * Smoke coach-geral: pergunta geral sobre exercício vai pra LLM (fetch mockado);
 * resposta sem ids snake_case / "EstadoExercicio"; LLM com erro → fallback humano.
 */
process.env.COACH_LLM_API_KEY = "mock-key";
process.env.COACH_LLM_BASE_URL = "https://llm.mock/v1";
process.env.COACH_LLM_MODEL = "openrouter/anthropic/claude-opus-5";

const PERGUNTA = "O que pode me dizer sobre o leg press articulado";
const ctx = {
  gerado_em: new Date().toISOString(),
  filtro: {},
  checkin_hoje: null,
  plano: { objetivo: "hipertrofia", mesociclo: { total_semanas: 6, semana_atual: 1, foco: "acumulo" } },
  estados: [{ exercicio_id: "triceps_halteres", nome: "", grupo: "triceps", carga_atual_kg: 7.5 }],
  volumes_semanais: [],
  decisoes_progressao: [],
  proxima_sessao: null,
};
const ID = /[a-z]+_[a-z]+/;
const realFetch = globalThis.fetch;
let chamadas = 0;
let modo: "ok" | "erro" | "timeout" = "ok";
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url);
  if (!u.startsWith("https://llm.mock")) return realFetch(url as string, init);
  chamadas++;
  const body = JSON.parse(String(init?.body ?? "{}"));
  if (!JSON.stringify(body.messages).includes("leg press articulado")) throw new Error("pergunta não chegou na LLM");
  if (modo === "erro") return new Response('{"error":"boom"}', { status: 500 });
  if (modo === "timeout") throw new Error("The operation was aborted due to timeout");
  return new Response(
    JSON.stringify({ choices: [{ message: { content: "O leg press articulado segue um arco fixo, então dá pra focar em empurrar com o pé inteiro e controlar a descida. Bom pra quadríceps com pouca demanda de estabilização; a carga e as séries seguem o seu plano." } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}) as typeof fetch;

async function chamar() {
  const { POST } = await import("../src/app/api/coach/chat/route");
  const res = await POST(new Request("http://x/api/coach/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mensagem: PERGUNTA, contexto: ctx }) }));
  return { status: res.status, json: (await res.json()) as { mensagem_usuario?: string; falha_llm?: boolean } };
}
function limpo(t: string) {
  if (ID.test(t)) throw new Error("id snake_case na resposta: " + t);
  if (/EstadoExercicio|no estado|Números acima/.test(t)) throw new Error("texto de stub na resposta: " + t);
}

(async () => {
  const a = await chamar();
  if (a.status !== 200 || chamadas !== 1) throw new Error(`LLM não foi chamada (status ${a.status}, chamadas ${chamadas})`);
  if (!/leg press articulado/i.test(a.json.mensagem_usuario ?? "") || a.json.falha_llm) throw new Error("resposta não é da LLM: " + a.json.mensagem_usuario);
  limpo(a.json.mensagem_usuario!);
  for (const m of ["erro", "timeout"] as const) {
    modo = m;
    const b = await chamar();
    const t = b.json.mensagem_usuario ?? "";
    if (b.status !== 200 || !b.json.falha_llm || !/Tive um problema pra pensar agora/.test(t)) throw new Error(`fallback ${m} não humano: ` + t);
    limpo(t);
  }
  const { semIdsInternos } = await import("../src/lib/llm/tom");
  const s = semIdsInternos("triceps_halteres: ~7.5 kg. EstadoExercicio");
  if (ID.test(s) || s.includes("EstadoExercicio")) throw new Error("sanitizador falhou: " + s);
  const { buildConversarStub } = await import("../src/lib/llm/coach");
  limpo(buildConversarStub({ mensagem: PERGUNTA, contexto: ctx as never, historico: [] }).mensagem_usuario ?? "");
  console.log("coach-geral OK", { chamadas });
})().catch((e) => { console.error(e); process.exit(1); });
