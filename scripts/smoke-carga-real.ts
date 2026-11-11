/**
 * smoke:carga-real — o usuário achou a sugestão leve e levantou mais (caso real, dados sintéticos).
 * A próxima sugestão tem que partir do que ele LEVANTOU (não do número antigo), em todas as fases.
 */
import assert from "node:assert/strict";
import { aplicarDecisao, aplicarEstadoNaPrescricao, decidirProgressao } from "../src/lib/engine/progression";
import { cargaSugeridaParaExercicio } from "../src/lib/engine/memoria-carga";
import { cargaAproximacao, cargaAquecimento, cargasDaEstrutura } from "../src/lib/treino/estrutura-series";
import { incrementoCargaKg, type EstadoExercicio, type GrupoMuscular, type RegistroSerie, type TipoSerie } from "../src/lib/domain";

type Caso = { id: string; grupo: GrupoMuscular; atual: number; faixa: [number, number]; sets: [TipoSerie, number, number, number][]; primeira?: boolean };
// [tipo, kg, reps, rir]
const casos: Caso[] = [
  { id: "cadeira_extensora", grupo: "quadriceps", atual: 15, faixa: [10, 15], primeira: true, sets: [["aquecimento", 30, 12, 5], ["trabalho", 60, 10, 2], ["top_set", 66, 9, 0], ["back_off", 57.5, 10, 1]] },
  { id: "panturrilha_em_pe", grupo: "panturrilhas", atual: 22.5, faixa: [8, 12], sets: [["trabalho", 70, 12, 2], ["top_set", 80, 10, 1], ["back_off", 70, 11, 1]] },
  { id: "supino_reto", grupo: "peito", atual: 22.5, faixa: [6, 10], sets: [["trabalho", 40, 9, 2], ["top_set", 45, 8, 1], ["back_off", 40, 8, 1]] },
  { id: "leg_press", grupo: "quadriceps", atual: 74, faixa: [8, 12], sets: [["trabalho", 100, 10, 2], ["top_set", 120, 8, 1], ["back_off", 105, 9, 1]] },
  { id: "stiff", grupo: "isquiotibiais", atual: 25, faixa: [6, 10], sets: [["trabalho", 45, 8, 2], ["top_set", 50, 6, 1], ["back_off", 45, 7, 1]] },
];

const estado = (c: Caso): EstadoExercicio => ({
  exercicio_id: c.id, carga_atual_kg: c.atual, faixa_reps: c.faixa, rir_alvo: 2,
  alvo_proxima_sessao: { carga_kg: c.atual, faixa_reps: c.faixa, rir_alvo: 2 },
  sessoes_sem_progresso: 0, ultima_progressao_em: null, e1rm_estimado_kg: 0, pr_carga_kg: 0, pr_reps: 0,
  origem_carga: c.primeira ? "estimativa_conservadora" : "calibracao", primeira_sessao: !!c.primeira,
  ultimo_top_kg: null, ultimo_back_off_kg: null, ultimo_rir: null, ultima_sessao_em: null, atualizado_em: "2026-11-01T12:00:00Z",
});

for (const c of casos) {
  const series = c.sets.map(([tipo_serie, carga_kg, reps, rir], i) => ({
    id: `r${i}`, sessao_id: "s1", prescricao_id: "p1", exercicio_id: c.id, serie_n: i + 1, tipo_serie, carga_kg, reps, rir_percebido: rir, dor: false, registrado_em: "2026-11-01T12:00:00Z",
  })) as unknown as RegistroSerie[];
  const est = estado(c);
  const d = decidirProgressao({ exercicio_id: c.id, sessao_id: "s1", grupo_primario: c.grupo, series, estado: est, tecnica: "nenhuma" });
  const novo = aplicarDecisao(est, d, series);
  const real = Math.max(...c.sets.filter((s) => s[0] !== "aquecimento" && s[0] !== "feeder").map((s) => s[1]));
  const top = novo.alvo_proxima_sessao.carga_kg;
  const step = incrementoCargaKg(c.grupo);
  // perto do que ele levanta: nunca abaixo de 85% nem acima de +10% (+1 step de folga de arredondamento)
  assert.ok(top >= real * 0.85 && top <= real * 1.1 + step, `${c.id}: top ${top} longe do real ${real} (${d.regra} ${d.motivo})`);
  assert.ok(top > c.atual, `${c.id}: não pode voltar pro número antigo ${c.atual}`);
  const presc = aplicarEstadoNaPrescricao({ id: "p1", exercicio_id: c.id, series: 3, tecnica: "nenhuma", faixa_reps: c.faixa, rir_alvo: 2, carga: { trabalho_kg: c.atual, top_set_kg: null, origem: "estimativa_conservadora" } } as never, novo);
  const fases = cargasDaEstrutura(presc.carga.trabalho_kg, step);
  const aq = cargaAquecimento(fases.top_set, step);
  // Ordem nova: aproximação → top → back-offs (a 1ª série que vale é o top).
  const ap = cargaAproximacao(fases.top_set, step, aq);
  assert.ok(aq <= ap && ap < fases.top_set && fases.back_off <= fases.top_set && fases.back_off >= fases.top_set * 0.8, `${c.id}: fases fora de ordem ${JSON.stringify({ top, aq, ap, fases })}`);
  const sug = cargaSugeridaParaExercicio({ estados: [novo], registros: series, exercicios: [{ id: c.id, grupo_primario: c.grupo } as never] }, c.id, c.atual);
  assert.equal(sug.carga_kg, top, `${c.id}: memória de carga diverge do estado`);
  console.log(`PASS ${c.id}: antes ${c.atual} → top ${top} (real ${real}) | aquec ${aq} · aprox ${ap} · top ${fases.top_set} · back-off ${fases.back_off} [${d.regra}]`);
}

// Limite de segurança: RIR 0 nunca sobe acima do que foi levantado; subida por sessão ≤ 2 degraus.
{
  const c = casos[0]!;
  const series = [{ id: "x", sessao_id: "s", prescricao_id: "p", exercicio_id: c.id, serie_n: 1, tipo_serie: "top_set", carga_kg: 40, reps: 20, rir_percebido: 5, dor: false }] as unknown as RegistroSerie[];
  const d = decidirProgressao({ exercicio_id: c.id, sessao_id: "s", grupo_primario: c.grupo, series, estado: estado(c), tecnica: "nenhuma" });
  assert.ok(d.nova_carga_kg <= 40 + 2 * 5, `cap por sessão: ${d.nova_carga_kg}`);
  console.log(`PASS cap por sessão: 40×20 RIR5 → ${d.nova_carga_kg}`);
}
console.log("smoke:carga-real OK");
