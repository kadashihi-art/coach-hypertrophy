/**
 * Faixa de dias (Hoje) × calendário: sempre o mesmo dia, treino e status, nos dois sentidos.
 * Estado: arquivo em CH_BACKUP_STATE (backup local, fora do repositório) ou fixture anônima.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { agendaEfetiva } from "../src/lib/plan/pendente";
import { projetarOcorrencias } from "../src/lib/plan/projecao";
import { acoesDoDia, derivarCalendario, limparDia, marcarDia, treinosParaEscolher, type AcaoDia } from "../src/lib/plan/calendario";
import { faixaDeDias, rotuloDia } from "../src/lib/plan/faixa";
import type { AppState } from "../src/lib/domain";

function fixture(): AppState {
  const s = (id: string, ordem: number, data: string, status: string) => ({ id, nome: id, ordem, data, status, prescricoes: [{ id: `p-${id}` }] });
  const sessoes = [
    s("Upper A", 1, "2026-11-01", "concluida"), s("Lower A", 2, "2026-11-02", "concluida"),
    s("Upper B", 3, "2026-11-03", "concluida"), s("Lower B", 4, "2026-11-03", "planejada"),
    s("Upper A2", 5, "2026-11-01", "planejada"),
  ];
  return { sessoes, registros: [], active_sessao_id: null,
    plano: { dias_por_semana: 5, sessoes: sessoes.map((x) => x.id), mesociclo: { data_inicio: "2026-11-01" } } } as never;
}
let st0: AppState;
const arq = process.env.CH_BACKUP_STATE;
if (arq) {
  const raw = JSON.parse(fs.readFileSync(arq, "utf8"));
  const st = raw.state ?? raw;
  // Mesmo início da conta já ajustada (01/11). Só em memória: nada é gravado.
  st0 = { ...st, plano: { ...st.plano, mesociclo: { ...st.plano.mesociclo, data_inicio: "2026-11-01" } } };
  console.log("usando backup local");
} else st0 = fixture();
const HOJE = "2026-11-04";
const antes = JSON.stringify(st0);

function coerente(st: AppState, rotulo: string) {
  const faixa = faixaDeDias(st, HOJE);
  assert.ok(faixa.length >= 7, rotulo);
  const ag = projetarOcorrencias(st, HOJE);
  const cal = derivarCalendario(ag, 2026, 10, st.dias_limpos ?? []);
  for (const f of faixa) {
    if (!f.dia.data.startsWith("2026-11")) continue;
    const c = cal.find((x) => x.data === f.dia.data)!;
    assert.deepEqual([f.dia.sessao_id, f.dia.nome, f.dia.status], [c.sessao_id, c.nome, c.status], `${rotulo}: ${f.dia.data}`);
  }
  // Sentido inverso: todo treino do calendário no período aparece na faixa no mesmo dia.
  for (const c of cal.filter((x) => x.sessao_id && x.data >= faixa[0]!.dia.data && x.data <= faixa.at(-1)!.dia.data)) {
    assert.equal(faixa.find((f) => f.dia.data === c.data)!.dia.sessao_id, c.sessao_id, `${rotulo}: inverso ${c.data}`);
  }
  assert.equal(faixa.filter((f) => f.hoje).length, 1);
  return faixa;
}
const linha = (st: AppState) => faixaDeDias(st, HOJE).filter((f) => f.dia.data >= "2026-11-01" && f.dia.data <= "2026-11-07")
  .map((f) => `${f.rotulo}=${f.dia.nome ?? "—"}:${f.status}`).join(" | ");

const f0 = coerente(st0, "base");
assert.equal(rotuloDia("2026-11-04"), "Qua 04/11");
const d4 = f0.find((f) => f.dia.data === HOJE)!;
assert.equal(d4.dia.nome, "Lower B", "04/11 é o Lower B pela agenda");
assert.equal(d4.status, "pendente");
assert.ok(d4.hoje);
assert.equal(f0.find((f) => f.dia.data === "2026-11-01")!.status, "feito");
assert.equal(f0.find((f) => f.dia.data === "2026-11-06")!.status, "folga");
console.log("base:", linha(st0));

// Ações em qualquer sentido (faixa ou calendário usam a mesma função) → os dois continuam iguais.
const agir = (st: AppState, d: string, a: AcaoDia) => {
  const dia = faixaDeDias(st, HOJE).find((f) => f.dia.data === d)!.dia;
  return marcarDia(st, agendaEfetiva(st, HOJE).sessoes, d, dia.sessao_id, a);
};
const casos: Array<[string, (s: AppState) => AppState]> = [
  ["pular 04", (s) => agir(s, "2026-11-04", "pular")],
  ["pular 04 + desfazer", (s) => agir(agir(s, "2026-11-04", "pular"), "2026-11-04", "desfazer")],
  ["planejar 05", (s) => agir(s, "2026-11-05", "planejar")],
  ["feito 04", (s) => agir(s, "2026-11-04", "feito")],
  ["próximo treino no 06", (s) => agir(s, "2026-11-06", "trazer")],
  ["limpar 05", (s) => { const r = limparDia(s, "2026-11-05", faixaDeDias(s, HOJE).find((f) => f.dia.data === "2026-11-05")!.dia.sessao_id); assert.ok(r.ok); return r.ok ? r.state : s; }],
];
for (const [nome, fn] of casos) {
  const s = fn(st0);
  coerente(s, nome);
  console.log(`${nome}:`, linha(s));
}
assert.equal(faixaDeDias(agir(st0, "2026-11-04", "pular"), HOJE).find((f) => f.hoje)!.status, "pulado");
assert.equal(JSON.stringify(st0), antes, "nada foi alterado no estado lido");

// ── Conta real (formato do diagnóstico de 04/11, anônimo): Lower B e Upper A2 marcados como pulados
// em dias passados. Antes: agenda vazia de 04 em diante. Agora: o pulo fica no dia e o treino volta.
const real: AppState = (() => {
  const b = fixture();
  return { ...b, sessoes: b.sessoes.map((x) => (x.id === "Lower B" || x.id === "Upper A2" ? { ...x, status: "pulada" as const } : x)) };
})();
const antesReal = JSON.stringify(real);
const fr = coerente(real, "real");
const dr = (d: string) => fr.find((f) => f.dia.data === d)!;
assert.equal(dr("2026-11-04").dia.nome, "Lower B", "real: 04 é o Lower B");
assert.equal(dr("2026-11-04").status, "planejado");
assert.ok(fr.some((f) => f.dia.data > HOJE && f.dia.nome === "Upper A2"), "real: Upper A2 nos próximos dias");
assert.deepEqual(["01", "02", "03"].map((d) => dr(`2026-11-${d}`).status), ["feito", "feito", "feito"]);
console.log("real:", linha(real));

// Painel: de hoje em diante, conjunto completo sempre (vazio, planejado, pulado, limpo). Feito: só Corrigir.
const COMPLETO = ["feito", "pular", "trocar", "limpar", "desfazer"];
for (const f of fr.filter((x) => x.dia.data >= HOJE)) {
  if (f.dia.projetado) {
    assert.deepEqual(acoesDoDia(f.dia, HOJE), [], `previsto sem ações ${f.dia.data}`);
    continue;
  }
  if (f.dia.status === "feito") assert.deepEqual(acoesDoDia(f.dia, HOJE), ["corrigir"]);
  else assert.deepEqual(acoesDoDia(f.dia, HOJE), COMPLETO, `ações ${f.dia.data}`);
}
assert.deepEqual(acoesDoDia(dr("2026-11-01").dia, HOJE), ["corrigir"]);
assert.deepEqual(acoesDoDia({ data: "2026-11-09", sessao_id: null, status: "limpo" }, HOJE), COMPLETO);

const agirR = (st: AppState, d: string, a: AcaoDia, esc?: string) => {
  const dia = faixaDeDias(st, HOJE).find((f) => f.dia.data === d)!.dia;
  return marcarDia(st, agendaEfetiva(st, HOJE).sessoes, d, dia.sessao_id, a, esc);
};
const vazio = fr.find((f) => f.dia.data > HOJE && f.status === "folga")!.dia.data;
const diaDe = (st: AppState, d: string) => faixaDeDias(st, HOJE).find((f) => f.dia.data === d)!;
// Pular / feito em dia vazio: vale para o próximo da fila (sem escolher) ou para o escolhido.
let x = agirR(real, vazio, "pular");
assert.equal(diaDe(x, vazio).status, "pulado"); coerente(x, "pular vazio");
x = agirR(real, vazio, "feito", "Upper A2");
assert.equal(diaDe(x, vazio).dia.nome, "Upper A2"); assert.equal(diaDe(x, vazio).status, "feito"); coerente(x, "feito vazio");
// Trocar: 04 passa a ser Upper A2; Lower B volta para a fila e não some.
x = agirR(real, HOJE, "trocar", "Upper A2");
assert.equal(diaDe(x, HOJE).dia.nome, "Upper A2");
assert.ok(faixaDeDias(x, HOJE).some((f) => f.dia.data > HOJE && f.dia.nome === "Lower B"), "Lower B voltou para a fila");
coerente(x, "trocar 04");
// Desfazer a troca: Upper A2 volta a seguir a agenda.
x = agirR(x, HOJE, "desfazer");
assert.equal(x.sessoes.find((s) => s.id === "Upper A2")!.data_manual, undefined); coerente(x, "desfazer troca");
// Feito no dia limpo tira a folga.
const lim = limparDia(real, "2026-11-05", diaDe(real, "2026-11-05").dia.sessao_id);
assert.ok(lim.ok);
if (lim.ok) { const y = agirR(lim.state, "2026-11-05", "feito"); assert.equal(diaDe(y, "2026-11-05").status, "feito"); coerente(y, "feito no limpo"); }
// Marca de pulo de dia passado não é tratada como o treino em si.
assert.ok(treinosParaEscolher(real).every((s) => !s.id.includes("#")));
assert.equal(JSON.stringify(real), antesReal, "nada foi alterado no estado real lido");
console.log("smoke-faixa OK");
