/**
 * Editar treino (por sessão). Lógica pura: nada aqui grava.
 * - O rascunho só guarda ESCOLHAS do usuário: quais exercícios, ordem, nº de séries, faixa de reps e dia.
 * - kg/RIR continuam vindo do EstadoExercicio (ou estimativa conservadora do gerador) — nunca do usuário.
 * - A estrutura de séries (aquecimento por grupo muscular, aproximação, trabalho → top → back-off)
 *   é derivada da nova ordem por `estrutura-series`, sem estado extra.
 * - Histórico (registros) e EstadoExercicio nunca são apagados.
 */
import { z } from "zod";
import type {
  AppState,
  EdicaoSessao,
  EstadoExercicio,
  Exercicio,
  Prescricao,
  Sessao,
  SnapshotSessao,
} from "@/lib/domain";
import { VOLUME_MAX, VOLUME_MIN } from "@/lib/domain";
import { cargaDoEstado, findAlt } from "@/lib/plan/alternativa";
import { estimarCargaKg } from "@/lib/plan/gerar-plano";
import {
  equipsDoPerfil,
  listarAlternativasTroca,
  permitido,
  volumePlanejado,
} from "@/lib/plan/trocar-exercicio";
import { addDaysIso, parseIsoDate } from "@/lib/plan/calendario";
import { labelGrupo } from "@/lib/labels";

/** Limites sensatos (validados no cliente e no servidor). */
export const LIMITES_EDICAO = {
  series_min: 1,
  series_max: 8,
  reps_min: 3,
  reps_max: 30,
  exercicios_min: 1,
  exercicios_max: 12,
} as const;

/** Faixa do aviso de volume semanal (pedido do iury: 10–20 séries/semana). */
export const AVISO_VOLUME_MIN = 10;
export const AVISO_VOLUME_MAX = 20;
// Hoje igual aos limites do Coach (VOLUME_MIN/MAX); se mudarem, o aviso continua 10/20.
void VOLUME_MIN;
void VOLUME_MAX;

export const ItemRascunhoSchema = z
  .object({
    exercicio_id: z.string().min(1),
    series: z.number().int().min(LIMITES_EDICAO.series_min).max(LIMITES_EDICAO.series_max),
    faixa_reps: z.tuple([
      z.number().int().min(LIMITES_EDICAO.reps_min).max(LIMITES_EDICAO.reps_max),
      z.number().int().min(LIMITES_EDICAO.reps_min).max(LIMITES_EDICAO.reps_max),
    ]),
  })
  .refine((i) => i.faixa_reps[0] <= i.faixa_reps[1], { message: "faixa de reps invertida" });

export const RascunhoSchema = z
  .object({
    sessao_id: z.string().min(1),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    itens: z.array(ItemRascunhoSchema).min(LIMITES_EDICAO.exercicios_min).max(LIMITES_EDICAO.exercicios_max),
  })
  .refine((r) => new Set(r.itens.map((i) => i.exercicio_id)).size === r.itens.length, {
    message: "exercício repetido",
  });
export type Rascunho = z.infer<typeof RascunhoSchema>;
export type ItemRascunho = z.infer<typeof ItemRascunhoSchema>;

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, Math.round(n)));

/** "2026-10-29" → "Qui, 29 out". */
export function dataHumana(iso: string): string {
  const d = parseIsoDate(iso);
  const dow = d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  const mes = d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "");
  return `${dow.charAt(0).toUpperCase()}${dow.slice(1)}, ${d.getUTCDate()} ${mes}`;
}

// ───────── editabilidade ─────────

export function sessaoEditavel(state: AppState, sessaoId: string): boolean {
  const s = state.sessoes.find((x) => x.id === sessaoId);
  if (!s || !state.plano?.sessoes.includes(s.id)) return false;
  if (s.status === "concluida" || s.status === "em_andamento") return false;
  if (state.active_sessao_id === s.id) return false;
  return true;
}

export function motivoNaoEditavel(state: AppState, sessaoId: string): string | null {
  const s = state.sessoes.find((x) => x.id === sessaoId);
  if (!s) return "Não achei esse treino.";
  if (s.status === "concluida") return "Esse treino já foi feito, então fica como está no seu histórico.";
  if (s.status === "em_andamento" || state.active_sessao_id === s.id)
    return "Esse treino está em andamento. Termine ou encerre antes de editar.";
  return null;
}

// ───────── rascunho ─────────

export function rascunhoDaSessao(s: Sessao): Rascunho {
  return {
    sessao_id: s.id,
    data: s.data,
    itens: [...s.prescricoes]
      .sort((a, b) => a.ordem - b.ordem)
      .map((p) => ({ exercicio_id: p.exercicio_id, series: p.series, faixa_reps: [p.faixa_reps[0], p.faixa_reps[1]] })),
  };
}

export function removerItem(r: Rascunho, idx: number): Rascunho {
  if (r.itens.length <= LIMITES_EDICAO.exercicios_min) return r;
  return { ...r, itens: r.itens.filter((_, i) => i !== idx) };
}

export function moverItem(r: Rascunho, idx: number, dir: -1 | 1): Rascunho {
  const j = idx + dir;
  if (j < 0 || j >= r.itens.length) return r;
  const itens = [...r.itens];
  [itens[idx], itens[j]] = [itens[j]!, itens[idx]!];
  return { ...r, itens };
}

export function ajustarSeries(r: Rascunho, idx: number, series: number): Rascunho {
  return {
    ...r,
    itens: r.itens.map((it, i) =>
      i === idx ? { ...it, series: clamp(series, LIMITES_EDICAO.series_min, LIMITES_EDICAO.series_max) } : it,
    ),
  };
}

export function ajustarReps(r: Rascunho, idx: number, min: number, max: number): Rascunho {
  let a = clamp(min, LIMITES_EDICAO.reps_min, LIMITES_EDICAO.reps_max);
  let b = clamp(max, LIMITES_EDICAO.reps_min, LIMITES_EDICAO.reps_max);
  if (a > b) [a, b] = [b, a];
  return { ...r, itens: r.itens.map((it, i) => (i === idx ? { ...it, faixa_reps: [a, b] } : it)) };
}

/** Faixa/séries padrão para um exercício novo (mesma regra do gerador: composto × isolado). */
function padraoParaNovo(state: AppState, ex: Exercicio): { series: number; faixa_reps: [number, number] } {
  const sessoes = state.sessoes.filter((s) => state.plano?.sessoes.includes(s.id));
  const catalog = state.exercicios;
  for (const s of sessoes)
    for (const p of s.prescricoes) {
      const e = catalog.find((x) => x.id === p.exercicio_id);
      if (e && e.composto === ex.composto) return { series: p.series, faixa_reps: [p.faixa_reps[0], p.faixa_reps[1]] };
    }
  return ex.composto ? { series: 3, faixa_reps: [6, 10] } : { series: 3, faixa_reps: [10, 15] };
}

export function adicionarItem(state: AppState, r: Rascunho, exercicioId: string): Rascunho {
  if (r.itens.length >= LIMITES_EDICAO.exercicios_max) return r;
  if (r.itens.some((i) => i.exercicio_id === exercicioId)) return r;
  const ex = state.exercicios.find((e) => e.id === exercicioId);
  if (!ex || !permitido(ex, state.perfil)) return r;
  return { ...r, itens: [...r.itens, { exercicio_id: ex.id, ...padraoParaNovo(state, ex) }] };
}

export function trocarItem(state: AppState, r: Rascunho, idx: number, paraId: string): Rascunho {
  const it = r.itens[idx];
  if (!it) return r;
  const ok = alternativasParaItem(state, r, idx).some((e) => e.id === paraId);
  if (!ok) return r;
  return { ...r, itens: r.itens.map((x, i) => (i === idx ? { ...x, exercicio_id: paraId } : x)) };
}

/** Catálogo para "Adicionar": filtrado por equipamento e lesões (como na troca), sem repetir. */
export function candidatosAdicionar(state: AppState, r: Rascunho): Exercicio[] {
  const ja = new Set(r.itens.map((i) => i.exercicio_id));
  return state.exercicios
    .filter((e) => !ja.has(e.id) && permitido(e, state.perfil))
    .sort((a, b) => a.grupo_primario.localeCompare(b.grupo_primario) || Number(b.composto) - Number(a.composto) || a.nome.localeCompare(b.nome));
}

/** Alternativas para trocar dentro do editor (mesmo fluxo/regras do "Trocar"). */
export function alternativasParaItem(state: AppState, r: Rascunho, idx: number): Exercicio[] {
  const it = r.itens[idx];
  if (!it) return [];
  return listarAlternativasTroca({
    exercicioId: it.exercicio_id,
    catalog: state.exercicios,
    perfil: state.perfil,
    excluir: r.itens.map((i) => i.exercicio_id),
  }).map((a) => a.exercicio);
}

// ───────── dias ─────────

/** Motivo pra não poder mover pra `iso` (ou null se pode). Não colide com dia Feito/em andamento nem com outro treino. */
export function conflitoDia(state: AppState, sessaoId: string, iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "Data inválida.";
  const outra = state.sessoes.find(
    (s) => s.id !== sessaoId && s.data === iso && (state.plano?.sessoes.includes(s.id) || s.status === "concluida"),
  );
  if (!outra) return null;
  if (outra.status === "concluida") return `Nesse dia você já fez ${outra.nome}.`;
  if (outra.status === "em_andamento") return `Nesse dia tem ${outra.nome} em andamento.`;
  if (outra.status === "pulada") return null; // dia pulado fica livre
  return `Nesse dia já tem ${outra.nome}.`;
}

/** Próximos dias livres a partir de `desdeIso` (inclui o dia atual da sessão). */
export function diasDisponiveis(state: AppState, sessaoId: string, desdeIso: string, n = 14): string[] {
  const out: string[] = [];
  for (let i = 0; i < 60 && out.length < n; i++) {
    const d = addDaysIso(desdeIso, i);
    if (!conflitoDia(state, sessaoId, d)) out.push(d);
  }
  return out;
}

// ───────── montar sessão ─────────

function snapshot(s: Sessao): SnapshotSessao {
  return {
    data: s.data,
    grupos: [...s.grupos],
    duracao_estimada_min: s.duracao_estimada_min,
    prescricoes: s.prescricoes.map((p) => ({ ...p, faixa_reps: [p.faixa_reps[0], p.faixa_reps[1]], carga: { ...p.carga } })),
  };
}

function aplicarSnapshot(s: Sessao, snap: SnapshotSessao): Sessao {
  return { ...s, data: snap.data, grupos: [...snap.grupos], duracao_estimada_min: snap.duracao_estimada_min, prescricoes: snap.prescricoes.map((p) => ({ ...p })) };
}

function novoEstado(exId: string, carga: number, faixa: [number, number], rir: number): EstadoExercicio {
  return {
    exercicio_id: exId,
    carga_atual_kg: carga,
    faixa_reps: faixa,
    rir_alvo: rir,
    alvo_proxima_sessao: { carga_kg: carga, faixa_reps: faixa, rir_alvo: rir },
    sessoes_sem_progresso: 0,
    ultima_progressao_em: null,
    e1rm_estimado_kg: Math.round(carga * (1 + faixa[1] / 30) * 10) / 10,
    pr_carga_kg: carga,
    pr_reps: 0,
    origem_carga: "estimativa_conservadora",
    primeira_sessao: true,
    ultimo_top_kg: null,
    ultimo_back_off_kg: null,
    ultimo_rir: null,
    ultima_sessao_em: null,
    atualizado_em: new Date().toISOString(),
  };
}

/**
 * Monta a sessão a partir do rascunho. Prescrições existentes mantêm tudo (kg, RIR, descanso, técnica, id),
 * só mudam ordem/séries/faixa. Exercícios novos herdam kg do EstadoExercicio (ou estimativa do gerador).
 */
export function montarSessao(state: AppState, sessao: Sessao, r: Rascunho): { sessao: Sessao; estadosNovos: EstadoExercicio[] } {
  const catalog = state.exercicios;
  const equips = equipsDoPerfil(state.perfil);
  const rirBase = sessao.prescricoes[0]?.rir_alvo ?? 2;
  const estadosNovos: EstadoExercicio[] = [];
  const prescricoes: Prescricao[] = r.itens.map((it, i) => {
    const atual = sessao.prescricoes.find((p) => p.exercicio_id === it.exercicio_id);
    const faixa: [number, number] = [it.faixa_reps[0], it.faixa_reps[1]];
    if (atual) return { ...atual, ordem: i + 1, series: it.series, faixa_reps: faixa };
    const ex = catalog.find((e) => e.id === it.exercicio_id)!;
    const estimativa = state.perfil
      ? estimarCargaKg(state.perfil.peso_kg, state.perfil.experiencia, ex.padrao, ex.composto, ex.equipamento)
      : 0;
    const carga = cargaDoEstado(state.estados, ex.id, estimativa);
    if (!state.estados.some((e) => e.exercicio_id === ex.id)) estadosNovos.push(novoEstado(ex.id, carga, faixa, rirBase));
    const molde = sessao.prescricoes.find((p) => catalog.find((e) => e.id === p.exercicio_id)?.composto === ex.composto);
    return {
      id: `presc-${sessao.id}-${ex.id}`,
      sessao_id: sessao.id,
      exercicio_id: ex.id,
      padrao: ex.padrao,
      ordem: i + 1,
      series: it.series,
      faixa_reps: faixa,
      rir_alvo: rirBase,
      descanso_seg: molde?.descanso_seg ?? (ex.composto ? 150 : 90),
      cadencia: "2-0-1-0",
      tecnica: "padrao",
      carga: { trabalho_kg: carga, top_set_kg: null, origem: "estimativa_conservadora" },
      alternativa_equipamento_ocupado: findAlt(catalog, ex.padrao, equips, ex.id),
      guia_id: ex.guia_id ?? null,
      evidencia: ex.composto ? "forte" : "moderado",
    };
  });
  const grupos = [...new Set(prescricoes.map((p) => catalog.find((e) => e.id === p.exercicio_id)?.grupo_primario).filter((g): g is NonNullable<typeof g> => !!g))];
  // Duração: mantém a proporção por série de trabalho do treino original.
  const seriesAntes = sessao.prescricoes.reduce((a, p) => a + p.series, 0) || 1;
  const seriesDepois = prescricoes.reduce((a, p) => a + p.series, 0);
  const duracao = Math.max(15, Math.round((sessao.duracao_estimada_min * seriesDepois) / seriesAntes));
  return {
    sessao: { ...sessao, data: r.data, grupos, prescricoes, duracao_estimada_min: duracao },
    estadosNovos,
  };
}

// ───────── resumo + volume ─────────

export type ResumoEdicao = { linhas: string[]; mudou: boolean };

export function resumoMudancas(state: AppState, antes: Sessao, depois: Sessao): ResumoEdicao {
  const nome = (id: string) => state.exercicios.find((e) => e.id === id)?.nome ?? "Exercício";
  const a = [...antes.prescricoes].sort((x, y) => x.ordem - y.ordem);
  const d = [...depois.prescricoes].sort((x, y) => x.ordem - y.ordem);
  const idsA = a.map((p) => p.exercicio_id);
  const idsD = d.map((p) => p.exercicio_id);
  const linhas: string[] = [];
  for (const p of d) if (!idsA.includes(p.exercicio_id)) linhas.push(`Adicionado: ${nome(p.exercicio_id)} (${p.series}× ${p.faixa_reps[0]}–${p.faixa_reps[1]} reps)`);
  for (const p of a) if (!idsD.includes(p.exercicio_id)) linhas.push(`Removido: ${nome(p.exercicio_id)}`);
  for (const p of d) {
    const v = a.find((x) => x.exercicio_id === p.exercicio_id);
    if (!v) continue;
    const ms: string[] = [];
    if (v.series !== p.series) ms.push(`${v.series} → ${p.series} séries`);
    if (v.faixa_reps[0] !== p.faixa_reps[0] || v.faixa_reps[1] !== p.faixa_reps[1])
      ms.push(`reps ${v.faixa_reps[0]}–${v.faixa_reps[1]} → ${p.faixa_reps[0]}–${p.faixa_reps[1]}`);
    if (ms.length) linhas.push(`${nome(p.exercicio_id)}: ${ms.join(", ")}`);
  }
  const comunsA = idsA.filter((id) => idsD.includes(id));
  const comunsD = idsD.filter((id) => idsA.includes(id));
  if (comunsA.join("|") !== comunsD.join("|")) linhas.push(`Nova ordem: ${idsD.map(nome).join(" → ")}`);
  if ((antes.data ?? null) !== (depois.data ?? null)) {
    linhas.push(
      depois.data
        ? `Dia: ${antes.data ? dataHumana(antes.data) : "sem data"} → ${dataHumana(depois.data)}`
        : "Dia: sem data",
    );
  }
  return { linhas, mudou: linhas.length > 0 };
}

export type AvisoVolume = { grupo: string; antes: number; depois: number; tipo: "abaixo" | "acima"; texto: string };

/** Volume semanal planejado (mesmo cálculo do Plano/troca) fora de 10–20, só nos músculos que a edição mexeu. */
export function avisosVolume(state: AppState, depoisSessao: Sessao): AvisoVolume[] {
  const ids = new Set(state.plano?.sessoes ?? []);
  const sessoes = state.sessoes.filter((s) => ids.has(s.id));
  const novas = sessoes.map((s) => (s.id === depoisSessao.id ? depoisSessao : s));
  const antes = volumePlanejado(sessoes, state.exercicios);
  const depois = volumePlanejado(novas, state.exercicios);
  const out: AvisoVolume[] = [];
  const grupos = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  for (const g of grupos) {
    const va = antes[g]?.efetivas ?? 0;
    const vd = depois[g]?.efetivas ?? 0;
    if (va === vd) continue;
    const fmt = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
    const nome = labelGrupo(g);
    if (vd < AVISO_VOLUME_MIN)
      out.push({ grupo: g, antes: va, depois: vd, tipo: "abaixo", texto: `${nome} fica com ${fmt(vd)} séries por semana (era ${fmt(va)}). Abaixo de ${AVISO_VOLUME_MIN} costuma render menos crescimento.` });
    else if (vd > AVISO_VOLUME_MAX)
      out.push({ grupo: g, antes: va, depois: vd, tipo: "acima", texto: `${nome} vai a ${fmt(vd)} séries por semana (era ${fmt(va)}). Acima de ${AVISO_VOLUME_MAX} a recuperação costuma ficar pesada.` });
  }
  return out;
}

export type PreviaEdicao = { antes: Sessao; depois: Sessao; resumo: ResumoEdicao; avisos: AvisoVolume[]; erro: string | null };

export function previaEdicao(state: AppState, r: Rascunho): PreviaEdicao | null {
  const antes = state.sessoes.find((s) => s.id === r.sessao_id);
  if (!antes) return null;
  const { sessao: depois } = montarSessao(state, antes, r);
  return {
    antes,
    depois,
    resumo: resumoMudancas(state, antes, depois),
    avisos: avisosVolume(state, depois),
    erro: validarRascunho(state, r),
  };
}

export function validarRascunho(state: AppState, r: Rascunho): string | null {
  const motivo = motivoNaoEditavel(state, r.sessao_id);
  if (motivo) return motivo;
  if (!sessaoEditavel(state, r.sessao_id)) return "Esse treino não pode ser editado agora.";
  const parsed = RascunhoSchema.safeParse(r);
  if (!parsed.success) return "Confira as séries e reps: algum valor ficou fora do limite.";
  for (const it of r.itens) {
    const ex = state.exercicios.find((e) => e.id === it.exercicio_id);
    if (!ex) return "Tem um exercício que não existe no catálogo.";
    const jaEstava = state.sessoes.find((s) => s.id === r.sessao_id)?.prescricoes.some((p) => p.exercicio_id === ex.id);
    if (!jaEstava && !permitido(ex, state.perfil)) return `${ex.nome} não combina com seu equipamento ou suas restrições.`;
  }
  if (r.data) {
    const c = conflitoDia(state, r.sessao_id, r.data);
    if (c) return c;
  }
  return null;
}

// ───────── aplicar / desfazer / voltar ao Coach ─────────

export type ResultadoEdicao = { ok: true; state: AppState } | { ok: false; erro: string };

/** Só chamado após "Confirmar". Guarda original (1ª vez) + anterior para desfazer. */
export function aplicarEdicao(state: AppState, r: Rascunho, agoraIso = new Date().toISOString()): ResultadoEdicao {
  const erro = validarRascunho(state, r);
  if (erro) return { ok: false, erro };
  const antes = state.sessoes.find((s) => s.id === r.sessao_id)!;
  const { sessao: depois, estadosNovos } = montarSessao(state, antes, r);
  if (!resumoMudancas(state, antes, depois).mudou) return { ok: false, erro: "Nada mudou." };
  const edicoes = [...(state.edicoes_sessao ?? [])];
  const i = edicoes.findIndex((e) => e.sessao_id === antes.id);
  const ent: EdicaoSessao = {
    sessao_id: antes.id,
    original: i >= 0 ? edicoes[i]!.original : snapshot(antes),
    anterior: snapshot(antes),
    editado_em: agoraIso,
  };
  if (i >= 0) edicoes[i] = ent;
  else edicoes.push(ent);
  return {
    ok: true,
    state: {
      ...state,
      sessoes: state.sessoes.map((s) => (s.id === antes.id ? depois : s)),
      estados: [...state.estados, ...estadosNovos],
      edicoes_sessao: edicoes,
    },
  };
}

export function edicaoDa(state: AppState, sessaoId: string): EdicaoSessao | null {
  return (state.edicoes_sessao ?? []).find((e) => e.sessao_id === sessaoId) ?? null;
}

export function podeDesfazer(state: AppState, sessaoId: string): boolean {
  return !!edicaoDa(state, sessaoId)?.anterior && sessaoEditavel(state, sessaoId);
}

export function podeVoltarAoCoach(state: AppState, sessaoId: string): boolean {
  return !!edicaoDa(state, sessaoId) && sessaoEditavel(state, sessaoId);
}

/** Data de um snapshot que não colida (ex.: dia virou Feito depois). */
function dataSegura(state: AppState, sessaoId: string, snapData: string | null, atual: string | null): string | null {
  if (!snapData) return snapData;
  return conflitoDia(state, sessaoId, snapData) ? atual : snapData;
}

export function desfazerEdicao(state: AppState, sessaoId: string): ResultadoEdicao {
  const ed = edicaoDa(state, sessaoId);
  if (!ed?.anterior) return { ok: false, erro: "Não tem edição pra desfazer." };
  if (!sessaoEditavel(state, sessaoId)) return { ok: false, erro: motivoNaoEditavel(state, sessaoId) ?? "Não dá pra mexer nesse treino agora." };
  const s = state.sessoes.find((x) => x.id === sessaoId)!;
  const snap = { ...ed.anterior, data: dataSegura(state, sessaoId, ed.anterior.data, s.data) };
  return {
    ok: true,
    state: {
      ...state,
      sessoes: state.sessoes.map((x) => (x.id === sessaoId ? aplicarSnapshot(x, snap) : x)),
      edicoes_sessao: (state.edicoes_sessao ?? []).map((e) => (e.sessao_id === sessaoId ? { ...e, anterior: null } : e)),
    },
  };
}

export function voltarAoCoach(state: AppState, sessaoId: string): ResultadoEdicao {
  const ed = edicaoDa(state, sessaoId);
  if (!ed) return { ok: false, erro: "Esse treino já está como o Coach montou." };
  if (!sessaoEditavel(state, sessaoId)) return { ok: false, erro: motivoNaoEditavel(state, sessaoId) ?? "Não dá pra mexer nesse treino agora." };
  const s = state.sessoes.find((x) => x.id === sessaoId)!;
  const snap = { ...ed.original, data: dataSegura(state, sessaoId, ed.original.data, s.data) };
  return {
    ok: true,
    state: {
      ...state,
      sessoes: state.sessoes.map((x) => (x.id === sessaoId ? aplicarSnapshot(x, snap) : x)),
      edicoes_sessao: (state.edicoes_sessao ?? []).filter((e) => e.sessao_id !== sessaoId),
    },
  };
}

/** Servidor: mesma forma do rascunho, com folga p/ ajustes automáticos do Coach (ex.: +séries por volume). */
const SessaoEditadaServidorSchema = z
  .object({
    sessao_id: z.string().min(1),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    itens: z
      .array(
        z
          .object({
            exercicio_id: z.string().min(1),
            series: z.number().int().min(1).max(12),
            faixa_reps: z.tuple([z.number().int().min(1).max(50), z.number().int().min(1).max(50)]),
          })
          .refine((i) => i.faixa_reps[0] <= i.faixa_reps[1]),
      )
      .min(1)
      .max(LIMITES_EDICAO.exercicios_max),
  })
  .refine((r) => new Set(r.itens.map((i) => i.exercicio_id)).size === r.itens.length);

/**
 * Validação de servidor (rota /api/state): sessões editadas precisam respeitar os limites do editor.
 * Só checa sessões com edição registrada — estados antigos passam como antes.
 */
export function validarEdicoesNoEstado(state: AppState): string | null {
  for (const ed of state.edicoes_sessao ?? []) {
    const s = state.sessoes.find((x) => x.id === ed.sessao_id);
    if (!s) return `edição de sessão inexistente`;
    if (s.status === "concluida" || s.status === "em_andamento") continue; // o treino seguiu; snapshot fica só como histórico
    const r = SessaoEditadaServidorSchema.safeParse(rascunhoDaSessao(s));
    if (!r.success) return `sessão editada fora dos limites`;
    for (const p of s.prescricoes) if (!state.exercicios.some((e) => e.id === p.exercicio_id)) return `exercício fora do catálogo`;
  }
  return null;
}
