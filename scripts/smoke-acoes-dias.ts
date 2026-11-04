/** Ações do calendário/chips em hoje e dias futuros, inclusive dias que só existem pela agenda calculada. */
import assert from "node:assert/strict";
import { agendaEfetiva } from "../src/lib/plan/pendente";
import { derivarCalendario, limparDia, marcarDia, semanaDoCalendario, type AcaoDia } from "../src/lib/plan/calendario";

// Mesmo formato da agenda real em 04/11/2026: 3 feitos, 2 planejados com data salva no passado
// (aparecem em 04 e 05 só pela agenda calculada), 06 vazio.
function mk() {
  const s = (id: string, ordem: number, data: string, status: string) => ({ id, nome: id, ordem, data, status, prescricoes: [{ id: `p-${id}` }] });
  const sessoes = [
    s("UpperA", 1, "2026-11-01", "concluida"), s("LowerA", 2, "2026-11-02", "concluida"),
    s("UpperB", 3, "2026-11-03", "concluida"), s("LowerB", 4, "2026-11-03", "planejada"),
    s("UpperA2", 5, "2026-11-01", "planejada"),
  ];
  return {
    sessoes, registros: [{ id: "r", sessao_id: "UpperA" }], active_sessao_id: null,
    plano: { dias_por_semana: 5, sessoes: sessoes.map((x) => x.id), mesociclo: { data_inicio: "2026-11-01" } },
  } as never as Parameters<typeof marcarDia>[0];
}
const HOJE = "2026-11-04";
const ag = (st: ReturnType<typeof mk>) => agendaEfetiva(st, HOJE).sessoes;
const dia = (st: ReturnType<typeof mk>, d: string) => derivarCalendario(ag(st), 2026, 10, st.dias_limpos).find((x) => x.data === d)!;
const agir = (st: ReturnType<typeof mk>, d: string, a: AcaoDia) => marcarDia(st, ag(st), d, dia(st, d).sessao_id, a);
const chipsIguais = (st: ReturnType<typeof mk>) => {
  const cal = derivarCalendario(ag(st), 2026, 10, st.dias_limpos);
  for (const c of semanaDoCalendario(ag(st), HOJE, st.dias_limpos)) assert.equal(c.st, cal.find((x) => x.data === c.iso)!.status);
};

const base = mk();
assert.equal(dia(base, "2026-11-04").sessao_id, "LowerB", "04 vem da agenda (salvo 03)");
assert.equal(dia(base, "2026-11-05").sessao_id, "UpperA2", "05 vem da agenda (salvo 01)");
assert.equal(dia(base, "2026-11-06").status, "vazio");

for (const d of ["2026-11-04", "2026-11-05"]) {
  const id = dia(base, d).sessao_id!;
  // Pular: o treino certo, fixado à mão naquele dia.
  const p = agir(base, d, "pular");
  const sp = p.sessoes.find((x) => x.id === id)!;
  assert.deepEqual([sp.status, sp.data, sp.data_manual], ["pulada", d, true], `pular ${d}`);
  assert.equal(dia(p, d).status, "pulado");
  assert.equal(p.sessoes.filter((x) => x.status === "pulada").length, 1, "só o treino do dia");
  chipsIguais(p);
  // Desfazer: volta a seguir a agenda e ao mesmo dia calculado.
  const u = agir(p, d, "desfazer");
  assert.equal(dia(u, d).status, "planejado");
  assert.equal(dia(u, d).sessao_id, id);
  chipsIguais(u);
  // Planejar: fixa à mão no dia.
  const pl = agir(base, d, "planejar");
  assert.deepEqual([pl.sessoes.find((x) => x.id === id)!.data, pl.sessoes.find((x) => x.id === id)!.data_manual], [d, true]);
  assert.equal(dia(pl, d).sessao_id, id);
  chipsIguais(pl);
  // Limpar dia: treino volta pra fila, dia limpo.
  const l = limparDia(base, d, id);
  assert.ok(l.ok);
  if (l.ok) { assert.equal(dia(l.state, d).status, "limpo"); chipsIguais(l.state); }
  // Feito: data do dia mostrado, não a data antiga salva.
  const f = agir(base, d, "feito");
  assert.equal(f.sessoes.find((x) => x.id === id)!.data, d);
}
// Pular 04 empurra o próximo para 05 e não toca no 06.
{
  const p = agir(base, "2026-11-04", "pular");
  assert.equal(dia(p, "2026-11-05").sessao_id, "UpperA2");
}
// 06 vazio: Planejar o próximo treino aqui (fila), fixado à mão; Limpar marca folga.
{
  const t = agir(base, "2026-11-06", "trazer");
  assert.equal(dia(t, "2026-11-06").sessao_id, "LowerB");
  assert.equal(t.sessoes.find((x) => x.id === "LowerB")!.data_manual, true);
  assert.equal(dia(t, "2026-11-04").sessao_id, "UpperA2", "o resto da fila anda");
  chipsIguais(t);
  const p6 = agir(t, "2026-11-06", "pular");
  assert.equal(dia(p6, "2026-11-06").status, "pulado");
  const l6 = limparDia(base, "2026-11-06", null);
  assert.ok(l6.ok && dia(l6.state, "2026-11-06").status === "limpo");
}
// Dia feito: Pular/Planejar/Desfazer não mexem (vai para Corrigir registro).
{
  const st = mk();
  for (const a of ["pular", "planejar", "desfazer"] as const) assert.equal(marcarDia(st, ag(st), "2026-11-03", "UpperB", a), st);
  assert.deepEqual(limparDia(st, "2026-11-03", "UpperB"), { ok: false, motivo: "feito" });
}
console.log("smoke-acoes-dias OK");
