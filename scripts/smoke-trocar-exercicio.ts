/** Smoke: troca permanente de exercício — padrão/músculo/equipamento/lesão, volume igual, nada sem confirmar, LLM falhando. */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import {
  aplicarTroca,
  detectarPedidoTroca,
  listarAlternativasTroca,
  previaTroca,
  volumePlanejado,
} from "../src/lib/plan/trocar-exercicio";
import { explicarComLlm, saidaLlmValida } from "../src/lib/plan/trocar-explicar-llm";
import type { AppState, Perfil } from "../src/lib/domain";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

const base: Perfil = {
  id: "smoke-troca", peso_kg: 80, altura_cm: 178, experiencia: "intermediario",
  dias_por_semana: 4, minutos_por_sessao: 60, cardio_min_semana: 0,
  equipamentos: ["barra", "halteres", "maquina", "cabo"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: new Date().toISOString(),
  parq_respostas: [false, false, false, false, false, false, false], criado_em: new Date().toISOString(),
};
function mk(perfil: Perfil): AppState {
  const g = gerarPlanoFromPerfil(perfil, CATALOG_EXERCICIOS);
  return {
    perfil, plano: g.plano, sessoes: g.sessoes, estados: g.estados,
    registros: [{ id: "r1", exercicio_id: "leg_press", marker: "historico" }],
    volumes_semanais: g.volumes_semanais, exercicios: CATALOG_EXERCICIOS, checkins: [],
  } as unknown as AppState;
}
const C = CATALOG_EXERCICIOS;
const sessDoPlano = (s: AppState) => s.sessoes.filter((x) => s.plano!.sessoes.includes(x.id));

// 1) Alternativas: mesmo padrão + músculo + equipamento disponível
const state = mk(base);
const planIds = new Set(sessDoPlano(state).flatMap((s) => s.prescricoes.map((p) => p.exercicio_id)));
for (const id of planIds) {
  const de = C.find((e) => e.id === id)!;
  const alts = listarAlternativasTroca({ exercicioId: id, catalog: C, perfil: base });
  ok(alts.every((a) => a.exercicio.padrao === de.padrao && a.exercicio.grupo_primario === de.grupo_primario && a.exercicio.id !== id), `${id}: alternativas mesmo padrão/músculo (${alts.length})`);
  ok(alts.every((a) => [...base.equipamentos, "peso_corporal"].includes(a.exercicio.equipamento)), `${id}: alternativas respeitam equipamento`);
  ok(alts.every((a) => !/_|motor|\bR\d/.test(a.explicacao) && a.explicacao.length > 10), `${id}: explicação humana sem ids/enums`);
}
const soHalteres = listarAlternativasTroca({ exercicioId: "supino_reto_convencional", catalog: C, perfil: { ...base, equipamentos: ["halteres"] } });
ok(soHalteres.length > 0 && soHalteres.every((a) => ["halteres", "peso_corporal"].includes(a.exercicio.equipamento)), "só halteres → só halteres/peso do corpo");

// 2) Lesões
const lombar = listarAlternativasTroca({ exercicioId: "leg_press", catalog: C, perfil: { ...base, restricoes: ["lombar"] } });
ok(!lombar.some((a) => a.exercicio.id === "agachamento_barra"), "lombar → sem agachamento com barra");
const joelho = listarAlternativasTroca({ exercicioId: "leg_press", catalog: C, perfil: { ...base, restricoes: ["dor no joelho"] } });
ok(!joelho.some((a) => ["agachamento_barra", "afundo_bulgaro"].includes(a.exercicio.id)), "joelho → sem agachamento barra/búlgaro");
const ombro = listarAlternativasTroca({ exercicioId: "desenvolvimento_halteres", catalog: C, perfil: { ...base, restricoes: ["ombro"] } });
ok(ombro.length === 0, "ombro → nenhum press vertical sugerido");

// 3) Volume por músculo igual + nada persiste sem confirmar
const alvoEx = [...planIds].find((id) => listarAlternativasTroca({ exercicioId: id, catalog: C, perfil: base }).length > 0)!;
const alvoAlts = listarAlternativasTroca({ exercicioId: alvoEx, catalog: C, perfil: base });
const snap = JSON.stringify(state);
for (const a of alvoAlts) {
  const prev = previaTroca(state, alvoEx, a.exercicio.id);
  if (!prev) { ok(true, `${alvoEx}→${a.exercicio.id}: já está na mesma sessão (pulado)`); continue; }
  ok(JSON.stringify(state) === snap, `${alvoEx}→${a.exercicio.id}: prévia não muda o estado`);
  const depois = aplicarTroca(state, alvoEx, a.exercicio.id)!;
  ok(JSON.stringify(state) === snap, "aplicarTroca é puro (estado original intacto até o app gravar)");
  const vA = volumePlanejado(sessDoPlano(state), C);
  const vD = volumePlanejado(sessDoPlano(depois), C);
  const grupos = new Set([...Object.keys(vA), ...Object.keys(vD)]);
  ok([...grupos].every((g) => (vA[g]?.diretas ?? 0) === (vD[g]?.diretas ?? 0)), `${alvoEx}→${a.exercicio.id}: séries diretas por músculo idênticas`);
  const g0 = C.find((e) => e.id === alvoEx)!.grupo_primario;
  ok(vA[g0].efetivas === vD[g0].efetivas, `${alvoEx}→${a.exercicio.id}: volume do músculo-alvo idêntico`);
  if (!a.secundarios_mudam) ok(JSON.stringify(vA) === JSON.stringify(vD), "auxiliares iguais → volume idêntico em todos os músculos");
  const pa = sessDoPlano(state).flatMap((s) => s.prescricoes).filter((p) => p.exercicio_id === alvoEx);
  const pd = sessDoPlano(depois).flatMap((s) => s.prescricoes).filter((p) => p.exercicio_id === a.exercicio.id);
  ok(pa.length === pd.length && pa.every((p, i) => p.series === pd[i].series && p.rir_alvo === pd[i].rir_alvo && p.faixa_reps.join() === pd[i].faixa_reps.join()), "séries/reps/RIR herdados (definidos pelo app, não pela IA)");
  ok(!sessDoPlano(depois).some((s) => s.prescricoes.some((p) => p.exercicio_id === alvoEx)), "troca vale pra todas as sessões do plano");
  ok(JSON.stringify(depois.registros) === JSON.stringify(state.registros), "histórico intacto");
  ok(depois.estados.some((e) => e.exercicio_id === a.exercicio.id), "estado do novo exercício existe");
  ok(pd[0].carga.trabalho_kg === prev.carga_kg, "kg da prévia = kg gravado");
}
// kg vem do EstadoExercicio quando existe
const comEstado = { ...state, estados: [...state.estados.filter((e) => e.exercicio_id !== alvoAlts[0].exercicio.id), { ...state.estados[0], exercicio_id: alvoAlts[0].exercicio.id, carga_atual_kg: 42.5, alvo_proxima_sessao: { ...state.estados[0].alvo_proxima_sessao, carga_kg: 47.5 } }] } as AppState;
const pv = previaTroca(comEstado, alvoEx, alvoAlts[0].exercicio.id);
ok(!pv || (pv.carga_kg === 47.5 && pv.carga_origem === "historico"), "kg inicial vem do estado salvo do novo exercício");
ok(aplicarTroca(state, alvoEx, "prancha") === null, "troca inválida (outro padrão) recusada");

// 4) Chat detecta pedido
ok(detectarPedidoTroca("troca o leg press por outro", { ...state, sessoes: state.sessoes.map((s, i) => (i === 0 ? { ...s, prescricoes: [{ ...s.prescricoes[0], exercicio_id: "leg_press" }] } : s)) } as AppState) !== null, "chat: 'troca o leg press por outro' detectado");
ok(detectarPedidoTroca("quero trocar um exercicio", state) === "generico", "chat: pedido genérico abre seletor");
ok(detectarPedidoTroca("por que essa carga?", state) === null, "chat: pergunta normal não abre troca");

// 5) LLM falhando / inválida
(async () => {
  process.env.COACH_LLM_API_KEY = "x"; process.env.COACH_LLM_BASE_URL = "https://example.invalid/v1";
  const itens = alvoAlts.map((a) => ({ id: a.exercicio.id, nome: a.exercicio.nome, equipamento: a.exercicio.equipamento, texto_base: a.explicacao }));
  const r402 = await explicarComLlm({ de: "x", itens, restricoes: [], fetchImpl: (async () => new Response("{}", { status: 402 })) as typeof fetch });
  ok(r402.fonte === "regra" && Object.keys(r402.explicacoes).length === 0, "LLM 402 → cai pra explicação por regra");
  const rErr = await explicarComLlm({ de: "x", itens, restricoes: [], fetchImpl: (async () => { throw new Error("down"); }) as typeof fetch });
  ok(rErr.fonte === "regra", "LLM fora do ar → regra");
  const ruim = JSON.stringify({ choices: [{ message: { content: JSON.stringify({ [itens[0].id]: "Faz 4 séries de 10 com 80 kg", zzz: "texto ok qualquer" }) } }] });
  const rBad = await explicarComLlm({ de: "x", itens, restricoes: [], fetchImpl: (async () => new Response(ruim, { status: 200 })) as typeof fetch });
  ok(Object.keys(rBad.explicacoes).length === 0, "LLM com números/ids desconhecidos → descartado");
  ok(!saidaLlmValida("usa o leg_press") && !saidaLlmValida("o motor decide") && saidaLlmValida("Boa opção, máquina guiada e segura."), "validação de texto da IA");
  ok(listarAlternativasTroca({ exercicioId: alvoEx, catalog: C, perfil: base }).length > 0, "alternativas aparecem sem IA");
  console.log(fail ? `\n${fail} FAIL` : "\nOK smoke:trocar-exercicio");
  process.exit(fail ? 1 : 0);
})();
