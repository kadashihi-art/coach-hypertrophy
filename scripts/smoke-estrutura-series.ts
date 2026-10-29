/** smoke:estrutura-series — 1º exercício com preparatórias; demais direto; volume igual; timer com fases certas. */
import assert from "node:assert/strict";
import { cargaAproximacao as ap, cargaPrimeiraTrabalho as pt, arredondarStep, cargasDaEstrutura, rotuloOrdemSeries, cargaAquecimento, estruturaSeries, fasesDeTrabalho, preparatoriasDaSessao, proximaFase, seriesTrabalhoFeitas, textoAquecimento } from "../src/lib/treino/estrutura-series";
import { descansoSugerido, rotuloFase } from "../src/lib/treino/rest-timer";
import { volumeSessaoPorGrupo } from "../src/lib/engine/volume";
import { decidirProgressao, pickTopSetAnchor } from "../src/lib/engine/progression";
import { e1rmEpley, melhorE1rm } from "../src/lib/engine/e1rm";
import { adaptarAposSerie } from "../src/lib/engine/adaptacao-ao-vivo";
import { ehSeriePreparatoria, type TipoSerie } from "../src/lib/domain";

const top = { series: 3, tecnica: "top_set_backoff" } as never;
const norm = { series: 3, tecnica: "nenhuma" } as never;

// 1) 1º exercício
assert.deepEqual(estruturaSeries(top, 0), ["aquecimento", "feeder", "trabalho", "top_set", "back_off"]);
assert.deepEqual(estruturaSeries(norm, 0), ["aquecimento", "feeder", "trabalho", "top_set", "back_off"]);
// 2) demais sem preparatórias
for (const pos of [1, 2, 5]) {
  assert.deepEqual(estruturaSeries(top, pos), ["trabalho", "top_set", "back_off"]);
  assert.deepEqual(estruturaSeries(norm, pos), ["trabalho", "top_set", "back_off"]);
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
// padrao também segue a ordem; N=1, drop_set e rest_pause ficam como estavam
assert.deepEqual(fasesDeTrabalho({ series: 4, tecnica: "padrao" } as never), ["trabalho", "trabalho", "top_set", "back_off"]);
assert.deepEqual(fasesDeTrabalho({ series: 2, tecnica: "padrao" } as never), ["top_set", "back_off"]);
assert.deepEqual(fasesDeTrabalho({ series: 1, tecnica: "padrao" } as never), ["trabalho"]);
assert.deepEqual(fasesDeTrabalho({ series: 3, tecnica: "drop_set" } as never), ["trabalho", "trabalho", "trabalho"]);
assert.deepEqual(fasesDeTrabalho({ series: 3, tecnica: "rest_pause" } as never), ["trabalho", "trabalho", "trabalho"]);
assert.equal(rotuloOrdemSeries({ series: 3, tecnica: "padrao" } as never), "1× trabalho → top → back-off");
assert.equal(rotuloOrdemSeries({ series: 2, tecnica: "padrao" } as never), "top → back-off");
assert.equal(rotuloOrdemSeries({ series: 3, tecnica: "drop_set" } as never), "");
// cargas: trabalho 80% / top = motor / back-off 90%, arredondado pra baixo no step (mín 1 step)
assert.deepEqual(cargasDaEstrutura(100, 5), { trabalho: 80, top_set: 100, back_off: 90 });
assert.deepEqual(cargasDaEstrutura(80, 5), { trabalho: 60, top_set: 80, back_off: 70 }); // 64→60, 72→70
assert.deepEqual(cargasDaEstrutura(62.5, 2.5), { trabalho: 50, top_set: 62.5, back_off: 55 }); // 50, 56.25→55
assert.deepEqual(cargasDaEstrutura(5, 5), { trabalho: 5, top_set: 5, back_off: 5 });
assert.equal(arredondarStep(0, 5), 0);
// progressão: R1–R3 avaliam o top; e1RM vem do top
{
  const est = { exercicio_id: "x", faixa_reps: [6, 10], carga_atual_kg: 100, rir_alvo: 2, origem_carga: "historico", primeira_sessao: false, sessoes_sem_progresso: 0 } as never;
  const S = (tipo_serie: TipoSerie, carga_kg: number, reps: number, rir_percebido: number) => ({ tipo_serie, carga_kg, reps, rir_percebido, dor: false, exercicio_id: "x" }) as never;
  const inp = (series: never[]) => ({ exercicio_id: "x", sessao_id: "s", grupo_primario: "quadriceps", series, estado: est, tecnica: "padrao" }) as never;
  // top no topo da faixa com RIR ok → R1 sobe, mesmo com trabalho/back-off abaixo do topo
  const d1 = decidirProgressao(inp([S("trabalho", 80, 8, 3), S("top_set", 100, 10, 2), S("back_off", 90, 8, 3)]));
  assert.equal(d1.regra, "R1"); assert.equal(d1.acao, "subir_carga"); assert.equal(d1.nova_carga_kg, 105);
  // top abaixo do topo com RIR ok → R2 mantém
  assert.equal(decidirProgressao(inp([S("trabalho", 80, 10, 3), S("top_set", 100, 8, 2), S("back_off", 90, 10, 3)])).regra, "R2");
  // top com RIR abaixo do alvo → R3
  assert.equal(decidirProgressao(inp([S("trabalho", 80, 10, 3), S("top_set", 100, 8, 1), S("back_off", 90, 10, 3)])).regra, "R3");
  // R4 continua: ≥2 séries abaixo do piso (limiar inalterado)
  assert.equal(decidirProgressao(inp([S("trabalho", 80, 5, 0), S("top_set", 100, 5, 0), S("back_off", 90, 8, 2)])).regra, "R4");
  // séries uniformes (sem top) → comportamento antigo
  assert.equal(decidirProgressao(inp([S("trabalho", 100, 10, 2), S("trabalho", 100, 10, 2), S("trabalho", 100, 10, 2)])).regra, "R1");
  // e1RM do top (trabalho mais leve com mais reps não domina)
  assert.equal(melhorE1rm([S("trabalho", 80, 15, 0), S("top_set", 100, 6, 2)] as never), e1rmEpley(100, 6));
  assert.equal(melhorE1rm([S("trabalho", 80, 10, 2)] as never), e1rmEpley(80, 10));
  // EstadoExercicio: top e back-off vêm das séries certas
  assert.equal(pickTopSetAnchor([S("trabalho", 80, 8, 3), S("top_set", 100, 8, 2), S("back_off", 90, 8, 3)] as never)?.carga_kg, 100);
}
// adaptação ao vivo: falha no trabalho (80% do top) corta a partir do top, não da carga de 80%
{
  const pr = { id: "p", series: 3, tecnica: "padrao", faixa_reps: [6, 10], rir_alvo: 2, carga: { trabalho_kg: 100, top_set_kg: null, origem: "historico" }, alternativa_equipamento_ocupado: null } as never;
  const r = { tipo_serie: "trabalho", carga_kg: 80, reps: 4, rir_percebido: 0, dor: false } as never;
  const a = adaptarAposSerie({ registro: r, seriesAnteriores: [], presc: pr, stepKg: 5 });
  assert.equal(a.aplicada, true); assert.equal(a.carga_sugerida_kg, 95); // 100×0,925 no step 5 (regra existente)
  const pu = { ...(pr as object), tecnica: "drop_set" } as never; // fora da ordem: comportamento antigo (base = carga da série)
  assert.equal(adaptarAposSerie({ registro: r, seriesAnteriores: [], presc: pu, stepKg: 5 }).carga_sugerida_kg, 75);
}
// volume continua N
const v3 = [reg("a", "trabalho"), reg("a", "top_set"), reg("a", "back_off")];
assert.equal(volumeSessaoPorGrupo(v3, ex).find((x: { grupo: string }) => x.grupo === "quadriceps")?.realizado, volumeSessaoPorGrupo([reg("a", "trabalho"), reg("a", "trabalho"), reg("a", "trabalho")], ex).find((x: { grupo: string }) => x.grupo === "quadriceps")?.realizado);
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

// 8) aproximação = 85% da 1ª série de trabalho efetiva, pra baixo no step; aquec ≤ aprox < trabalho
{
  const ce = cargasDaEstrutura;
  const tabela = (topKg: number, st: number, n: number) => {
    const c = ce(topKg, st); const aq = cargaAquecimento(topKg, st);
    const prim = pt({ series: n, tecnica: "top_set_backoff" } as never, topKg, c.trabalho, st);
    return { aquec: aq, aprox: ap(prim, st, aq), trabalho: c.trabalho, top: topKg, back_off: c.back_off };
  };
  // agachamento (step 5, top 90, 4 séries): antes aprox 80 > trabalho 70
  assert.deepEqual(tabela(90, 5, 4), { aquec: 50, aprox: 55, trabalho: 70, top: 90, back_off: 80 });
  // remada (step 2,5, top 70, 4 séries): antes aprox 60 > trabalho 55
  assert.deepEqual(tabela(70, 2.5, 4), { aquec: 40, aprox: 45, trabalho: 55, top: 70, back_off: 62.5 });
  // N=2 (top → back-off): 1ª efetiva é o próprio top
  assert.equal(pt({ series: 2, tecnica: "reta" } as never, 100, 80, 5), 100);
  // N=1 / drop_set / rest_pause: a própria série
  assert.equal(pt({ series: 1, tecnica: "reta" } as never, 60, 60, 2.5), 60);
  assert.equal(pt({ series: 3, tecnica: "drop_set" } as never, 60, 50, 2.5), 50);
  assert.equal(pt({ series: 3, tecnica: "rest_pause" } as never, 60, 50, 2.5), 50);
  assert.equal(ap(60, 2.5, cargaAquecimento(60, 2.5)), 50); // 51 → 50
  // steps 1 / 2,5 / 5
  assert.equal(ap(40, 1), 34);
  assert.equal(ap(13, 1), 11); // 11,05 → 11
  assert.equal(ap(55, 2.5), 45); // 46,75 → 45
  assert.equal(ap(70, 5), 55); // 59,5 → 55
  // step grosso: 85% arredonda pro próprio trabalho → trabalho − 1 step
  assert.equal(ap(5, 2.5), 2.5); // 4,25 → 2,5
  assert.equal(ap(10, 5, 5), 5); // 8,5 → 5 = aquecimento (colisão documentada: igual, nunca acima do trabalho)
  assert.equal(ap(5, 5), 5); // trabalho = 1 step: mínimo 1 step
  assert.equal(ap(0, 5), 0);
  // propriedade: aquec ≤ aprox < trabalho (trabalho ≥ 2 steps)
  for (const st of [1, 2.5, 5]) for (let top = 4 * st; top <= 200; top += st) for (const n of [1, 2, 3, 4, 5]) {
    const c = ce(top, st); const aq = cargaAquecimento(top, st);
    const prim = pt({ series: n, tecnica: "top_set_backoff" } as never, top, c.trabalho, st);
    const a = ap(prim, st, aq);
    if (prim >= 2 * st) assert.ok(a < prim, `aprox ${a} < trabalho ${prim} (top ${top}, step ${st}, N ${n})`);
    if (aq < prim) assert.ok(a >= aq, `aprox ${a} ≥ aquec ${aq} (top ${top}, step ${st})`);
    assert.ok(Math.abs(a / st - Math.round(a / st)) < 1e-9);
  }
}
console.log("smoke:estrutura-series OK");
