/** smoke:conceitos — explicações práticas (RM, RIR…) e exemplos com os números do usuário. */
import { CONCEITOS, ORDEM_CONCEITOS, cargaParaRM, contextoPessoal, exemploPessoal, repsMaxNaCarga } from "../src/lib/conceitos";
import { e1rmEpley } from "../src/lib/engine/e1rm";

let fail = 0;
const ok = (c: boolean, m: string) => { if (c) console.log("PASS", m); else { fail++; console.log("FAIL", m); } };

ok(ORDEM_CONCEITOS.length === Object.keys(CONCEITOS).length, "todos os conceitos estão na ordem da página");
for (const id of ORDEM_CONCEITOS) {
  const c = CONCEITOS[id];
  ok(c.curto.length > 20 && c.pratica.length >= 2 && c.no_app.length > 20, `${id}: curto + prática + no app`);
  const tudo = [c.curto, ...c.pratica, c.no_app].join(" ");
  ok(!/\bmotor\b|R\d{1,2}\b|#{1,3} /.test(tudo), `${id}: sem "motor", sem código de regra, sem header`);
}
// Matemática coerente com o e1RM do app (Epley).
ok(Math.abs(e1rmEpley(80, 10) - 106.67) < 0.1, "80×10 ≈ 107 kg de 1RM (texto do RM)");
ok(repsMaxNaCarga(100, 75) === 10, "75% do 1RM ≈ 10 reps");
ok(Math.abs(cargaParaRM(e1rmEpley(80, 10), 10) - 80) < 0.5, "cargaParaRM inverte o Epley (e1RM arredondado)");
ok(repsMaxNaCarga(100, 120) === 1 && repsMaxNaCarga(0, 50) === 1, "bordas: carga ≥ 1RM ou sem 1RM → 1");

const ctx = { exercicio: "Supino", carga_kg: 80, reps: 8, rir_alvo: 2, e1rm_kg: 106.7 };
const rir = exemploPessoal("rir", ctx)!;
ok(/80 kg × 8 com RIR 2/.test(rir) && /umas 10 no total/.test(rir), `RIR com os números: ${rir}`);
const rm = exemploPessoal("rm", ctx)!;
ok(/106,5 kg|107 kg/.test(rm) && /10RM fica perto de 80 kg/.test(rm), `RM com os números: ${rm}`);
const tb = exemploPessoal("top_backoff", ctx)!;
ok(/72 kg/.test(tb) && /~10 reps/.test(tb), `top/back-off: ${tb}`);
const sv = exemploPessoal("serie_valida", ctx)!;
ok(/sobram ~2/.test(sv) && /série válida/.test(sv), `série válida: ${sv}`);
ok(exemploPessoal("rm", {}) === null && exemploPessoal("rir", { exercicio: "x" }) === null, "sem dados → sem exemplo inventado");

const cp = contextoPessoal({
  estados: [
    { exercicio_id: "a", e1rm_estimado_kg: 0, ultima_sessao_em: "2026-11-10", alvo_proxima_sessao: { carga_kg: 50, faixa_reps: [8, 12], rir_alvo: 2 } },
    { exercicio_id: "b", e1rm_estimado_kg: 120, ultima_sessao_em: "2026-11-09", alvo_proxima_sessao: { carga_kg: 90, faixa_reps: [6, 10], rir_alvo: 2 } },
    { exercicio_id: "c", e1rm_estimado_kg: 60, ultima_sessao_em: "2026-11-01", alvo_proxima_sessao: { carga_kg: 40, faixa_reps: [10, 15], rir_alvo: 1 } },
  ],
  exercicios: [{ id: "a", nome: "A" }, { id: "b", nome: "Agachamento" }, { id: "c", nome: "C" }],
});
ok(cp.exercicio === "Agachamento" && cp.carga_kg === 90 && cp.reps === 6 && cp.e1rm_kg === 120, "contexto pessoal: exercício mais recente com e1RM");
ok(Object.keys(contextoPessoal({ estados: [], exercicios: [] })).length === 0, "sem histórico → contexto vazio");

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
