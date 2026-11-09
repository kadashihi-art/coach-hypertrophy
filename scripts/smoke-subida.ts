/**
 * Quando subir carga (item 3).
 * - R1 tolerante: 1ª série no topo e as de trás caindo pouco por fadiga também sobem.
 * - Salto relativo: em carga leve o degrau fixo vira salto enorme; segura e progride por reps
 *   até a carga nova caber (conta e1RM) ou até passar 4 reps do topo.
 * - 2 degraus por folga só se o salto total ficar em até 10%.
 */
import type { EstadoExercicio, GrupoMuscular, RegistroSerie } from "../src/lib/domain";
import { decidirProgressao, subidaCabe } from "../src/lib/engine/progression";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  console.log(cond ? "✓" : "✗", msg);
  if (!cond) falhas++;
}

function estado(kg: number, faixa: [number, number], rir = 2): EstadoExercicio {
  return {
    exercicio_id: "x", carga_atual_kg: kg, faixa_reps: faixa, rir_alvo: rir,
    alvo_proxima_sessao: { carga_kg: kg, faixa_reps: faixa, rir_alvo: rir },
    sessoes_sem_progresso: 0, ultima_progressao_em: null, e1rm_estimado_kg: 0, pr_carga_kg: 0, pr_reps: 0,
    origem_carga: "historico", primeira_sessao: false, ultimo_top_kg: null, ultimo_back_off_kg: null,
    ultimo_rir: null, ultima_sessao_em: null, atualizado_em: "2026-11-01T00:00:00.000Z",
  };
}
function series(kg: number, reps: number[], rirs: number[], tipo: RegistroSerie["tipo_serie"] = "trabalho"): RegistroSerie[] {
  return reps.map((r, i) => ({
    id: `s${i}`, sessao_id: "s", prescricao_id: "p", exercicio_id: "x", numero: i + 1, tipo_serie: tipo,
    carga_kg: kg, reps: r, rir_percebido: rirs[i] ?? rirs[rirs.length - 1]!, dor: false, executado_em: "2026-11-01T10:00:00.000Z",
  }));
}
function decidir(e: EstadoExercicio, ss: RegistroSerie[], grupo: GrupoMuscular = "peito", tecnica?: string) {
  return decidirProgressao({ exercicio_id: "x", sessao_id: "s", grupo_primario: grupo, series: ss, estado: e, tecnica });
}

// 1) R1 tolerante (supino 60 kg, faixa 8–12, RIR alvo 2).
{
  const e = estado(60, [8, 12]);
  const d = decidir(e, series(60, [12, 11, 11], [2, 2, 1]));
  ok(d.regra === "R1" && d.nova_carga_kg === 62.5, `12/11/11 com fadiga normal sobe pra 62,5 (got ${d.regra} ${d.nova_carga_kg})`);
  const d2 = decidir(e, series(60, [12, 11, 10], [2, 2, 1]));
  ok(d2.acao !== "subir_carga", `12/11/10 ainda não sobe: perdeu mais de 1 rep por série (got ${d2.regra} ${d2.acao})`);
  const d3 = decidir(e, series(60, [12, 12, 9], [2, 2, 1]));
  ok(d3.acao !== "subir_carga", `série a 3 reps do topo não sobe (got ${d3.regra})`);
  const d4 = decidir(e, series(60, [12, 11, 11], [1, 1, 0]));
  ok(d4.acao !== "subir_carga", `1ª série já no RIR 1 (abaixo do alvo) não sobe pelo tolerante (got ${d4.regra})`);
  const d5 = decidir(e, series(60, [12, 12, 12], [2, 2, 2]));
  ok(d5.regra === "R1" && d5.nova_carga_kg === 62.5, `estrito continua igual (got ${d5.nova_carga_kg})`);
}

// 2) Salto grande em carga leve (elevação lateral 6 kg, faixa 10–15).
{
  const e = estado(6, [10, 15]);
  const d = decidir(e, series(6, [15, 15, 15], [2]), "ombros");
  ok(d.acao === "manter_carga" && d.nova_carga_kg === 6, `6 → 8,5 kg (+42%) segura a carga (got ${d.regra} ${d.acao} ${d.nova_carga_kg})`);
  ok(/salto de 42%/.test(d.motivo), `motivo explica o salto: "${d.motivo}"`);
  const d2 = decidir(e, series(6, [17, 16, 15], [2]), "ombros");
  ok(d2.acao === "manter_carga", `reps acima do topo seguem progredindo por reps (got ${d2.regra} ${d2.acao})`);
  const d3 = decidir(e, series(6, [19, 18, 17], [2]), "ombros");
  ok(d3.regra === "R1" && d3.nova_carga_kg === 8.5, `passou 4 reps do topo: sobe (got ${d3.regra} ${d3.nova_carga_kg})`);
}

// 3) Salto > 10% que cabe pela conta sobe direto.
{
  const c = subidaCabe({ cargaKg: 20, novaKg: 22.5, series: series(20, [15], [3]), faixaReps: [10, 15], rirAlvo: 2 });
  ok(c.cabe && c.repsPrevistas === 10, `20 → 22,5 (+12,5%) com 15 reps @ RIR 3 cabe: prevê ${c.repsPrevistas} reps`);
}

// 4) Carga pesada não muda nada (100 kg, degrau 5 = 5%).
{
  const d = decidir(estado(100, [8, 12]), series(100, [12, 12, 12], [2]), "quadriceps");
  ok(d.regra === "R1" && d.nova_carga_kg === 105, `100 → 105 kg igual a antes (got ${d.nova_carga_kg})`);
}

// 5) Folga de 2 degraus só se o salto total for até 10%.
{
  const leve = decidir(estado(40, [8, 12]), series(40, [12, 12, 12], [4]));
  ok(leve.nova_carga_kg === 42.5, `40 kg com muita folga: 1 degrau (45 seria +12,5%) (got ${leve.nova_carga_kg})`);
  const pesado = decidir(estado(60, [8, 12]), series(60, [12, 12, 12], [4]));
  ok(pesado.nova_carga_kg === 65, `60 kg com muita folga: 2 degraus (+8%) (got ${pesado.nova_carga_kg})`);
}

// 6) Top set leve (R8): 10 kg → 12,5 (+25%) não cabe com 12 reps @ RIR 1.
{
  const d = decidir(estado(10, [8, 12]), series(10, [12], [1], "top_set"), "biceps", "top_set_backoff");
  ok(d.regra === "R8" && d.acao === "manter_carga", `top set leve segura (got ${d.regra} ${d.acao})`);
  const d2 = decidir(estado(60, [6, 10]), series(60, [8], [1], "top_set"), "peito", "top_set_backoff");
  ok(d2.regra === "R8" && d2.nova_carga_kg === 62.5, `top set pesado sobe como antes (got ${d2.nova_carga_kg})`);
}

// 7) Peso corporal (0 kg) não é afetado pela regra de salto.
{
  const c = subidaCabe({ cargaKg: 0, novaKg: 2.5, series: series(0, [15], [2]), faixaReps: [8, 12], rirAlvo: 2 });
  ok(c.cabe, "sem carga externa: regra de salto não se aplica");
}

// 8) Precisão: série feita mais leve não prova a carga cheia.
{
  const ss = series(60, [12, 12, 12], [2]);
  ss[2] = { ...ss[2]!, carga_kg: 50 };
  const d = decidir(estado(60, [8, 12]), ss);
  ok(d.acao === "manter_carga" && /série 3 foi com 50 kg/.test(d.motivo), `série 3 com 50 kg segura a subida (got ${d.regra} ${d.acao})`);
}

// 9) Precisão: back-off (mais leve de propósito) não entra na conta do R1.
{
  const ss = [...series(60, [12, 12], [2]), ...series(50, [9], [2], "back_off").map((s) => ({ ...s, id: "bo", numero: 3 }))];
  const d = decidir(estado(60, [8, 12]), ss);
  ok(d.regra === "R1" && d.nova_carga_kg === 62.5, `back-off abaixo da faixa não trava a subida (got ${d.regra} ${d.nova_carga_kg})`);
}

// 10) Precisão: RIR corrigido pela queda de reps.
{
  // Marcou RIR 3 em tudo, mas despencou 12 → 8 na mesma carga: estava perto da falha.
  const perto = decidir(estado(60, [8, 12], 2), series(60, [12, 8, 8], [3, 3, 3]));
  ok(/RIR ajustado pela queda de reps: série 1 marcada RIR 3, considerei 2/.test(perto.motivo), `queda forte corrige o RIR e explica: "${perto.motivo}"`);
  // Marcou "falha" (RIR 0) mas repetiu as reps: sobrava. Com a 1ª corrigida, o R1 tolerante sobe.
  const sobra = decidir(estado(60, [8, 12], 1), series(60, [12, 12, 11], [0, 0, 0]));
  ok(sobra.regra === "R1" && sobra.acao === "subir_carga", `"falha" que repete reps conta como sobra (got ${sobra.regra} ${sobra.acao})`);
  // Sem queda estranha, nada muda.
  const normal = decidir(estado(60, [8, 12]), series(60, [12, 12, 12], [2]));
  ok(!/RIR ajustado/.test(normal.motivo), "sem sinal forte, o RIR relatado vale");
}

if (falhas > 0) {
  console.error(`smoke:subida FALHOU (${falhas})`);
  process.exit(1);
}
console.log("smoke:subida OK");
