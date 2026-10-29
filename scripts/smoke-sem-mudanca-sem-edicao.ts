/**
 * Smoke de não-regressão: nenhuma conta muda de progressão sem edição.
 * Uso: STATE_FILE=/caminho/estado.json npm run smoke:sem-mudanca-sem-edicao
 *      (sem STATE_FILE roda só com fixtures sintéticas geradas pelo código de ANTES deste PR).
 * Verifica:
 *  1) carregar/normalizar/migrar com o campo novo não muda EstadoExercicio, próxima carga, âncora,
 *     e1RM, PR, volume nem Progresso;
 *  2) abrir o editor e salvar sem mudar nada é no-op (treino planejado e concluído);
 *  3) concluir uma sessão nova dá o mesmo estado que o código de antes do PR, só com o snapshot a mais.
 * Não lê nada por rede. O arquivo é só lido, nunca escrito.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { AppStateSchema, type AppState, type Perfil, type RegistroSerie } from "../src/lib/domain";
import { concluirSessao } from "../src/lib/engine/concluir-sessao";
import { mesmo, aplicarCorrecao, rascunhoCorrecaoDaSessao, recalcularAPartirDe, previaCorrecao } from "../src/lib/plan/corrigir-concluida";
import { previaEdicao, rascunhoDaSessao, sessaoEditavel } from "../src/lib/plan/editar-treino";
import { currentIsoWeek } from "../src/lib/engine/volume";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const BASE_COMMIT = process.env.BASE_COMMIT ?? "c50f392";

// ——— conclusão "de antes do PR": o corpo original do finishSession, tirado do git ———
type Velho = (s: AppState) => AppState;
async function carregarVelho(): Promise<Velho | null> {
  let src: string;
  try {
    src = execFileSync("git", ["show", `${BASE_COMMIT}:src/components/AppProvider.tsx`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
  const ini = src.indexOf("  const finishSession = useCallback((): DecisaoProgressao[] => {");
  const a = src.indexOf("    setState((s) => {\n", ini) + "    setState((s) => {\n".length;
  const fim = src.indexOf("    return decisoes;\n  }, []);", ini);
  let corpo = src.slice(a, fim);
  corpo = corpo.slice(0, corpo.trimEnd().lastIndexOf("});"));
  corpo = corpo.replace("decisoes = novasDecisoes;", "");
  const arq = join(__dirname, `.tmp-concluir-velho-${process.pid}.ts`);
  writeFileSync(arq, `import { ehSeriePreparatoria } from "../src/lib/domain/enums";
import type { AppState, DecisaoProgressao, GrupoMuscular } from "../src/lib/domain";
import { aplicarDecisao, aplicarEstadoNaPrescricao, decidirProgressao } from "../src/lib/engine/progression";
import { acumularVolumeSemanal, mergeVolumeSessao, volumeSessaoPorGrupo, currentIsoWeek } from "../src/lib/engine/volume";
import { avaliarAlertasVolume, aplicarAjusteVolumeNasSessoes, extractVolumeMarkers } from "../src/lib/engine/alertas-volume";
export function velho(s: AppState): AppState {
${corpo}
}
`);
  try {
    const m = await import(pathToFileURL(arq).href);
    return m.velho as Velho;
  } finally {
    unlinkSync(arq);
  }
}

// ——— normalização para comparar (carimbos de tempo e ids aleatórios fora) ———
const TEMPO = new Set(["atualizado_em", "ultima_sessao_em", "finalizada_em", "snapshot_conclusao"]);
function limpo(v: unknown, pai = ""): unknown {
  if (Array.isArray(v)) return v.map((x) => limpo(x, pai));
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      if (TEMPO.has(k)) continue;
      if (k === "id" && (pai === "decisoes" || pai === "alertas")) continue;
      o[k] = limpo((v as Record<string, unknown>)[k], k);
    }
    return o;
  }
  return v;
}

function derivados(s: { estados?: unknown[]; volumes_semanais?: unknown[]; registros?: unknown[]; sessoes?: unknown[]; decisoes?: unknown[] }) {
  type E = { exercicio_id: string; carga_atual_kg: number; alvo_proxima_sessao: { carga_kg: number; faixa_reps: number[]; rir_alvo: number }; e1rm_estimado_kg: number; pr_carga_kg: number; pr_reps: number; origem_carga: string; ultimo_top_kg?: number | null; ultimo_back_off_kg?: number | null; sessoes_sem_progresso: number };
  const est = ((s.estados ?? []) as E[]).map((e) => ({
    ex: e.exercicio_id, carga: e.carga_atual_kg, proxima: e.alvo_proxima_sessao, e1rm: e.e1rm_estimado_kg,
    pr: [e.pr_carga_kg, e.pr_reps], origem: e.origem_carga, ancora: [e.ultimo_top_kg ?? null, e.ultimo_back_off_kg ?? null], ssp: e.sessoes_sem_progresso,
  }));
  const sem = currentIsoWeek();
  type V = { semana_iso: string; grupo: string; series_diretas?: number; series_indiretas?: number; series_efetivas?: number };
  const vols = ((s.volumes_semanais ?? []) as V[]).map((v) => [v.semana_iso, v.grupo, v.series_diretas ?? 0, v.series_indiretas ?? 0, v.series_efetivas ?? 0]);
  type R = { sessao_id: string; exercicio_id: string; carga_kg: number; reps: number; rir_percebido: number; tipo_serie: string };
  const regs = ((s.registros ?? []) as R[]).map((r) => [r.sessao_id, r.exercicio_id, r.tipo_serie, r.carga_kg, r.reps, r.rir_percebido]);
  type S = { id: string; status?: string; prescricoes?: { exercicio_id: string; carga?: { trabalho_kg: number; top_set_kg?: number | null } }[] };
  const sess = ((s.sessoes ?? []) as S[]).map((x) => [x.id, x.status ?? "planejada", (x.prescricoes ?? []).map((p) => [p.exercicio_id, p.carga?.trabalho_kg, p.carga?.top_set_kg ?? null])]);
  const progresso = {
    concluidas: ((s.sessoes ?? []) as S[]).filter((x) => x.status === "concluida").length,
    semana: vols.filter((v) => v[0] === sem),
    decisoes: (s.decisoes ?? []).length,
  };
  return JSON.stringify({ est, vols, regs, sess, progresso });
}

// ——— fixture sintética (gerada pelo código de antes do PR) ———
function iniciarComRegistros(s: AppState, sid: string, variar = 0): AppState {
  const sess = s.sessoes.find((x) => x.id === sid)!;
  const regs: RegistroSerie[] = [];
  sess.prescricoes.slice(0, 3).forEach((p, k) => {
    for (let j = 0; j < Math.max(2, Math.min(p.series, 4)); j++) {
      regs.push({
        id: `${p.id}-r${j + 1}`, sessao_id: sid, prescricao_id: p.id, exercicio_id: p.exercicio_id, numero: j + 1,
        tipo_serie: j === 0 && k === 0 ? "aquecimento" : "trabalho",
        carga_kg: Math.max(0, p.carga.trabalho_kg + variar), reps: p.faixa_reps[1] - (j % 2), rir_percebido: 2, dor: false,
        executado_em: "2026-10-20T12:00:00.000Z",
      });
    }
  });
  return { ...s, active_sessao_id: sid, sessoes: s.sessoes.map((x) => (x.id === sid ? { ...x, status: "em_andamento" as const } : x)), registros: [...s.registros, ...regs] };
}

function fixturesSinteticas(v: Velho): { nome: string; raw: unknown }[] {
  const out: { nome: string; raw: unknown }[] = [];
  const perfis: Perfil[] = [
    { id: "fx-a", peso_kg: 80, altura_cm: 178, experiencia: "intermediario", dias_por_semana: 4, minutos_por_sessao: 60, cardio_min_semana: 0, equipamentos: ["barra", "halteres", "maquina", "cabo"], restricoes: [], objetivo: "hipertrofia", onboarding_concluido: true, parq_liberado: true, parq_respondido_em: "2026-10-01T10:00:00.000Z", parq_respostas: [false, false, false, false, false, false, false], criado_em: "2026-10-01T10:00:00.000Z" },
    { id: "fx-b", peso_kg: 62, altura_cm: 165, experiencia: "iniciante", dias_por_semana: 3, minutos_por_sessao: 45, cardio_min_semana: 60, equipamentos: ["halteres", "maquina"], restricoes: ["joelho"], objetivo: "hipertrofia", onboarding_concluido: true, parq_liberado: true, parq_respondido_em: "2026-10-01T10:00:00.000Z", parq_respostas: [false, false, false, false, false, false, false], criado_em: "2026-10-01T10:00:00.000Z" },
  ];
  for (const perfil of perfis) {
    const g = gerarPlanoFromPerfil(perfil, CATALOG_EXERCICIOS);
    let s: AppState = AppStateSchema.parse({
      perfil, exercicios: CATALOG_EXERCICIOS, guias: [], plano: g.plano, sessoes: g.sessoes.map((x, i) => ({ ...x, data: `2026-10-${String(19 + i).padStart(2, "0")}` })),
      registros: [], estados: g.estados, checkins: [], alertas: [], decisoes: [], volumes_semanais: g.volumes_semanais, active_sessao_id: null, logger_prescricao_id: null,
    });
    // histórico com o código antigo: 2 sessões concluídas (uma com carga acima, outra abaixo)
    s = v(iniciarComRegistros(s, s.sessoes[0]!.id, 2.5));
    s = v(iniciarComRegistros(s, s.sessoes[1]!.id, -2.5));
    // forma de JSON antigo (sem campos novos), como estaria salvo
    out.push({ nome: `sintética ${perfil.id}`, raw: JSON.parse(JSON.stringify(s)) });
  }
  return out;
}

function checar(nome: string, raw: unknown, v: Velho | null) {
  console.log(`\n— ${nome}`);
  const bruto = ((raw as { state?: unknown })?.state ?? raw) as Record<string, unknown>;
  const p1 = AppStateSchema.safeParse(bruto);
  ok(p1.success, `${nome}: estado carrega no schema novo`);
  if (!p1.success) return;
  const s = p1.data;
  // 1) carregar/normalizar/migrar
  ok(derivados(bruto) === derivados(s), `${nome}: carregar não muda estado, próxima carga, âncora, e1RM, PR, volume nem Progresso`);
  const s2 = AppStateSchema.parse(JSON.parse(JSON.stringify(s)));
  ok(JSON.stringify(s2) === JSON.stringify(s), `${nome}: salvar e carregar de novo é idêntico`);

  // 2) editor sem mudança = no-op
  for (const x of s.sessoes) {
    if (sessaoEditavel(s, x.id)) {
      const pv = previaEdicao(s, rascunhoDaSessao(x));
      if (pv && pv.resumo.mudou) { ok(false, `${nome}: abrir e salvar ${x.nome} sem mudar nada mudaria o treino`); }
    }
    if (x.status === "concluida") {
      const r = rascunhoCorrecaoDaSessao(s, x.id);
      const res = aplicarCorrecao(s, r);
      ok(res.ok && res.state === s, `${nome}: corrigir ${x.nome} sem mudar nada é no-op`);
      ok(!previaCorrecao(s, r).mudou, `${nome}: prévia de ${x.nome} sem mudança não pede confirmação`);
      if (x.snapshot_conclusao) {
        const rep = recalcularAPartirDe(s, x.id, s.registros.filter((q) => q.sessao_id === x.id), x.prescricoes).state;
        ok(mesmo(rep.estados, s.estados) && mesmo(rep.decisoes, s.decisoes), `${nome}: refazer a conta de ${x.nome} sem edição dá o mesmo estado`);
      }
    }
  }
  ok(true, `${nome}: treinos planejados abertos e salvos sem mudança não mudam`);

  // 3) concluir uma sessão nova
  const alvo = s.sessoes.find((x) => (x.status === "planejada" || x.status === "parcial") && x.prescricoes.length > 0);
  if (!alvo) { ok(true, `${nome}: sem treino planejado para concluir (pulado)`); return; }
  const ini = iniciarComRegistros({ ...s, active_sessao_id: null }, alvo.id);
  const novo = concluirSessao(structuredClone(ini), { gravarSnapshot: true }).state;
  const semSnap = concluirSessao(structuredClone(ini), { gravarSnapshot: false }).state;
  ok(!!novo.sessoes.find((x) => x.id === alvo.id)?.snapshot_conclusao, `${nome}: sessão nova grava snapshot`);
  ok(JSON.stringify(limpo(novo)) === JSON.stringify(limpo(semSnap)), `${nome}: com e sem snapshot, o resto é igual`);
  if (v) {
    const antigo = v(structuredClone(ini));
    ok(JSON.stringify(limpo(novo)) === JSON.stringify(limpo(antigo)), `${nome}: concluir dá o mesmo estado do código de antes do PR (só o snapshot a mais)`);
  } else {
    ok(false, `${nome}: não consegui ler o código de antes do PR (${BASE_COMMIT}) no git`);
  }
}

async function main() {
  const v = await carregarVelho();
  ok(!!v, `código de antes do PR (${BASE_COMMIT}) carregado do git`);
  if (v) for (const f of fixturesSinteticas(v)) checar(f.nome, f.raw, v);
  const arq = process.env.STATE_FILE;
  if (arq) {
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(arq, "utf8")); } catch { ok(false, `STATE_FILE não pôde ser lido como JSON`); raw = null; }
    if (raw) checar("STATE_FILE", raw, v);
  } else {
    console.log("\n(sem STATE_FILE: só fixtures sintéticas)");
  }
  console.log(fail ? `\n${fail} FAIL` : "\nOK");
  process.exit(fail ? 1 : 0);
}
void main();
