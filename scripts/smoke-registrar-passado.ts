/** Dia que já passou: escolher qual treino foi feito, inclusive um já feito em outro dia. */
import assert from "node:assert/strict";
import { agendaEfetiva } from "../src/lib/plan/pendente";
import { projetarOcorrencias } from "../src/lib/plan/projecao";
import {
  acoesDoDia,
  derivarCalendario,
  desmarcarFeito,
  podeDesmarcarFeito,
  registrarFeitoNoDia,
  treinosParaRegistrar,
} from "../src/lib/plan/calendario";
import { ehRegistroAvulso } from "../src/lib/plan/ocorrencia-id";

type St = Parameters<typeof registrarFeitoNoDia>[0];
const HOJE = "2026-11-07";

// Como no app em 07/11: feitos em 01, 03, 05, 06; 02 vazio; LowerA ainda não feito.
function mk(): St {
  const s = (id: string, ordem: number, data: string | null, status: string) => ({
    id, nome: id, ordem, data, status, prescricoes: [{ id: `p-${id}` }],
  });
  const sessoes = [
    s("UpperA", 1, "2026-11-01", "concluida"),
    s("LowerA", 2, "2026-11-02", "planejada"),
    s("UpperB", 3, "2026-11-03", "concluida"),
    s("LowerB", 4, "2026-11-05", "concluida"),
    s("UpperA2", 5, "2026-11-06", "concluida"),
  ];
  return {
    sessoes,
    registros: [{ id: "r1", sessao_id: "UpperA" }],
    active_sessao_id: null,
    plano: { dias_por_semana: 5, sessoes: sessoes.map((x) => x.id), mesociclo: { data_inicio: "2026-11-01", total_semanas: 6 } },
  } as never as St;
}
const ag = (st: St) => agendaEfetiva(st, HOJE).sessoes;
const dia = (st: St, d: string) =>
  derivarCalendario(projetarOcorrencias(st, HOJE, agendaEfetiva(st, HOJE)), 2026, 10, st.dias_limpos ?? []).find((x) => x.data === d)!;

const base = mk();
// A agenda empurra LowerA (pendente) para hoje; 02 fica vazio.
assert.equal(dia(base, "2026-11-02").status, "vazio");
assert.ok(acoesDoDia(dia(base, "2026-11-02"), HOJE).includes("feito"), "dia passado tem Marcar como feito");

// Seletor do passado lista todos os treinos, inclusive os já feitos.
assert.deepEqual(treinosParaRegistrar(base).map((x) => x.id), ["UpperA", "LowerA", "UpperB", "LowerB", "UpperA2"]);

// 1) Treino ainda não feito: conclui com a data do dia.
{
  const st = registrarFeitoNoDia(base, ag(base), "2026-11-02", null, "LowerA", HOJE);
  const la = st.sessoes.find((x) => x.id === "LowerA")!;
  assert.deepEqual([la.status, la.data], ["concluida", "2026-11-02"]);
  assert.equal(dia(st, "2026-11-02").status, "feito");
  assert.equal(st.sessoes.length, base.sessoes.length, "não cria sessão nova");
  // Sem séries registradas: dá para desmarcar, e o treino volta para a fila.
  assert.ok(podeDesmarcarFeito(st, "LowerA"));
  const u = desmarcarFeito(st, "LowerA");
  assert.deepEqual([u.sessoes.find((x) => x.id === "LowerA")!.status, u.sessoes.find((x) => x.id === "LowerA")!.data], ["planejada", null]);
  assert.equal(dia(u, "2026-11-02").status, "vazio");
}

// 2) Treino já feito em outro dia: registro avulso, o original não muda.
{
  const st = registrarFeitoNoDia(base, ag(base), "2026-11-02", null, "UpperA", HOJE);
  const orig = st.sessoes.find((x) => x.id === "UpperA")!;
  assert.deepEqual([orig.status, orig.data], ["concluida", "2026-11-01"], "original fica no dia 01");
  const av = st.sessoes.find((x) => ehRegistroAvulso(x.id))!;
  assert.ok(av, "registro avulso criado");
  assert.deepEqual([av.status, av.data, av.nome, av.prescricoes.length], ["concluida", "2026-11-02", "UpperA", 0]);
  const d2 = dia(st, "2026-11-02");
  assert.deepEqual([d2.status, d2.nome], ["feito", "UpperA"]);
  assert.equal(dia(st, "2026-11-01").status, "feito", "dia 01 continua feito");
  // Avulso não entra nas opções nem na fila do plano.
  assert.ok(!treinosParaRegistrar(st).some((x) => ehRegistroAvulso(x.id)));
  // Repetir no mesmo dia não duplica.
  const st2 = registrarFeitoNoDia(st, ag(st), "2026-11-02", d2.sessao_id, "UpperB", HOJE);
  assert.equal(st2, st, "dia já feito não muda");
  // Desmarcar remove só o avulso.
  assert.ok(podeDesmarcarFeito(st, av.id));
  const u = desmarcarFeito(st, av.id);
  assert.equal(u.sessoes.length, base.sessoes.length);
  assert.equal(dia(u, "2026-11-02").status, "vazio");
  assert.equal(dia(u, "2026-11-01").status, "feito");
}

// 3) Guardas: hoje/futuro, projeção e treino com séries registradas.
assert.equal(registrarFeitoNoDia(base, ag(base), HOJE, null, "UpperA", HOJE), base, "hoje não usa o caminho do passado");
assert.equal(registrarFeitoNoDia(base, ag(base), "2026-11-20", null, "UpperA", HOJE), base, "futuro não muda");
assert.equal(registrarFeitoNoDia(base, ag(base), "2026-11-02", null, "UpperA#prev-w2", HOJE), base, "projeção não muda");
assert.ok(!podeDesmarcarFeito(base, "UpperA"), "com séries registradas: só Corrigir registro");
assert.equal(desmarcarFeito(base, "UpperA"), base);

console.log("smoke-registrar-passado OK");
