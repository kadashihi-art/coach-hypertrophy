/** Repetir treino na semana seg–dom: domingo conta para a semana anterior; nada é apagado. */
import assert from "node:assert/strict";
import { agendaEfetiva } from "../src/lib/plan/pendente";
import { derivarCalendario, marcarDia } from "../src/lib/plan/calendario";
import { proximaSessao } from "../src/lib/plan/proxima-sessao";
import { arquivarConclusao, feitoNaSemana } from "../src/lib/plan/repetir";
import { ehRegistroAvulso } from "../src/lib/plan/ocorrencia-id";

type St = Parameters<typeof marcarDia>[0];
const HOJE = "2026-11-07"; // sábado; semana seg 02 – dom 08

// Upper A no domingo 01 (semana anterior); nesta semana: Lower A, Upper B, Lower B, Upper A2.
function mk(): St {
  const s = (id: string, ordem: number, data: string) => ({
    id, nome: id, ordem, data, status: "concluida", finalizada_em: `${data}T20:00:00.000Z`,
    prescricoes: [{ id: `p-${id}` }], volume_por_grupo: [],
  });
  const sessoes = [
    s("UpperA", 1, "2026-11-01"), s("LowerA", 2, "2026-11-02"), s("UpperB", 3, "2026-11-03"),
    s("LowerB", 4, "2026-11-05"), s("UpperA2", 5, "2026-11-06"),
  ];
  return {
    sessoes,
    registros: [{ id: "r1", sessao_id: "UpperA" }, { id: "r2", sessao_id: "LowerA" }],
    active_sessao_id: null,
    plano: { dias_por_semana: 5, sessoes: sessoes.map((x) => x.id), mesociclo: { data_inicio: "2026-11-01", total_semanas: 6 } },
  } as never as St;
}
const cal = (st: St) => derivarCalendario(agendaEfetiva(st, HOJE).sessoes, 2026, 10, st.dias_limpos ?? []);
const dia = (st: St, d: string) => cal(st).find((x) => x.data === d)!;
const base = mk();

// Semana seg–dom: domingo 01 não conta nesta semana; segunda 02 conta.
assert.equal(feitoNaSemana(base.sessoes[0]!, HOJE), false, "domingo 01 é da semana anterior");
assert.equal(feitoNaSemana(base.sessoes[1]!, HOJE), true, "segunda 02 é desta semana");
assert.equal(feitoNaSemana(base.sessoes[0]!, "2026-11-01"), true, "no próprio domingo, conta");

// Sugestão: na ordem do plano, o primeiro ainda não feito nesta semana → Upper A.
assert.equal(proximaSessao(base, HOJE)?.id, "UpperA");

// Escolho no dia: repetir Lower A hoje (já feito nesta semana, na segunda).
{
  const st = marcarDia(base, agendaEfetiva(base, HOJE).sessoes, HOJE, null, "planejar", "LowerA");
  const la = st.sessoes.find((x) => x.id === "LowerA")!;
  assert.deepEqual([la.status, la.data, la.data_manual], ["planejada", HOJE, true], "Lower A planejado hoje");
  assert.equal(dia(st, HOJE).nome, "LowerA");
  // A execução de segunda continua no calendário e com as séries.
  const av = st.sessoes.find((x) => ehRegistroAvulso(x.id) && x.data === "2026-11-02")!;
  assert.ok(av, "segunda guardada como registro avulso");
  assert.equal(av.status, "concluida");
  assert.equal(dia(st, "2026-11-02").status, "feito");
  assert.deepEqual(st.registros.map((r) => r.sessao_id), ["UpperA", av.id], "séries de segunda foram junto, nada apagado");
  // Marcar como feito hoje.
  const f = marcarDia(st, agendaEfetiva(st, HOJE).sessoes, HOJE, "LowerA", "feito");
  assert.equal(dia(f, HOJE).status, "feito");
  assert.equal(dia(f, "2026-11-02").status, "feito");
}

// Repetir Upper A (do domingo): domingo continua feito.
{
  const st = marcarDia(base, agendaEfetiva(base, HOJE).sessoes, HOJE, null, "feito", "UpperA");
  assert.equal(dia(st, HOJE).status, "feito");
  assert.equal(dia(st, "2026-11-01").status, "feito");
  assert.equal(st.sessoes.find((x) => x.id === "UpperA")!.data, HOJE);
}

// Mesmo dia: nada muda (feito hoje só muda por Corrigir registro).
{
  const hoje = { ...base, sessoes: base.sessoes.map((x) => (x.id === "UpperA2" ? { ...x, data: HOJE } : x)) } as St;
  assert.equal(marcarDia(hoje, agendaEfetiva(hoje, HOJE).sessoes, HOJE, "UpperA2", "planejar"), hoje);
}

// Arquivar não duplica e não mexe em treino não feito.
{
  const a1 = arquivarConclusao(base, "UpperA");
  assert.equal(a1.sessoes.filter((x) => ehRegistroAvulso(x.id)).length, 1);
  const plan = { ...base, sessoes: base.sessoes.map((x) => (x.id === "UpperA" ? { ...x, status: "planejada" } : x)) } as St;
  assert.equal(arquivarConclusao(plan, "UpperA"), plan);
}

console.log("smoke-repetir-semana OK");
