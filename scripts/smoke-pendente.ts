/** Treino não feito não é pulado: a sequência anda por treino (só leitura, nada gravado). */
import assert from "node:assert/strict";
import { agendaEfetiva, avisoPendente } from "../src/lib/plan/pendente";
import { proximaSessao } from "../src/lib/plan/proxima-sessao";

// Seg/Qua/Sex por 2 semanas (6 treinos), início 02/11/2026.
const datas = ["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-09", "2026-11-11", "2026-11-13"];
function mk(status: Record<number, string> = {}) {
  const sessoes = datas.map((d, i) => ({
    id: `s${i}`, nome: `Treino ${"ABC"[i % 3]}${i}`, ordem: i, data: d, status: status[i] ?? "planejada",
    prescricoes: [{ id: `p${i}` }],
  }));
  return {
    sessoes, active_sessao_id: null,
    plano: { dias_por_semana: 3, sessoes: sessoes.map((s) => s.id), mesociclo: { data_inicio: "2026-11-02" } },
  } as never;
}
const congelado = (st: unknown) => JSON.stringify(st);
const datasDe = (a: { sessoes: Array<{ id: string; data: string }> }) => a.sessoes.map((s) => s.data);

// 1) Não treinou ontem (seg 02/11 feito; qua 04/11 não feito; hoje qui 05/11).
{
  const st = mk({ 0: "concluida" });
  const antes = congelado(st);
  const a = agendaEfetiva(st, "2026-11-05");
  assert.equal(congelado(st), antes, "não grava nada");
  assert.equal(proximaSessao(st, "2026-11-05")?.id, "s1", "o de ontem continua sendo o próximo");
  assert.deepEqual(datasDe(a as never), ["2026-11-02", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-11", "2026-11-13"]);
  assert.deepEqual(a.pendentes.map((p) => p.sessao_id), ["s1"]);
  assert.equal(avisoPendente(a.pendentes, "2026-11-05")!.titulo, "Treino de ontem ficou pendente");
  assert.equal(avisoPendente(a.pendentes, "2026-11-07")!.titulo, "Treino de 04/11 ficou pendente");
}
// 2) Dois dias de treino seguidos sem treinar (qua e sex), hoje sáb 07/11.
{
  const st = mk({ 0: "concluida" });
  const a = agendaEfetiva(st, "2026-11-07");
  assert.equal(proximaSessao(st, "2026-11-07")?.id, "s1");
  const d = datasDe(a as never);
  assert.deepEqual(d.slice(1, 4), ["2026-11-07", "2026-11-09", "2026-11-11"], "ordem por treino");
  // 3) Sem buraco no fim: os 2 treinos que sobraram ganham dias novos no mesmo ritmo, em ordem e sem repetir dia.
  assert.deepEqual(d.slice(4), ["2026-11-13", "2026-11-16"]);
  assert.equal(new Set(d).size, d.length);
  assert.deepEqual([...d].sort(), d);
  assert.equal(avisoPendente(a.pendentes, "2026-11-07")!.titulo, "2 treinos ficaram pendentes");
}
// 4) Pulo explícito é respeitado: s1 pulado → próximo é s2; s1 fica no dia dele.
{
  const st = mk({ 0: "concluida", 1: "pulada" });
  assert.equal(proximaSessao(st, "2026-11-05")?.id, "s2");
  const a = agendaEfetiva(st, "2026-11-05");
  assert.equal(a.sessoes[1]!.data, "2026-11-04");
  assert.equal(a.pendentes.length, 0);
  assert.deepEqual(datasDe(a as never), datas, "sem pendente nada muda");
}
// 5) Já treinou hoje: o pendente vai para o próximo dia.
{
  const st = mk({ 0: "concluida" });
  (st as { sessoes: Array<{ data: string; status: string }> }).sessoes[0]!.data = "2026-11-05";
  const a = agendaEfetiva(st, "2026-11-05");
  assert.equal(a.sessoes[1]!.data, "2026-11-06");
}
// 6) Em dia: nada muda.
{
  const st = mk({ 0: "concluida" });
  assert.deepEqual(datasDe(agendaEfetiva(st, "2026-11-03") as never), datas);
  assert.equal(proximaSessao(st, "2026-11-03")?.id, "s1");
}
console.log("smoke-pendente OK");
