/** Tudo conta a partir do primeiro treino ou check-in registrado. */
import assert from "node:assert/strict";
import { avaliarAlertasVolume, alertaVolumeValido } from "../src/lib/engine/alertas-volume";
import { inicioDeUso, semanaCheia, semanaAntesDoInicio, segundaDaSemana } from "../src/lib/inicio";
import { serieDias } from "../src/lib/sono-agua/avaliacao";

assert.equal(segundaDaSemana("2026-W45"), "2026-11-02");
assert.equal(segundaDaSemana("2026-W01"), "2025-12-29");
const ini = inicioDeUso({
  sessoes: [{ status: "planejada", data: "2026-10-20" }, { status: "concluida", data: "2026-11-03" }],
  registros: [{ executado_em: "2026-11-01T13:00:00.000Z" }],
  checkins: [{ data: "2026-11-02" }],
});
assert.equal(ini, "2026-11-01");
assert.equal(inicioDeUso({}), null);
assert.equal(semanaCheia("2026-W44", ini), false); // 26/10–01/11: parcial
assert.equal(semanaCheia("2026-W45", ini), true);
assert.equal(semanaAntesDoInicio("2026-W43", ini), true);
assert.equal(semanaAntesDoInicio("2026-W44", ini), false);

// Caso do iury: 7 séries na semana do início (parcial) e 5 na semana em andamento → sem alerta.
const vols = [
  { semana_iso: "2026-W44", grupo: "quadriceps", series_efetivas: 7 },
  { semana_iso: "2026-W45", grupo: "quadriceps", series_efetivas: 5 },
] as never;
const antes = avaliarAlertasVolume({ volumes_semanais: vols, semana_iso: "2026-W45" });
assert.equal(antes.filter((a) => a.regra === "R10").length, 0, "semana em andamento não conta");
const r = avaliarAlertasVolume({ volumes_semanais: vols, semana_iso: "2026-W45", inicio: ini });
assert.equal(r.length, 0);
// Alerta já salvo com 7 → 5 fica fora da tela.
assert.equal(alertaVolumeValido("[R10:quadriceps:2026-W45] Volume efetivo de quadríceps abaixo de 10 por 2 semanas (7 → 5 séries).", ini), false);
assert.equal(alertaVolumeValido("Check-in: prontidão 2", ini), true);
// Duas semanas cheias e fechadas abaixo do mínimo → alerta.
const v2 = [
  { semana_iso: "2026-W45", grupo: "quadriceps", series_efetivas: 6 },
  { semana_iso: "2026-W46", grupo: "quadriceps", series_efetivas: 7 },
  { semana_iso: "2026-W47", grupo: "quadriceps", series_efetivas: 2 },
] as never;
const ok = avaliarAlertasVolume({ volumes_semanais: v2, semana_iso: "2026-W47", inicio: ini });
assert.equal(ok.length, 1);
assert.match(ok[0]!.motivo, /\(6 → 7 séries\)/);
assert.equal(alertaVolumeValido(ok[0]!.motivo, ini), true);
// Sem dados numa das semanas → sem alerta.
assert.equal(avaliarAlertasVolume({ volumes_semanais: [v2[1], v2[2]] as never, semana_iso: "2026-W47", inicio: ini }).length, 0);
// Sem nenhum registro → nunca alerta.
assert.equal(avaliarAlertasVolume({ volumes_semanais: v2, semana_iso: "2026-W47", inicio: null }).length, 0);
// R11 antes do início não alerta; na semana parcial alerta.
const alto = [{ semana_iso: "2026-W43", grupo: "peito", series_efetivas: 25 }, { semana_iso: "2026-W44", grupo: "peito", series_efetivas: 25 }] as never;
assert.equal(avaliarAlertasVolume({ volumes_semanais: alto, semana_iso: "2026-W43", inicio: ini }).length, 0);
assert.equal(avaliarAlertasVolume({ volumes_semanais: alto, semana_iso: "2026-W44", inicio: ini }).length, 1);
// Sono/água: dias antes do início ficam vazios.
const dias = serieDias([{ data: "2026-10-31", sono_h: 7 }, { data: "2026-11-01", sono_h: 8 }] as never, "2026-11-01", 2, ini);
assert.equal(dias[0]!.sono_h, null);
assert.equal(dias[1]!.sono_h, 8);
console.log("smoke-inicio OK");
