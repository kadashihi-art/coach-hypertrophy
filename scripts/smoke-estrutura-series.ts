/** smoke:estrutura-series — 1º exercício com preparatórias; demais direto; volume igual; timer com fases certas. */
import assert from "node:assert/strict";
import { estruturaSeries, fasesDeTrabalho, proximaFase, seriesTrabalhoFeitas } from "../src/lib/treino/estrutura-series";
import { descansoSugerido, rotuloFase } from "../src/lib/treino/rest-timer";
import { volumeSessaoPorGrupo } from "../src/lib/engine/volume";
import { ehSeriePreparatoria, type TipoSerie } from "../src/lib/domain";

const top = { series: 3, tecnica: "top_set_backoff" } as never;
const norm = { series: 3, tecnica: "nenhuma" } as never;

// 1) 1º exercício
assert.deepEqual(estruturaSeries(top, 0), ["aquecimento", "feeder", "top_set", "back_off", "back_off"]);
assert.deepEqual(estruturaSeries(norm, 0), ["aquecimento", "feeder", "trabalho", "trabalho", "trabalho"]);
// 2) demais sem preparatórias
for (const pos of [1, 2, 5]) {
  assert.deepEqual(estruturaSeries(top, pos), ["top_set", "back_off", "back_off"]);
  assert.deepEqual(estruturaSeries(norm, pos), ["trabalho", "trabalho", "trabalho"]);
  assert.ok(!estruturaSeries(top, pos).some(ehSeriePreparatoria));
}
// séries de trabalho = presc.series (preparatórias são extras)
assert.equal(estruturaSeries(top, 0).filter((f) => !ehSeriePreparatoria(f)).length, 3);

// 3) sequência guiada pelo logger
const seq = (p: never, pos: number) => {
  const out: TipoSerie[] = []; const log: { tipo_serie: TipoSerie }[] = [];
  for (let f = proximaFase(p, pos, log); f; f = proximaFase(p, pos, log)) { out.push(f); log.push({ tipo_serie: f }); }
  return { out, trab: seriesTrabalhoFeitas(log) };
};
assert.deepEqual(seq(top, 0).out, estruturaSeries(top, 0));
assert.equal(seq(top, 0).trab, 3);
assert.deepEqual(seq(top, 1).out, estruturaSeries(top, 1));
// troca de ordem: o mesmo exercício na posição 0 ganha preparatórias, na 1 não; trabalho idêntico
assert.deepEqual(fasesDeTrabalho(top), estruturaSeries(top, 1));

// 4) volume: preparatórias não contam → idêntico à main (main só contava trabalho; plano usa presc.series)
const ex = [{ id: "a", grupo_primario: "quadriceps" }, { id: "b", grupo_primario: "peito" }] as never;
const reg = (exercicio_id: string, tipo_serie: TipoSerie) => ({ exercicio_id, tipo_serie }) as never;
const novo = [reg("a", "aquecimento"), reg("a", "feeder"), reg("a", "top_set"), reg("a", "back_off"), reg("a", "back_off"), reg("b", "trabalho"), reg("b", "trabalho"), reg("b", "trabalho")];
const mainLike = [reg("a", "top_set"), reg("a", "back_off"), reg("a", "back_off"), reg("b", "trabalho"), reg("b", "trabalho"), reg("b", "trabalho")];
const sort = (v: { grupo: string; realizado: number }[]) => [...v].sort((x, y) => x.grupo.localeCompare(y.grupo)).map((x) => [x.grupo, x.realizado]);
assert.deepEqual(sort(volumeSessaoPorGrupo(novo, ex)), sort(volumeSessaoPorGrupo(mainLike, ex)));

// 5) timer
for (const f of estruturaSeries(top, 0)) assert.ok(descansoSugerido({ fase: f as never, composto: true, prescritoSeg: 150 }) > 0);
assert.equal(rotuloFase("feeder"), "Descanso da aproximação");
assert.equal(descansoSugerido({ fase: "aquecimento", composto: true, prescritoSeg: 150 }), 60);
assert.equal(descansoSugerido({ fase: "feeder", composto: true, prescritoSeg: 150 }), 90);
assert.equal(descansoSugerido({ fase: "back_off", composto: true, prescritoSeg: 150 }), 150);
console.log("smoke:estrutura-series OK");
