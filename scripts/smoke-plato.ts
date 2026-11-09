/**
 * Platô (R5) só com platô de verdade.
 * - +1 rep por sessão na mesma carga (R2) é progresso: não dispara deload.
 * - 3 sessões iguais disparam R5 uma vez; o deload zera o contador (não se repete).
 * - Carga do deload cai no degrau do equipamento.
 * - Estado antigo (sem desempenho registrado) não dispara R5 com contador inflado.
 * - Prontidão baixa (R9) não conta como sessão sem progresso.
 */
import type { EstadoExercicio, RegistroSerie } from "../src/lib/domain";
import { avaliarCheckinDeload } from "../src/lib/engine/checkin-deload";
import {
  aplicarDecisao,
  cargaDeloadKg,
  decidirProgressao,
  houveProgresso,
} from "../src/lib/engine/progression";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  console.log(cond ? "✓" : "✗", msg);
  if (!cond) falhas++;
}

function estadoBase(over: Partial<EstadoExercicio> = {}): EstadoExercicio {
  return {
    exercicio_id: "supino",
    carga_atual_kg: 60,
    faixa_reps: [8, 12],
    rir_alvo: 2,
    alvo_proxima_sessao: { carga_kg: 60, faixa_reps: [8, 12], rir_alvo: 2 },
    sessoes_sem_progresso: 0,
    ultima_progressao_em: null,
    e1rm_estimado_kg: 0,
    pr_carga_kg: 0,
    pr_reps: 0,
    origem_carga: "historico",
    primeira_sessao: false,
    ultimo_top_kg: null,
    ultimo_back_off_kg: null,
    ultimo_rir: null,
    ultima_sessao_em: null,
    atualizado_em: "2026-11-01T00:00:00.000Z",
    ...over,
  };
}

let n = 0;
function series(kg: number, reps: number[], rir = 2): RegistroSerie[] {
  n++;
  return reps.map((r, i) => ({
    id: `r${n}-${i}`,
    sessao_id: `s${n}`,
    prescricao_id: "p1",
    exercicio_id: "supino",
    numero: i + 1,
    tipo_serie: "trabalho",
    carga_kg: kg,
    reps: r,
    rir_percebido: rir,
    dor: false,
    executado_em: "2026-11-01T10:00:00.000Z",
  }));
}

function sessao(estado: EstadoExercicio, ss: RegistroSerie[], checkin?: { sono_h: number; prontidao: number }) {
  const d = decidirProgressao({
    exercicio_id: "supino",
    sessao_id: ss[0]!.sessao_id,
    grupo_primario: "peito",
    series: ss,
    estado,
    checkin: checkin ? ({ id: "c", data: "2026-11-01", dor: [], ...checkin } as never) : null,
  });
  return { d, estado: aplicarDecisao(estado, d, ss) };
}

// 1) Dupla progressão por reps: 8 → 9 → 10 → 11 → 12 na mesma carga. Nunca deload.
{
  let e = estadoBase();
  const regras: string[] = [];
  for (const r of [8, 9, 10, 11]) {
    const out = sessao(e, series(e.carga_atual_kg, [r, r, r]));
    regras.push(out.d.regra);
    e = out.estado;
  }
  ok(!regras.includes("R5"), `+1 rep por sessão não vira platô (regras: ${regras.join(",")})`);
  ok(e.carga_atual_kg === 60, `carga mantida em 60 kg (got ${e.carga_atual_kg})`);
  ok(e.sessoes_sem_progresso === 0, `contador zerado com progresso por reps (got ${e.sessoes_sem_progresso})`);
  const top = sessao(e, series(60, [12, 12, 12]));
  ok(top.d.regra === "R1" && top.d.acao === "subir_carga", `topo da faixa sobe carga (got ${top.d.regra} ${top.d.acao})`);
}

// 2) Platô real: mesmas reps 3 sessões seguidas → R5 uma vez, depois não repete.
{
  let e = estadoBase();
  e = sessao(e, series(60, [10, 10, 9])).estado; // 1ª sessão registra o desempenho (conta 1)
  for (let i = 0; i < 2; i++) {
    const out = sessao(e, series(e.carga_atual_kg, [10, 10, 9]));
    ok(out.d.regra !== "R5", `sessão igual ${i + 2}: ainda sem deload (got ${out.d.regra})`);
    e = out.estado;
  }
  ok(e.sessoes_sem_progresso === 3, `3 sessões iguais = contador 3 (got ${e.sessoes_sem_progresso})`);
  const deload = sessao(e, series(60, [10, 10, 9]));
  ok(deload.d.regra === "R5" && deload.d.acao === "deload", `platô real dispara R5 (got ${deload.d.regra})`);
  ok(deload.d.nova_carga_kg === 55, `deload no degrau de 2,5 kg: 60 → 55 (got ${deload.d.nova_carga_kg})`);
  ok(deload.estado.sessoes_sem_progresso === 0, `deload zera o contador (got ${deload.estado.sessoes_sem_progresso})`);
  const depois = sessao(deload.estado, series(55, [10, 10, 9]));
  ok(depois.d.regra !== "R5", `deload não se repete na sessão seguinte (got ${depois.d.regra})`);
}

// 3) Estado antigo com contador inflado e sem desempenho → sem R5; recomeça a contar.
{
  const legado = estadoBase({ sessoes_sem_progresso: 5, e1rm_estimado_kg: 80, pr_carga_kg: 60, pr_reps: 10 });
  const out = sessao(legado, series(60, [11, 10, 10]));
  ok(out.d.regra !== "R5", `estado antigo não leva deload falso (got ${out.d.regra})`);
  ok(out.estado.sessoes_sem_progresso === 0, `PR novo no estado antigo = progresso (got ${out.estado.sessoes_sem_progresso})`);
  ok(!!out.estado.ultimo_desempenho, "desempenho passa a ser registrado");
  const pre = avaliarCheckinDeload({
    estados: [legado],
    prescricoes: [{ id: "p1", exercicio_id: "supino", ordem: 1, series: 3, carga: { trabalho_kg: 60, top_set_kg: null, origem: "historico" } } as never],
    exercicios: [{ id: "supino", grupo_primario: "peito", composto: true } as never],
  });
  ok(!pre.regras.includes("R5"), "check-in do dia também não aplica platô de estado antigo");
}

// 4) Prontidão baixa (R9) não conta como sessão sem progresso.
{
  let e = estadoBase();
  e = sessao(e, series(60, [10, 10, 10])).estado;
  e = sessao(e, series(60, [10, 10, 10])).estado; // contador 2
  const out = sessao(e, series(60, [9, 9, 8]), { sono_h: 5, prontidao: 2 });
  ok(out.d.regra === "R9", `dia ruim cai em R9 (got ${out.d.regra})`);
  ok(out.estado.sessoes_sem_progresso === 2, `R9 não soma no platô (got ${out.estado.sessoes_sem_progresso})`);
}

// 5) Regras de comparação e degrau.
ok(houveProgresso({ carga_kg: 62.5, reps_na_carga: [8, 8], e1rm_kg: 79.2 }, { carga_kg: 60, reps_na_carga: [10, 10], e1rm_kg: 80 }) === false,
  "mais carga com menos reps e e1RM menor não é progresso");
ok(houveProgresso({ carga_kg: 60, reps_na_carga: [10, 10, 9], e1rm_kg: 80 }, { carga_kg: 60, reps_na_carga: [10, 9, 9], e1rm_kg: 80 }) === true,
  "mesma carga, +1 rep numa série de trás = progresso");
ok(houveProgresso({ carga_kg: 60, reps_na_carga: [10, 9], e1rm_kg: 80 }, { carga_kg: 60, reps_na_carga: [10, 9, 9], e1rm_kg: 80 }) === false,
  "uma série a menos não conta como progresso");
ok(houveProgresso({ carga_kg: 0, reps_na_carga: [15, 14], e1rm_kg: 0 }, { carga_kg: 0, reps_na_carga: [14, 14], e1rm_kg: 0 }) === true,
  "peso corporal progride por reps");
ok(cargaDeloadKg(100, 5) === 90, "100 kg (degrau 5) → 90");
ok(cargaDeloadKg(10, 2.5) === 10, "carga leve sem degrau para −10% mantém (deload só nas séries)");

if (falhas > 0) {
  console.error(`smoke:plato FALHOU (${falhas})`);
  process.exit(1);
}
console.log("smoke:plato OK");
