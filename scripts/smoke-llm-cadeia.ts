/* Smoke da cadeia grátis: Tokia → Groq → Gemini → resposta pronta, com fetch mockado. */
import { chamarCadeia, ultimaCadeia, extrairJson } from "../src/lib/llm/cadeia";
import { getCoachProvider, COACH_FALLBACK_MSG } from "../src/lib/llm/coach";
import { RespostaNegociacaoSchema } from "../src/lib/plan/negociacao";

let falhas = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "✔" : "✘"} ${m}`); if (!c) falhas++; };
const KEYS = ["COACH_LLM_API_KEY", "COACH_LLM_BASE_URL", "GROQ_API_KEY", "GEMINI_API_KEY", "GROQ_MODEL", "GEMINI_MODEL"];
function env(v: Record<string, string>) { for (const k of KEYS) delete process.env[k]; Object.assign(process.env, v); }
const TODAS = { COACH_LLM_API_KEY: "t", COACH_LLM_BASE_URL: "https://tokia.test/v1", GROQ_API_KEY: "g", GEMINI_API_KEY: "m" };
const resp = (s: number, txt: string) => new Response(s === 200 ? JSON.stringify({ choices: [{ message: { content: txt } }] }) : txt, { status: s });
type Rota = (url: string, body: { model: string }) => Response;
let chamadas: string[] = [];
function mock(r: Rota) {
  chamadas = [];
  globalThis.fetch = (async (u: string, init: RequestInit) => {
    const url = String(u);
    chamadas.push(url.includes("groq") ? "groq" : url.includes("googleapis") ? "gemini" : "tokia");
    return r(url, JSON.parse(String(init.body)));
  }) as typeof fetch;
}
const msgs = [{ role: "user" as const, content: "oi" }];
console.info = () => {};

(async () => {
  env(TODAS);
  mock((u, b) => (u.includes("tokia") ? resp(402, "insufficient credits") : resp(200, `groq:${b.model}`)));
  let r = await chamarCadeia({ messages: msgs });
  ok(r?.etapa === "groq" && r.texto === "groq:llama-3.3-70b-versatile", "402 no Tokia → Groq (modelo padrão)");
  ok(ultimaCadeia[0].resultado === "cota", "402 classificado como cota");

  mock((u, b) => (u.includes("tokia") ? resp(402, "") : u.includes("groq") ? resp(429, "rate limit") : resp(200, `gem:${b.model}`)));
  r = await chamarCadeia({ messages: msgs });
  ok(r?.etapa === "gemini" && r.texto === "gem:gemini-flash-latest", "429 no Groq → Gemini (modelo padrão)");
  ok(chamadas.filter((c) => c === "groq").length === 1, "cota não repete a mesma etapa");

  mock(() => resp(500, "boom"));
  r = await chamarCadeia({ messages: msgs });
  ok(r === null, "tudo falhando → null (resposta pronta)");
  ok(chamadas.join(",") === "tokia,groq,groq,gemini,gemini", "erro comum tem 1 retry nas etapas grátis");

  mock(() => { throw new Error("timeout"); });
  ok((await chamarCadeia({ messages: msgs })) === null, "timeout/rede em tudo → null");

  env({ GEMINI_API_KEY: "m", GEMINI_MODEL: "gemini-x" });
  mock((_u, b) => resp(200, `gem:${b.model}`));
  r = await chamarCadeia({ messages: msgs });
  ok(r?.etapa === "gemini" && chamadas.join(",") === "gemini" && r.texto === "gem:gemini-x", "chave ausente → etapa pulada; GEMINI_MODEL respeitado");
  ok(ultimaCadeia.filter((t) => t.resultado === "pulada").length === 2, "log marca Tokia e Groq como puladas");

  env({});
  mock(() => resp(200, "x"));
  ok((await chamarCadeia({ messages: msgs })) === null && chamadas.length === 0, "sem chave nenhuma → nenhuma chamada");

  env(TODAS);
  const valido = JSON.stringify({ resposta: "Beleza, ajustei.", ajustes: {} });
  mock((u) => (u.includes("tokia") ? resp(200, "isso não é json") : u.includes("groq") ? resp(200, '{"resposta": 3}') : resp(200, "```json\n" + valido + "\n```")));
  r = await chamarCadeia({ messages: msgs, json: true, validar: (t) => RespostaNegociacaoSchema.safeParse(extrairJson(t)).success });
  ok(r?.etapa === "gemini", "JSON inválido → próxima etapa (Tokia texto, Groq schema errado, Gemini ok)");
  ok(chamadas.join(",") === "tokia,groq,gemini", "inválido não repete a etapa");

  // Coach chat: tudo fora → provider devolve stub e lastChat.ok=false (rota mostra mensagem clara)
  mock(() => resp(402, ""));
  const coach = getCoachProvider() as unknown as { conversar: (i: unknown) => Promise<{ mensagem_usuario?: string }>; lastChat: { ok: boolean } };
  await coach.conversar({ mensagem: "como foi meu treino?", contexto: { estados: [], decisoes_progressao: [], volumes_semanais: [], plano: null, proxima_sessao: null, checkin_hoje: null, racional: null } });
  ok(coach.lastChat.ok === false, "chat sem IA → lastChat.ok=false");
  ok(/sem IA agora; seus números seguem calculados normalmente/.test(COACH_FALLBACK_MSG), "mensagem clara sem IA");
  mock((u) => (u.includes("tokia") ? resp(402, "") : resp(200, "Treino bom, segue o plano.")));
  const c2 = await coach.conversar({ mensagem: "como foi meu treino?", contexto: { estados: [], decisoes_progressao: [], volumes_semanais: [], plano: null, proxima_sessao: null, checkin_hoje: null, racional: null } });
  ok(coach.lastChat.ok === true && c2.mensagem_usuario === "Treino bom, segue o plano.", "chat: Tokia 402 → Groq responde");

  // Nada de chave no log
  const logs: string[] = [];
  console.info = (...a: unknown[]) => { logs.push(a.join(" ")); };
  env({ ...TODAS, GROQ_API_KEY: "gsk_SEGREDO123" });
  mock(() => resp(500, ""));
  await chamarCadeia({ messages: msgs, ponto: "teste" });
  ok(logs.length > 0 && !logs.join("").includes("SEGREDO"), "log interno sem segredos");

  console.log(falhas ? `\n${falhas} falha(s)` : "\nsmoke:llm-cadeia OK");
  process.exit(falhas ? 1 : 0);
})();
