/**
 * Smoke: catálogo expandido + merge na hidratação.
 * Garante que exercícios novos chegam a estados antigos sem perder customizados,
 * que os metadados canônicos vencem e que as restrições continuam valendo.
 */
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { mergeCatalogoExercicios } from "../src/lib/catalog/merge";
import { ExercicioSchema, type Exercicio, type Perfil } from "../src/lib/domain";
import {
  exerciseAllowed,
  patternBlocked,
  parseRestricoes,
} from "../src/lib/plan/gerar-plano";
import { listarAlternativasTroca } from "../src/lib/plan/trocar-exercicio";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fail++;
};

const byId = new Map(CATALOG_EXERCICIOS.map((e) => [e.id, e]));

// 1) Integridade do catálogo
ok(byId.size === CATALOG_EXERCICIOS.length, `ids únicos (${CATALOG_EXERCICIOS.length})`);
const invalidos = CATALOG_EXERCICIOS.filter((e) => !ExercicioSchema.safeParse(e).success);
ok(invalidos.length === 0, `todos passam no schema${invalidos.length ? ` (${invalidos.map((e) => e.id).join(", ")})` : ""}`);
ok(
  CATALOG_EXERCICIOS.some((e) => e.id === "supino_inclinado_maquina") &&
    CATALOG_EXERCICIOS.some((e) => e.id === "pallof_press") &&
    CATALOG_EXERCICIOS.some((e) => e.id === "cadeira_flexora_sentada"),
  "catálogo expandido inclui peito, core e posterior",
);

// 2) Merge para usuários existentes
const antigos = CATALOG_EXERCICIOS.slice(0, 5);
const merged = mergeCatalogoExercicios(antigos);
ok(
  merged.length === CATALOG_EXERCICIOS.length,
  `merge completa o catálogo (${antigos.length} → ${merged.length})`,
);
ok(
  antigos.every((e, i) => merged[i]?.id === e.id),
  "merge preserva a ordem dos exercícios já existentes",
);
ok(
  merged.some((e) => e.id === "pallof_press"),
  "merge adiciona exercícios novos para quem já tinha estado",
);

const custom: Exercicio = {
  id: "exercicio_custom",
  nome: "Exercício custom",
  padrao: "core_antiextensao",
  grupo_primario: "abdomen",
  grupos_secundarios: [],
  equipamento: "peso_corporal",
  composto: false,
  unilateral: false,
};
const comCustom = mergeCatalogoExercicios([...antigos, custom]);
ok(
  comCustom.some((e) => e.id === "exercicio_custom"),
  "merge preserva exercício fora do catálogo",
);

const antigoRenomeado = { ...antigos[0], nome: "Nome velho" };
const atualizado = mergeCatalogoExercicios([antigoRenomeado]);
ok(
  atualizado.find((e) => e.id === antigos[0].id)?.nome === antigos[0].nome,
  "merge atualiza metadados canônicos do exercício já existente",
);
ok(
  JSON.stringify(mergeCatalogoExercicios(atualizado)) === JSON.stringify(atualizado),
  "merge é estável na segunda passada",
);

// 3) Restrições continuam valendo com o catálogo maior
const semBarra = new Set(["halteres", "maquina", "cabo", "peso_corporal"]);
const restricoesVazias = parseRestricoes([]);
const barras = CATALOG_EXERCICIOS.filter((e) => e.equipamento === "barra");
ok(
  barras.every((e) => !exerciseAllowed(e, semBarra, restricoesVazias)),
  "sem barra → nenhum exercício de barra permitido",
);

const ombro = parseRestricoes(["ombro"]);
ok(
  patternBlocked("empurrar_vertical", ombro) &&
    !exerciseAllowed(byId.get("mergulho_paralelas")!, semBarra, ombro),
  "ombro → sem press vertical e sem mergulho nas paralelas",
);

const joelho = parseRestricoes(["joelho"]);
ok(
  ["agachamento_barra", "afundo_bulgaro", "passada_caminhando", "step_up"].every(
    (id) => !exerciseAllowed(byId.get(id)!, semBarra, joelho),
  ),
  "joelho → sem agachamento barra, búlgaro, passada e step-up",
);

const lombar = parseRestricoes(["lombar"]);
ok(
  ["bom_dia", "rdl_unilateral", "rdl_halteres", "stiff_rdl", "remada_curvada", "agachamento_barra"].every(
    (id) => !exerciseAllowed(byId.get(id)!, semBarra, lombar),
  ),
  "lombar → sem bom dia, RDL unilateral e demais hinges carregados",
);

// 4) Novos exercícios aparecem como alternativas de troca
const perfil: Perfil = {
  id: "smoke-catalogo",
  peso_kg: 80,
  altura_cm: 178,
  experiencia: "intermediario",
  dias_por_semana: 4,
  minutos_por_sessao: 60,
  cardio_min_semana: 0,
  equipamentos: ["barra", "halteres", "maquina", "cabo"],
  restricoes: [],
  objetivo: "hipertrofia",
  onboarding_concluido: true,
  parq_liberado: true,
  parq_respondido_em: new Date().toISOString(),
  parq_respostas: [false, false, false, false, false, false, false],
  criado_em: new Date().toISOString(),
};

function alternativas(de: string): string[] {
  return listarAlternativasTroca({
    exercicioId: de,
    catalog: CATALOG_EXERCICIOS,
    perfil,
  }).map((a) => a.exercicio.id);
}

ok(
  alternativas("supino_halteres").includes("crucifixo_halteres"),
  "peito → alternativa nova de crucifixo com halteres",
);
ok(
  ["supino_inclinado_maquina", "supino_inclinado_barra"].every((id) =>
    alternativas("supino_inclinado_halteres").includes(id),
  ),
  "peito inclinado → alternativas novas de máquina/barra",
);
ok(
  ["remada_apoiada_peito", "remada_unilateral_cabo", "remada_invertida"].every((id) =>
    alternativas("remada_maquina").includes(id),
  ),
  "costas → alternativas novas de remada",
);
ok(
  ["rosca_inclinada", "rosca_scott", "rosca_concentrada"].every((id) =>
    alternativas("rosca_direta").includes(id),
  ),
  "bíceps → alternativas novas de rosca",
);
ok(
  ["triceps_pulley", "triceps_overhead_cabo"].every((id) =>
    alternativas("triceps_corda").includes(id),
  ),
  "tríceps → alternativas novas no cabo",
);
ok(
  alternativas("panturrilha_pe").includes("panturrilha_leg_press"),
  "panturrilha → alternativa no leg press",
);

if (fail) {
  console.error(`\nsmoke:catalogo FAIL (${fail})`);
  process.exit(1);
}
console.log("\nsmoke:catalogo OK");
