/** Smoke: botão de edição da Hoje → alvo certo por estado da sessão (planejada/concluída/em andamento). */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { AppStateSchema, type AppState, type Perfil } from "../src/lib/domain";
import { alvoEditarHoje } from "../src/lib/plan/hoje-editar";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const perfil: Perfil = {
  id: "smoke-hoje", peso_kg: 80, altura_cm: 178, experiencia: "intermediario",
  dias_por_semana: 4, minutos_por_sessao: 60, cardio_min_semana: 0,
  equipamentos: ["barra", "halteres", "maquina", "cabo"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: "2026-10-01T10:00:00.000Z",
  parq_respostas: [false, false, false, false, false, false, false], criado_em: "2026-10-01T10:00:00.000Z",
};
const g = gerarPlanoFromPerfil(perfil, CATALOG_EXERCICIOS);
const base: AppState = AppStateSchema.parse({
  perfil, exercicios: CATALOG_EXERCICIOS, guias: [], plano: g.plano, sessoes: g.sessoes, registros: [], estados: g.estados,
  checkins: [], alertas: [], decisoes: [], volumes_semanais: [], active_sessao_id: null, logger_prescricao_id: null,
});
const ids = base.plano!.sessoes;
ok(ids.length >= 3, "plano tem sessões");
const st: AppState = structuredClone(base);
st.sessoes.find((s) => s.id === ids[0])!.status = "concluida";
const sa = st.sessoes.find((s) => s.id === ids[1])!; sa.status = "em_andamento"; st.active_sessao_id = sa.id;
const a0 = alvoEditarHoje(st, ids[0]), a1 = alvoEditarHoje(st, ids[1]), a2 = alvoEditarHoje(st, ids[2]);
ok(a0?.modo === "corrigir" && a0.label === "Corrigir registro", "concluída → Corrigir registro");
ok(a1?.modo === "bloqueado" && !!(a1 as any).motivo, "em andamento → bloqueia com mensagem");
ok(a2?.modo === "editar" && a2.label === "Editar treino" && a2.sessaoId === ids[2], "planejada → Editar treino");
ok(alvoEditarHoje(st, null) === null && alvoEditarHoje(st, "nao-existe") === null, "sem sessão → sem botão");
const antes = JSON.stringify(st); alvoEditarHoje(st, ids[2]); ok(JSON.stringify(st) === antes, "não altera o estado");
const tela = [a0, a1, a2].map((a) => a!.label + ((a as any).motivo ?? "")).join(" ");
ok(!/motor|_id|em_andamento|concluida/.test(tela), "texto humano");
console.log(fail ? `FAIL ${fail}` : "ALL PASS"); process.exit(fail ? 1 : 0);
