/**
 * Smoke: alternativa de "equipamento ocupado" + duração com unilaterais.
 *
 * Cobre o que o catálogo novo tornou possível/necessário:
 * - alternativa nunca repete exercício da sessão;
 * - alternativa respeita equipamento e restrições do perfil;
 * - alternativa gravada que virou banida é descartada;
 * - unilateral conta o outro lado na duração estimada.
 */
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { findAlt, resolverAlternativa } from "../src/lib/plan/alternativa";
import { estimateDurationMin, gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import {
  BAN_IDS,
  exerciseAllowed,
  parseRestricoes,
  patternBlocked,
} from "../src/lib/plan/restricoes";
import { equipsDoPerfil } from "../src/lib/plan/trocar-exercicio";
import type { Perfil, Prescricao } from "../src/lib/domain";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fail++;
};

const byId = new Map(CATALOG_EXERCICIOS.map((e) => [e.id, e]));
const todosEquipamentos = new Set(CATALOG_EXERCICIOS.map((e) => e.equipamento));

// ── 1) Restrições na alternativa ─────────────────────────────────────
const lombar = parseRestricoes(["lombar"]);
const altLombarId = findAlt(CATALOG_EXERCICIOS, "dobradica_quadril", todosEquipamentos, "hip_thrust", {
  restr: lombar,
});
const altLombar = altLombarId ? byId.get(altLombarId) : undefined;
ok(
  !!altLombar &&
    altLombar.padrao === "dobradica_quadril" &&
    !BAN_IDS.lombar.includes(altLombar.id) &&
    !patternBlocked(altLombar.padrao, lombar),
  `lombar: alternativa não é banida (${altLombar?.id ?? "nenhuma"})`,
);

const joelho = parseRestricoes(["joelho"]);
const altJoelhoId = findAlt(CATALOG_EXERCICIOS, "agachamento", todosEquipamentos, "leg_press", {
  restr: joelho,
});
const altJoelho = altJoelhoId ? byId.get(altJoelhoId) : undefined;
ok(
  !!altJoelho &&
    !BAN_IDS.joelho.includes(altJoelho.id) &&
    !patternBlocked(altJoelho.padrao, joelho),
  `joelho: alternativa não é banida (${altJoelho?.id ?? "nenhuma"})`,
);

const ombro = parseRestricoes(["ombro"]);
const salvaBanida = resolverAlternativa(
  { exercicio_id: "supino_halteres", alternativa_equipamento_ocupado: "mergulho_paralelas" },
  CATALOG_EXERCICIOS,
  { restr: ombro },
);
ok(
  salvaBanida != null &&
    salvaBanida.id !== "mergulho_paralelas" &&
    salvaBanida.padrao === "empurrar_horizontal",
  `ombro: alternativa gravada banida é descartada (${salvaBanida?.id ?? "nenhuma"})`,
);

// ── 2) Não repete a sessão e mantém o músculo-alvo ───────────────────
const naSessao = ["supino_reto_convencional", "supino_maquina"];
const altSessaoId = findAlt(CATALOG_EXERCICIOS, "empurrar_horizontal", todosEquipamentos, "supino_halteres", {
  excludeIds: naSessao,
  grupo: "peito",
});
const altSessao = altSessaoId ? byId.get(altSessaoId) : undefined;
ok(
  !!altSessao &&
    !naSessao.includes(altSessao.id) &&
    altSessao.id !== "supino_halteres" &&
    altSessao.grupo_primario === "peito",
  `alternativa não repete a sessão e mantém peito (${altSessao?.id ?? "nenhuma"})`,
);

const soHalteres = new Set(["halteres"]);
const altHalteresId = findAlt(CATALOG_EXERCICIOS, "agachamento", soHalteres, "agachamento_goblet");
ok(
  !!altHalteresId && byId.get(altHalteresId)?.equipamento === "halteres",
  `alternativa usa só equipamento disponível (${altHalteresId ?? "nenhuma"})`,
);

// ── 3) Duração: unilateral conta o outro lado ────────────────────────
function presc(exercicio_id: string, series = 4, descanso_seg = 120): Prescricao {
  return {
    id: `presc-${exercicio_id}`,
    sessao_id: "sess-smoke",
    exercicio_id,
    padrao: byId.get(exercicio_id)?.padrao ?? "empurrar_horizontal",
    ordem: 1,
    series,
    faixa_reps: [8, 12],
    rir_alvo: 2,
    descanso_seg,
    cadencia: "2-0-1-0",
    tecnica: "padrao",
    carga: { trabalho_kg: 20, top_set_kg: null, origem: "estimativa_conservadora" },
    alternativa_equipamento_ocupado: null,
    guia_id: null,
    evidencia: "moderado",
  };
}

const bilaterais = Array.from({ length: 6 }, () => presc("supino_halteres"));
const unilaterais = Array.from({ length: 6 }, () => presc("passada_caminhando"));
const durBi = estimateDurationMin(bilaterais, CATALOG_EXERCICIOS);
const durUni = estimateDurationMin(unilaterais, CATALOG_EXERCICIOS);
ok(durUni > durBi, `unilateral aumenta a duração (${durBi} → ${durUni} min)`);
ok(
  estimateDurationMin(bilaterais, []) === durBi,
  "sem catálogo mantém o cálculo antigo (bilateral = 45 s)",
);

// ── 4) Planos gerados: toda alternativa é segura ────────────────────
const base: Perfil = {
  id: "smoke-alternativa",
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

const cenarios: Array<{ nome: string; perfil: Perfil }> = [
  { nome: "sem barra", perfil: { ...base, equipamentos: ["halteres", "maquina", "cabo"] } },
  { nome: "ombro", perfil: { ...base, restricoes: ["ombro"] } },
  { nome: "lombar", perfil: { ...base, restricoes: ["lombar"] } },
  { nome: "joelho", perfil: { ...base, restricoes: ["joelho"] } },
  { nome: "completo", perfil: base },
];

for (const { nome, perfil } of cenarios) {
  const equips = equipsDoPerfil(perfil)!;
  const restr = parseRestricoes(perfil.restricoes);
  const gerado = gerarPlanoFromPerfil(perfil, CATALOG_EXERCICIOS);
  const prescricoes = gerado.sessoes.flatMap((s) => s.prescricoes);
  const invalidas = prescricoes.filter((p) => {
    if (!p.alternativa_equipamento_ocupado) return false;
    const alt = byId.get(p.alternativa_equipamento_ocupado);
    return (
      !alt ||
      alt.id === p.exercicio_id ||
      !exerciseAllowed(alt, equips, restr)
    );
  });
  ok(
    invalidas.length === 0,
    `${nome}: alternativas respeitam equipamento/restrições${
      invalidas.length
        ? ` (${invalidas.map((p) => `${p.exercicio_id}→${p.alternativa_equipamento_ocupado}`).join(", ")})`
        : ""
    }`,
  );
  ok(
    gerado.sessoes.every((s) => s.duracao_estimada_min >= 20),
    `${nome}: duração estimada plausível (${gerado.sessoes.map((s) => s.duracao_estimada_min).join("/")} min)`,
  );
}

if (fail) {
  console.error(`\nsmoke:alternativa FAIL (${fail})`);
  process.exit(1);
}
console.log("\nsmoke:alternativa OK");
