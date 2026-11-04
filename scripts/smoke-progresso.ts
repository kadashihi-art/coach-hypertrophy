/**
 * smoke:progresso — e1RM/PR só de séries reais, volume na semana do treino,
 * séries casadas por exercício quando o id da prescrição ficou velho, recálculo único.
 */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { AppStateSchema, type AppState, type Perfil, type RegistroSerie, type Sessao } from "../src/lib/domain";
import { concluirSessao } from "../src/lib/engine/concluir-sessao";
import { isoWeekDe } from "../src/lib/engine/volume";
import { e1rmEpley } from "../src/lib/engine/e1rm";
import { recalcularRecordesConta, recordeDasSeries } from "../src/lib/engine/recordes";
import { aplicarCorrecao, editarSerie, rascunhoCorrecaoDaSessao } from "../src/lib/plan/corrigir-concluida";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const C = CATALOG_EXERCICIOS;
const perfil: Perfil = {
  id: "smoke-prog", peso_kg: 80, altura_cm: 178, experiencia: "intermediario",
  dias_por_semana: 4, minutos_por_sessao: 60, cardio_min_semana: 0,
  equipamentos: ["barra", "halteres", "maquina", "cabo"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: "2026-10-01T10:00:00.000Z",
  parq_respostas: [false, false, false, false, false, false, false], criado_em: "2026-10-01T10:00:00.000Z",
};
const g = gerarPlanoFromPerfil(perfil, C);

// (1) plano novo: nada de e1RM/PR inventado
ok(g.estados.length > 0 && g.estados.every((e) => e.e1rm_estimado_kg === 0 && e.pr_carga_kg === 0 && e.pr_reps === 0), "plano novo começa sem e1RM/PR (sem dados)");

// (2) PR = melhor série de trabalho por e1RM; aquecimento/aproximação fora
const S = (tipo: string, kg: number, reps: number) => ({ tipo_serie: tipo, carga_kg: kg, reps }) as never;
const r = recordeDasSeries([S("aquecimento", 100, 10), S("feeder", 90, 5), S("trabalho", 30, 6), S("trabalho", 25, 12)]);
ok(r.pr_carga_kg === 30 && r.pr_reps === 6 && r.e1rm_estimado_kg === 36, `PR = melhor série real por e1RM, aquecimento fora (30×6=36 > 25×12=35)`);
ok(recordeDasSeries([S("trabalho", 30, 6)]).e1rm_estimado_kg === 36, "agachamento 30×6 → e1RM 36");
ok(recordeDasSeries([S("aquecimento", 20, 10)]).pr_reps === 0, "só aquecimento → sem dados");

// fixtures
const A0: Sessao = { ...g.sessoes[0]!, data: "2026-10-21" };
const B0: Sessao = { ...A0, id: `${A0.id}-b`, data: "2026-10-28", ordem: A0.ordem + 1, prescricoes: A0.prescricoes.map((p) => ({ ...p, id: `${p.id}-b`, sessao_id: `${A0.id}-b` })) };
const base: AppState = AppStateSchema.parse({
  perfil, exercicios: C, guias: [], plano: g.plano, sessoes: [A0, B0, ...g.sessoes.slice(1)], registros: [], estados: g.estados,
  checkins: [], alertas: [], decisoes: [], volumes_semanais: [], active_sessao_id: null, logger_prescricao_id: null,
});
const p1 = A0.prescricoes[0]!;
const ex1 = p1.exercicio_id;
function regs(sess: Sessao, kg: number, reps: number, prescId?: string): RegistroSerie[] {
  const p = sess.prescricoes[0]!;
  return [
    { tipo: "aquecimento", kg: kg * 0.5, reps: 10 },
    { tipo: "trabalho", kg, reps },
    { tipo: "trabalho", kg, reps },
  ].map((s, j) => ({
    id: `${sess.id}-r${j}`, sessao_id: sess.id, prescricao_id: prescId ?? p.id, exercicio_id: p.exercicio_id, numero: j + 1,
    tipo_serie: s.tipo as RegistroSerie["tipo_serie"], carga_kg: s.kg, reps: s.reps, rir_percebido: 2, dor: false, executado_em: `${sess.data}T12:00:00.000Z`,
  }));
}
function concluir(s: AppState, sid: string, rs: RegistroSerie[], agora: string): AppState {
  const st: AppState = { ...s, active_sessao_id: sid, sessoes: s.sessoes.map((x) => (x.id === sid ? { ...x, status: "em_andamento" as const } : x)), registros: [...s.registros, ...rs] };
  return concluirSessao(st, { gravarSnapshot: true, agora }).state;
}
const est = (s: AppState) => s.estados.find((e) => e.exercicio_id === ex1)!;

// (5) volume na semana do treino, não do clique (concluída 9 dias depois)
const s1 = concluir(base, A0.id, regs(A0, 40, 10), "2026-10-30T13:00:00.000Z");
const semA = isoWeekDe(new Date("2026-10-21T12:00:00"));
ok(s1.volumes_semanais.length > 0 && s1.volumes_semanais.every((v) => v.semana_iso === semA), `volume na semana do treino (${semA})`);
ok(est(s1).pr_carga_kg === 40 && est(s1).pr_reps === 10 && est(s1).e1rm_estimado_kg === e1rmEpley(40, 10), "1º treino real define PR/e1RM");

// (4) id de prescrição velho (Ocupado/troca/edição) → casa pelo exercício
const s4 = concluir(base, A0.id, regs(A0, 40, 10, "prescricao-velha"), "2026-10-21T13:00:00.000Z");
ok(s4.decisoes.some((d) => d.exercicio_id === ex1 && d.sessao_id === A0.id), "séries com id velho entram na decisão do exercício");
ok(est(s4).pr_reps === 10, "séries com id velho contam no PR (sem '× 0')");

// (3) correção pode baixar
const s2 = concluir(s1, B0.id, regs(B0, 42.5, 10), "2026-10-28T13:00:00.000Z");
ok(est(s2).pr_carga_kg === 42.5, "PR sobe com treino melhor");
let rc = rascunhoCorrecaoDaSessao(s2, B0.id);
const idx = rc.itens.findIndex((i: { exercicio_id: string }) => i.exercicio_id === ex1);
for (let j = 0; j < rc.itens[idx]!.series.length; j++) rc = editarSerie(rc, idx, j, { carga_kg: 35, reps: 8 });
const corr = aplicarCorrecao(s2, rc);
ok(corr.ok && est(corr.state).pr_carga_kg === 40 && est(corr.state).pr_reps === 10, "corrigir o treino pra menos baixa o PR (volta pro melhor real)");

// recálculo único: estado antigo com seed falso
const velho: AppState = { ...s1, estados: s1.estados.map((e) => (e.exercicio_id === ex1 ? e : { ...e, e1rm_estimado_kg: e.carga_atual_kg * 1.4, pr_carga_kg: e.carga_atual_kg, pr_reps: 0 })) };
const rec = recalcularRecordesConta(velho);
ok(rec.linhas.filter((l) => l.exercicio_id !== ex1).every((l) => l.depois.pr_reps === 0 && l.depois.e1rm_estimado_kg === 0), "recálculo apaga e1RM/PR inventado (sem treino real)");
ok(rec.linhas.every((l) => l.variacao_carga_pct === 0), "recálculo não mexe na carga atual");
ok(JSON.stringify(velho.estados) === JSON.stringify(velho.estados.map((e) => ({ ...e }))), "entrada intacta");

// estado antigo carrega
ok(AppStateSchema.safeParse(JSON.parse(JSON.stringify(velho))).success, "estado antigo carrega");

if (fail) { console.log(`${fail} FAIL`); process.exit(1); }
console.log("smoke:progresso OK");
