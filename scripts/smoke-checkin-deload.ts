import {
  AGUA_MIN_ML,
  avaliarCheckinDeload,
} from "../src/lib/engine/checkin-deload";
import type {
  Checkin,
  EstadoExercicio,
  Exercicio,
  Mesociclo,
  Prescricao,
} from "../src/lib/domain";

function ok(c: boolean, m: string) {
  console.log(c ? "✓" : "✗", m);
  if (!c) process.exitCode = 1;
}

const exComposto: Exercicio = {
  id: "supino",
  nome: "Supino",
  padrao: "empurrar_horizontal",
  grupo_primario: "peito",
  grupos_secundarios: ["triceps"],
  equipamento: "barra",
  composto: true,
  unilateral: false,
};
const exIso: Exercicio = {
  id: "crucifixo",
  nome: "Crucifixo",
  padrao: "empurrar_horizontal",
  grupo_primario: "peito",
  grupos_secundarios: [],
  equipamento: "halteres",
  composto: false,
  unilateral: false,
};

function presc(
  partial: Partial<Prescricao> & Pick<Prescricao, "id" | "exercicio_id" | "ordem" | "series">,
): Prescricao {
  return {
    sessao_id: "s1",
    padrao: "empurrar_horizontal",
    faixa_reps: [6, 10],
    rir_alvo: 2,
    descanso_seg: 120,
    cadencia: "2-0-1-0",
    tecnica: "padrao",
    carga: { trabalho_kg: 60, top_set_kg: null, origem: "historico" },
    alternativa_equipamento_ocupado: null,
    guia_id: null,
    evidencia: "forte",
    ...partial,
  };
}

const prescricoes: Prescricao[] = [
  presc({ id: "p1", exercicio_id: "supino", ordem: 1, series: 4 }),
  presc({ id: "p2", exercicio_id: "crucifixo", ordem: 2, series: 3 }),
];

const ckRuim: Checkin = {
  id: "ck1",
  data: "2026-10-28",
  sono_h: 5,
  prontidao: 2,
  dor: [],
};

const ckBom: Checkin = {
  id: "ck2",
  data: "2026-10-28",
  sono_h: 8,
  prontidao: 4,
  dor: [],
};

// 1) R9 corta 1 série no composto; isolamento intacto; carga mantida
const r9 = avaliarCheckinDeload({
  checkin: ckRuim,
  prescricoes,
  exercicios: [exComposto, exIso],
});
ok(r9.regras.includes("R9"), "R9 na lista de regras");
ok(r9.aplicado, "R9 aplicado");
const p1 = r9.prescricoes.find((p) => p.id === "p1")!;
const p2 = r9.prescricoes.find((p) => p.id === "p2")!;
ok(p1.series === 3, `composto 4→3 (got ${p1.series})`);
ok(p2.series === 3, `isolamento mantém 3 (got ${p2.series})`);
ok(p1.carga.trabalho_kg === 60, "R9 mantém carga");
ok(
  r9.motivo.toLowerCase().includes("série") ||
    r9.motivo.includes("compostos"),
  `motivo PT menciona séries (${r9.motivo})`,
);

// 2) Check-in bom → no-op
const good = avaliarCheckinDeload({
  checkin: ckBom,
  prescricoes,
  exercicios: [exComposto, exIso],
});
ok(!good.aplicado && good.regras.length === 0, "check-in bom = no-op");
ok(
  good.prescricoes.every((p, i) => p.series === prescricoes[i]!.series),
  "séries intactas no no-op",
);

// 3) R6 −10%
const meso: Mesociclo = {
  total_semanas: 6,
  semana_atual: 6,
  foco: "acumulo", data_inicio: null};
const r6 = avaliarCheckinDeload({
  checkin: ckBom,
  mesociclo: meso,
  prescricoes,
  exercicios: [exComposto, exIso],
});
ok(r6.regras.includes("R6"), "R6 dispara na última semana");
ok(
  r6.prescricoes[0]!.carga.trabalho_kg === 55 ||
    r6.prescricoes[0]!.carga.trabalho_kg === 52.5,
  `R6 −10% de 60 → ~55/52.5 (got ${r6.prescricoes[0]!.carga.trabalho_kg})`,
);
ok(r6.prescricoes[0]!.series === 4, "R6 sozinho não corta série");

// 4) Água baixa só alerta
const ckAgua: Checkin = {
  ...ckBom,
  agua_ml: 1000,
};
const agua = avaliarCheckinDeload({
  checkin: ckAgua,
  prescricoes,
  exercicios: [exComposto, exIso],
});
ok(agua.regras.includes("AGUA"), "AGUA na lista");
ok(!agua.aplicado, "água baixa não corta séries/carga");
ok(
  agua.alertas.some((a) => a.motivo.includes("Hidratação")),
  "alerta de hidratação",
);
ok(agua.prescricoes[0]!.series === 4, "séries intactas com água baixa");
ok(AGUA_MIN_ML === 1500, "threshold 1500 ml");

// 5) Clamp quando séries já feitas
const clamp = avaliarCheckinDeload({
  checkin: ckRuim,
  prescricoes,
  exercicios: [exComposto, exIso],
  seriesJaFeitas: { p1: 4 }, // já fez as 4
});
ok(
  clamp.prescricoes.find((p) => p.id === "p1")!.series === 4,
  `clamp series>=já feitas (got ${clamp.prescricoes.find((p) => p.id === "p1")!.series})`,
);

// 6) R5 soft platô
const estadoPlatô: EstadoExercicio = {
  exercicio_id: "supino",
  carga_atual_kg: 60,
  faixa_reps: [6, 10],
  rir_alvo: 2,
  alvo_proxima_sessao: {
    carga_kg: 60,
    faixa_reps: [6, 10],
    rir_alvo: 2,
  },
  sessoes_sem_progresso: 3,
  ultima_progressao_em: null,
  e1rm_estimado_kg: 80,
  pr_carga_kg: 60,
  pr_reps: 10,
  origem_carga: "historico",
  primeira_sessao: false,
  ultimo_top_kg: 60,
  ultimo_back_off_kg: 52.5,
  ultimo_rir: 2,
  ultima_sessao_em: null,
  atualizado_em: new Date().toISOString(),
};
const r5 = avaliarCheckinDeload({
  checkin: ckBom,
  estados: [estadoPlatô],
  prescricoes,
  exercicios: [exComposto, exIso],
});
ok(r5.regras.includes("R5"), "R5 platô");
ok(
  r5.prescricoes.find((p) => p.id === "p1")!.carga.trabalho_kg < 60,
  "R5 −10% no exercício com platô",
);
ok(
  r5.prescricoes.find((p) => p.id === "p2")!.carga.trabalho_kg === 60,
  "isolamento sem platô mantém carga",
);

// 7) R9 + R6: −1 série nos compostos + −10% carga (não empilha cortes brutais de série)
const combo = avaliarCheckinDeload({
  checkin: ckRuim,
  mesociclo: meso,
  prescricoes,
  exercicios: [exComposto, exIso],
});
ok(
  combo.regras.includes("R9") && combo.regras.includes("R6"),
  "R9+R6 combinados",
);
ok(combo.prescricoes[0]!.series === 3, "combo: −1 série");
ok(
  combo.prescricoes[0]!.carga.trabalho_kg < 60,
  "combo: −10% carga (R6), R9 não empilha corte de carga",
);

if (process.exitCode) {
  console.error("smoke:checkin-deload FAIL");
  process.exit(1);
}
console.log("smoke:checkin-deload OK");
