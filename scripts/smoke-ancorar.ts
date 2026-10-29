import {
  ancorarCargaDeAquecimento,
  roundToStep,
} from "../src/lib/engine/ancorar-carga";
import type { Prescricao } from "../src/lib/domain";

const presc: Prescricao = {
  id: "p1",
  sessao_id: "s1",
  exercicio_id: "supino_reto_convencional",
  padrao: "empurrar_horizontal",
  ordem: 1,
  series: 3,
  faixa_reps: [6, 10],
  rir_alvo: 2,
  descanso_seg: 150,
  cadencia: "2-0-1-0",
  tecnica: "top_set_backoff",
  carga: { trabalho_kg: 60, top_set_kg: null, origem: "estimativa_conservadora" },
  alternativa_equipamento_ocupado: null,
  guia_id: null,
  evidencia: "forte",
};

const r = ancorarCargaDeAquecimento({
  cargaKg: 62.5,
  tecnica: "top_set_backoff",
  grupo: "peito",
  prescricoesPendentes: presc,
});

function ok(c: boolean, m: string) {
  console.log(c ? "✓" : "✗", m);
  if (!c) process.exitCode = 1;
}

ok(r.trabalho_kg === 62.5, `trabalho 62.5 (got ${r.trabalho_kg})`);
ok(r.top_set_kg === 62.5, `top 62.5 (got ${r.top_set_kg})`);
ok(
  r.back_off_kg !== null && r.back_off_kg >= 54.5 && r.back_off_kg <= 56.25,
  `back_off ≈54.5–56 (got ${r.back_off_kg})`,
);
ok(roundToStep(62.5 * 0.875, 2.5) === 55, `0.875*62.5 → 55`);

const linear = ancorarCargaDeAquecimento({
  cargaKg: 62.5,
  tecnica: "padrao",
  grupo: "peito",
  prescricoesPendentes: { ...presc, tecnica: "padrao" },
});
ok(linear.trabalho_kg === 62.5 && linear.back_off_kg === null, "linear só trabalho");

if (process.exitCode) {
  console.error("smoke:ancorar FAIL");
  process.exit(1);
}
console.log("smoke:ancorar OK");
