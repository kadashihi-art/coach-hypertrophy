/** Smoke: refazer onboarding — cancelar não grava nada; confirmar preserva estados; PAR-Q vale. */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { remountPlano } from "../src/lib/plan/remount-plano";
import { cancelarRefazer, emModoRefazer, patchConfirmarRefazer } from "../src/lib/plan/refazer";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import type { AppState, Perfil } from "../src/lib/domain";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

const perfil: Perfil = {
  id: "smoke-refazer", peso_kg: 80, altura_cm: 178, experiencia: "intermediario",
  dias_por_semana: 4, minutos_por_sessao: 60, cardio_min_semana: 60,
  equipamentos: ["barra", "halteres", "maquina", "cabo"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: new Date().toISOString(),
  parq_respostas: [false, false, false, false, false, false, false], criado_em: new Date().toISOString(),
};
const g = gerarPlanoFromPerfil(perfil, CATALOG_EXERCICIOS);
const state = {
  perfil, plano: g.plano, sessoes: g.sessoes, estados: g.estados,
  registros: [{ id: "r1", marker: "historico" }], volumes_semanais: g.volumes_semanais,
  exercicios: CATALOG_EXERCICIOS,
} as unknown as AppState;
const snap = JSON.stringify(state);

ok(emModoRefazer("?refazer=1", perfil), "?refazer=1 com onboarding concluído → modo refazer");
ok(!emModoRefazer("?refazer=1", { ...perfil, onboarding_concluido: false }), "sem onboarding concluído → fluxo normal");
ok(!emModoRefazer("", perfil), "sem param → fluxo normal");

const depois = cancelarRefazer(state);
ok(depois === state && JSON.stringify(depois) === snap, "cancelar refazer: estado idêntico (nada gravado, sem reset)");

const bloqueado = patchConfirmarRefazer({ ...perfil, parq_liberado: false, parq_respostas: [true, false, false, false, false, false, false] });
ok(!bloqueado.ok, "PAR-Q com SIM no refazer → confirmar recusado");

const novo = patchConfirmarRefazer({ ...perfil, dias_por_semana: 3 });
ok(novo.ok && novo.patch.onboarding_concluido === true && !("id" in novo.patch), "confirmar → patch sem id, onboarding_concluido");

(async () => {
  if (novo.ok) {
    const r = await remountPlano({ perfil: { ...perfil, ...novo.patch }, catalog: CATALOG_EXERCICIOS, estadosAnteriores: state.estados, skipLlm: true });
    const mantidos = r.estados.filter((e) => state.estados.some((a) => a.exercicio_id === e.exercicio_id));
    ok(mantidos.length > 0, `confirmar preserva EstadoExercicio dos mantidos (${mantidos.length})`);
    ok(!("registros" in r), "remount não toca histórico de treinos");
  }
  ok(JSON.stringify(state) === snap, "estado original intacto após simulações");
  console.log(fail ? `FAILED ${fail}` : "ALL OK");
  process.exit(fail ? 1 : 0);
})();
