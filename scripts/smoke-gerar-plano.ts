import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import type { Perfil } from "../src/lib/domain";

const base: Perfil = {
  id: "smoke",
  peso_kg: 80,
  altura_cm: 178,
  experiencia: "intermediario",
  dias_por_semana: 4,
  minutos_por_sessao: 60,
  cardio_min_semana: 60,
  equipamentos: ["barra", "halteres", "maquina", "cabo"],
  restricoes: [],
  objetivo: "hipertrofia",
  onboarding_concluido: false,
  parq_liberado: true,
  parq_respondido_em: new Date().toISOString(),
  parq_respostas: [false, false, false, false, false, false, false],
  criado_em: new Date().toISOString(),
};

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("✗", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}

// Case 1: no barra + ombro
{
  const p = {
    ...base,
    equipamentos: ["halteres", "maquina"] as Perfil["equipamentos"],
    restricoes: ["ombro"],
    dias_por_semana: 3,
    objetivo: "hipertrofia" as const,
  };
  const g = gerarPlanoFromPerfil(p, CATALOG_EXERCICIOS);
  const ids = g.sessoes.flatMap((s) => s.prescricoes.map((x) => x.exercicio_id));
  const exById = Object.fromEntries(CATALOG_EXERCICIOS.map((e) => [e.id, e]));
  assert(g.sessoes.length === 3, `3 dias → ${g.sessoes.length} sessões full_body`);
  assert(g.plano.divisao === "full_body", `divisão full_body (got ${g.plano.divisao})`);
  assert(
    ids.every((id) => exById[id]?.equipamento !== "barra"),
    "sem exercícios de barra",
  );
  assert(
    !ids.includes("desenvolvimento_maquina"),
    "ombro → sem press vertical",
  );
  assert(
    /halteres|máquina|maquina|ombro|full body|full_body|3 dias/i.test(g.plano.justificativa.texto),
    "justificativa menciona escolhas",
  );
  console.log("  justificativa:", g.plano.justificativa.texto.slice(0, 160) + "…");
  console.log("  exercícios:", ids.join(", "));
}

// Case 2: 2 dias
{
  const g = gerarPlanoFromPerfil({ ...base, dias_por_semana: 2 }, CATALOG_EXERCICIOS);
  assert(g.sessoes.length === 2 && g.plano.divisao === "full_body", "2 dias → FB 2");
}

// Case 3: forca vs hipertrofia reps
{
  const h = gerarPlanoFromPerfil({ ...base, objetivo: "hipertrofia" }, CATALOG_EXERCICIOS);
  const f = gerarPlanoFromPerfil({ ...base, objetivo: "forca" }, CATALOG_EXERCICIOS);
  const hReps = h.sessoes[0]?.prescricoes[0]?.faixa_reps[0] ?? 0;
  const fReps = f.sessoes[0]?.prescricoes[0]?.faixa_reps[0] ?? 0;
  assert(fReps < hReps, `força reps (${fReps}) < hipertrofia (${hReps})`);
  const hSets = h.sessoes.reduce((a, s) => a + s.prescricoes.reduce((b, p) => b + p.series, 0), 0);
  const fSets = f.sessoes.reduce((a, s) => a + s.prescricoes.reduce((b, p) => b + p.series, 0), 0);
  assert(fSets <= hSets, `força volume semanal sets (${fSets}) ≤ hipertrofia (${hSets})`);
}

if (process.exitCode) {
  console.error("smoke:gerar-plano FAIL");
  process.exit(1);
}
console.log("smoke:gerar-plano OK");
