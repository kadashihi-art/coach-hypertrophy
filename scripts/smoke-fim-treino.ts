/** smoke:fim-treino — recordes da sessão e textos do que muda (sem nome de regra). */
import { recordesDaSessao, textoAcao } from "../src/lib/treino/fim-do-treino";
import { AcaoProgressaoSchema } from "../src/lib/domain/enums";
import type { AppState } from "../src/lib/domain";

let fail = 0;
const ok = (c: boolean, m: string) => { if (c) console.log("PASS", m); else { fail++; console.log("FAIL", m); } };
type R = AppState["registros"][number];
const reg = (id: string, sess: string, ex: string, kg: number, reps: number, t: string, tipo: R["tipo_serie"] = "back_off"): R =>
  ({ id, sessao_id: sess, prescricao_id: "p", exercicio_id: ex, numero: 1, tipo_serie: tipo, carga_kg: kg, reps, rir_percebido: 2, dor: false, executado_em: t });

const registros: R[] = [
  reg("a1", "s1", "supino", 32.5, 8, "2026-11-10T18:00:00Z"),
  reg("a2", "s1", "remada", 30, 10, "2026-11-10T18:10:00Z"),
  reg("b1", "s2", "supino", 35, 8, "2026-11-17T18:00:00Z"),
  reg("b2", "s2", "remada", 30, 9, "2026-11-17T18:10:00Z"),
  reg("b3", "s2", "puxada", 40, 10, "2026-11-17T18:20:00Z"),
  reg("b4", "s2", "supino", 50, 5, "2026-11-17T17:50:00Z", "aquecimento"),
];
const r = recordesDaSessao({ registros }, { id: "s2", finalizada_em: "2026-11-17T19:00:00Z" });
ok(r.length === 1 && r[0]!.exercicio_id === "supino", "supino 35×8 bate 32,5×8: é recorde");
ok(r[0]!.antes.carga_kg === 32.5 && r[0]!.atual.carga_kg === 35, "mostra antes e agora");
ok(!r.some((x) => x.exercicio_id === "remada"), "remada com menos reps na mesma carga não é recorde");
ok(!r.some((x) => x.exercicio_id === "puxada"), "primeira vez no exercício não conta como recorde");
ok(r[0]!.atual.reps === 8, "aquecimento não entra no recorde (50×5 de aquecimento ignorado)");
ok(recordesDaSessao({ registros }, { id: "s1", finalizada_em: "2026-11-10T19:00:00Z" }).length === 0, "treino mais antigo não compara com o futuro");
ok(AcaoProgressaoSchema.options.every((a) => { const t = textoAcao(a).texto; return t.length > 0 && !/R\d|_/.test(t); }), "todas as decisões têm texto sem código de regra");

if (fail) { console.error(`\n${fail} falha(s)`); process.exit(1); }
console.log("\nsmoke:fim-treino OK");
