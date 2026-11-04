/** smoke:duracao — duração do treino e descanso real a partir dos horários das séries (item 5). */
import { calcularDuracaoTreino, comparacaoMeta, duracaoDaSessao, formatarDescanso } from "../src/lib/engine/duracao-treino";
import { readFileSync } from "node:fs";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const t0 = Date.parse("2026-11-04T18:00:00.000Z");
const at = (min: number) => ({ sessao_id: "s1", executado_em: new Date(t0 + min * 60_000).toISOString() });

// 10 séries a cada 2 min → 18 min ativos + 4 de margem
const normal = Array.from({ length: 10 }, (_, i) => at(i * 2));
const a = calcularDuracaoTreino(normal)!;
ok(a.duracao_min === 22, `duração normal = 22 min (veio ${a.duracao_min})`);
ok(a.descanso_medio_s === 120, `descanso médio 120 s (veio ${a.descanso_medio_s})`);
ok(a.pausas_ignoradas === 0, "sem pausas");

// fora de ordem dá o mesmo
ok(calcularDuracaoTreino([...normal].reverse())!.duracao_min === 22, "ordem não importa");

// treino aberto e retomado no dia seguinte
const virada = [...normal, at(18 + 60 * 20), at(18 + 60 * 20 + 2)];
const b = calcularDuracaoTreino(virada)!;
ok(b.pausas_ignoradas === 1, "pausa do dia seguinte ignorada");
ok(b.duracao_min === 24, `duração sem a pausa = 24 min (veio ${b.duracao_min})`);

// registro em lote (5 s) e troca longa (20 min) não entram no descanso
const lote = [at(0), { sessao_id: "s1", executado_em: new Date(t0 + 5000).toISOString() }, at(3), at(23)];
const c = calcularDuracaoTreino(lote)!;
ok(c.descanso_medio_s === 175, `descanso só com intervalos plausíveis (veio ${c.descanso_medio_s})`);

// teto
const longo = Array.from({ length: 30 }, (_, i) => at(i * 29));
ok(calcularDuracaoTreino(longo)!.duracao_min === 240, "teto de 240 min");

// poucos dados
ok(calcularDuracaoTreino([at(0)]) === null, "1 série: sem duração");
ok(calcularDuracaoTreino([{ executado_em: "lixo" }, at(0)]) === null, "horário inválido ignorado");

// sessões antigas: gravada vence; sem gravada calcula na hora sem mutar
const sessAntiga = { id: "s1", duracao_real_min: null as number | null };
const d = duracaoDaSessao(sessAntiga, normal)!;
ok(d.duracao_min === 22 && sessAntiga.duracao_real_min === null, "antiga: calcula na exibição, não grava");
ok(duracaoDaSessao({ id: "s1", duracao_real_min: 50 }, normal)!.duracao_min === 50, "gravada vence");
ok(duracaoDaSessao({ id: "x", duracao_real_min: null }, normal) === null, "sem horários: nada");

// textos
ok(formatarDescanso(95) === "1 min 35 s" && formatarDescanso(40) === "40 s" && formatarDescanso(120) === "2 min", "formato do descanso");
ok(comparacaoMeta(62, 60) === "Dentro da sua meta de 60 min.", "meta dentro");
ok(comparacaoMeta(80, 60) === "20 min acima da sua meta de 60 min.", "meta acima");
ok(comparacaoMeta(40, 60) === "20 min abaixo da sua meta de 60 min.", "meta abaixo");
ok(comparacaoMeta(40, null) === null, "sem meta");

// conclusão grava duracao_real_min e não mexe na progressão
const src = readFileSync("src/lib/engine/concluir-sessao.ts", "utf8");
ok(/duracao_real_min:\s*\n?\s*calcularDuracaoTreino\(seriesSessao\)/.test(src), "concluirSessao preenche duracao_real_min");
const ui = readFileSync("src/app/treino/feedback/page.tsx", "utf8") + readFileSync("src/app/plano/calendario/page.tsx", "utf8");
ok(!/\bmotor\b/i.test(ui), "sem 'motor' na UI");

console.log(fail ? `\n${fail} FAIL` : "\nOK smoke:duracao");
process.exit(fail ? 1 : 0);
