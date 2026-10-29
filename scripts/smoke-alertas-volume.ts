import {
  aplicarAjusteVolumeNasSessoes,
  avaliarAlertasVolume,
  extractVolumeMarkers,
  previousIsoWeek,
} from "../src/lib/engine/alertas-volume";
import type {
  Exercicio,
  Sessao,
  VolumeSemanal,
} from "../src/lib/domain";

function ok(c: boolean, m: string) {
  console.log(c ? "✓" : "✗", m);
  if (!c) process.exitCode = 1;
}

const semana = "2026-W44";
const prev = previousIsoWeek(semana);
ok(prev === "2026-W43", `previousIsoWeek ${semana} → ${prev}`);

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
const exCostas: Exercicio = {
  id: "remada",
  nome: "Remada",
  padrao: "puxar_horizontal",
  grupo_primario: "costas",
  grupos_secundarios: ["biceps"],
  equipamento: "barra",
  composto: true,
  unilateral: false,
};

function vol(
  semana_iso: string,
  grupo: VolumeSemanal["grupo"],
  series_efetivas: number,
): VolumeSemanal {
  return {
    semana_iso,
    grupo,
    series_diretas: series_efetivas,
    series_indiretas: 0,
    series_efetivas,
  };
}

// 1) 2 weeks under → R10 (delta 2 se <<8, senão 1)
const under = avaliarAlertasVolume({
  volumes_semanais: [
    vol(prev, "peito", 6),
    vol(semana, "peito", 7),
    vol(semana, "costas", 12), // na faixa — sem alerta
  ],
  semana_iso: semana,
});
ok(
  under.some((a) => a.regra === "R10" && a.grupo === "peito" && a.delta_series === 2),
  "R10 peito under <<8 → +2 séries",
);
ok(
  !under.some((a) => a.grupo === "costas"),
  "costas na faixa → sem alerta",
);

const underMild = avaliarAlertasVolume({
  volumes_semanais: [vol(prev, "ombros", 9), vol(semana, "ombros", 9)],
  semana_iso: semana,
});
ok(
  underMild.some((a) => a.regra === "R10" && a.delta_series === 1),
  "R10 ombros 9/9 → +1 série",
);

// 2) over 20 → R11
const over = avaliarAlertasVolume({
  volumes_semanais: [vol(semana, "quadriceps", 22)],
  semana_iso: semana,
});
ok(
  over.some(
    (a) =>
      a.regra === "R11" &&
      a.grupo === "quadriceps" &&
      a.delta_series === 2 &&
      a.acao === "remover_series",
  ),
  "R11 quadriceps >20 → −2 séries",
);

// 3) na faixa → sem falso positivo
const faixa = avaliarAlertasVolume({
  volumes_semanais: [
    vol(prev, "peito", 12),
    vol(semana, "peito", 14),
    vol(semana, "costas", 18),
  ],
  semana_iso: semana,
});
ok(faixa.length === 0, "na faixa → 0 alertas");

// 4) só 1 semana under → sem R10
const oneWeek = avaliarAlertasVolume({
  volumes_semanais: [vol(semana, "biceps", 5)],
  semana_iso: semana,
});
ok(!oneWeek.some((a) => a.regra === "R10"), "1 semana under → sem R10");

// 5) dedupe via markers_ativos
const first = avaliarAlertasVolume({
  volumes_semanais: [vol(prev, "peito", 5), vol(semana, "peito", 5)],
  semana_iso: semana,
});
const markers = first.map((a) => a.marker);
const again = avaliarAlertasVolume({
  volumes_semanais: [vol(prev, "peito", 5), vol(semana, "peito", 5)],
  semana_iso: semana,
  markers_ativos: markers,
});
ok(again.length === 0, "dedupe markers_ativos → sem spam");
ok(
  extractVolumeMarkers([first[0]!.motivo]).includes(first[0]!.marker),
  "extractVolumeMarkers lê marker do motivo",
);

// 6) aplicar +series / −series em planejada
function sess(
  id: string,
  status: Sessao["status"],
  presc: { id: string; exercicio_id: string; series: number; ordem: number }[],
): Sessao {
  return {
    id,
    plano_id: "p1",
    nome: id,
    ordem: 1,
    data: "2026-10-29",
    status,
    grupos: ["peito"],
    duracao_estimada_min: 60,
    duracao_real_min: null,
    prescricoes: presc.map((p) => ({
      id: p.id,
      sessao_id: id,
      exercicio_id: p.exercicio_id,
      ordem: p.ordem,
      series: p.series,
      padrao: "empurrar_horizontal",
      faixa_reps: [6, 10] as [number, number],
      rir_alvo: 2,
      descanso_seg: 120,
      cadencia: "2-0-1-0",
      tecnica: "padrao",
      carga: { trabalho_kg: 60, top_set_kg: null, origem: "historico" as const },
      alternativa_equipamento_ocupado: null,
      guia_id: null,
      evidencia: "forte" as const,
    })),
    volume_por_grupo: [],
    rest_timer: {
      status: "idle",
      segundos_totais: 0,
      segundos_restantes: 0,
    },
  };
}

const sessoes: Sessao[] = [
  sess("done", "concluida", [
    { id: "d1", exercicio_id: "supino", series: 4, ordem: 1 },
  ]),
  sess("next", "planejada", [
    { id: "n1", exercicio_id: "supino", series: 3, ordem: 1 },
    { id: "n2", exercicio_id: "crucifixo", series: 3, ordem: 2 },
    { id: "n3", exercicio_id: "remada", series: 4, ordem: 3 },
  ]),
  sess("parcial1", "parcial", [
    { id: "p1", exercicio_id: "supino", series: 3, ordem: 1 },
  ]),
];

const r10 = avaliarAlertasVolume({
  volumes_semanais: [vol(prev, "peito", 6), vol(semana, "peito", 6)],
  semana_iso: semana,
});
const afterAdd = aplicarAjusteVolumeNasSessoes(sessoes, r10, [
  exComposto,
  exIso,
  exCostas,
]);
const nextAdd = afterAdd.find((s) => s.id === "next")!;
const doneAdd = afterAdd.find((s) => s.id === "done")!;
const parcialAdd = afterAdd.find((s) => s.id === "parcial1")!;
ok(
  nextAdd.prescricoes.find((p) => p.exercicio_id === "supino")!.series === 5,
  "R10 +2 no composto (supino 3→5) em planejada",
);
ok(
  nextAdd.prescricoes.find((p) => p.exercicio_id === "crucifixo")!.series === 3,
  "R10 não mexe no isolamento quando composto existe",
);
ok(
  doneAdd.prescricoes[0]!.series === 4,
  "concluida intacta",
);
ok(
  parcialAdd.prescricoes[0]!.series === 5,
  "parcial também recebe +séries",
);

const r11 = avaliarAlertasVolume({
  volumes_semanais: [vol(semana, "peito", 24)],
  semana_iso: semana,
});
const afterRem = aplicarAjusteVolumeNasSessoes(sessoes, r11, [
  exComposto,
  exIso,
  exCostas,
]);
const nextRem = afterRem.find((s) => s.id === "next")!;
const cruc = nextRem.prescricoes.find((p) => p.exercicio_id === "crucifixo")!;
const sup = nextRem.prescricoes.find((p) => p.exercicio_id === "supino")!;
const rem = nextRem.prescricoes.find((p) => p.exercicio_id === "remada")!;
ok(cruc.series === 1, `R11 remove do isolamento primeiro (3→1), got ${cruc.series}`);
ok(sup.series === 3, `R11 composto intacto se delta já coberto, got ${sup.series}`);
ok(rem.series === 4, "R11 não mexe em outro grupo");

// floor 1
const tiny: Sessao[] = [
  sess("t", "planejada", [
    { id: "t1", exercicio_id: "crucifixo", series: 1, ordem: 1 },
  ]),
];
const afterFloor = aplicarAjusteVolumeNasSessoes(tiny, r11, [exIso]);
ok(
  afterFloor[0]!.prescricoes[0]!.series === 1,
  "R11 floor 1 — não zera série",
);

console.log("\nsmoke-alertas-volume done");
