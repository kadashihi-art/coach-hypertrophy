/**
 * Smoke: perfil remount + data_inicio + pulada/proximaSessao + LLM stub path
 */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { remountPlano } from "../src/lib/plan/remount-plano";
import {
  agendarSessoes,
  marcarPulada,
} from "../src/lib/plan/calendario";
import { proximaSessao } from "../src/lib/plan/proxima-sessao";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import type { AppState, Perfil } from "../src/lib/domain";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fail++;
};

const base: Perfil = {
  id: "smoke-perfil",
  peso_kg: 80,
  altura_cm: 178,
  experiencia: "intermediario",
  dias_por_semana: 4,
  minutos_por_sessao: 60,
  cardio_min_semana: 60,
  equipamentos: ["barra", "halteres", "maquina", "cabo"],
  restricoes: [],
  objetivo: "hipertrofia",
  onboarding_concluido: true,
  parq_liberado: true,
  parq_respondido_em: new Date().toISOString(),
  parq_respostas: [false, false, false, false, false, false, false],
  criado_em: new Date().toISOString(),
};

const g1 = gerarPlanoFromPerfil(base, CATALOG_EXERCICIOS);
ok(!!g1.plano.id, `gerarPlano id=${g1.plano.id}`);
ok(g1.volumes_semanais.length === 0, "generate volumes empty (no fake progress)");

const patched: Perfil = {
  ...base,
  dias_por_semana: 3,
  objetivo: "forca",
  peso_kg: 85,
};
const g2 = gerarPlanoFromPerfil(patched, CATALOG_EXERCICIOS);
ok(g2.plano.id !== g1.plano.id, "perfil patch → novo plano id");
ok(g2.plano.divisao === "full_body", `3 dias → full_body (got ${g2.plano.divisao})`);
ok(g2.plano.mesociclo.data_inicio === null, "data_inicio null by default");

const inicio = "2026-11-03"; // Monday
const planoComInicio = {
  ...g2.plano,
  mesociclo: { ...g2.plano.mesociclo, data_inicio: inicio },
};
const scheduled = agendarSessoes(g2.sessoes, planoComInicio, inicio);
ok(
  scheduled.every((s) => s.data != null),
  "data_inicio → all sessoes have dates",
);
ok(scheduled[0]?.data === inicio, `first session on ${inicio}`);
ok(
  scheduled.filter((s) => s.data).length === g2.sessoes.length,
  "all sessions scheduled",
);

// "Começar hoje" num dia que já tem sessão concluída (de outro plano/histórico):
// a 1ª sessão nova vai pro próximo dia livre, espaçamento mantido, histórico intocado.
{
  const feita = { ...g1.sessoes[0]!, id: "hist-feita", status: "concluida" as const, data: inicio, finalizada_em: "2026-11-03T20:00:00.000Z" };
  const antes = [feita, ...g2.sessoes];
  const ag = agendarSessoes(antes, planoComInicio, inicio);
  const h = ag.find((s) => s.id === "hist-feita")!;
  ok(JSON.stringify(h) === JSON.stringify(feita), "concluída intocada");
  const novas = ag.filter((s) => s.id !== "hist-feita").sort((a, b) => a.ordem - b.ordem);
  ok(novas[0]!.data === "2026-11-04", `1ª nova no próximo dia livre (got ${novas[0]!.data})`);
  ok(novas.every((s) => s.data !== inicio), "nenhuma nova escondida atrás da concluída");
  const semConflito = scheduled.filter((s) => g2.sessoes.some((x) => x.id === s.id)).sort((a, b) => a.ordem - b.ordem);
  const delta = (xs: typeof novas) => xs.slice(1).map((s, i) => (Date.parse(s.data!) - Date.parse(xs[i]!.data!)) / 864e5);
  ok(JSON.stringify(delta(novas)) === JSON.stringify(delta(semConflito)), "espaçamento do plano mantido");
}

// Mark first as pulada → proximaSessao skips it
const afterSkip = marcarPulada(scheduled, scheduled[0]!.id);
const state: AppState = {
  perfil: patched,
  exercicios: CATALOG_EXERCICIOS,
  guias: [],
  plano: planoComInicio,
  sessoes: afterSkip,
  registros: [],
  estados: g2.estados,
  checkins: [],
  alertas: [],
  decisoes: [],
  volumes_semanais: [],
  active_sessao_id: null,
  logger_prescricao_id: null,
};
const prox = proximaSessao(state);
ok(!!prox, "proximaSessao returns something");
ok(
  prox?.id !== scheduled[0]!.id,
  `proximaSessao skips pulada (got ${prox?.id}, skipped ${scheduled[0]!.id})`,
);
ok(prox?.status !== "pulada", "proxima is not pulada");

async function main() {
  // LLM remount stub when no key
  delete process.env.COACH_LLM_API_KEY;
  delete process.env.COACH_LLM_BASE_URL;
  const rem = await remountPlano({
    perfil: patched,
    catalog: CATALOG_EXERCICIOS,
    estadosAnteriores: g1.estados,
    skipLlm: false, // still motor — no key
  });
  ok(rem.fonte === "motor", `LLM absent → fonte motor (got ${rem.fonte})`);
  ok(!!rem.plano.id, "remount returns plano");
  ok(rem.volumes_semanais.length === 0, "remount volumes empty");

  // Preserve estado for overlapping exercise
  const kept = rem.estados.find((e) =>
    g1.estados.some((x) => x.exercicio_id === e.exercicio_id),
  );
  ok(!!kept, "some estado preserved/merged from previous");

  if (fail) {
    console.error(`smoke-perfil-calendario FAIL (${fail})`);
    process.exit(1);
  }
  console.log("smoke-perfil-calendario OK");
}

void main();
