/**
 * smoke:limites — limites de entrada (item 3 da auditoria).
 * Limites só na entrada/edição e em registros novos; dados antigos fora dos limites continuam carregando.
 */
import { readFileSync } from "node:fs";
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { AppStateSchema, type AppState, type Perfil, type RegistroSerie } from "../src/lib/domain";
import {
  avisoSaltoCarga, cargaMaxKg, validarAltura, validarCarga, validarEntradasNovas, validarFaixaReps, validarPeso, validarReps,
} from "../src/lib/domain/limites";
import { editarSerie, rascunhoCorrecaoDaSessao, validarRascunhoCorrecao } from "../src/lib/plan/corrigir-concluida";
import { concluirSessao } from "../src/lib/engine/concluir-sessao";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

// (1) validadores puros
ok(validarCarga(80, "agachamento") === null, "80 kg no agachamento passa");
ok(validarCarga(-5, "agachamento") !== null, "carga negativa bloqueada");
ok(validarCarga(NaN, "agachamento") !== null, "carga não numérica bloqueada");
ok(validarCarga(600, "agachamento") !== null && cargaMaxKg("agachamento") === 500, "600 kg no agachamento bloqueado (limite 500)");
ok(validarCarga(150, "flexao_cotovelo") !== null && validarCarga(60, "flexao_cotovelo") === null, "rosca: 150 bloqueado, 60 passa");
ok(validarCarga(250, "padrao_inexistente") === null && validarCarga(350, "padrao_inexistente") !== null, "padrão desconhecido usa 300 kg");
ok(validarReps(0) !== null && validarReps(1) === null && validarReps(100) === null && validarReps(101) !== null, "reps no logger: 1 a 100");
ok(validarReps(8.5) !== null, "reps fracionadas bloqueadas");
ok(validarFaixaReps(12, 8) !== null && validarFaixaReps(8, 12) === null && validarFaixaReps(10, 10) === null, "faixa exige mínimo ≤ máximo");
ok(validarPeso(20) !== null && validarPeso(300) !== null && validarPeso(82) === null, "peso: 35 a 250 kg");
ok(validarAltura(100) !== null && validarAltura(250) !== null && validarAltura(178) === null, "altura: 130 a 230 cm");

// (2) aviso de +40%
ok(avisoSaltoCarga(58, 40) === "Isso é 45% acima da sua última carga (40 kg). Confirma?", "58 kg vs 40 kg → aviso de 45%");
ok(avisoSaltoCarga(56, 40) === null, "56 kg vs 40 kg (+40% exato) → sem aviso");
ok(avisoSaltoCarga(100, null) === null && avisoSaltoCarga(100, 0) === null, "sem histórico → sem aviso");
ok(avisoSaltoCarga(30, 40) === null, "carga menor → sem aviso");
const txt = avisoSaltoCarga(58, 40)!;
ok(!/motor/i.test(txt) && !/_/.test(txt), "texto sem 'motor' e sem ids");

// (3) estado antigo fora dos limites continua carregando (mesmo schema da leitura)
const perfil: Perfil = {
  id: "smoke-lim", peso_kg: 80, altura_cm: 178, experiencia: "intermediario",
  dias_por_semana: 4, minutos_por_sessao: 60, cardio_min_semana: 0,
  equipamentos: ["barra", "halteres", "maquina", "cabo"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: "2026-10-01T10:00:00.000Z",
  parq_respostas: [false, false, false, false, false, false, false], criado_em: "2026-10-01T10:00:00.000Z",
};
const g = gerarPlanoFromPerfil(perfil, CATALOG_EXERCICIOS);
const A0 = { ...g.sessoes[0]!, data: "2026-10-21" };
const p1 = A0.prescricoes[0]!;
const exAgach = CATALOG_EXERCICIOS.find((e) => e.id === p1.exercicio_id)!;
const reg = (id: string, kg: number, reps: number): RegistroSerie => ({
  id, sessao_id: A0.id, prescricao_id: p1.id, exercicio_id: p1.exercicio_id, numero: 1,
  tipo_serie: "trabalho", carga_kg: kg, reps, rir_percebido: 2, dor: false, executado_em: "2026-10-21T12:00:00.000Z",
});
const max = cargaMaxKg(exAgach.padrao);
const legado = {
  perfil: { ...perfil, peso_kg: 20, altura_cm: 300 },
  exercicios: CATALOG_EXERCICIOS, guias: [], plano: g.plano,
  sessoes: [{ ...A0, prescricoes: A0.prescricoes.map((p, i) => (i === 0 ? { ...p, faixa_reps: [12, 8] } : p)) }, ...g.sessoes.slice(1)],
  registros: [reg("old-1", max + 400, 150), reg("old-2", 40, 8)],
  estados: g.estados, checkins: [], alertas: [], decisoes: [], volumes_semanais: [], active_sessao_id: null, logger_prescricao_id: null,
};
const lido = AppStateSchema.safeParse(legado);
ok(lido.success, "estado antigo com kg/reps/peso/altura/faixa fora dos limites continua válido na leitura");
const userState = readFileSync(new URL("../src/lib/user-state.ts", import.meta.url), "utf8");
ok(/AppStateSchema\.safeParse\(raw\.state\)/.test(userState) && !/limites/.test(userState), "leitura do estado segue o mesmo schema, sem limites novos");
const old = lido.data as AppState;
ok(old.registros[0]!.carga_kg === max + 400 && old.perfil!.peso_kg === 20, "valores antigos preservados como estavam");

// (4) servidor: só valida o que é novo ou mudou
ok(validarEntradasNovas(old, old) === null, "salvar de novo sem mexer nos antigos passa");
ok(validarEntradasNovas(old, { ...old, checkins: [] }) === null, "outra alteração qualquer não esbarra nos dados antigos");
ok(validarEntradasNovas(old, { ...old, registros: [...old.registros, reg("new-1", 60, 10)] }) === null, "série nova plausível passa");
ok(validarEntradasNovas(old, { ...old, registros: [...old.registros, reg("new-2", max + 1, 10)] }) !== null, "série nova acima do limite é recusada");
ok(validarEntradasNovas(old, { ...old, registros: [...old.registros, reg("new-3", 60, 101)] }) !== null, "série nova com 101 reps é recusada");
ok(validarEntradasNovas(old, { ...old, registros: old.registros.map((r) => (r.id === "old-2" ? { ...r, carga_kg: -1 } : r)) }) !== null, "editar série antiga pra valor impossível é recusado");
ok(validarEntradasNovas(old, { ...old, perfil: { ...old.perfil!, peso_kg: 300 } }) !== null, "peso novo impossível recusado");
ok(validarEntradasNovas(old, { ...old, perfil: { ...old.perfil!, peso_kg: 81 } }) === null, "peso novo plausível passa (altura antiga fora do limite não trava)");
ok(validarEntradasNovas(null, { ...old, registros: [reg("n", 60, 10)], perfil: perfil }) === null, "conta nova com valores plausíveis passa");

// (5) correção de treino concluído bloqueia valor impossível com mensagem clara
const base: AppState = AppStateSchema.parse({ ...legado, perfil, sessoes: [A0, ...g.sessoes.slice(1)], registros: [] });
const st: AppState = { ...base, active_sessao_id: A0.id, sessoes: base.sessoes.map((x) => (x.id === A0.id ? { ...x, status: "em_andamento" as const } : x)), registros: [reg("c-1", 60, 10)] };
const done = concluirSessao(st, { gravarSnapshot: true, agora: "2026-10-21T13:00:00.000Z" }).state;
const r0 = rascunhoCorrecaoDaSessao(done, A0.id);
const i0 = r0.itens.findIndex((it) => it.exercicio_id === p1.exercicio_id);
const ruim = editarSerie(r0, i0, 0, { carga_kg: max + 50 });
const msg = validarRascunhoCorrecao(done, ruim);
ok(!!msg && msg.includes(`${max} kg`) && msg.includes(exAgach.nome), `correção acima do limite bloqueada: "${msg}"`);
ok(validarRascunhoCorrecao(done, editarSerie(r0, i0, 0, { carga_kg: 62.5 })) === null, "correção plausível passa");

console.log(fail ? `\n${fail} FAIL` : "\nsmoke:limites OK");
process.exit(fail ? 1 : 0);
