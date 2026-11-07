/**
 * Projeção das 6 semanas no calendário: semanas futuras, virada de fase, passado real
 * e segurança das ações em dias previstos.
 */
import assert from "node:assert/strict";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import {
  acoesDoDia,
  addDaysIso,
  agendarSessoes,
  derivarCalendario,
  limparDia,
  marcarDia,
} from "../src/lib/plan/calendario";
import {
  ehOcorrenciaProjetada,
  semanaDaOcorrenciaProjetada,
} from "../src/lib/plan/ocorrencia-id";
import { projetarOcorrencias } from "../src/lib/plan/projecao";
import type { AppState, Perfil } from "../src/lib/domain";

const base: Perfil = {
  id: "smoke-projecao",
  peso_kg: 80,
  altura_cm: 178,
  experiencia: "intermediario",
  dias_por_semana: 4,
  minutos_por_sessao: 60,
  cardio_min_semana: 0,
  equipamentos: ["barra", "halteres", "maquina", "cabo"],
  restricoes: [],
  objetivo: "hipertrofia",
  onboarding_concluido: true,
  parq_liberado: true,
  parq_respostas: [false, false, false, false, false, false, false],
  parq_respondido_em: "2026-10-01",
  criado_em: "2026-10-01T12:00:00.000Z",
};

function montar(perfil: Perfil, inicio: string): AppState {
  const g = gerarPlanoFromPerfil(perfil, CATALOG_EXERCICIOS);
  const plano = { ...g.plano, mesociclo: { ...g.plano.mesociclo, data_inicio: inicio } };
  const sessoes = agendarSessoes(g.sessoes, plano, inicio);
  return {
    perfil,
    exercicios: CATALOG_EXERCICIOS,
    guias: [],
    plano,
    sessoes,
    registros: [],
    estados: g.estados,
    checkins: [],
    alertas: [],
    decisoes: [],
    volumes_semanais: [],
    active_sessao_id: null,
    logger_prescricao_id: null,
  } as AppState;
}

const semanaDe = (iso: string) => semanaDaOcorrenciaProjetada(iso);
const naFaixa = (iso: string, ini: string, fim: string) => iso >= ini && iso <= fim;
const ocorrencias = (ocs: ReturnType<typeof projetarOcorrencias>, ini: string, fim: string) =>
  ocs.filter((s) => !!s.data && naFaixa(s.data, ini, fim));

// ── 1) Plano novo, sem fase: 4 treinos/semana × 6 semanas ─────────────────────────────
const inicio = "2026-11-02"; // segunda
const A = montar(base, inicio);
{
  const ocs = projetarOcorrencias(A, inicio);
  const reais = ocs.filter((s) => !ehOcorrenciaProjetada(s.id));
  const previstas = ocs.filter((s) => ehOcorrenciaProjetada(s.id));
  assert.equal(reais.length, 4, "semana 1 vem da agenda real");
  assert.equal(previstas.length, 20, "semanas 2–6 projetadas (4 por semana)");
  assert.equal(ocs.length, 24, "4 treinos × 6 semanas");

  const semanas = new Map<number, number>();
  for (const p of previstas) {
    const w = semanaDe(p.id);
    assert.ok(w != null, `id previsto com semana: ${p.id}`);
    semanas.set(w!, (semanas.get(w!) ?? 0) + 1);
  }
  for (const w of [2, 3, 4, 5, 6]) assert.equal(semanas.get(w), 4, `semana ${w} com 4 treinos`);

  // Dias da semana saem do microciclo da fase (descanso inteligente), não de um preset fixo.
  const micro = A.plano!.estrutura!.fases[0]!.microciclo;
  const diasSemana = micro.filter((d) => d.sessao_id).map((d) => d.dia);
  const esperadoSem2 = diasSemana.map((off) => addDaysIso("2026-11-09", off));
  const sem2 = ocorrencias(ocs, "2026-11-09", "2026-11-15").sort((a, b) => a.data!.localeCompare(b.data!));
  assert.deepEqual(sem2.map((s) => s.data), esperadoSem2, "semana 2 segue o microciclo");
  assert.ok(sem2.every((s) => ehOcorrenciaProjetada(s.id)), "semana 2 é projetada");

  const cal = derivarCalendario(ocs, 2026, 10);
  const d2 = cal.find((d) => d.data === "2026-11-09")!;
  const d1 = cal.find((d) => d.data === "2026-11-02")!;
  assert.equal(d2.projetado, true, "calendário marca dia previsto");
  assert.equal(d2.status, "planejado");
  assert.equal(d2.semana, 2);
  assert.equal(d1.projetado, undefined, "semana 1 não é projeção");
  assert.deepEqual(acoesDoDia(d2, inicio), [], "dia previsto não mostra ações");
  assert.ok(acoesDoDia(d1, inicio).includes("feito"), "semana 1 continua acionável");

  // Segurança: ações em dia previsto não gravam nada.
  const idPrev = d2.sessao_id!;
  assert.equal(marcarDia(A, ocs, d2.data, idPrev, "feito"), A, "marcar feito em previsto é no-op");
  assert.equal(marcarDia(A, ocs, d2.data, idPrev, "pular"), A, "pular previsto é no-op");
  assert.deepEqual(limparDia(A, d2.data, idPrev), { ok: false, motivo: "projetado" });
}

// ── 2) Virada de fase: 3 semanas de UL + 3 semanas de híbrido ─────────────────────────
{
  const B = montar(
    { ...base, estilo_split: "upper_lower", fase2_estilo: "hibrido_ppl_ul", fase1_semanas: 3, fase2_semanas: 3 },
    inicio,
  );
  const fases = B.plano!.estrutura!.fases;
  assert.equal(fases.length, 2);
  assert.equal(fases[1]!.semana_inicio, 4, "fase 2 começa na semana 4");

  const ocs = projetarOcorrencias(B, inicio);
  const n1 = fases[0]!.microciclo.filter((d) => d.sessao_id).length;
  const n2 = fases[1]!.microciclo.filter((d) => d.sessao_id).length;
  assert.equal(ocs.length, 3 * n1 + 3 * n2, "3+3 semanas com os treinos de cada fase");
  const sem2e3 = ocorrencias(ocs, "2026-11-09", "2026-11-22");
  const sem4 = ocorrencias(ocs, "2026-11-23", "2026-11-29");
  const sem5 = ocorrencias(ocs, "2026-11-30", "2026-12-06");
  assert.ok(sem2e3.length === 2 * n1 && sem2e3.every((s) => !s.nome.startsWith("F2 · ")), "semanas 2–3 na fase 1");
  assert.equal(sem4.length, n2, "semana 4 traz os treinos da fase 2");
  assert.ok(sem4.every((s) => s.nome.startsWith("F2 · ")), "semana 4 já usa os treinos da fase 2");
  assert.equal(sem4[0]!.data, "2026-11-23", "1º treino da fase 2 em 23/11");
  assert.ok(sem5.length === n2 && sem5.every((s) => s.nome.startsWith("F2 · ")), "semana 5 projeta a fase 2");
  assert.ok(sem5.every((s) => ehOcorrenciaProjetada(s.id)), "semana 5 é projeção");
}

// ── 3) Passado não é inventado ────────────────────────────────────────────────────────
{
  const C: AppState = {
    ...A,
    sessoes: A.sessoes.map((s) => ({ ...s, status: "concluida" as const, finalizada_em: "2026-11-06T20:00:00.000Z" })),
  };
  const hoje = "2026-11-18"; // quarta da semana 3
  const ocs = projetarOcorrencias(C, hoje);
  assert.ok(
    ocs.filter((s) => ehOcorrenciaProjetada(s.id)).every((s) => s.data! >= hoje),
    "nenhuma ocorrência projetada no passado",
  );
  assert.equal(ocorrencias(ocs, "2026-11-09", "2026-11-15").length, 0, "semana 2 passada não é inventada");
  assert.equal(
    ocs.filter((s) => s.status === "concluida").length,
    4,
    "histórico da semana 1 continua aparecendo",
  );
  assert.ok(ocorrencias(ocs, hoje, "2026-12-20").length > 0, "futuro continua planejado");
}

// ── 4) Pendente empurrado não duplica o mesmo treino ─────────────────────────────────
{
  const D: AppState = {
    ...A,
    sessoes: A.sessoes.map((s) =>
      s.ordem < 4 ? { ...s, status: "concluida" as const, finalizada_em: "2026-11-06T20:00:00.000Z" } : s,
    ),
  };
  const hoje = "2026-11-09"; // segunda da semana 2, com o 4º treino da semana 1 pendente
  const ocs = projetarOcorrencias(D, hoje);
  const chave = (s: { nome: string; data: string | null }) => `${s.nome}@${s.data}`;
  const chaves = ocs.filter((s) => !!s.data).map(chave);
  assert.equal(new Set(chaves).size, chaves.length, "nenhum treino duplicado no mesmo dia");

  const quarto = D.sessoes.find((s) => s.ordem === 4)!;
  const ocorrenciasQuarto = ocs.filter((s) => s.id === quarto.id || s.id.startsWith(`${quarto.id}#`));
  const reaisQuarto = ocorrenciasQuarto.filter((s) => !ehOcorrenciaProjetada(s.id));
  assert.equal(reaisQuarto.length, 1, "o pendente aparece uma única vez como ocorrência real");
  assert.equal(reaisQuarto[0]!.data, hoje, "o pendente foi para hoje");
  for (const p of ocorrenciasQuarto.filter((s) => ehOcorrenciaProjetada(s.id))) {
    assert.ok(p.data! > hoje, `as próximas semanas do mesmo treino vêm depois: ${p.data}`);
  }
}

// ── 5) Plano antigo sem estrutura também projeta as 6 semanas ────────────────────────
{
  const g = gerarPlanoFromPerfil(base, CATALOG_EXERCICIOS);
  const plano = {
    ...g.plano,
    estrutura: undefined,
    mesociclo: { ...g.plano.mesociclo, data_inicio: inicio, total_semanas: 6 },
  };
  const sessoes = agendarSessoes(g.sessoes, plano, inicio);
  const L = { ...A, plano, sessoes } as AppState;
  const ocs = projetarOcorrencias(L, inicio);
  assert.equal(ocs.filter((s) => ehOcorrenciaProjetada(s.id)).length, 20, "legado: 5 semanas projetadas");
  assert.equal(ocs.length, 24, "legado: 6 semanas no total");
}

console.log("smoke-projecao OK");
