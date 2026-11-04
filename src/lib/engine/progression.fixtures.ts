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

// ── R12 calibração inicial ───────────────────────────────────────────────

function estadoEstimativa(over: Partial<EstadoExercicio> = {}): EstadoExercicio {
  return {
    ...estadoSupino60(),
    carga_atual_kg: 30,
    alvo_proxima_sessao: { carga_kg: 30, faixa_reps: [6, 10], rir_alvo: 2 },
    // Estado recém-gerado: PR/e1RM ainda são a estimativa, não algo levantado.
    pr_carga_kg: 30,
    pr_reps: 0,
    e1rm_estimado_kg: 40,
    origem_carga: "estimativa_conservadora",
    primeira_sessao: true,
    ...over,
  };
}

function seriesCalibracao(opts: {
  cargaKg: number;
  reps: number;
  rir: number;
  tipo_serie?: RegistroSerie["tipo_serie"];
}): RegistroSerie[] {
  const base = {
    sessao_id: "sess-calib",
    prescricao_id: "presc-supino",
    exercicio_id: "supino_reto_convencional",
    dor: false,
    executado_em: "2026-10-21T18:00:00.000Z",
  };
  return [
    {
      ...base,
      id: "c1",
      numero: 1,
      tipo_serie: opts.tipo_serie ?? ("trabalho" as const),
      carga_kg: opts.cargaKg,
      reps: opts.reps,
      rir_percebido: opts.rir,
    },
  ];
}

/** Estimativa folgada + RIR alto → calibra subindo (mais que R1). */
export function assertR12Subir(): { ok: boolean; msg: string } {
  const series = seriesCalibracao({ cargaKg: 30, reps: 10, rir: 4 });
  const d = decidirProgressao({ ...inputR1(), series, estado: estadoEstimativa() });
  const ok =
    d.regra === "R12" &&
    d.acao === "subir_carga" &&
    d.nova_carga_kg > 30 &&
    d.nova_carga_kg <= 40;
  return {
    ok,
    msg: ok
      ? `R12 subir OK: 30→${d.nova_carga_kg} kg (RIR 4)`
      : `R12 subir FAIL: ${d.regra} ${d.acao} ${d.nova_carga_kg}`,
  };
}

/** Estimativa já no ponto (piso da faixa no RIR alvo) → mantém e calibra. */
export function assertR12Manter(): { ok: boolean; msg: string } {
  const series = seriesCalibracao({ cargaKg: 40, reps: 6, rir: 2 });
  const estado = estadoEstimativa({ carga_atual_kg: 40 });
  const d = decidirProgressao({ ...inputR1(), series, estado });
  const depois = aplicarDecisao(estado, d, series);
  const ok =
    d.regra === "R12" &&
    d.acao === "manter_carga" &&
    d.nova_carga_kg === 40 &&
    depois.origem_carga === "calibracao" &&
    depois.primeira_sessao === false;
  return {
    ok,
    msg: ok
      ? `R12 manter OK: 40 kg; origem=${depois.origem_carga}`
      : `R12 manter FAIL: ${d.regra} ${d.acao} ${d.nova_carga_kg} origem=${depois.origem_carga}`,
  };
}

/** Estimativa otimista demais (falhou o piso) → calibra reduzindo. */
export function assertR12Reduzir(): { ok: boolean; msg: string } {
  const series = seriesCalibracao({ cargaKg: 60, reps: 4, rir: 0 });
  const estado = estadoEstimativa({
    carga_atual_kg: 60,
    faixa_reps: [8, 12],
    alvo_proxima_sessao: { carga_kg: 60, faixa_reps: [8, 12], rir_alvo: 2 },
  });
  const d = decidirProgressao({ ...inputR1(), series, estado });
  const ok =
    d.regra === "R12" &&
    d.acao === "reduzir_carga" &&
    d.nova_carga_kg < 60 &&
    d.nova_carga_kg >= 50;
  return {
    ok,
    msg: ok
      ? `R12 reduzir OK: 60→${d.nova_carga_kg} kg (4 reps @ RIR 0)`
      : `R12 reduzir FAIL: ${d.regra} ${d.acao} ${d.nova_carga_kg}`,
  };
}

/** Peso corporal (0 kg) não inventa carga: mantém 0 e encerra a calibração. */
export function assertR12SemCarga(): { ok: boolean; msg: string } {
  const series = seriesCalibracao({ cargaKg: 0, reps: 20, rir: 1 });
  const estado = estadoEstimativa({
    carga_atual_kg: 0,
    alvo_proxima_sessao: { carga_kg: 0, faixa_reps: [6, 10], rir_alvo: 2 },
  });
  const d = decidirProgressao({ ...inputR1(), series, estado });
  const depois = aplicarDecisao(estado, d, series);
  const ok =
    d.regra === "R12" &&
    d.acao === "manter_e_checar" &&
    d.nova_carga_kg === 0 &&
    depois.origem_carga === "calibracao";
  return {
    ok,
    msg: ok
      ? "R12 sem carga OK: 0 kg mantido"
      : `R12 sem carga FAIL: ${d.regra} ${d.acao} ${d.nova_carga_kg}`,
  };
}

/** Sem série válida (só aquecimento) → adia a calibração para a próxima. */
export function assertR12Adiada(): { ok: boolean; msg: string } {
  const series = seriesCalibracao({
    cargaKg: 30,
    reps: 10,
    rir: 3,
    tipo_serie: "aquecimento",
  });
  const estado = estadoEstimativa();
  const d = decidirProgressao({ ...inputR1(), series, estado });
  const depois = aplicarDecisao(estado, d, series);
  const ok =
    d.regra === "R12" &&
    d.acao === "manter_e_checar" &&
    depois.primeira_sessao === true &&
    depois.origem_carga === "estimativa_conservadora";
  return {
    ok,
    msg: ok
      ? "R12 adiada OK: sem série válida, calibra na próxima"
      : `R12 adiada FAIL: ${d.regra} ${d.acao} primeira=${depois.primeira_sessao}`,
  };
}

/** Alvo logo acima do atual não pode "sumir" no arredondamento (10 → 12,5). */
export function assertR12ArredondaPraCima(): { ok: boolean; msg: string } {
  const series = seriesCalibracao({ cargaKg: 10, reps: 10, rir: 4 });
  const estado = estadoEstimativa({
    carga_atual_kg: 10,
    faixa_reps: [8, 12],
    alvo_proxima_sessao: { carga_kg: 10, faixa_reps: [8, 12], rir_alvo: 2 },
  });
  const d = decidirProgressao({ ...inputR1(), series, estado });
  const ok =
    d.regra === "R12" && d.acao === "subir_carga" && d.nova_carga_kg === 12.5;
  return {
    ok,
    msg: ok
      ? `R12 arredonda pra cima OK: 10→${d.nova_carga_kg} kg`
      : `R12 arredonda pra cima FAIL: ${d.regra} ${d.acao} ${d.nova_carga_kg}`,
  };
}

/** PR/e1RM da estimativa não podem sobreviver à 1ª sessão real. */
export function assertR12PRReal(): { ok: boolean; msg: string } {
  const series = seriesCalibracao({ cargaKg: 60, reps: 4, rir: 0 });
  const estado = estadoEstimativa({
    carga_atual_kg: 60,
    faixa_reps: [8, 12],
    alvo_proxima_sessao: { carga_kg: 60, faixa_reps: [8, 12], rir_alvo: 2 },
    pr_carga_kg: 90,
    pr_reps: 0,
    e1rm_estimado_kg: 100,
  });
  const d = decidirProgressao({ ...inputR1(), series, estado });
  const depois = aplicarDecisao(estado, d, series);
  const e1rmReal = Math.round(60 * (1 + 4 / 30) * 10) / 10;
  const ok =
    d.regra === "R12" &&
    depois.pr_carga_kg === 60 &&
    depois.e1rm_estimado_kg === e1rmReal;
  return {
    ok,
    msg: ok
      ? `R12 PR real OK: PR=60 e1RM=${depois.e1rm_estimado_kg} (antes 90/100)`
      : `R12 PR real FAIL: PR=${depois.pr_carga_kg} e1RM=${depois.e1rm_estimado_kg}`,
  };
}
