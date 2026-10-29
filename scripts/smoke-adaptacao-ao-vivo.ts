import {
  adaptarAposSerie,
  aplicarAdaptacaoNaPrescricao,
} from "../src/lib/engine/adaptacao-ao-vivo";
import type { Prescricao, RegistroSerie } from "../src/lib/domain";

const presc: Prescricao = {
  id: "p1",
  sessao_id: "s1",
  exercicio_id: "supino_reto_convencional",
  padrao: "empurrar_horizontal",
  ordem: 1,
  series: 4,
  faixa_reps: [6, 10],
  rir_alvo: 2,
  descanso_seg: 150,
  cadencia: "2-0-1-0",
  tecnica: "padrao",
  carga: { trabalho_kg: 60, top_set_kg: null, origem: "historico" },
  alternativa_equipamento_ocupado: "supino_halteres",
  guia_id: null,
  evidencia: "forte",
};

function reg(
  partial: Partial<RegistroSerie> &
    Pick<RegistroSerie, "numero" | "tipo_serie" | "reps" | "carga_kg">,
): RegistroSerie {
  return {
    id: `r-${partial.numero}-${partial.tipo_serie}`,
    sessao_id: "s1",
    prescricao_id: "p1",
    exercicio_id: "supino_reto_convencional",
    rir_percebido: 2,
    dor: false,
    executado_em: new Date().toISOString(),
    ...partial,
  };
}

function ok(c: boolean, m: string) {
  console.log(c ? "✓" : "✗", m);
  if (!c) process.exitCode = 1;
}

// 1) Aquecimento NÃO dispara R4-live
const aq = adaptarAposSerie({
  registro: reg({
    numero: 1,
    tipo_serie: "aquecimento",
    carga_kg: 40,
    reps: 2,
  }),
  seriesAnteriores: [],
  presc,
  stepKg: 2.5,
});
ok(!aq.aplicada && aq.regra === "NENHUMA", "aquecimento ignora AO_VIVO_R4");

// 2) 1 falha no piso → −7,5%
const fail1 = adaptarAposSerie({
  registro: reg({
    numero: 1,
    tipo_serie: "trabalho",
    carga_kg: 60,
    reps: 4,
    rir_percebido: 0,
  }),
  seriesAnteriores: [],
  presc,
  stepKg: 2.5,
});
ok(fail1.aplicada && fail1.regra === "AO_VIVO_R4", "1 falha → AO_VIVO_R4");
ok(
  typeof fail1.carga_sugerida_kg === "number" &&
    fail1.carga_sugerida_kg < 60 &&
    fail1.carga_sugerida_kg >= 52.5,
  `carga −7,5% ≈55 (got ${fail1.carga_sugerida_kg})`,
);
ok(!fail1.cortar_serie_extra, "1 falha não corta série");

// 3) 2 falhas → corte ~10% + cortar série
const firstFail = reg({
  numero: 1,
  tipo_serie: "trabalho",
  carga_kg: 60,
  reps: 3,
});
const fail2 = adaptarAposSerie({
  registro: reg({
    numero: 2,
    tipo_serie: "trabalho",
    carga_kg: 60,
    reps: 4,
  }),
  seriesAnteriores: [firstFail],
  presc,
  stepKg: 2.5,
});
ok(
  fail2.aplicada &&
    fail2.cortar_serie_extra === true &&
    fail2.series_alvo_ajustado === 3,
  `2 falhas → corte série (alvo ${fail2.series_alvo_ajustado})`,
);
ok(
  typeof fail2.carga_sugerida_kg === "number" &&
    fail2.carga_sugerida_kg < 55 &&
    fail2.carga_sugerida_kg >= 50,
  `2 falhas carga ~52.5 (got ${fail2.carga_sugerida_kg})`,
);

const prescCortada = aplicarAdaptacaoNaPrescricao(presc, fail2);
ok(prescCortada.series === 3, `presc.series=3 (got ${prescCortada.series})`);
ok(
  prescCortada.carga.trabalho_kg === fail2.carga_sugerida_kg,
  "aplicarAdaptacao atualiza trabalho_kg",
);

// 4) dor ×2 → alerta N1
const dor1 = reg({
  numero: 1,
  tipo_serie: "trabalho",
  carga_kg: 60,
  reps: 8,
  dor: true,
});
const dor2 = adaptarAposSerie({
  registro: reg({
    numero: 2,
    tipo_serie: "trabalho",
    carga_kg: 60,
    reps: 8,
    dor: true,
  }),
  seriesAnteriores: [dor1],
  presc,
  stepKg: 2.5,
});
ok(
  dor2.aplicada && dor2.regra === "AO_VIVO_DOR" && dor2.alerta === "N1",
  "dor×2 → N1",
);
ok(
  dor2.sugerir_alternativa === "supino_halteres",
  "sugere alternativa_equipamento_ocupado",
);

// 5) RIR 0 no piso → redução leve
const rir0 = adaptarAposSerie({
  registro: reg({
    numero: 1,
    tipo_serie: "top_set",
    carga_kg: 60,
    reps: 6,
    rir_percebido: 0,
  }),
  seriesAnteriores: [],
  presc,
  stepKg: 2.5,
});
ok(
  rir0.aplicada && rir0.regra === "AO_VIVO_RIR0",
  `RIR0 no piso → AO_VIVO_RIR0 (got ${rir0.regra})`,
);
ok(
  typeof rir0.carga_sugerida_kg === "number" &&
    rir0.carga_sugerida_kg < 60,
  `RIR0 reduz carga (got ${rir0.carga_sugerida_kg})`,
);

if (process.exitCode) {
  console.error("smoke:adaptacao-ao-vivo FAIL");
  process.exit(1);
}
console.log("smoke:adaptacao-ao-vivo OK");
