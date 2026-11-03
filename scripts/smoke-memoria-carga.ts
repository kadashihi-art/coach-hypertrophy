/**
 * smoke:memoria-carga — memória de carga (Fase 1).
 * Garante: resumo por exercício, exclusão da sessão em andamento, prioridade
 * estado → histórico → mesmo padrão → estimativa, e estimativa sensível a
 * peso corporal/core, sexo, idade e incremento de inferiores.
 */
import assert from "node:assert/strict";
import type {
  EstadoExercicio,
  RegistroSerie,
  TipoSerie,
} from "../src/lib/domain";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import {
  cargaDeMesmoPadrao,
  cargaSugeridaParaExercicio,
  fatorEquipamento,
  resumirExercicio,
  resumirExercicios,
  textoUltimaVez,
  textoTendencia,
} from "../src/lib/engine/memoria-carga";
import { estimarCargaKg, gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { remountPlano } from "../src/lib/plan/remount-plano";

const EX = "supino_reto_convencional";
const EX_MAQUINA = "supino_maquina";
const EX_INFERIOR = "agachamento_barra";

let regSeq = 0;
function reg(
  sessao_id: string,
  carga_kg: number,
  reps: number,
  opts: {
    tipo_serie?: TipoSerie;
    rir_percebido?: number;
    em?: string;
    exercicio_id?: string;
  } = {},
): RegistroSerie {
  regSeq += 1;
  return {
    id: `reg-${regSeq}`,
    sessao_id,
    prescricao_id: `presc-${sessao_id}`,
    exercicio_id: opts.exercicio_id ?? EX,
    numero: regSeq,
    tipo_serie: opts.tipo_serie ?? "top_set",
    carga_kg,
    reps,
    rir_percebido: opts.rir_percebido ?? 2,
    dor: false,
    executado_em: opts.em ?? `2026-10-0${regSeq}T12:00:00.000Z`,
  };
}

const registros: RegistroSerie[] = [
  // preparatória não conta
  reg("s1", 30, 5, { tipo_serie: "aquecimento", em: "2026-10-01T12:00:00.000Z" }),
  reg("s1", 60, 8, { em: "2026-10-01T12:05:00.000Z" }),
  reg("s1", 55, 8, { tipo_serie: "back_off", em: "2026-10-01T12:10:00.000Z" }),
  reg("s2", 62.5, 7, { rir_percebido: 1, em: "2026-10-08T12:00:00.000Z" }),
  reg("s3", 65, 6, { rir_percebido: 0, em: "2026-10-15T12:00:00.000Z" }),
];

// ── 1) resumo do exercício ────────────────────────────────────────────────
const m = resumirExercicio(registros, EX, { stepKg: 2.5 });
assert.ok(m, "deveria resumir o exercício com histórico");
assert.equal(m.sessoes, 3, "3 sessões de trabalho (aquecimento fora)");
assert.equal(m.ultima_em, "2026-10-15T12:00:00.000Z");
assert.equal(m.ultimo_top_kg, 65);
assert.equal(m.ultimas_reps, 6);
assert.equal(m.ultimo_rir, 0);
assert.equal(m.ultimo_back_off_kg, 55);
assert.equal(m.carga_sugerida_kg, 65);
assert.ok(m.melhor_e1rm_kg >= m.e1rm_recente_kg, "melhor e1RM ≥ recente");
assert.ok((m.tendencia_pct ?? 0) > 0, "tendência positiva entre 3 sessões");
assert.equal(textoUltimaVez(m), "65 kg × 6 reps @ RIR 0");
assert.ok(textoTendencia(m)?.includes("e1RM"), "texto de tendência cita e1RM");

// Sem histórico
assert.equal(resumirExercicio(registros, "inexistente", { stepKg: 2.5 }), null);

// Excluir a sessão em andamento (mostra "última vez", não "agora")
const mSemS3 = resumirExercicio(registros, EX, {
  stepKg: 2.5,
  excluirSessaoId: "s3",
});
assert.ok(mSemS3);
assert.equal(mSemS3.sessoes, 2);
assert.equal(mSemS3.ultimo_top_kg, 62.5);
assert.equal(mSemS3.tendencia_pct, null, "menos de 3 sessões → sem tendência");

const mapa = resumirExercicios(registros, CATALOG_EXERCICIOS);
assert.equal(mapa.get(EX)?.sessoes, 3);
assert.equal(mapa.has("inexistente"), false);

// ── 2) fator de equipamento ───────────────────────────────────────────────
assert.equal(fatorEquipamento("empurrar_horizontal", "peso_corporal"), 0);
assert.ok(
  fatorEquipamento("agachamento", "maquina") >
    fatorEquipamento("agachamento", "barra"),
  "leg press carrega mais que barra",
);

// ── 3) carga sugerida: prioridade ─────────────────────────────────────────
const base = { estados: [], registros, exercicios: CATALOG_EXERCICIOS };

const hist = cargaSugeridaParaExercicio(base, EX, 40);
assert.equal(hist.origem, "historico");
assert.equal(hist.carga_kg, 65);
assert.equal(hist.confianca, "alta");

const estimativa = cargaSugeridaParaExercicio(base, "crucifixo_cabo", 12);
assert.equal(estimativa.origem, "estimativa");
assert.equal(estimativa.carga_kg, 12.5, "fallback arredonda no step de 2,5 kg");
assert.equal(estimativa.confianca, "baixa");

const equivalente = cargaSugeridaParaExercicio(base, EX_MAQUINA, 60);
assert.equal(equivalente.origem, "mesmo_padrao");
assert.ok(equivalente.carga_kg > 0);
assert.equal(equivalente.exercicio_origem_id, EX);

const mesmoPadrao = cargaDeMesmoPadrao({
  registros,
  exercicios: CATALOG_EXERCICIOS,
  alvo: CATALOG_EXERCICIOS.find((e) => e.id === EX_MAQUINA)!,
  fallbackKg: 60,
});
assert.ok(mesmoPadrao, "deveria achar equivalente de mesmo padrão");
assert.equal(mesmoPadrao.mesmo_equipamento, false);

// Estado calibrado vence histórico
function estado(over: Partial<EstadoExercicio>): EstadoExercicio {
  return {
    exercicio_id: EX,
    carga_atual_kg: 70,
    faixa_reps: [8, 12],
    rir_alvo: 2,
    alvo_proxima_sessao: { carga_kg: 72.5, faixa_reps: [8, 12], rir_alvo: 2 },
    sessoes_sem_progresso: 0,
    ultima_progressao_em: null,
    e1rm_estimado_kg: 90,
    pr_carga_kg: 70,
    pr_reps: 8,
    origem_carga: "historico",
    primeira_sessao: false,
    ultimo_top_kg: 70,
    ultimo_back_off_kg: null,
    ultimo_rir: 2,
    ultima_sessao_em: "2026-10-15T12:00:00.000Z",
    atualizado_em: "2026-10-15T12:00:00.000Z",
    ...over,
  };
}

const calibrado = cargaSugeridaParaExercicio(
  { ...base, estados: [estado({})] },
  EX,
  40,
);
assert.equal(calibrado.origem, "estado");
assert.equal(calibrado.carga_kg, 72.5);

const primeira = cargaSugeridaParaExercicio(
  {
    ...base,
    estados: [
      estado({ primeira_sessao: true, origem_carga: "estimativa_conservadora" }),
    ],
  },
  EX,
  40,
);
assert.equal(primeira.origem, "historico", "1ª sessão ainda usa histórico real");

// ── 4) estimativa inicial ─────────────────────────────────────────────────
const exSupino = CATALOG_EXERCICIOS.find((e) => e.id === EX)!;
const exSupinoMaquina = CATALOG_EXERCICIOS.find((e) => e.id === EX_MAQUINA)!;
const exFlexao = CATALOG_EXERCICIOS.find((e) => e.id === "flexao_solo")!;

assert.equal(
  estimarCargaKg(80, "intermediario", exFlexao.padrao, true, "peso_corporal", {
    grupo: exFlexao.grupo_primario,
  }),
  0,
  "peso corporal não recebe kg",
);
assert.equal(
  estimarCargaKg(80, "intermediario", "core_antiextensao", false, "maquina", {
    grupo: "abdomen",
  }),
  0,
  "core não recebe kg",
);

const homem30 = estimarCargaKg(80, "intermediario", exSupino.padrao, true, exSupino.equipamento, {
  sexo: "masculino",
  idade: 30,
  grupo: exSupino.grupo_primario,
});
const mulher30 = estimarCargaKg(80, "intermediario", exSupino.padrao, true, exSupino.equipamento, {
  sexo: "feminino",
  idade: 30,
  grupo: exSupino.grupo_primario,
});
const homem65 = estimarCargaKg(80, "intermediario", exSupino.padrao, true, exSupino.equipamento, {
  sexo: "masculino",
  idade: 65,
  grupo: exSupino.grupo_primario,
});
assert.ok(mulher30 < homem30, "sexo feminino reduz a estimativa");
assert.ok(homem65 < homem30, "idade ≥60 reduz a estimativa");

const semOpcoes = estimarCargaKg(80, "intermediario", exSupino.padrao, true, exSupino.equipamento);
assert.equal(homem30, semOpcoes, "sem sexo/idade mantém cálculo anterior");

const supinoMaq = estimarCargaKg(
  80,
  "intermediario",
  exSupinoMaquina.padrao,
  true,
  exSupinoMaquina.equipamento,
  { grupo: exSupinoMaquina.grupo_primario },
);
assert.equal(supinoMaq % 2.5, 0, "superiores arredondam em 2,5 kg");

const agachamento = estimarCargaKg(80, "intermediario", "agachamento", true, "barra", {
  grupo: "quadriceps",
});
assert.equal(agachamento % 5, 0, "inferiores arredondam em 5 kg");
assert.ok(agachamento >= 5);

// agachamento_barra existe no catálogo? (mantém o fixture honesto)
assert.ok(
  CATALOG_EXERCICIOS.some((e) => e.id === EX_INFERIOR),
  "fixture de inferiores presente no catálogo",
);

// ── 5) remontagem: memória preenche exercício novo e faixa/RIR seguem o plano ──
(async () => {
  const perfil = {
    id: "smoke-memoria",
    peso_kg: 80,
    altura_cm: 178,
    experiencia: "intermediario" as const,
    dias_por_semana: 4,
    minutos_por_sessao: 60,
    cardio_min_semana: 0,
    equipamentos: ["barra", "halteres", "maquina", "cabo"] as const,
    restricoes: [],
    objetivo: "hipertrofia" as const,
    onboarding_concluido: true,
    parq_liberado: true,
    parq_respondido_em: "2026-01-01T00:00:00.000Z",
    parq_respostas: [false, false, false, false, false, false, false],
    criado_em: "2026-01-01T00:00:00.000Z",
  };
  const perfilOk = { ...perfil, equipamentos: [...perfil.equipamentos] };

  const g = gerarPlanoFromPerfil(perfilOk, CATALOG_EXERCICIOS);
  const alvo = g.sessoes[0]!.prescricoes[0]!;

  // Histórico real do exercício escolhido pelo motor: deve virar o estado do plano.
  const historico = [
    reg("h1", 80, 8, { exercicio_id: alvo.exercicio_id, em: "2026-10-01T12:00:00.000Z" }),
    reg("h2", 82.5, 8, { exercicio_id: alvo.exercicio_id, em: "2026-10-08T12:00:00.000Z" }),
  ];
  const r1 = await remountPlano({
    perfil: perfilOk,
    catalog: CATALOG_EXERCICIOS,
    estadosAnteriores: [],
    registros: historico,
    skipLlm: true,
  });
  const estadoNovo = r1.estados.find((e) => e.exercicio_id === alvo.exercicio_id);
  assert.ok(estadoNovo, "remontagem cria estado para o exercício do plano");
  assert.equal(estadoNovo.origem_carga, "historico");
  assert.equal(estadoNovo.primeira_sessao, false);
  assert.equal(estadoNovo.alvo_proxima_sessao.carga_kg, 82.5);

  // Estado anterior preserva a carga, mas adota faixa/RIR do plano novo.
  const antigo = estado({
    exercicio_id: alvo.exercicio_id,
    faixa_reps: [3, 5],
    rir_alvo: 1,
    alvo_proxima_sessao: { carga_kg: 99, faixa_reps: [3, 5], rir_alvo: 1 },
  });
  const r2 = await remountPlano({
    perfil: perfilOk,
    catalog: CATALOG_EXERCICIOS,
    estadosAnteriores: [antigo],
    registros: historico,
    skipLlm: true,
  });
  const merged = r2.estados.find((e) => e.exercicio_id === alvo.exercicio_id)!;
  const pNovo = r2.sessoes
    .flatMap((s) => s.prescricoes)
    .find((p) => p.exercicio_id === alvo.exercicio_id)!;
  assert.equal(merged.alvo_proxima_sessao.carga_kg, 99, "preserva carga anterior");
  assert.deepEqual(merged.alvo_proxima_sessao.faixa_reps, pNovo.faixa_reps);
  assert.equal(merged.alvo_proxima_sessao.rir_alvo, pNovo.rir_alvo);
  assert.equal(merged.rir_alvo, pNovo.rir_alvo);

  console.log("smoke:memoria-carga OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
