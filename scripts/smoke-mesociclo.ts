/**
 * Semana do mesociclo calculada pela data (a salva no plano fica sempre em 1).
 * - Semana vem de data_inicio; sem ela, do 1º treino registrado desde a criação do plano.
 * - Deload programado (R6) só na ÚLTIMA semana; nenhum deload depois do fim do bloco.
 * - R6 não derruba a base a cada treino da semana de deload.
 * - RIR do dia aperta ao longo do bloco e solta na semana de deload.
 */
import type { EstadoExercicio, Plano, RegistroSerie } from "../src/lib/domain";
import { avaliarCheckinDeload } from "../src/lib/engine/checkin-deload";
import { aplicarDecisao, decidirProgressao } from "../src/lib/engine/progression";
import { rirAlvoDoDia } from "../src/lib/engine/proximidade-falha";
import { emDeload } from "../src/lib/engine/tecnicas";
import { ehSemanaDeload, focoDoDia, inicioDoBloco, mesocicloEfetivo, semanaDoBloco } from "../src/lib/plan/mesociclo";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  console.log(cond ? "✓" : "✗", msg);
  if (!cond) falhas++;
}

const plano = (data_inicio: string | null, criado_em = "2026-09-01T12:00:00.000Z") =>
  ({ criado_em, mesociclo: { total_semanas: 6, semana_atual: 1, foco: "acumulo", data_inicio } }) as unknown as Plano;
const reg = (executado_em: string) => ({ executado_em }) as RegistroSerie;

// 1) Semana pela data de início (seg 07/09/2026).
const P = plano("2026-09-07");
ok(semanaDoBloco({ plano: P }, "2026-09-07") === 1, "dia do início = semana 1");
ok(semanaDoBloco({ plano: P }, "2026-09-13") === 1, "6 dias depois ainda semana 1");
ok(semanaDoBloco({ plano: P }, "2026-09-14") === 2, "7 dias depois = semana 2");
ok(semanaDoBloco({ plano: P }, "2026-10-12") === 6, "5 semanas depois = semana 6");
ok(semanaDoBloco({ plano: P }, "2026-10-19") === 7, "depois do bloco = semana 7");
ok(semanaDoBloco({ plano: P }, "2026-09-01") === 1, "antes do início não fica < 1");

// 2) Sem data_inicio: 1º treino registrado depois de o plano ser criado; registros antigos não contam.
const P2 = plano(null, "2026-09-01T12:00:00.000Z");
const regs = [reg("2026-08-10T10:00:00.000Z"), reg("2026-09-03T10:00:00.000Z"), reg("2026-09-20T10:00:00.000Z")];
ok(inicioDoBloco({ plano: P2, registros: regs }) === "2026-09-03", "início = 1º treino desde a criação do plano");
ok(semanaDoBloco({ plano: P2, registros: regs }, "2026-09-17") === 3, "semana 3 contada a partir do 1º treino");
ok(semanaDoBloco({ plano: P2, registros: [] }, "2026-10-30") === 1, "sem início nem treino: fica a semana salva");

// 3) Deload só na última semana.
const m = (sem: number) => mesocicloEfetivo({ plano: P }, ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"][sem - 1]!)!;
ok(m(5).semana_atual === 5 && !ehSemanaDeload(m(5)), "semana 5 é de treino (antes era deload)");
ok(ehSemanaDeload(m(6)), "semana 6 = deload programado");
ok(!ehSemanaDeload(m(7)), "depois do fim do bloco não fica em deload pra sempre");
ok(focoDoDia(m(6)) === "deload" && focoDoDia(m(4)) === "acumulo", "foco do dia vira deload só na semana 6");

// 4) R6 no motor: base guardada, não cai a cada treino da semana de deload.
const estado: EstadoExercicio = {
  exercicio_id: "supino", carga_atual_kg: 60, faixa_reps: [8, 12], rir_alvo: 2,
  alvo_proxima_sessao: { carga_kg: 60, faixa_reps: [8, 12], rir_alvo: 2 },
  sessoes_sem_progresso: 0, ultima_progressao_em: null, e1rm_estimado_kg: 80, pr_carga_kg: 60, pr_reps: 10,
  origem_carga: "historico", primeira_sessao: false, ultimo_top_kg: 60, ultimo_back_off_kg: 52.5, ultimo_rir: 2,
  ultima_sessao_em: null, ultimo_desempenho: { carga_kg: 60, reps_na_carga: [10, 10, 10], e1rm_kg: 80 },
  atualizado_em: "2026-10-01T00:00:00.000Z",
};
const series = (kg: number, i: number): RegistroSerie[] =>
  [1, 2].map((n) => ({ id: `r${i}${n}`, sessao_id: `s${i}`, prescricao_id: "p1", exercicio_id: "supino", numero: n,
    tipo_serie: "trabalho", carga_kg: kg, reps: 10, rir_percebido: 3, dor: false, executado_em: "2026-10-12T10:00:00.000Z" }));
let e = estado;
for (let i = 0; i < 3; i++) {
  const d = decidirProgressao({ exercicio_id: "supino", sessao_id: `s${i}`, grupo_primario: "peito", series: series(55, i), estado: e, mesociclo: m(6) });
  ok(d.regra === "R6" && d.acao === "deload", `treino ${i + 1} da semana 6: R6 (got ${d.regra})`);
  e = aplicarDecisao(e, d, series(55, i));
}
ok(e.carga_atual_kg === 60, `base fica em 60 kg depois da semana de deload (got ${e.carga_atual_kg})`);
const d5 = decidirProgressao({ exercicio_id: "supino", sessao_id: "x", grupo_primario: "peito", series: series(60, 9), estado, mesociclo: m(5) });
ok(d5.regra !== "R6", `semana 5 progride normalmente (got ${d5.regra})`);

// 5) Ajuste do dia: −10% só na semana 6.
const presc = [{ id: "p1", exercicio_id: "supino", ordem: 1, series: 3, carga: { trabalho_kg: 60, top_set_kg: null, origem: "historico" } } as never];
const exs = [{ id: "supino", grupo_primario: "peito", composto: true } as never];
ok(avaliarCheckinDeload({ mesociclo: m(6), prescricoes: presc, exercicios: exs }).regras.includes("R6"), "check-in da semana 6 aplica deload");
ok(!avaliarCheckinDeload({ mesociclo: m(5), prescricoes: presc, exercicios: exs }).regras.includes("R6"), "check-in da semana 5 não aplica");

// 6) RIR do dia acompanha o bloco.
const ex = { composto: false, equipamento: "maquina" } as never;
const rir = (sem: number) => rirAlvoDoDia({ exercicio: ex, foco: focoDoDia(m(sem)), semana_atual: m(sem).semana_atual, total_semanas: 6 }).alvo;
ok(rir(1) > rir(5), `RIR aperta do início (${rir(1)}) ao fim do bloco (${rir(5)})`);
ok(rir(6) === 3, `semana de deload: RIR 3 (got ${rir(6)})`);

// 7) Técnicas desligadas na semana de deload.
ok(emDeload({ plano: P }, "2026-10-12") && !emDeload({ plano: P }, "2026-10-05"), "técnicas desligadas só na semana 6");

if (falhas > 0) {
  console.error(`smoke:mesociclo FALHOU (${falhas})`);
  process.exit(1);
}
console.log("smoke:mesociclo OK");
