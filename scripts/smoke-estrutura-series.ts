/** smoke:estrutura-series — 1º exercício com preparatórias; demais direto; volume igual; timer com fases certas. */
import assert from "node:assert/strict";
import { cargaAquecimento, estruturaSeries, fasesDeTrabalho, preparatoriasDaSessao, proximaFase, seriesTrabalhoFeitas, textoAquecimento } from "../src/lib/treino/estrutura-series";
import { descansoSugerido, rotuloFase } from "../src/lib/treino/rest-timer";
import { volumeSessaoPorGrupo } from "../src/lib/engine/volume";
import { ehSeriePreparatoria, type TipoSerie } from "../src/lib/domain";

const top = { series: 3, tecnica: "top_set_backoff" } as never;
const norm = { series: 3, tecnica: "nenhuma" } as never;

// 1) 1º exercício
assert.deepEqual(estruturaSeries(top, 0), ["aquecimento", "feeder", "trabalho", "top_set", "back_off"]);
assert.deepEqual(estruturaSeries(norm, 0), ["aquecimento", "feeder", "trabalho", "trabalho", "trabalho"]);
// 2) demais sem preparatórias
for (const pos of [1, 2, 5]) {
  assert.deepEqual(estruturaSeries(top, pos), ["trabalho", "top_set", "back_off"]);
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

// 5b) ordem N−2 trabalho → top → back-off (top_set_backoff)
const tb = (series: number) => ({ series, tecnica: "top_set_backoff" }) as never;
assert.deepEqual(fasesDeTrabalho(tb(2)), ["top_set", "back_off"]);
assert.deepEqual(fasesDeTrabalho(tb(3)), ["trabalho", "top_set", "back_off"]);
assert.deepEqual(fasesDeTrabalho(tb(4)), ["trabalho", "trabalho", "top_set", "back_off"]);
assert.deepEqual(fasesDeTrabalho(tb(1)), ["top_set"]);
for (const n of [1, 2, 3, 4, 5]) assert.equal(fasesDeTrabalho(tb(n)).length, n); // volume = N
// demais técnicas inalteradas (conflito com o motor)
assert.deepEqual(fasesDeTrabalho({ series: 4, tecnica: "padrao" } as never), ["trabalho", "trabalho", "trabalho", "trabalho"]);
assert.equal(descansoSugerido({ fase: "trabalho", composto: true, prescritoSeg: 150 }), 150);

// 6) aquecimento por grupo muscular
const E = (id: string, grupo_primario: string, grupos_secundarios: string[], composto: boolean) => ({ id, grupo_primario, grupos_secundarios, composto }) as never;
const cat = [
  E("agacha", "quadriceps", ["gluteos", "posteriores"], true),
  E("legpress", "quadriceps", ["gluteos"], true),
  E("extensora", "quadriceps", [], false),
  E("flexora", "posteriores", [], false),
  E("supino", "peito", ["triceps", "ombros"], true),
  E("cruci", "peito", [], false),
  E("triceps", "triceps", [], false),
  E("rosca", "biceps", [], false),
];
const P = (...ids: string[]) => ids.map((exercicio_id) => ({ exercicio_id }));
// perna começando com agachamento → resto da perna sem aquecimento (posterior aquecido pelo composto)
assert.deepEqual(preparatoriasDaSessao(P("agacha", "legpress", "extensora", "flexora"), cat), [true, false, false, false]);
// agachamento em 3º num treino de peito → ganha aquecimento
assert.deepEqual(preparatoriasDaSessao(P("supino", "cruci", "agacha", "extensora"), cat), [true, false, true, false]);
// tríceps aquecido pelo supino (composto); isolador só aquece o próprio primário
assert.deepEqual(preparatoriasDaSessao(P("supino", "triceps", "rosca"), cat), [true, false, true]);
assert.deepEqual(preparatoriasDaSessao(P("extensora", "flexora", "agacha"), cat), [true, true, false]);
// 1º sempre tem, mesmo isolador
assert.equal(preparatoriasDaSessao(P("rosca"), cat)[0], true);
// sequência com boolean
assert.deepEqual(estruturaSeries(top, true), estruturaSeries(top, 0));
assert.deepEqual(estruturaSeries(top, false), fasesDeTrabalho(top));
// volume inalterado com 2 exercícios aquecidos (preparatórias fora)
const ex2 = [{ id: "a", grupo_primario: "peito" }, { id: "c", grupo_primario: "quadriceps" }] as never;
const comPrep = [reg("a", "aquecimento"), reg("a", "feeder"), reg("a", "trabalho"), reg("c", "aquecimento"), reg("c", "feeder"), reg("c", "trabalho"), reg("c", "trabalho")];
const semPrep = [reg("a", "trabalho"), reg("c", "trabalho"), reg("c", "trabalho")];
assert.deepEqual(sort(volumeSessaoPorGrupo(comPrep, ex2)), sort(volumeSessaoPorGrupo(semPrep, ex2)));

// 7) arredondamento do aquecimento ao step
assert.equal(cargaAquecimento(30, 5), 15); // 18 → 15 (múltiplo de 5, pra baixo)
assert.equal(cargaAquecimento(30, 2.5), 17.5); // 18 → 17,5
assert.equal(cargaAquecimento(100, 5), 60);
assert.equal(cargaAquecimento(40, 2.5), 22.5); // 24 → 22,5
assert.equal(cargaAquecimento(5, 5), 5); // mínimo = 1 step
assert.equal(cargaAquecimento(0, 5), 0);
for (const [k, st] of [[30, 5], [47.5, 2.5], [82, 5], [12, 2.5]] as const) {
  const v = cargaAquecimento(k, st); assert.ok(Math.abs(v / st - Math.round(v / st)) < 1e-9, `${v} múltiplo de ${st}`);
}
const t = textoAquecimento(30, 2.5);
assert.equal(t, "Aquecimento: 17,5 kg (cerca de 60% da carga de hoje)");
assert.ok(!/[~]|recalc|âncora/.test(t));
console.log("smoke:estrutura-series OK");
