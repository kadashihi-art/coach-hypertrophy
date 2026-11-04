/** Limpar dia no calendário + chips da semana iguais ao calendário + pendente respeita marcações manuais. */
import assert from "node:assert/strict";
import { agendaEfetiva } from "../src/lib/plan/pendente";
import { derivarCalendario, desfazerLimpeza, limparDia, semanaDoCalendario } from "../src/lib/plan/calendario";
import { proximaSessao } from "../src/lib/plan/proxima-sessao";

// Seg/Qua/Sex por 2 semanas, início 02/11/2026.
const datas = ["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-09", "2026-11-11", "2026-11-13"];
function mk(status: Record<number, string> = {}, extra: Record<number, object> = {}) {
  const sessoes = datas.map((d, i) => ({
    id: `s${i}`, nome: `Treino ${i}`, ordem: i, data: d, status: status[i] ?? "planejada",
    prescricoes: [{ id: `p${i}` }], ...(extra[i] ?? {}),
  }));
  return {
    sessoes, active_sessao_id: null,
    registros: [{ id: "r1", sessao_id: "s0", kg: 50, reps: 10 }, { id: "r2", sessao_id: "s1", kg: 60, reps: 8 }],
    plano: { dias_por_semana: 3, sessoes: sessoes.map((s) => s.id), mesociclo: { data_inicio: "2026-11-02" } },
  } as never as Parameters<typeof limparDia>[0];
}
const datasDe = (ss: Array<{ data: string | null }>) => ss.map((s) => s.data);

// 1) Limpar dia com treino planejado: sai do dia, volta pra fila, continua no plano, nada apagado.
{
  const st = mk({ 0: "concluida", 1: "concluida" });
  const antes = JSON.stringify(st);
  const r = limparDia(st, "2026-11-06", "s2");
  assert.equal(JSON.stringify(st), antes, "função pura: não muta o estado");
  assert.ok(r.ok);
  if (!r.ok) throw new Error();
  assert.equal(r.tirado, "Treino 2");
  const s2 = r.state.sessoes.find((s) => s.id === "s2")!;
  assert.equal(s2.data, null);
  assert.equal(s2.status, "planejada");
  assert.equal(r.state.sessoes.length, 6, "treino continua no plano");
  assert.deepEqual(r.state.registros, st.registros, "séries intactas");
  assert.deepEqual(r.state.dias_limpos, ["2026-11-06"]);
  const a = agendaEfetiva(r.state, "2026-11-05");
  assert.deepEqual(datasDe(a.sessoes), ["2026-11-02", "2026-11-04", "2026-11-09", "2026-11-11", "2026-11-13", "2026-11-16"]);
  assert.equal(proximaSessao(r.state, "2026-11-05")?.id, "s2", "o treino tirado é o próximo da fila");
  const cal = derivarCalendario(a.sessoes, 2026, 10, r.state.dias_limpos);
  assert.equal(cal.find((d) => d.data === "2026-11-06")!.status, "limpo");
  // Desfazer limpeza: o dia volta a poder receber treino.
  const des = desfazerLimpeza(r.state, "2026-11-06");
  assert.deepEqual(des.dias_limpos, []);
  // Limpar dia vazio só marca o dia.
  const v = limparDia(st, "2026-11-07", null);
  assert.ok(v.ok && v.tirado === null && v.state.sessoes === st.sessoes);
}
// 2) Dia com treino feito: não limpa (vai pro Corrigir registro), nada muda.
{
  const st = mk({ 0: "concluida" });
  const r = limparDia(st, "2026-11-02", "s0");
  assert.deepEqual(r, { ok: false, motivo: "feito" });
  assert.deepEqual(limparDia(mk({ 0: "parcial" }), "2026-11-02", "s0"), { ok: false, motivo: "feito" });
  assert.deepEqual(limparDia(mk({ 1: "em_andamento" }), "2026-11-04", "s1"), { ok: false, motivo: "em_andamento" });
}
// 3) Chips da semana em Hoje = calendário (planejar, mover, pular, limpar).
{
  let st = mk({ 0: "concluida", 2: "pulada" }, { 3: { data: "2026-11-08", data_manual: true } });
  const r = limparDia(st, "2026-11-04", "s1");
  assert.ok(r.ok);
  if (r.ok) st = r.state;
  for (const hoje of ["2026-11-03", "2026-11-05", "2026-11-10"]) {
    const ag = agendaEfetiva(st, hoje).sessoes;
    const cal = derivarCalendario(ag, 2026, 10, st.dias_limpos);
    const chips = semanaDoCalendario(ag, hoje, st.dias_limpos);
    assert.equal(chips.length, 7);
    for (const c of chips) {
      const d = cal.find((x) => x.data === c.iso)!;
      assert.equal(c.st, d.status, `chip ${c.iso} igual ao calendário`);
      assert.equal(c.nome, d.nome);
    }
  }
  const chips = semanaDoCalendario(agendaEfetiva(st, "2026-11-05").sessoes, "2026-11-05", st.dias_limpos);
  assert.deepEqual(chips.map((c) => c.st), ["feito", "vazio", "limpo", "vazio", "pulado", "vazio", "planejado"]);
}
// 4) Pendente respeita dia limpo e treino movido à mão.
{
  // s1 (04/11) não foi feito; hoje 05/11 está limpo; s3 foi movido à mão para 10/11.
  const st = { ...mk({ 0: "concluida" }, { 3: { data: "2026-11-10", data_manual: true } }), dias_limpos: ["2026-11-05"] };
  const a = agendaEfetiva(st as never, "2026-11-05");
  const d = Object.fromEntries(a.sessoes.map((s) => [s.id, s.data]));
  assert.notEqual(d.s1, "2026-11-05", "não põe treino em dia limpo");
  assert.equal(d.s1, "2026-11-06");
  assert.equal(d.s3, "2026-11-10", "data manual não é sobrescrita");
  const usadas = a.sessoes.map((s) => s.data);
  assert.equal(new Set(usadas).size, usadas.length, "sem dia repetido");
  assert.ok(!usadas.includes("2026-11-05"));
  assert.deepEqual(a.pendentes.map((p) => p.sessao_id), ["s1"]);
  // Pulo manual também fica no dia.
  const p = agendaEfetiva(mk({ 0: "concluida", 2: "pulada" }) as never, "2026-11-05");
  assert.equal(p.sessoes.find((s) => s.id === "s2")!.data, "2026-11-06");
}
console.log("smoke-limpar-dia OK");
