/**
 * Corrigir registro de treino concluído. Lógica pura: nada aqui grava.
 * - O usuário corrige só o que FEZ (kg, reps, RIR por série; séries/exercícios a mais ou a menos; troca).
 * - Com snapshot (sessões concluídas depois desta versão): a decisão do dia é refeita com as MESMAS
 *   funções do Coach e as mesmas entradas gravadas, e as sessões concluídas seguintes que usam os
 *   mesmos exercícios são reaplicadas em ordem. Sem snapshot: só histórico e volume mudam.
 * - Nenhuma regra nova: decidirProgressao/aplicarDecisao/aplicarEstadoNaPrescricao são as do Coach.
 */
import { z } from "zod";
import type {
  AppState,
  CorrecaoConcluida,
  DecisaoProgressao,
  EstadoExercicio,
  Exercicio,
  Prescricao,
  RegistroSerie,
  Sessao,
  VolumeSemanal,
} from "@/lib/domain";
import { TipoSerieSchema, ehSeriePreparatoria, type TipoSerie } from "@/lib/domain/enums";
import { volumeEfetivo } from "@/lib/domain";
import {
  aplicarDecisao,
  aplicarEstadoNaPrescricao,
  decidirProgressao,
} from "@/lib/engine/progression";
import { isoWeekDe, mergeVolumeSessao, volumeSessaoPorGrupo } from "@/lib/engine/volume";

/** Limites validados no cliente e no servidor. RIR: o registro aceita até 5 (schema). */
export const LIMITES_CORRECAO = {
  kg_min: 0,
  kg_max: 1000,
  reps_min: 0,
  reps_max: 100,
  rir_min: 0,
  rir_max: 10,
  series_max: 20,
  exercicios_max: 15,
} as const;
/** Teto efetivo de RIR aceito pelo registro de série. */
export const RIR_MAX_REGISTRO = 5;

export const AVISO_SEM_SNAPSHOT =
  "Esse treino é de antes do registro detalhado: a correção atualiza o histórico e o volume, mas não muda a próxima carga.";

export const SerieCorrecaoSchema = z.object({
  id: z.string().nullable(),
  tipo_serie: TipoSerieSchema,
  carga_kg: z.number().min(LIMITES_CORRECAO.kg_min).max(LIMITES_CORRECAO.kg_max),
  reps: z.number().int().min(LIMITES_CORRECAO.reps_min).max(LIMITES_CORRECAO.reps_max),
  rir_percebido: z.number().int().min(LIMITES_CORRECAO.rir_min).max(LIMITES_CORRECAO.rir_max),
  dor: z.boolean().default(false),
});
export const ItemCorrecaoSchema = z.object({
  prescricao_id: z.string().nullable(),
  exercicio_id: z.string(),
  series: z.array(SerieCorrecaoSchema).max(LIMITES_CORRECAO.series_max),
});
export const RascunhoCorrecaoSchema = z.object({
  sessao_id: z.string(),
  itens: z.array(ItemCorrecaoSchema).min(1).max(LIMITES_CORRECAO.exercicios_max),
});
export type SerieCorrecao = z.infer<typeof SerieCorrecaoSchema>;
export type ItemCorrecao = z.infer<typeof ItemCorrecaoSchema>;
export type RascunhoCorrecao = z.infer<typeof RascunhoCorrecaoSchema>;

// ——— Consultas ———

export function sessaoCorrigivel(state: AppState, sessaoId: string): boolean {
  const s = state.sessoes.find((x) => x.id === sessaoId);
  return !!s && s.status === "concluida" && state.active_sessao_id !== sessaoId;
}

export function temRegistroDetalhado(state: AppState, sessaoId: string): boolean {
  return !!state.sessoes.find((x) => x.id === sessaoId)?.snapshot_conclusao;
}

function ordenarSeries(a: RegistroSerie, b: RegistroSerie) {
  return a.numero - b.numero || a.executado_em.localeCompare(b.executado_em);
}

export function rascunhoCorrecaoDaSessao(state: AppState, sessaoId: string): RascunhoCorrecao {
  const s = state.sessoes.find((x) => x.id === sessaoId);
  const regs = state.registros.filter((r) => r.sessao_id === sessaoId);
  const itens: ItemCorrecao[] = (s?.prescricoes ?? [])
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((p) => ({
      prescricao_id: p.id,
      exercicio_id: p.exercicio_id,
      series: regs
        .filter((r) => r.prescricao_id === p.id)
        .sort(ordenarSeries)
        .map((r) => ({
          id: r.id,
          tipo_serie: r.tipo_serie,
          carga_kg: r.carga_kg,
          reps: r.reps,
          rir_percebido: r.rir_percebido,
          dor: r.dor,
        })),
    }));
  return { sessao_id: sessaoId, itens };
}

// ——— Operações no rascunho (imutáveis) ———

export function editarSerie(r: RascunhoCorrecao, i: number, j: number, patch: Partial<Pick<SerieCorrecao, "carga_kg" | "reps" | "rir_percebido">>): RascunhoCorrecao {
  return {
    ...r,
    itens: r.itens.map((it, a) =>
      a !== i ? it : { ...it, series: it.series.map((s, b) => (b !== j ? s : { ...s, ...patch })) },
    ),
  };
}

export function adicionarSerie(r: RascunhoCorrecao, i: number): RascunhoCorrecao {
  return {
    ...r,
    itens: r.itens.map((it, a) => {
      if (a !== i) return it;
      const base = [...it.series].reverse().find((s) => !ehSeriePreparatoria(s.tipo_serie)) ?? it.series[it.series.length - 1];
      const nova: SerieCorrecao = {
        id: null,
        tipo_serie: (base?.tipo_serie ?? "trabalho") as TipoSerie,
        carga_kg: base?.carga_kg ?? 0,
        reps: base?.reps ?? 8,
        rir_percebido: base?.rir_percebido ?? 2,
        dor: false,
      };
      return { ...it, series: [...it.series, nova] };
    }),
  };
}

export function removerSerie(r: RascunhoCorrecao, i: number, j: number): RascunhoCorrecao {
  return { ...r, itens: r.itens.map((it, a) => (a !== i ? it : { ...it, series: it.series.filter((_, b) => b !== j) })) };
}

export function removerExercicioCorrecao(r: RascunhoCorrecao, i: number): RascunhoCorrecao {
  return { ...r, itens: r.itens.filter((_, a) => a !== i) };
}

export function adicionarExercicioCorrecao(r: RascunhoCorrecao, exercicioId: string): RascunhoCorrecao {
  return {
    ...r,
    itens: [
      ...r.itens,
      { prescricao_id: null, exercicio_id: exercicioId, series: [{ id: null, tipo_serie: "trabalho", carga_kg: 0, reps: 8, rir_percebido: 2, dor: false }] },
    ],
  };
}

export function trocarExercicioCorrecao(r: RascunhoCorrecao, i: number, paraId: string): RascunhoCorrecao {
  return { ...r, itens: r.itens.map((it, a) => (a !== i ? it : { ...it, exercicio_id: paraId })) };
}

export function validarRascunhoCorrecao(state: AppState, r: RascunhoCorrecao): string | null {
  const p = RascunhoCorrecaoSchema.safeParse(r);
  if (!p.success) return "Confira os valores: kg não pode ser negativo, reps vão de 0 a 100 e RIR de 0 a 10.";
  if (!sessaoCorrigivel(state, r.sessao_id)) return "Esse treino não pode ser corrigido agora.";
  for (const it of r.itens) {
    if (!state.exercicios.some((e) => e.id === it.exercicio_id)) return "Exercício não encontrado.";
    if (it.series.some((s) => s.rir_percebido > RIR_MAX_REGISTRO)) return `O registro aceita RIR de 0 a ${RIR_MAX_REGISTRO}.`;
  }
  const exs = r.itens.map((i) => i.exercicio_id);
  if (new Set(exs).size !== exs.length) return "O mesmo exercício aparece duas vezes.";
  if (!r.itens.some((i) => i.series.length > 0)) return "O treino precisa ter pelo menos uma série.";
  return null;
}

// ——— Volume ———

type Delta = Map<string, { diretas: number; indiretas: number }>;
function deltaSeries(series: RegistroSerie[], exercicios: Exercicio[], sinal: 1 | -1, acc: Delta = new Map()): Delta {
  for (const s of series) {
    if (ehSeriePreparatoria(s.tipo_serie)) continue;
    const ex = exercicios.find((e) => e.id === s.exercicio_id);
    if (!ex) continue;
    const p = acc.get(ex.grupo_primario) ?? { diretas: 0, indiretas: 0 };
    p.diretas += sinal;
    acc.set(ex.grupo_primario, p);
    for (const sec of ex.grupos_secundarios) {
      const c = acc.get(sec) ?? { diretas: 0, indiretas: 0 };
      c.indiretas += sinal;
      acc.set(sec, c);
    }
  }
  return acc;
}

/** Troca a contribuição antiga de uma sessão pela nova na semana dela. Sem diferença = mesmo array. */
export function ajustarVolumeSemanal(
  vols: VolumeSemanal[],
  antigas: RegistroSerie[],
  novas: RegistroSerie[],
  exercicios: Exercicio[],
  semanaIso: string,
): VolumeSemanal[] {
  const d = deltaSeries(novas, exercicios, 1, deltaSeries(antigas, exercicios, -1));
  let next = vols;
  for (const [grupo, v] of d) {
    if (v.diretas === 0 && v.indiretas === 0) continue;
    if (next === vols) next = [...vols];
    const idx = next.findIndex((x) => x.semana_iso === semanaIso && x.grupo === grupo);
    const prev = idx >= 0 ? next[idx]! : { semana_iso: semanaIso, grupo: grupo as VolumeSemanal["grupo"], series_diretas: 0, series_indiretas: 0, series_efetivas: 0 };
    const diretas = Math.max(0, prev.series_diretas + v.diretas);
    const indiretas = Math.max(0, prev.series_indiretas + v.indiretas);
    const row = { ...prev, series_diretas: diretas, series_indiretas: indiretas, series_efetivas: volumeEfetivo(diretas, indiretas) };
    if (idx >= 0) next[idx] = row;
    else next.push(row);
  }
  return next;
}

function semanaDaSessao(s: Sessao): string {
  if (s.snapshot_conclusao) return s.snapshot_conclusao.semana_iso;
  const ref = s.finalizada_em ?? (s.data ? `${s.data}T12:00:00` : null);
  return isoWeekDe(ref ? new Date(ref) : new Date());
}

// ——— Montagem do registro corrigido ———

function idNovo(sid: string, base: string, n: number) {
  return `${sid}-corr-${base}-${n}`;
}

function prescricaoNova(sess: Sessao, ex: Exercicio, ordem: number, series: SerieCorrecao[]): Prescricao {
  const tpl = sess.prescricoes[0];
  const work = series.filter((s) => !ehSeriePreparatoria(s.tipo_serie));
  const kg = work[0]?.carga_kg ?? series[0]?.carga_kg ?? 0;
  const reps = work.map((s) => s.reps);
  const lo = reps.length ? Math.min(...reps) : 8;
  const hi = reps.length ? Math.max(...reps) : 12;
  return {
    id: idNovo(sess.id, ex.id, ordem),
    sessao_id: sess.id,
    exercicio_id: ex.id,
    padrao: ex.padrao,
    ordem,
    series: Math.max(1, work.length || series.length),
    faixa_reps: [lo, Math.max(lo, hi)],
    rir_alvo: tpl?.rir_alvo ?? 2,
    descanso_seg: tpl?.descanso_seg ?? 120,
    cadencia: tpl?.cadencia ?? "2-0-1-0",
    tecnica: "padrao",
    carga: { trabalho_kg: kg, top_set_kg: null, origem: "usuario" },
    alternativa_equipamento_ocupado: null,
    guia_id: ex.guia_id ?? null,
    evidencia: tpl?.evidencia ?? "moderado",
  };
}

function montarRegistro(state: AppState, sess: Sessao, r: RascunhoCorrecao): { sessao: Sessao; registros: RegistroSerie[] } {
  const antigos = state.registros.filter((x) => x.sessao_id === sess.id);
  const quando = sess.finalizada_em ?? new Date().toISOString();
  const prescricoes: Prescricao[] = [];
  const registros: RegistroSerie[] = [];
  r.itens.forEach((it, ordem) => {
    const ex = state.exercicios.find((e) => e.id === it.exercicio_id)!;
    const orig = it.prescricao_id ? sess.prescricoes.find((p) => p.id === it.prescricao_id) : undefined;
    let p: Prescricao;
    if (orig) {
      p = orig.exercicio_id === it.exercicio_id
        ? { ...orig, ordem }
        : { ...orig, ordem, exercicio_id: ex.id, padrao: ex.padrao, guia_id: ex.guia_id ?? null, alternativa_equipamento_ocupado: null };
    } else {
      p = prescricaoNova(sess, ex, ordem, it.series);
    }
    prescricoes.push(p);
    it.series.forEach((s, j) => {
      const velho = s.id ? antigos.find((x) => x.id === s.id) : undefined;
      registros.push({
        id: velho?.id ?? idNovo(sess.id, `${p.id}-s`, j + 1),
        sessao_id: sess.id,
        prescricao_id: p.id,
        exercicio_id: p.exercicio_id,
        numero: j + 1,
        tipo_serie: s.tipo_serie,
        carga_kg: s.carga_kg,
        reps: s.reps,
        rir_percebido: s.rir_percebido,
        dor: s.dor,
        ...(velho?.observacao ? { observacao: velho.observacao } : {}),
        executado_em: velho?.executado_em ?? quando,
      });
    });
  });
  // Séries sem linha no treino (dados antigos) não aparecem no editor e ficam como estão.
  for (const x of antigos) if (!sess.prescricoes.some((p) => p.id === x.prescricao_id)) registros.push(x);
  const realizado = volumeSessaoPorGrupo(registros, state.exercicios);
  const volume_por_grupo = mergeVolumeSessao(sess.volume_por_grupo, realizado).map((v) => ({
    ...v,
    planejado: v.planejado > 0 ? v.planejado : v.realizado,
  }));
  return { sessao: { ...sess, prescricoes, volume_por_grupo }, registros };
}

// ——— Recálculo (replay com as funções do Coach) ———

function concluidasEmOrdem(state: AppState): Sessao[] {
  return state.sessoes
    .filter((s) => s.status === "concluida")
    .slice()
    .sort((a, b) => (a.finalizada_em ?? a.data ?? "").localeCompare(b.finalizada_em ?? b.data ?? ""));
}

function estadoPadrao(p: Prescricao): EstadoExercicio {
  return {
    exercicio_id: p.exercicio_id,
    carga_atual_kg: p.carga.trabalho_kg,
    faixa_reps: p.faixa_reps,
    rir_alvo: p.rir_alvo,
    alvo_proxima_sessao: { carga_kg: p.carga.trabalho_kg, faixa_reps: p.faixa_reps, rir_alvo: p.rir_alvo },
    sessoes_sem_progresso: 0,
    ultima_progressao_em: null,
    e1rm_estimado_kg: 0,
    pr_carga_kg: p.carga.trabalho_kg,
    pr_reps: 0,
    origem_carga: p.carga.origem,
    primeira_sessao: false,
    ultimo_top_kg: null,
    ultimo_back_off_kg: null,
    ultimo_rir: null,
    ultima_sessao_em: null,
    atualizado_em: new Date().toISOString(),
  };
}

export type ResultadoRecalculo = {
  state: AppState;
  /** Sessão sem snapshot onde a cascata parou (se parou). */
  parouEm: Sessao | null;
  /** Exercícios sem ponto de partida conhecido (estado mantido). */
  semBase: string[];
};

/**
 * Refaz a decisão da sessão `sid` (com snapshot) e reaplica, em ordem, as concluídas seguintes que
 * usam os mesmos exercícios. `antigosSid` = registros da sessão antes da correção (para volume e
 * para saber quais exercícios foram afetados).
 */
export function recalcularAPartirDe(state: AppState, sid: string, antigosSid: RegistroSerie[], prescAntigas: Prescricao[]): ResultadoRecalculo {
  const ordem = concluidasEmOrdem(state);
  const i0 = ordem.findIndex((s) => s.id === sid);
  const s0 = ordem[i0];
  if (!s0?.snapshot_conclusao) return { state, parouEm: null, semBase: [] };
  const novosSid = state.registros.filter((r) => r.sessao_id === sid);
  const semana0 = s0.snapshot_conclusao.semana_iso;
  const regsDe = (id: string) => state.registros.filter((r) => r.sessao_id === id);
  const toca = (s: Sessao, ex: string) => regsDe(s.id).some((r) => r.exercicio_id === ex);

  const afetados = new Set<string>([...antigosSid.map((r) => r.exercicio_id), ...novosSid.map((r) => r.exercicio_id)]);
  const E = new Map<string, EstadoExercicio>();
  const semBase: string[] = [];
  for (const ex of afetados) {
    const snap = s0.snapshot_conclusao.estados_antes.find((e) => e.exercicio_id === ex);
    if (snap) { E.set(ex, snap); continue; }
    const depois = ordem.slice(i0 + 1).some((s) => toca(s, ex));
    const atual = state.estados.find((e) => e.exercicio_id === ex);
    if (!depois) {
      const p = s0.prescricoes.find((x) => x.exercicio_id === ex) ?? prescAntigas.find((x) => x.exercicio_id === ex);
      const base = atual ?? (p ? estadoPadrao(p) : undefined);
      if (base) { E.set(ex, base); continue; }
    }
    semBase.push(ex);
  }
  for (const ex of semBase) afetados.delete(ex);

  let decisoes = state.decisoes;
  const sessoesNovas = new Map<string, Sessao>();
  let parouEm: Sessao | null = null;
  let iParada = ordem.length;

  for (let i = i0; i < ordem.length; i++) {
    const S = ordem[i]!;
    const regs = regsDe(S.id);
    const tocados = S.prescricoes.filter((p) => afetados.has(p.exercicio_id) && regs.some((r) => r.prescricao_id === p.id));
    if (i > i0 && !S.snapshot_conclusao) {
      if (tocados.length > 0) { parouEm = S; iParada = i; break; }
      continue;
    }
    const snap = S.snapshot_conclusao!;
    const volsAntes = i === i0 ? snap.volumes_semanais_antes : ajustarVolumeSemanal(snap.volumes_semanais_antes, antigosSid, novosSid, state.exercicios, semana0);
    const estadosAntes = [...snap.estados_antes];
    for (const p of tocados) {
      const ex = state.exercicios.find((e) => e.id === p.exercicio_id);
      let input = E.get(p.exercicio_id)!;
      if (i > i0) {
        const ancora = S.ancoras_sessao?.find((a) => a.exercicio_id === p.exercicio_id);
        if (ancora) {
          const original = snap.estados_antes.find((e) => e.exercicio_id === p.exercicio_id);
          input = {
            ...input,
            carga_atual_kg: ancora.trabalho_kg,
            alvo_proxima_sessao: { ...input.alvo_proxima_sessao, carga_kg: ancora.trabalho_kg },
            origem_carga: "usuario",
            atualizado_em: original?.atualizado_em ?? input.atualizado_em,
          };
        }
        const k = estadosAntes.findIndex((e) => e.exercicio_id === p.exercicio_id);
        if (k >= 0) estadosAntes[k] = input; else estadosAntes.push(input);
      } else if (!estadosAntes.some((e) => e.exercicio_id === p.exercicio_id)) {
        estadosAntes.push(input);
      }
      const series = regs.filter((r) => r.prescricao_id === p.id);
      const grupo = ex?.grupo_primario ?? "peito";
      let d: DecisaoProgressao = decidirProgressao({
        exercicio_id: p.exercicio_id,
        sessao_id: S.id,
        grupo_primario: grupo,
        series,
        estado: input,
        checkin: snap.checkin ?? undefined,
        volume_semanal_grupo: volsAntes.filter((v) => v.grupo === grupo).sort((a, b) => b.semana_iso.localeCompare(a.semana_iso)),
        mesociclo: snap.mesociclo ?? undefined,
        tecnica: p.tecnica,
      });
      const prev = state.decisoes.find((x) => x.sessao_id === S.id && x.exercicio_id === p.exercicio_id);
      if (prev) d = { ...d, id: prev.id, data: prev.data };
      else if (S.finalizada_em) d = { ...d, data: S.finalizada_em.slice(0, 10) };
      const out = aplicarDecisao(input, d, series);
      E.set(p.exercicio_id, { ...out, ultima_sessao_em: S.finalizada_em ?? out.ultima_sessao_em });
      decisoes = [...decisoes.filter((x) => !(x.sessao_id === S.id && x.exercicio_id === p.exercicio_id)), d];
    }
    // decisões de exercícios que saíram da sessão corrigida
    if (i === i0) {
      const ficam = new Set(tocados.map((p) => p.exercicio_id));
      decisoes = decisoes.filter((x) => !(x.sessao_id === S.id && afetados.has(x.exercicio_id) && !ficam.has(x.exercicio_id)));
    }
    sessoesNovas.set(S.id, { ...S, snapshot_conclusao: { ...snap, estados_antes: estadosAntes, volumes_semanais_antes: volsAntes } });
  }

  // Estado final: só para exercícios que ninguém depois da parada usa.
  const depoisDaParada = ordem.slice(iParada);
  let estados = state.estados;
  const mudados = new Map<string, EstadoExercicio>();
  for (const ex of afetados) {
    if (depoisDaParada.some((s) => toca(s, ex))) continue;
    const novo = E.get(ex)!;
    const atual = estados.find((e) => e.exercicio_id === ex);
    if (atual && equivalenteEstado(atual, novo)) continue;
    const final = atual ? { ...novo, atualizado_em: new Date().toISOString() } : novo;
    mudados.set(ex, final);
  }
  if (mudados.size > 0) {
    estados = [...estados.filter((e) => !mudados.has(e.exercicio_id)), ...mudados.values()];
  }
  const sessoes = state.sessoes.map((s) => {
    const n = sessoesNovas.get(s.id);
    if (n) return mesmo(s, n) ? s : n;
    if ((s.status === "planejada" || s.status === "parcial") && mudados.size > 0 && s.prescricoes.some((p) => mudados.has(p.exercicio_id))) {
      return { ...s, prescricoes: s.prescricoes.map((p) => (mudados.has(p.exercicio_id) ? aplicarEstadoNaPrescricao(p, mudados.get(p.exercicio_id)!) : p)) };
    }
    return s;
  });
  const decisoesFinal = mesmo(decisoes, state.decisoes) ? state.decisoes : decisoes;
  return { state: { ...state, estados, sessoes, decisoes: decisoesFinal }, parouEm, semBase };
}

// ——— Comparação ignorando carimbos de tempo ———

const CAMPOS_TEMPO = new Set(["atualizado_em", "ultima_sessao_em"]);
function semTempo(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(semTempo);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) if (!CAMPOS_TEMPO.has(k)) o[k] = semTempo((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}
export function mesmo(a: unknown, b: unknown): boolean {
  return JSON.stringify(semTempo(a)) === JSON.stringify(semTempo(b));
}
function equivalenteEstado(a: EstadoExercicio, b: EstadoExercicio) {
  return mesmo(a, b);
}

/** Troca os registros de uma sessão mantendo a posição deles na lista (desfazer fica exato). */
function trocarRegistrosDaSessao(todos: RegistroSerie[], sid: string, novos: RegistroSerie[]): RegistroSerie[] {
  const i = todos.findIndex((x) => x.sessao_id === sid);
  const resto = todos.filter((x) => x.sessao_id !== sid);
  if (i < 0) return [...resto, ...novos];
  const antes = todos.slice(0, i).filter((x) => x.sessao_id !== sid).length;
  return [...resto.slice(0, antes), ...novos, ...resto.slice(antes)];
}

// ——— Prévia e aplicação ———

export type PreviaCorrecao = {
  linhas: string[];
  mudou: boolean;
  avisos: string[];
  erro: string | null;
  comRecalculo: boolean;
};

function nomeEx(state: AppState, id: string) {
  return state.exercicios.find((e) => e.id === id)?.nome ?? "Exercício";
}

function linhasResumo(state: AppState, antesR: RascunhoCorrecao, depoisR: RascunhoCorrecao): string[] {
  const out: string[] = [];
  const porPresc = new Map(antesR.itens.filter((i) => i.prescricao_id).map((i) => [i.prescricao_id!, i]));
  const ficam = new Set(depoisR.itens.map((i) => i.prescricao_id).filter(Boolean));
  for (const a of antesR.itens) if (a.prescricao_id && !ficam.has(a.prescricao_id)) out.push(`Removido: ${nomeEx(state, a.exercicio_id)}`);
  for (const d of depoisR.itens) {
    const a = d.prescricao_id ? porPresc.get(d.prescricao_id) : undefined;
    if (!a) { out.push(`Adicionado: ${nomeEx(state, d.exercicio_id)} (${d.series.length} ${d.series.length === 1 ? "série" : "séries"})`); continue; }
    if (a.exercicio_id !== d.exercicio_id) out.push(`Trocado: ${nomeEx(state, a.exercicio_id)} → ${nomeEx(state, d.exercicio_id)}`);
    const n = Math.max(a.series.length, d.series.length);
    for (let j = 0; j < n; j++) {
      const x = a.series[j];
      const y = d.series[j];
      const fmt = (s: SerieCorrecao) => `${s.carga_kg} kg × ${s.reps}, RIR ${s.rir_percebido}`;
      if (x && !y) out.push(`${nomeEx(state, d.exercicio_id)}: série ${j + 1} removida`);
      else if (!x && y) out.push(`${nomeEx(state, d.exercicio_id)}: série ${j + 1} adicionada (${fmt(y)})`);
      else if (x && y && (x.carga_kg !== y.carga_kg || x.reps !== y.reps || x.rir_percebido !== y.rir_percebido)) {
        out.push(`${nomeEx(state, d.exercicio_id)}, série ${j + 1}: ${fmt(x)} → ${fmt(y)}`);
      }
    }
  }
  return out;
}

export type ResultadoCorrecao = { ok: true; state: AppState; avisos: string[] } | { ok: false; erro: string };

/** Aplica (sem gravar) a correção. Sem mudança no rascunho = mesmo state (no-op). */
export function aplicarCorrecao(state: AppState, r: RascunhoCorrecao, agoraIso = new Date().toISOString()): ResultadoCorrecao {
  if (!sessaoCorrigivel(state, r.sessao_id)) return { ok: false, erro: "Esse treino não pode ser corrigido agora." };
  const sess = state.sessoes.find((s) => s.id === r.sessao_id)!;
  const antesR = rascunhoCorrecaoDaSessao(state, sess.id);
  // Sem mudança = no-op, mesmo que o registro antigo não passe nas regras de edição.
  if (mesmo(antesR, r)) return { ok: true, state, avisos: [] };
  const erro = validarRascunhoCorrecao(state, r);
  if (erro) return { ok: false, erro };

  const antigos = state.registros.filter((x) => x.sessao_id === sess.id);
  const { sessao, registros } = montarRegistro(state, sess, r);
  let next: AppState = {
    ...state,
    sessoes: state.sessoes.map((s) => (s.id === sess.id ? sessao : s)),
    registros: trocarRegistrosDaSessao(state.registros, sess.id, registros),
    volumes_semanais: ajustarVolumeSemanal(state.volumes_semanais, antigos, registros, state.exercicios, semanaDaSessao(sess)),
  };
  const avisos: string[] = [];
  const comRecalculo = !!sess.snapshot_conclusao;
  if (comRecalculo) {
    const rec = recalcularAPartirDe(next, sess.id, antigos, sess.prescricoes);
    next = rec.state;
    if (rec.parouEm) {
      avisos.push(`Um treino seguinte (${rec.parouEm.nome}) é de antes do registro detalhado: a próxima carga foi recalculada só até ele.`);
    }
    if (rec.semBase.length > 0) {
      avisos.push(`${rec.semBase.map((id) => nomeEx(state, id)).join(", ")}: o histórico foi corrigido, mas a próxima carga não muda.`);
    }
  } else {
    avisos.push(AVISO_SEM_SNAPSHOT);
  }
  const mudadas = state.sessoes.filter((s) => next.sessoes.find((n) => n.id === s.id) !== s);
  const correcao: CorrecaoConcluida = {
    sessao_id: sess.id,
    corrigido_em: agoraIso,
    com_recalculo: comRecalculo,
    anterior: {
      sessoes: mudadas,
      registros_sessao: antigos,
      estados: state.estados,
      volumes_semanais: state.volumes_semanais,
      decisoes: state.decisoes,
    },
  };
  next = {
    ...next,
    correcoes_concluidas: [...(state.correcoes_concluidas ?? []).filter((c) => c.sessao_id !== sess.id), correcao],
  };
  return { ok: true, state: next, avisos };
}

export function previaCorrecao(state: AppState, r: RascunhoCorrecao): PreviaCorrecao {
  const antesR = rascunhoCorrecaoDaSessao(state, r.sessao_id);
  const erro = validarRascunhoCorrecao(state, r);
  const linhas = erro || mesmo(antesR, r) ? [] : linhasResumo(state, antesR, r);
  const comRecalculo = temRegistroDetalhado(state, r.sessao_id);
  if (erro || linhas.length === 0) return { linhas, mudou: false, avisos: [], erro, comRecalculo };
  const res = aplicarCorrecao(state, r);
  if (!res.ok) return { linhas, mudou: false, avisos: [], erro: res.erro, comRecalculo };
  const extra: string[] = [];
  for (const e of res.state.estados) {
    const a = state.estados.find((x) => x.exercicio_id === e.exercicio_id);
    if (a && a.alvo_proxima_sessao.carga_kg !== e.alvo_proxima_sessao.carga_kg) {
      extra.push(`Próxima carga de ${nomeEx(state, e.exercicio_id)}: ${a.alvo_proxima_sessao.carga_kg} kg → ${e.alvo_proxima_sessao.carga_kg} kg`);
    }
  }
  return { linhas: [...linhas, ...extra], mudou: true, avisos: res.avisos, erro: null, comRecalculo };
}

export function podeDesfazerCorrecao(state: AppState, sessaoId: string): boolean {
  const c = (state.correcoes_concluidas ?? []).find((x) => x.sessao_id === sessaoId);
  if (!c) return false;
  if (state.active_sessao_id) return false;
  // Depois de concluir outro treino, voltar o estado inteiro apagaria esse treino: não permite.
  return !state.sessoes.some((s) => s.status === "concluida" && s.id !== sessaoId && (s.finalizada_em ?? "") > c.corrigido_em);
}

/** Desfazer: restaura exatamente a versão anterior (sessões, registros, estados, volume, decisões). */
export function desfazerCorrecao(state: AppState, sessaoId: string): ResultadoCorrecao {
  if (!podeDesfazerCorrecao(state, sessaoId)) return { ok: false, erro: "Não dá mais para desfazer essa correção." };
  const c = (state.correcoes_concluidas ?? []).find((x) => x.sessao_id === sessaoId)!;
  const porId = new Map(c.anterior.sessoes.map((s) => [s.id, s]));
  return {
    ok: true,
    avisos: [],
    state: {
      ...state,
      sessoes: state.sessoes.map((s) => porId.get(s.id) ?? s),
      registros: trocarRegistrosDaSessao(state.registros, sessaoId, c.anterior.registros_sessao),
      estados: c.anterior.estados,
      volumes_semanais: c.anterior.volumes_semanais,
      decisoes: c.anterior.decisoes,
      correcoes_concluidas: (state.correcoes_concluidas ?? []).filter((x) => x.sessao_id !== sessaoId),
    },
  };
}

/** Validação de servidor dos registros das sessões corrigidas. */
export function validarCorrecoesNoEstado(state: AppState): string | null {
  for (const c of state.correcoes_concluidas ?? []) {
    for (const r of state.registros.filter((x) => x.sessao_id === c.sessao_id)) {
      const p = SerieCorrecaoSchema.safeParse({ id: r.id, tipo_serie: r.tipo_serie, carga_kg: r.carga_kg, reps: r.reps, rir_percebido: r.rir_percebido, dor: r.dor });
      if (!p.success) return "Invalid correction";
    }
  }
  return null;
}
