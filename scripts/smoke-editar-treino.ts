/** Smoke: Editar treino — add, remove, reorder, séries/reps, mover dia, volume fora da faixa, desfazer, voltar ao Coach, histórico intacto. */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { AppStateSchema, type AppState, type Perfil } from "../src/lib/domain";
import { preparatoriasDaSessao } from "../src/lib/treino/estrutura-series";
import {
  LIMITES_EDICAO,
  adicionarItem,
  ajustarReps,
  ajustarSeries,
  alternativasParaItem,
  aplicarEdicao,
  candidatosAdicionar,
  conflitoDia,
  desfazerEdicao,
  moverItem,
  previaEdicao,
  rascunhoDaSessao,
  removerItem,
  sessaoEditavel,
  trocarItem,
  validarEdicoesNoEstado,
  voltarAoCoach,
} from "../src/lib/plan/editar-treino";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const C = CATALOG_EXERCICIOS;

const perfil: Perfil = {
  id: "smoke-edit", peso_kg: 80, altura_cm: 178, experiencia: "intermediario",
  dias_por_semana: 4, minutos_por_sessao: 60, cardio_min_semana: 0,
  equipamentos: ["barra", "halteres", "maquina", "cabo"], restricoes: ["joelho"], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: new Date().toISOString(),
  parq_respostas: [false, false, false, false, false, false, false], criado_em: new Date().toISOString(),
};
const g = gerarPlanoFromPerfil(perfil, C);
const ids = g.plano.sessoes;
const sessoes = g.sessoes.map((s, i) => ({ ...s, data: `2026-11-0${2 + i}` }));
sessoes[1] = { ...sessoes[1]!, status: "concluida" as const };
const registro = { id: "r1", sessao_id: sessoes[1]!.id, prescricao_id: sessoes[1]!.prescricoes[0]!.id, exercicio_id: sessoes[1]!.prescricoes[0]!.exercicio_id, numero: 1, tipo_serie: "trabalho" as const, carga_kg: 50, reps: 10, rir_percebido: 2, dor: false, executado_em: new Date().toISOString() };
const s0: AppState = AppStateSchema.parse({
  perfil, exercicios: C, guias: [], plano: g.plano, sessoes, registros: [registro], estados: g.estados,
  checkins: [], alertas: [], decisoes: [], volumes_semanais: g.volumes_semanais, active_sessao_id: null, logger_prescricao_id: null,
});
const alvo = s0.sessoes.find((s) => s.id === ids[0])!;
const regsAntes = JSON.stringify(s0.registros);
const estadosAntes = JSON.stringify(s0.estados);

// editabilidade
ok(sessaoEditavel(s0, alvo.id), "sessão planejada é editável");
ok(!sessaoEditavel(s0, sessoes[1]!.id), "sessão concluída não é editável");
const emAnd: AppState = { ...s0, sessoes: s0.sessoes.map((s) => (s.id === alvo.id ? { ...s, status: "em_andamento" as const } : s)) };
ok(!sessaoEditavel(emAnd, alvo.id), "sessão em andamento não é editável");
ok(!aplicarEdicao(emAnd, rascunhoDaSessao(alvo)).ok, "aplicar em sessão em andamento é recusado");

// add (filtrado por equipamento/lesão)
let r = rascunhoDaSessao(alvo);
const n0 = r.itens.length;
const cands = candidatosAdicionar(s0, r);
ok(cands.length > 0 && cands.every((e) => !r.itens.some((i) => i.exercicio_id === e.id)), "candidatos não repetem exercícios");
ok(!cands.some((e) => e.id === "agachamento_barra" || e.id === "afundo_bulgaro"), "restrição de joelho filtra candidatos");
ok(cands.every((e) => ["barra", "halteres", "maquina", "cabo", "peso_corporal"].includes(e.equipamento)), "equipamento filtrado");
const novo = cands.find((e) => !s0.estados.some((x) => x.exercicio_id === e.id)) ?? cands[0]!;
r = adicionarItem(s0, r, novo.id);
ok(r.itens.length === n0 + 1 && r.itens.at(-1)!.exercicio_id === novo.id, "adiciona exercício no fim");
ok(adicionarItem(s0, r, novo.id).itens.length === r.itens.length, "não duplica exercício");

// remove
const removido = r.itens[1]!.exercicio_id;
r = removerItem(r, 1);
ok(!r.itens.some((i) => i.exercicio_id === removido), "remove exercício");

// reorder
const primeiro = r.itens[0]!.exercicio_id;
r = moverItem(r, 0, 1);
ok(r.itens[1]!.exercicio_id === primeiro, "desce o 1º para a 2ª posição");
ok(moverItem(r, 0, -1) === r, "subir o primeiro não faz nada");

// séries/reps com limites
r = ajustarSeries(r, 0, 99);
ok(r.itens[0]!.series === LIMITES_EDICAO.series_max, "séries limitadas ao máximo");
r = ajustarSeries(r, 0, 4);
r = ajustarReps(r, 0, 15, 8);
ok(r.itens[0]!.faixa_reps[0] === 8 && r.itens[0]!.faixa_reps[1] === 15, "faixa de reps invertida é corrigida");
r = ajustarReps(r, 0, 1, 99);
ok(r.itens[0]!.faixa_reps[0] === LIMITES_EDICAO.reps_min && r.itens[0]!.faixa_reps[1] === LIMITES_EDICAO.reps_max, "reps limitadas");
r = ajustarReps(r, 0, 6, 10);

// trocar via mesmo fluxo
const alts = alternativasParaItem(s0, r, 0);
if (alts[0]) {
  const antesId = r.itens[0]!.exercicio_id;
  r = trocarItem(s0, r, 0, alts[0].id);
  ok(r.itens[0]!.exercicio_id === alts[0].id && r.itens[0]!.series === 4, `troca ${antesId} → ${alts[0].id} mantendo séries`);
  ok(trocarItem(s0, r, 0, "nao_existe").itens[0]!.exercicio_id === alts[0].id, "troca inválida é ignorada");
}

// mover dia: não colide com dia Feito
ok(!!conflitoDia(s0, alvo.id, sessoes[1]!.data!), "dia já Feito bloqueia");
ok(!!conflitoDia(s0, alvo.id, sessoes[2]!.data!), "dia com outro treino bloqueia");
ok(conflitoDia(s0, alvo.id, "2026-11-20") === null, "dia livre ok");
ok(!aplicarEdicao(s0, { ...r, data: sessoes[1]!.data }).ok, "salvar em dia Feito é recusado");
r = { ...r, data: "2026-11-20" };

// prévia: resumo + kg do engine + aquecimento pela nova ordem
const pv = previaEdicao(s0, r)!;
ok(pv.erro === null, "rascunho válido");
ok(pv.resumo.linhas.some((l) => l.startsWith("Adicionado")), "resumo: adicionado");
ok(pv.resumo.linhas.some((l) => l.startsWith("Removido")), "resumo: removido");
ok(pv.resumo.linhas.some((l) => l.startsWith("Dia:")), "resumo: dia");
ok(pv.resumo.linhas.some((l) => l.includes("séries") || l.includes("reps")), "resumo: séries/reps");
ok(!pv.resumo.linhas.join(" ").match(/R1[01]|motor|_/), "resumo sem códigos/ids");
const mantidos = pv.depois.prescricoes.filter((p) => alvo.prescricoes.some((a) => a.exercicio_id === p.exercicio_id));
ok(mantidos.every((p) => { const a = alvo.prescricoes.find((x) => x.exercicio_id === p.exercicio_id)!; return a.carga.trabalho_kg === p.carga.trabalho_kg && a.rir_alvo === p.rir_alvo && a.id === p.id; }), "kg/RIR/id preservados nos mantidos");
const pAdd = pv.depois.prescricoes.find((p) => p.exercicio_id === novo.id)!;
const est = s0.estados.find((e) => e.exercicio_id === novo.id);
ok(pAdd.carga.trabalho_kg > 0 && (!est || pAdd.carga.trabalho_kg === (est.alvo_proxima_sessao.carga_kg ?? est.carga_atual_kg)), "kg do novo vem do estado/estimativa");
ok(pv.depois.prescricoes.map((p) => p.ordem).join() === pv.depois.prescricoes.map((_, i) => i + 1).join(), "ordem renumerada");
const prep = preparatoriasDaSessao(pv.depois.prescricoes, C);
ok(prep[0] === true, "aquecimento no 1º da nova ordem (regra por grupo mantida)");

// volume fora da faixa
let rv = rascunhoDaSessao(alvo);
for (let i = 0; i < rv.itens.length; i++) rv = ajustarSeries(rv, i, LIMITES_EDICAO.series_max);
const pvMax = previaEdicao(s0, rv)!;
ok(pvMax.avisos.some((a) => a.tipo === "acima" && a.depois > 20), "aviso de volume acima de 20");
let rmin = rascunhoDaSessao(alvo);
while (rmin.itens.length > 1) rmin = removerItem(rmin, rmin.itens.length - 1);
rmin = ajustarSeries(rmin, 0, 1);
const pvMin = previaEdicao(s0, rmin)!;
ok(pvMin.avisos.some((a) => a.tipo === "abaixo" && a.depois < 10), "aviso de volume abaixo de 10");
ok(pvMin.avisos.every((a) => !/R1[01]|_/.test(a.texto)), "aviso sem código de regra");

// aplicar
const a1 = aplicarEdicao(s0, r);
ok(a1.ok, "aplica edição após confirmar");
if (!a1.ok) process.exit(1);
const s1 = a1.state;
ok(AppStateSchema.safeParse(s1).success, "estado editado passa no Zod");
ok(validarEdicoesNoEstado(s1) === null, "validação do servidor aceita");
ok(s1.sessoes.find((s) => s.id === alvo.id)!.data === "2026-11-20", "sessão moveu de dia");
ok(JSON.stringify(s1.registros) === regsAntes, "histórico intacto");
ok(JSON.parse(estadosAntes).every((e: { exercicio_id: string }) => s1.estados.some((x) => x.exercicio_id === e.exercicio_id && JSON.stringify(x) === JSON.stringify(e))), "EstadoExercicio preservado (inclusive do removido)");
ok(s1.estados.some((e) => e.exercicio_id === removido), "remover não apaga o estado");
ok(JSON.stringify(s1.sessoes.find((s) => s.id === sessoes[1]!.id)) === JSON.stringify(s0.sessoes.find((s) => s.id === sessoes[1]!.id)), "sessão concluída intocada");

// segunda edição + desfazer
let r2 = rascunhoDaSessao(s1.sessoes.find((s) => s.id === alvo.id)!);
r2 = ajustarSeries(r2, 0, 2);
const a2 = aplicarEdicao(s1, r2);
ok(a2.ok, "segunda edição");
if (!a2.ok) process.exit(1);
const d = desfazerEdicao(a2.state, alvo.id);
ok(d.ok && JSON.stringify(d.state.sessoes.find((s) => s.id === alvo.id)!.prescricoes) === JSON.stringify(s1.sessoes.find((s) => s.id === alvo.id)!.prescricoes), "desfazer volta à versão anterior");
ok(d.ok && !desfazerEdicao(d.state, alvo.id).ok, "só um nível de desfazer");

// voltar ao Coach
if (d.ok) {
  const v = voltarAoCoach(d.state, alvo.id);
  ok(v.ok, "voltar ao plano do Coach");
  if (v.ok) {
    const back = v.state.sessoes.find((s) => s.id === alvo.id)!;
    ok(JSON.stringify(back.prescricoes) === JSON.stringify(alvo.prescricoes) && back.data === alvo.data, "sessão igual ao original do Coach");
    ok(!(v.state.edicoes_sessao ?? []).some((e) => e.sessao_id === alvo.id), "registro de edição limpo");
    ok(JSON.stringify(v.state.registros) === regsAntes, "histórico intacto após voltar");
  }
}

// servidor rejeita lixo
const lixo = { ...s1, sessoes: s1.sessoes.map((s) => (s.id === alvo.id ? { ...s, prescricoes: s.prescricoes.map((p, i) => (i === 0 ? { ...p, faixa_reps: [12, 6] as [number, number] } : p)) } : s)) };
ok(validarEdicoesNoEstado(lixo) !== null, "servidor rejeita faixa invertida em sessão editada");
ok(validarEdicoesNoEstado(s0) === null, "estado sem edições passa como antes");

console.log(fail ? `\n${fail} FAIL` : "\nOK smoke:editar-treino");
process.exit(fail ? 1 : 0);
