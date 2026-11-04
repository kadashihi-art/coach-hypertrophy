/** Smoke: editar exercício/treino DURANTE a sessão (lote 2). Lógica pura, sem gravar nada fora do estado em memória. */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { AppStateSchema, type AppState, type Perfil, type RegistroSerie, type TipoSerie } from "../src/lib/domain";
import { concluirSessao } from "../src/lib/engine/concluir-sessao";
import { cargaParaExercicio } from "../src/lib/plan/alternativa";
import { preparatoriasDaSessao, proximaFase } from "../src/lib/treino/estrutura-series";
import { sessaoEditavel } from "../src/lib/plan/editar-treino";
import {
  acaoRemover, adicionarAoVivo, ajustarCargaAoVivo, ajustarRepsAoVivo, ajustarSeriesAoVivo, alternativasAoVivo,
  aplicarEdicaoAoVivo, candidatosAoVivo, desfazerEdicaoAoVivo, desfazerTrocaNoRascunho, montarAoVivo, moverAoVivo,
  podeDesfazerAoVivo, podeEditarAoVivo, podeMover, rascunhoAoVivo, removerAoVivo, trocarAoVivo, validarEdicaoAoVivoNoEstado,
} from "../src/lib/treino/editar-durante-treino";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const C = CATALOG_EXERCICIOS;
const perfil: Perfil = {
  id: "smoke-aovivo", peso_kg: 80, altura_cm: 178, experiencia: "intermediario",
  dias_por_semana: 4, minutos_por_sessao: 60, cardio_min_semana: 0,
  equipamentos: ["barra", "halteres", "maquina", "cabo"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: new Date().toISOString(),
  parq_respostas: [false, false, false, false, false, false, false], criado_em: new Date().toISOString(),
};
const g = gerarPlanoFromPerfil(perfil, C);
const sessoes = g.sessoes.map((s, i) => ({ ...s, data: `2026-11-0${2 + i}` }));
const base: AppState = AppStateSchema.parse({
  perfil, exercicios: C, guias: [], plano: g.plano, sessoes, registros: [], estados: g.estados,
  checkins: [], alertas: [], decisoes: [], volumes_semanais: g.volumes_semanais, active_sessao_id: null, logger_prescricao_id: null,
});
ok(!podeEditarAoVivo(base) && rascunhoAoVivo(base) === null, "sem treino em andamento não abre edição ao vivo");

const sid = base.plano!.sessoes[0]!;
const sess0 = base.sessoes.find((s) => s.id === sid)!;
let st: AppState = {
  ...base,
  active_sessao_id: sid,
  logger_prescricao_id: sess0.prescricoes[0]!.id,
  sessoes: base.sessoes.map((s) => (s.id === sid ? { ...s, status: "em_andamento" as const, data: "2026-11-02" } : s)),
};
ok(podeEditarAoVivo(st), "treino em andamento abre edição ao vivo");
ok(!sessaoEditavel(st, sid), "editor do Plano continua bloqueado pra sessão em andamento");

let n = 0;
const log = (s: AppState, prescId: string, tipo: TipoSerie, kg: number, reps: number, rir = 2): AppState => {
  const p = s.sessoes.find((x) => x.id === sid)!.prescricoes.find((x) => x.id === prescId)!;
  const r: RegistroSerie = { id: `r${++n}`, sessao_id: sid, prescricao_id: p.id, exercicio_id: p.exercicio_id, numero: n, tipo_serie: tipo, carga_kg: kg, reps, rir_percebido: rir, dor: false, executado_em: `2026-11-02T10:${String(n).padStart(2, "0")}:00Z` };
  return { ...s, registros: [...s.registros, r] };
};

// Primeiro exercício com séries suficientes p/ trocar no meio (força 4 séries)
const p0 = sess0.prescricoes[0]!;
st = { ...st, sessoes: st.sessoes.map((s) => (s.id === sid ? { ...s, prescricoes: s.prescricoes.map((p) => (p.id === p0.id ? { ...p, series: 4 } : p)) } : s)) };
const est0 = st.estados.find((e) => e.exercicio_id === p0.exercicio_id)!;
const kg0 = est0.carga_atual_kg || 40;
st = log(st, p0.id, "aquecimento", Math.round(kg0 * 0.6), 10, 4);
st = log(st, p0.id, "feeder", Math.round(kg0 * 0.85), 3, 4);
st = log(st, p0.id, "trabalho", kg0, p0.faixa_reps[0] + 1);
st = log(st, p0.id, "trabalho", kg0, p0.faixa_reps[0] + 1);
const regsAntes = JSON.stringify(st.registros);
const estadosAntes = JSON.stringify(st.estados);

// ── trocar no meio ──
let r = rascunhoAoVivo(st)!;
const alts = alternativasAoVivo(st, r, 0);
ok(alts.length > 0, `há alternativas pro 1º exercício (${alts.length})`);
ok(alts.every((e) => !r.itens.some((i) => i.exercicio_id === e.id)), "alternativas não repetem exercício do treino");
const alvo = alts[0]!;
r = trocarAoVivo(st, r, 0, alvo.id);
ok(r.itens[0]!.trocar_para === alvo.id, "troca entra no rascunho");
ok(desfazerTrocaNoRascunho(r, 0).itens[0]!.trocar_para === null, "desfazer troca no rascunho");
ok(ajustarSeriesAoVivo(st, r, 0, 1).itens[0]!.series === 3, "trocado no meio: não dá pra ficar sem série pro novo (mín. feitas + 1)");
const m = montarAoVivo(st, r, "t")!;
const [pa, pb] = m.prescricoes;
ok(pa!.id === p0.id && pa!.exercicio_id === p0.exercicio_id && pa!.series === 2, "original fica com as 2 séries de trabalho feitas");
ok(pb!.exercicio_id === alvo.id && pb!.series === 2, "novo entra logo depois com as 2 que faltavam");
ok(pb!.carga.trabalho_kg === cargaParaExercicio(st, alvo.id, pb!.carga.trabalho_kg).carga_kg, "kg do novo vem da memória de carga do Coach");
ok(m.logger_prescricao_id === pb!.id, "logger segue pro exercício novo");
ok(m.linhas.some((l) => l.startsWith("Trocado:")) && m.linhas.every((l) => !/motor|presc-|_/.test(l)), "resumo humano, sem 'motor' nem ids");
const prepsT = preparatoriasDaSessao(m.prescricoes, C);
ok(prepsT[1] === (alvo.grupo_primario !== C.find((e) => e.id === p0.exercicio_id)!.grupo_primario), "troca do mesmo músculo vai direto pro trabalho");
const res1 = aplicarEdicaoAoVivo(st, r);
ok(res1.ok, "aplicar troca");
if (!res1.ok) process.exit(1);
const s1 = res1.state;
ok(JSON.stringify(s1.registros) === regsAntes, "séries já registradas não mudam (ficam no exercício original)");
ok(s1.registros.filter((x) => x.prescricao_id === p0.id).every((x) => x.exercicio_id === p0.exercicio_id), "registros continuam com o exercício original");
ok(proximaFase(pa!, true, s1.registros.filter((x) => x.prescricao_id === p0.id)) === null, "original aparece como concluído no logger");
ok(podeDesfazerAoVivo(s1), "Desfazer disponível logo após confirmar");
const und = desfazerEdicaoAoVivo(s1);
ok(und.ok && JSON.stringify(und.state.sessoes) === JSON.stringify(st.sessoes) && JSON.stringify(und.state.estados) === estadosAntes, "Desfazer volta exatamente ao treino anterior");
const pbReal = s1.sessoes.find((x) => x.id === sid)!.prescricoes.find((x) => x.exercicio_id === alvo.id)!;
ok(s1.logger_prescricao_id === pbReal.id, "logger aponta pro exercício novo depois de confirmar");
const s1log = log(s1, pbReal.id, "trabalho", pbReal.carga.trabalho_kg, 10);
ok(!podeDesfazerAoVivo(s1log) && !desfazerEdicaoAoVivo(s1log).ok, "Desfazer some depois de registrar série no exercício novo");

// ── progressão: troca no meio não vira falha ──
const fim = concluirSessao({ ...s1log }, { gravarSnapshot: false, agora: "2026-11-02T12:00:00Z" }).state;
const eA = fim.estados.find((e) => e.exercicio_id === p0.exercicio_id)!;
ok(eA.carga_atual_kg >= est0.carga_atual_kg, `carga do original não cai por causa da troca (${est0.carga_atual_kg} → ${eA.carga_atual_kg})`);
ok(eA.pr_carga_kg === kg0 && eA.pr_reps === p0.faixa_reps[0] + 1, "PR só de séries de trabalho (aquecimento/aproximação fora)");
const eB = fim.estados.find((e) => e.exercicio_id === alvo.id);
ok(!!eB && eB.pr_reps === 10, "novo exercício tem histórico próprio");

// ── séries, reps, carga ──
r = rascunhoAoVivo(st)!;
ok(ajustarSeriesAoVivo(st, r, 0, 1).itens[0]!.series === 2, "não tira séries já feitas");
ok(ajustarSeriesAoVivo(st, r, 0, 5).itens[0]!.series === 5, "acrescenta série depois da última");
const i1 = 1;
const p1 = sess0.prescricoes[1]!;
let r2 = ajustarRepsAoVivo(r, i1, 6, 8);
r2 = ajustarCargaAoVivo(r2, i1, 33.3);
const m2 = montarAoVivo(st, r2, "c")!;
const q = m2.prescricoes.find((p) => p.id === p1.id)!;
ok(q.faixa_reps[0] === 6 && q.faixa_reps[1] === 8, "reps das próximas ajustadas");
ok((q.carga.top_set_kg ?? q.carga.trabalho_kg) === 33.3 && q.carga.origem === "usuario", "carga das próximas marcada como ajuste seu");
const s2 = aplicarEdicaoAoVivo(st, r2);
ok(s2.ok && JSON.stringify(s2.state.estados) === estadosAntes, "ajuste não mexe na memória de carga (progressão usa o que for feito)");

// ── adicionar (aquecimento por grupo) ──
r = rascunhoAoVivo(st)!;
const gruposNoTreino = new Set(sess0.prescricoes.map((p) => C.find((e) => e.id === p.exercicio_id)!.grupo_primario));
const cands = candidatosAoVivo(st, r);
const novoOutro = cands.find((e) => !gruposNoTreino.has(e.grupo_primario))!;
const g0 = C.find((e) => e.id === p0.exercicio_id)!.grupo_primario;
const novoMesmo = cands.find((e) => e.grupo_primario === g0 && !e.composto) ?? cands.find((e) => e.grupo_primario === g0)!;
let r3 = adicionarAoVivo(st, r, novoOutro.id, "fim");
r3 = adicionarAoVivo(st, r3, novoMesmo.id, "depois_atual");
ok(r3.itens[1]!.exercicio_id === novoMesmo.id && r3.itens.at(-1)!.exercicio_id === novoOutro.id, "adiciona depois do atual e no fim");
ok(adicionarAoVivo(st, r3, novoOutro.id, "fim").itens.length === r3.itens.length, "não duplica exercício");
const m3 = montarAoVivo(st, r3, "a")!;
const pr3 = preparatoriasDaSessao(m3.prescricoes, C);
ok(pr3[1] === false, "mesmo músculo já aquecido → direto pro trabalho");
ok(pr3[m3.prescricoes.length - 1] === true, "músculo novo → aquecimento + aproximação");
ok(m3.linhas.some((l) => l.includes("aquecimento + aproximação")) && m3.linhas.some((l) => l.includes("direto pras séries")), "resumo explica o aquecimento");
const s3 = aplicarEdicaoAoVivo(st, r3);
ok(s3.ok && s3.state.sessoes.find((s) => s.id === sid)!.prescricoes.length === sess0.prescricoes.length + 2, "aplica os 2 adicionados");
if (s3.ok) {
  const novos = s3.state.edicao_ao_vivo!.estados_criados;
  const und3 = desfazerEdicaoAoVivo(s3.state);
  ok(und3.ok && novos.every((id) => !und3.state.estados.some((e) => e.exercicio_id === id)), "Desfazer tira os estados criados");
}

// ── remover / encerrar ──
r = rascunhoAoVivo(st)!;
const ult = r.itens.length - 1;
ok(acaoRemover(st, r, ult) === "remover" && acaoRemover(st, r, 0) === "encerrar", "não começado → remover; com série → só encerrar aqui");
const r4 = removerAoVivo(st, removerAoVivo(st, r, ult), 0);
const m4 = montarAoVivo(st, r4, "x")!;
ok(!m4.prescricoes.some((p) => p.id === sess0.prescricoes[ult]!.id) && m4.removidas.includes(sess0.prescricoes[ult]!.id), "remove o não começado (e avisa pra cancelar o descanso dele)");
ok(m4.prescricoes.find((p) => p.id === p0.id)!.series === 2, "encerrar aqui fica com as séries feitas");
ok(m4.logger_prescricao_id === sess0.prescricoes[1]!.id, "logger pula pro próximo pendente");

// ── reordenar ──
ok(!podeMover(st, r, 0, 1) && !podeMover(st, r, 1, -1), "o que já começou não sai do lugar");
const r5 = moverAoVivo(st, r, 1, 1);
ok(r5.itens[1]!.exercicio_id === r.itens[2]!.exercicio_id && r5.itens[2]!.exercicio_id === r.itens[1]!.exercicio_id, "troca a ordem dos que faltam");

// ── nada salva sem confirmar / esquema ──
ok(aplicarEdicaoAoVivo(st, rascunhoAoVivo(st)!).ok === false, "sem mudança não salva");
ok(st.edicao_ao_vivo === undefined, "montar prévia não grava nada");
const velho = AppStateSchema.safeParse(JSON.parse(JSON.stringify(base)));
ok(velho.success, "estado antigo (sem o campo novo) carrega");
const novo = AppStateSchema.safeParse(JSON.parse(JSON.stringify(s1)));
ok(novo.success && validarEdicaoAoVivoNoEstado(novo.data) === null, "estado com edição ao vivo passa no esquema e na validação do servidor");
const ruim = { ...s1, sessoes: s1.sessoes.map((s) => (s.id === sid ? { ...s, prescricoes: s.prescricoes.map((p) => ({ ...p, exercicio_id: "nao_existe" })) } : s)) };
ok(validarEdicaoAoVivoNoEstado(ruim) !== null, "servidor recusa exercício fora do catálogo");

console.log(fail ? `\n${fail} FAIL` : "\nTODOS PASS");
process.exit(fail ? 1 : 0);
