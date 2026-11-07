/** Tudo conta a partir do primeiro treino ou check-in registrado. */
import assert from "node:assert/strict";
import { avaliarAlertasVolume, alertaVolumeValido } from "../src/lib/engine/alertas-volume";
import { isoWeekDe, isoWeekDoDia } from "../src/lib/engine/volume";
import { inicioDeUso, semanaCheia, semanaAntesDoInicio, segundaDaSemana } from "../src/lib/inicio";
import { serieDias } from "../src/lib/sono-agua/avaliacao";

assert.equal(segundaDaSemana("2026-W45"), "2026-11-02");
assert.equal(segundaDaSemana("2026-W01"), "2025-12-29");

// Semana começa na segunda: domingo pertence à semana que abriu na segunda anterior.
assert.equal(isoWeekDoDia("2026-11-02"), "2026-W45", "segunda abre a semana");
assert.equal(isoWeekDoDia("2026-11-01"), "2026-W44", "domingo 01/11 fecha a semana anterior (26/10–01/11)");
assert.equal(isoWeekDe(new Date("2026-11-02T02:30:00.000Z")), "2026-W44", "domingo 01/11 23:30 em SP ainda é a semana anterior");
assert.equal(isoWeekDoDia("2026-11-08"), "2026-W45", "domingo fecha a mesma semana");
assert.equal(isoWeekDoDia("2026-11-09"), "2026-W46", "segunda seguinte abre outra semana");
// Instante UTC convertido para o dia de São Paulo: domingo 23:30 em SP ainda é a semana anterior.
assert.equal(isoWeekDe(new Date("2026-11-08T03:00:00.000Z")), "2026-W45", "domingo 00:00 em SP");
assert.equal(isoWeekDe(new Date("2026-11-09T02:30:00.000Z")), "2026-W45", "domingo 23:30 em SP já é segunda em UTC");
assert.equal(isoWeekDe(new Date("2026-11-09T03:00:00.000Z")), "2026-W46", "segunda 00:00 em SP abre a semana");
assert.equal(isoWeekDe(new Date("2026-11-09T12:00:00.000Z")), "2026-W46", "segunda de dia");
// Virada de ano: 2026 tem 53 semanas ISO; domingo 03/01/2027 ainda é 2026-W53.
assert.equal(isoWeekDoDia("2026-12-28"), "2026-W53", "segunda 28/12 abre a última semana de 2026");
assert.equal(isoWeekDoDia("2027-01-03"), "2026-W53", "domingo 03/01 fecha 2026-W53");
assert.equal(isoWeekDoDia("2027-01-04"), "2027-W01", "segunda 04/01 abre 2027-W01");
assert.equal(isoWeekDe(new Date("2027-01-04T02:30:00.000Z")), "2026-W53", "domingo 03/01 23:30 em SP fica em 2026");
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
