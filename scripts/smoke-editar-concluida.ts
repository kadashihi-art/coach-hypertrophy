/**
 * Smoke: corrigir treino concluído.
 * Com snapshot: a correção é comparada com a VERDADE — refazer a história do zero, com os mesmos
 * passos do Coach (concluirSessao), já com o registro corrigido. Cobre top/carga, âncora, e1RM,
 * cascata numa sessão seguinte, remover e trocar exercício, desfazer e idempotência.
 * Sem snapshot: só registro e volume mudam; estado intacto.
 */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { AppStateSchema, type AppState, type Perfil, type RegistroSerie, type Sessao } from "../src/lib/domain";
import { concluirSessao } from "../src/lib/engine/concluir-sessao";
import {
  AVISO_SEM_SNAPSHOT,
  aplicarCorrecao,
  desfazerCorrecao,
  editarSerie,
  mesmo,
  podeDesfazerCorrecao,
  previaCorrecao,
  rascunhoCorrecaoDaSessao,
  recalcularAPartirDe,
  removerExercicioCorrecao,
  trocarExercicioCorrecao,
  validarCorrecoesNoEstado,
  validarRascunhoCorrecao,
} from "../src/lib/plan/corrigir-concluida";
import { alternativasParaItem } from "../src/lib/plan/editar-treino";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const C = CATALOG_EXERCICIOS;

const perfil: Perfil = {
  id: "smoke-corr", peso_kg: 80, altura_cm: 178, experiencia: "intermediario",
  dias_por_semana: 4, minutos_por_sessao: 60, cardio_min_semana: 0,
  equipamentos: ["barra", "halteres", "maquina", "cabo"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: "2026-10-01T10:00:00.000Z",
  parq_respostas: [false, false, false, false, false, false, false], criado_em: "2026-10-01T10:00:00.000Z",
};
const g = gerarPlanoFromPerfil(perfil, C);
const A0 = { ...g.sessoes[0]!, data: "2026-10-26" };
// B = mesma ficha numa semana depois (mesmos exercícios → cascata).
const B0: Sessao = {
  ...A0, id: `${A0.id}-b`, data: "2026-10-28", ordem: A0.ordem + 1,
  prescricoes: A0.prescricoes.map((p) => ({ ...p, id: `${p.id}-b`, sessao_id: `${A0.id}-b` })),
};
const base: AppState = AppStateSchema.parse({
  perfil, exercicios: C, guias: [], plano: g.plano, sessoes: [A0, B0, ...g.sessoes.slice(1)], registros: [], estados: g.estados,
  checkins: [], alertas: [], decisoes: [], volumes_semanais: [], active_sessao_id: null, logger_prescricao_id: null,
});
const [p1, p2] = [A0.prescricoes[0]!, A0.prescricoes[1]!];
const ex1 = p1.exercicio_id;
const ex2 = p2.exercicio_id;

type Serie = { kg: number; reps: number; rir: number };
function regs(sess: Sessao, plano: Record<string, Serie[]>, troca: Record<string, string> = {}): RegistroSerie[] {
  const out: RegistroSerie[] = [];
  for (const p of sess.prescricoes) {
    const lista = plano[p.exercicio_id];
    if (!lista) continue;
    lista.forEach((s, j) => out.push({
      id: `${p.id}-r${j + 1}`, sessao_id: sess.id, prescricao_id: p.id, exercicio_id: troca[p.exercicio_id] ?? p.exercicio_id,
      numero: j + 1, tipo_serie: "trabalho", carga_kg: s.kg, reps: s.reps, rir_percebido: s.rir, dor: false,
      executado_em: "2026-10-26T12:00:00.000Z",
    }));
  }
  return out;
}
const tres = (kg: number, reps: number, rir = 2): Serie[] => [0, 1, 2].map(() => ({ kg, reps, rir }));
const ANCORA_B = 41;

function concluir(s: AppState, sid: string, rs: RegistroSerie[], snapshot: boolean): AppState {
  let st: AppState = { ...s, active_sessao_id: sid, sessoes: s.sessoes.map((x) => (x.id === sid ? { ...x, status: "em_andamento" as const } : x)), registros: [...s.registros, ...rs] };
  if (sid === B0.id) {
    // âncora de aquecimento no B (como logSerie faz)
    st = {
      ...st,
      sessoes: st.sessoes.map((x) => (x.id !== sid ? x : { ...x, ancoras_sessao: [{ exercicio_id: ex2, trabalho_kg: ANCORA_B }] })),
      estados: st.estados.map((e) => (e.exercicio_id !== ex2 ? e : { ...e, carga_atual_kg: ANCORA_B, alvo_proxima_sessao: { ...e.alvo_proxima_sessao, carga_kg: ANCORA_B }, origem_carga: "usuario" as const })),
    };
  }
  const r = concluirSessao(st, { gravarSnapshot: snapshot }).state;
  // finalizada_em determinístico para ordem
  return { ...r, sessoes: r.sessoes.map((x) => (x.id === sid ? { ...x, finalizada_em: sid === A0.id ? "2026-10-26T13:00:00.000Z" : "2026-10-28T13:00:00.000Z" } : x)) };
}

const histA = { [ex1]: tres(40, 10), [ex2]: tres(30, 12) };
const histB = { [ex1]: tres(42.5, 9), [ex2]: tres(ANCORA_B, 10) };
function historia(aPlano: Record<string, Serie[]>, snapshot = true, trocaA: Record<string, string> = {}, semEx1NoA = false): AppState {
  let A = A0;
  if (semEx1NoA) A = { ...A0, prescricoes: A0.prescricoes.filter((p) => p.exercicio_id !== ex1) };
  if (Object.keys(trocaA).length) A = { ...A0, prescricoes: A0.prescricoes.map((p) => (trocaA[p.exercicio_id] ? { ...p, exercicio_id: trocaA[p.exercicio_id]! } : p)) };
  let s: AppState = { ...base, sessoes: base.sessoes.map((x) => (x.id === A0.id ? A : x)) };
  s = concluir(s, A0.id, regs(A0, aPlano, trocaA), snapshot);
  s = concluir(s, B0.id, regs(B0, histB), snapshot);
  return s;
}
const resumoEst = (s: AppState) => s.estados.slice().sort((a, b) => a.exercicio_id.localeCompare(b.exercicio_id));
const decs = (s: AppState) => s.decisoes.map((d) => ({ ...d, id: "", data: "" })).sort((a, b) => (a.sessao_id + a.exercicio_id).localeCompare(b.sessao_id + b.exercicio_id));
const vols = (s: AppState) => s.volumes_semanais.slice().sort((a, b) => (a.semana_iso + a.grupo).localeCompare(b.semana_iso + b.grupo));
const est = (s: AppState, ex: string) => s.estados.find((e) => e.exercicio_id === ex)!;

// ——— Com snapshot ———
const S = historia(histA);
ok(!!S.sessoes.find((x) => x.id === A0.id)?.snapshot_conclusao, "concluir grava snapshot");
ok(S.decisoes.length === 4, "4 decisões (2 exercícios × 2 sessões)");
ok(est(S, ex2).alvo_proxima_sessao.carga_kg !== undefined, "estado do exercício ancorado existe");

// idempotência: replay sem edição
const regsA = S.registros.filter((r) => r.sessao_id === A0.id);
const rep = recalcularAPartirDe(S, A0.id, regsA, A0.prescricoes).state;
ok(mesmo(rep.estados, S.estados), "replay sem edição: estados iguais (ignora carimbos de tempo)");
ok(mesmo(rep.decisoes, S.decisoes), "replay sem edição: decisões iguais");
ok(mesmo(rep.sessoes, S.sessoes), "replay sem edição: sessões/snapshots iguais");
const noop = aplicarCorrecao(S, rascunhoCorrecaoDaSessao(S, A0.id));
ok(noop.ok && noop.state === S, "salvar sem mudar nada = no-op");
ok(!previaCorrecao(S, rascunhoCorrecaoDaSessao(S, A0.id)).mudou, "prévia sem mudança: nada a confirmar");

// editar top/carga de ex1 no A (40 → 50 kg, reps 12) e ex2 (30 → 35)
let r = rascunhoCorrecaoDaSessao(S, A0.id);
const i1 = r.itens.findIndex((i) => i.exercicio_id === ex1);
const i2 = r.itens.findIndex((i) => i.exercicio_id === ex2);
for (let j = 0; j < 3; j++) r = editarSerie(r, i1, j, { carga_kg: 50, reps: 12 });
for (let j = 0; j < 3; j++) r = editarSerie(r, i2, j, { carga_kg: 35 });
const prev = previaCorrecao(S, r);
ok(prev.mudou && prev.linhas.some((l) => l.includes("40 kg × 10, RIR 2 → 50 kg × 12, RIR 2")), "resumo mostra a série corrigida");
const res = aplicarCorrecao(S, r, "2026-10-29T10:00:00.000Z");
ok(res.ok, "correção aplicada");
const T = historia({ [ex1]: tres(50, 12), [ex2]: tres(35, 12) });
const Sc = res.ok ? res.state : S;
ok(mesmo(resumoEst(Sc), resumoEst(T)), "estados = refazer a história do zero com o registro corrigido");
ok(mesmo(decs(Sc), decs(T)), "decisões (A e B) = verdade");
ok(mesmo(vols(Sc), vols(T)), "volume semanal = verdade");
ok(est(Sc, ex1).e1rm_estimado_kg > est(S, ex1).e1rm_estimado_kg, "e1RM recalculado (subiu)");
ok(est(Sc, ex1).pr_carga_kg === est(T, ex1).pr_carga_kg, "PR recalculado");
const dB = (s: AppState) => s.decisoes.find((d) => d.sessao_id === B0.id && d.exercicio_id === ex1)!;
const antesB = (s: AppState) => s.sessoes.find((x) => x.id === B0.id)!.snapshot_conclusao!.estados_antes.find((e) => e.exercicio_id === ex1)!;
ok(antesB(Sc).e1rm_estimado_kg > antesB(S).e1rm_estimado_kg && mesmo(antesB(Sc), antesB(T)), "cascata: sessão seguinte reaplicada a partir do novo estado");
ok(est(Sc, ex1).alvo_proxima_sessao.carga_kg === est(T, ex1).alvo_proxima_sessao.carga_kg, "próxima carga recalculada");
ok(dB(Sc).carga_anterior_kg === dB(T).carga_anterior_kg, "âncora/top da sessão seguinte reproduzidos");
const dB2 = (s: AppState) => s.decisoes.find((d) => d.sessao_id === B0.id && d.exercicio_id === ex2)!;
ok(dB2(Sc).carga_anterior_kg === ANCORA_B, "âncora de aquecimento do treino seguinte preservada no replay");
ok(Sc.registros.filter((x) => x.sessao_id === B0.id).length === S.registros.filter((x) => x.sessao_id === B0.id).length, "registros do treino seguinte intactos");
ok(validarCorrecoesNoEstado(Sc) === null && AppStateSchema.safeParse(Sc).success, "estado corrigido passa no schema e na validação de servidor");
const futuras = Sc.sessoes.filter((x) => x.status === "planejada" && x.prescricoes.some((p) => p.exercicio_id === ex1));
ok(futuras.every((x) => x.prescricoes.find((p) => p.exercicio_id === ex1)!.carga.trabalho_kg === est(Sc, ex1).alvo_proxima_sessao.carga_kg), "treinos planejados recebem a nova carga");

// replay idempotente depois da correção
const rep2 = recalcularAPartirDe(Sc, A0.id, Sc.registros.filter((x) => x.sessao_id === A0.id), Sc.sessoes.find((x) => x.id === A0.id)!.prescricoes).state;
ok(mesmo(rep2.estados, Sc.estados) && mesmo(rep2.decisoes, Sc.decisoes), "replay após correção é idempotente");

// desfazer exato
ok(podeDesfazerCorrecao(Sc, A0.id), "pode desfazer");
const u = desfazerCorrecao(Sc, A0.id);
const semCorr = (s: AppState) => ({ ...s, correcoes_concluidas: undefined });
ok(u.ok && JSON.stringify(semCorr(u.state)) === JSON.stringify(semCorr(S)), "desfazer restaura sessão e estado derivado exatamente");

// remover exercício
let rr = removerExercicioCorrecao(rascunhoCorrecaoDaSessao(S, A0.id), i1);
const resR = aplicarCorrecao(S, rr);
const TR = historia({ [ex2]: tres(30, 12) }, true, {}, true);
ok(resR.ok && mesmo(resumoEst(resR.state), resumoEst(TR)), "remover exercício: estados = verdade");
ok(resR.ok && mesmo(decs(resR.state), decs(TR)), "remover exercício: decisões = verdade");
ok(resR.ok && mesmo(vols(resR.state), vols(TR)), "remover exercício: volume = verdade");

// trocar exercício
const alt = alternativasParaItem(S, { sessao_id: A0.id, data: A0.data, itens: A0.prescricoes.map((p) => ({ exercicio_id: p.exercicio_id, series: 3, faixa_reps: [8, 12] as [number, number] })) }, i1)
  .find((e) => !B0.prescricoes.some((p) => p.exercicio_id === e.id) && !A0.prescricoes.some((p) => p.exercicio_id === e.id));
ok(!!alt, "há alternativa para trocar");
if (alt) {
  // sem estado prévio: ganha um a partir do que foi feito
  const resN = aplicarCorrecao(S, trocarExercicioCorrecao(rascunhoCorrecaoDaSessao(S, A0.id), i1, alt.id));
  ok(resN.ok && (resN.state.estados.find((e) => e.exercicio_id === alt.id)?.e1rm_estimado_kg ?? 0) > 0, "trocar para exercício sem histórico cria o estado dele");
  // com estado prévio: compara com a verdade
  const estAlt = { ...g.estados.find((e) => e.exercicio_id === ex1)!, exercicio_id: alt.id, carga_atual_kg: 22.5, alvo_proxima_sessao: { ...g.estados.find((e) => e.exercicio_id === ex1)!.alvo_proxima_sessao, carga_kg: 22.5 } };
  const baseOrig = base.estados;
  base.estados = [...baseOrig, estAlt];
  const S2 = historia(histA);
  rr = trocarExercicioCorrecao(rascunhoCorrecaoDaSessao(S2, A0.id), i1, alt.id);
  const resT = aplicarCorrecao(S2, rr);
  const TT = historia(histA, true, { [ex1]: alt.id });
  base.estados = baseOrig;
  ok(resT.ok && mesmo(resumoEst(resT.state), resumoEst(TT)), "trocar exercício: estados = verdade");
  ok(resT.ok && mesmo(decs(resT.state), decs(TT)), "trocar exercício: decisões = verdade");
  ok(resT.ok && mesmo(vols(resT.state), vols(TT)), "trocar exercício: volume = verdade");
  ok(resT.ok && resT.state.registros.filter((x) => x.sessao_id === A0.id && x.exercicio_id === alt.id).length === 3, "registros foram para o exercício novo");
}

// limites
let rx = editarSerie(rascunhoCorrecaoDaSessao(S, A0.id), 0, 0, { carga_kg: -1 });
ok(validarRascunhoCorrecao(S, rx) !== null, "kg negativo recusado");
rx = editarSerie(rascunhoCorrecaoDaSessao(S, A0.id), 0, 0, { reps: 101 });
ok(validarRascunhoCorrecao(S, rx) !== null, "reps > 100 recusado");
rx = editarSerie(rascunhoCorrecaoDaSessao(S, A0.id), 0, 0, { rir_percebido: 11 });
ok(validarRascunhoCorrecao(S, rx) !== null, "RIR > 10 recusado");

// sessão seguinte sem snapshot: cascata para nela e avisa
{
  let s: AppState = concluir(base, A0.id, regs(A0, histA), true);
  s = concluir(s, B0.id, regs(B0, histB), false);
  let r2 = rascunhoCorrecaoDaSessao(s, A0.id);
  for (let j = 0; j < 3; j++) r2 = editarSerie(r2, i1, j, { carga_kg: 50, reps: 12 });
  const rs = aplicarCorrecao(s, r2);
  ok(rs.ok && rs.avisos.some((a) => a.includes("só até ele")), "sessão seguinte sem snapshot: aviso de recálculo parcial");
  ok(rs.ok && mesmo(est(rs.state, ex1), est(s, ex1)), "estado final mantido quando a cascata para");
  ok(rs.ok && rs.state.decisoes.find((d) => d.sessao_id === A0.id && d.exercicio_id === ex1)!.nova_carga_kg >= 0, "decisão do treino corrigido refeita");
}

// ——— Sem snapshot (treinos antigos) ———
{
  const L = historia(histA, false);
  ok(!L.sessoes.find((x) => x.id === A0.id)?.snapshot_conclusao, "treino antigo sem snapshot");
  let r3 = rascunhoCorrecaoDaSessao(L, A0.id);
  for (let j = 0; j < 3; j++) r3 = editarSerie(r3, i1, j, { carga_kg: 50, reps: 12 });
  const pv = previaCorrecao(L, r3);
  ok(pv.avisos.includes(AVISO_SEM_SNAPSHOT), "aviso humano de treino antigo");
  const rl = aplicarCorrecao(L, r3);
  ok(rl.ok && JSON.stringify(rl.state.estados) === JSON.stringify(L.estados), "sem snapshot: EstadoExercicio intacto");
  ok(rl.ok && JSON.stringify(rl.state.decisoes) === JSON.stringify(L.decisoes), "sem snapshot: decisões intactas");
  ok(rl.ok && rl.state.registros.filter((x) => x.sessao_id === A0.id && x.exercicio_id === ex1).every((x) => x.carga_kg === 50), "sem snapshot: registro corrigido");
  const rr4 = removerExercicioCorrecao(rascunhoCorrecaoDaSessao(L, A0.id), i1);
  const rl2 = aplicarCorrecao(L, rr4);
  const TL = historia({ [ex2]: tres(30, 12) }, false, {}, true);
  ok(rl2.ok && mesmo(vols(rl2.state), vols(TL)), "sem snapshot: volume recalculado a partir dos registros");
  ok(rl2.ok && JSON.stringify(rl2.state.estados) === JSON.stringify(L.estados), "sem snapshot: remover não mexe no estado");
  const ul = rl.ok ? desfazerCorrecao(rl.state, A0.id) : null;
  ok(!!ul && ul.ok && JSON.stringify({ ...ul.state, correcoes_concluidas: undefined }) === JSON.stringify({ ...L, correcoes_concluidas: undefined }), "sem snapshot: desfazer exato");
}

// telas sem jargão
const textos = JSON.stringify([prev.linhas, prev.avisos, AVISO_SEM_SNAPSHOT]);
ok(!/motor|R\d{1,2}\b|_id|subir_carga/.test(textos), "textos sem jargão");

console.log(fail ? `\n${fail} FAIL` : "\nOK");
process.exit(fail ? 1 : 0);
