/** smoke:backup — exportar e importar a cópia dos dados (ida e volta, arquivos inválidos recusados). */
import { gerarBackup, lerBackup, resumoDoEstado } from "../src/lib/backup";
import { seedState } from "../src/lib/seed";
import { AppStateSchema } from "../src/lib/domain";
import { CATALOG_EXERCICIOS as C } from "../src/lib/catalog/exercicios";
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import type { AppState, Perfil } from "../src/lib/domain";

let fail = 0;
const ok = (c: boolean, m: string) => { if (c) console.log("PASS", m); else { fail++; console.log("FAIL", m); } };

const perfil = { ...seedState.perfil!, id: "b", experiencia: "intermediario", dias_por_semana: 4, minutos_por_sessao: 60, equipamentos: ["barra", "halteres", "maquina", "cabo"], restricoes: [], onboarding_concluido: true, parq_liberado: true, parq_respostas: [false, false, false, false, false, false, false], parq_respondido_em: "2026-10-01T00:00:00Z", dias_treino_semana: [1, 2, 4, 5] } as Perfil;
const g = gerarPlanoFromPerfil(perfil, C);
const s0: AppState = AppStateSchema.parse({ ...structuredClone(seedState), perfil, plano: g.plano, sessoes: g.sessoes.map((x, i) => (i === 0 ? { ...x, status: "concluida", data: "2026-11-16" } : x)), estados: g.estados, active_sessao_id: g.sessoes[1]!.id });

const texto = gerarBackup(s0, new Date("2026-11-19T12:00:00Z"));
const r = lerBackup(texto);
ok(r.ok, "cópia exportada abre de volta");
if (r.ok) {
  ok(JSON.stringify({ ...r.state, active_sessao_id: s0.active_sessao_id }) === JSON.stringify(s0), "ida e volta: mesmos dados");
  ok(r.state.active_sessao_id === null, "importar não deixa treino aberto");
  ok(r.resumo.treinos_feitos === 1 && r.resumo.ultimo_treino === "2026-11-16", "resumo mostra treinos feitos e o último");
  ok(r.exportado_em === "2026-11-19T12:00:00.000Z", "data da cópia");
  ok(JSON.stringify(r.state.perfil?.dias_treino_semana) === "[1,2,4,5]", "dias de treino vão junto");
}
ok(!lerBackup("não é json").ok, "texto qualquer é recusado");
ok(!lerBackup(JSON.stringify({ app: "outro", state: s0 })).ok, "arquivo de outro app é recusado");
ok(!lerBackup(JSON.stringify({ app: "coach-hypertrophy", state: { sessoes: "x" } })).ok, "cópia alterada/incompleta é recusada");
ok(resumoDoEstado(seedState).treinos_feitos === 0, "resumo do estado vazio");

if (fail) { console.error(`\n${fail} falha(s)`); process.exit(1); }
console.log("\nsmoke:backup OK");
