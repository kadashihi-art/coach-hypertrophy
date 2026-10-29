/**
 * Fixtures para o motor R1–R12.
 * Ex.: input que dispara R1 (supino 60→62.5 do brief).
 */
import type { EstadoExercicio, RegistroSerie } from "@/lib/domain";
import {
  aplicarDecisao,
  decidirProgressao,
  sugerirBackOffKg,
  type ProgressionInput,
} from "./progression";

export function estadoSupino60(): EstadoExercicio {
  return {
    exercicio_id: "supino_reto_convencional",
    carga_atual_kg: 60,
    faixa_reps: [6, 10],
    rir_alvo: 2,
    alvo_proxima_sessao: { carga_kg: 60, faixa_reps: [6, 10], rir_alvo: 2 },
    sessoes_sem_progresso: 0,
    ultima_progressao_em: "2026-10-18",
    e1rm_estimado_kg: 78.4,
    pr_carga_kg: 60,
    pr_reps: 10,
    origem_carga: "historico",
    primeira_sessao: false,
    ultimo_top_kg: null,
    ultimo_back_off_kg: null,
    ultimo_rir: null,
    ultima_sessao_em: null,
    atualizado_em: "2026-10-20",
  };
}

/** 3 séries no topo (10) com RIR ≥ 2 → R1 subir 2,5 kg */
export function seriesR1(): RegistroSerie[] {
  const base = {
    sessao_id: "sess-upper-a",
    prescricao_id: "presc-supino",
    exercicio_id: "supino_reto_convencional",
    tipo_serie: "trabalho" as const,
    carga_kg: 60,
    dor: false,
    executado_em: "2026-10-21T18:00:00.000Z",
  };
  return [
    { ...base, id: "s1", numero: 1, reps: 10, rir_percebido: 2 },
    { ...base, id: "s2", numero: 2, reps: 10, rir_percebido: 2 },
    { ...base, id: "s3", numero: 3, reps: 10, rir_percebido: 2 },
  ];
}

export function inputR1(): ProgressionInput {
  return {
    exercicio_id: "supino_reto_convencional",
    sessao_id: "sess-upper-a",
    grupo_primario: "peito",
    series: seriesR1(),
    estado: estadoSupino60(),
    checkin: {
      id: "ck-1",
      data: "2026-10-21",
      sono_h: 7.5,
      prontidao: 4,
      dor: [],
    },
  };
}

/** Smoke: R1 deve retornar subir_carga 62.5 */
export function assertR1(): { ok: boolean; msg: string } {
  const d = decidirProgressao(inputR1());
  const ok =
    d.regra === "R1" &&
    d.acao === "subir_carga" &&
    d.nova_carga_kg === 62.5 &&
    d.faixa_reps_reiniciada === true;
  return {
    ok,
    msg: ok
      ? `R1 OK: ${d.carga_anterior_kg} → ${d.nova_carga_kg} kg`
      : `R1 FAIL: got ${d.regra} ${d.acao} ${d.nova_carga_kg}`,
  };
}

export function seriesR4(): RegistroSerie[] {
  const base = {
    sessao_id: "sess-upper-a",
    prescricao_id: "presc-supino",
    exercicio_id: "supino_reto_convencional",
    tipo_serie: "trabalho" as const,
    carga_kg: 60,
    dor: false,
    executado_em: "2026-10-21T18:00:00.000Z",
  };
  return [
    { ...base, id: "s1", numero: 1, reps: 4, rir_percebido: 0 },
    { ...base, id: "s2", numero: 2, reps: 3, rir_percebido: 0 },
    { ...base, id: "s3", numero: 3, reps: 8, rir_percebido: 2 },
  ];
}

export function assertR4(): { ok: boolean; msg: string } {
  const d = decidirProgressao({
    ...inputR1(),
    series: seriesR4(),
  });
  const ok = d.regra === "R4" && d.acao === "reduzir_carga";
  return {
    ok,
    msg: ok
      ? `R4 OK: ${d.carga_anterior_kg} → ${d.nova_carga_kg}`
      : `R4 FAIL: ${d.regra} ${d.acao}`,
  };
}

export function assertR7(): { ok: boolean; msg: string } {
  const series = seriesR1().map((s, i) => ({
    ...s,
    dor: i < 2,
  }));
  const d = decidirProgressao({ ...inputR1(), series });
  const ok = d.regra === "R7" && d.acao === "suspender";
  return {
    ok,
    msg: ok ? "R7 OK: suspender por dor" : `R7 FAIL: ${d.regra}`,
  };
}

function seriesTopBack(opts: {
  topKg: number;
  topReps: number;
  topRir: number;
  backKg?: number;
}): RegistroSerie[] {
  const base = {
    sessao_id: "sess-upper-a",
    prescricao_id: "presc-supino",
    exercicio_id: "supino_reto_convencional",
    dor: false,
    executado_em: "2026-10-21T18:00:00.000Z",
  };
  const backKg = opts.backKg ?? sugerirBackOffKg(opts.topKg, "peito");
  return [
    {
      ...base,
      id: "ts",
      numero: 1,
      tipo_serie: "top_set" as const,
      carga_kg: opts.topKg,
      reps: opts.topReps,
      rir_percebido: opts.topRir,
    },
    {
      ...base,
      id: "bo1",
      numero: 2,
      tipo_serie: "back_off" as const,
      carga_kg: backKg,
      reps: 10,
      rir_percebido: 2,
    },
    {
      ...base,
      id: "bo2",
      numero: 3,
      tipo_serie: "back_off" as const,
      carga_kg: backKg,
      reps: 10,
      rir_percebido: 3,
    },
  ];
}

/** R8: top RIR 0–1 → sobe carga; back-off ≈ 0.875 * novo top */
export function assertR8Subir(): { ok: boolean; msg: string } {
  const series = seriesTopBack({ topKg: 60, topReps: 8, topRir: 1 });
  const d = decidirProgressao({
    ...inputR1(),
    series,
    tecnica: "top_set_backoff",
  });
  const est = aplicarDecisao(estadoSupino60(), d, series);
  const bo = sugerirBackOffKg(d.nova_carga_kg, "peito");
  const ok =
    d.regra === "R8" &&
    d.acao === "subir_carga" &&
    d.nova_carga_kg === 62.5 &&
    est.alvo_proxima_sessao.carga_kg === 62.5 &&
    est.ultimo_top_kg === 60 &&
    est.ultimo_rir === 1 &&
    Math.abs(bo - 62.5 * 0.875) < 1.3; // step 2.5 → 55
  return {
    ok,
    msg: ok
      ? `R8 subir OK: 60→${d.nova_carga_kg}; bo≈${bo}; mem top=${est.ultimo_top_kg} rir=${est.ultimo_rir}`
      : `R8 subir FAIL: ${d.regra} ${d.acao} ${d.nova_carga_kg} bo=${bo} mem=${est.ultimo_top_kg}`,
  };
}

/** R8: reps abaixo do piso → reduzir/manter (não sobe) */
export function assertR8Reduzir(): { ok: boolean; msg: string } {
  const series = seriesTopBack({ topKg: 60, topReps: 4, topRir: 0 });
  const d = decidirProgressao({
    ...inputR1(),
    series,
    tecnica: "top_set_backoff",
  });
  const ok =
    d.regra === "R8" &&
    d.acao === "reduzir_carga" &&
    d.nova_carga_kg < 60 &&
    d.nova_carga_kg >= 50;
  return {
    ok,
    msg: ok
      ? `R8 reduzir OK: 60→${d.nova_carga_kg}`
      : `R8 reduzir FAIL: ${d.regra} ${d.acao} ${d.nova_carga_kg}`,
  };
}

/** R8: RIR 2 na faixa → manter; back-off ≈ 0.875 * top */
export function assertR8Manter(): { ok: boolean; msg: string } {
  const series = seriesTopBack({ topKg: 60, topReps: 8, topRir: 2 });
  const d = decidirProgressao({
    ...inputR1(),
    series,
    tecnica: "top_set_backoff",
  });
  const bo = sugerirBackOffKg(60, "peito");
  const ok =
    d.regra === "R8" &&
    d.acao === "manter_carga" &&
    d.nova_carga_kg === 60 &&
    bo === 52.5; // roundToStep(52.5, 2.5)=52.5; 60*0.875=52.5
  return {
    ok,
    msg: ok
      ? `R8 manter OK: 60 kg; bo=${bo} (=0.875*60)`
      : `R8 manter FAIL: ${d.regra} ${d.acao} ${d.nova_carga_kg} bo=${bo}`,
  };
}

/** R8 não pode bloquear: sem tecnica top_set_backoff, R1 ainda dispara */
export function assertR8NaoBloqueiaR1(): { ok: boolean; msg: string } {
  const d = decidirProgressao(inputR1()); // sem tecnica
  const ok = d.regra === "R1" && d.acao === "subir_carga";
  return {
    ok,
    msg: ok
      ? "R8 não bloqueia R1 OK"
      : `R8 não bloqueia FAIL: ${d.regra}`,
  };
}
