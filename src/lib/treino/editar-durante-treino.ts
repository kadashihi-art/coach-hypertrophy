/**
 * Editar exercício/treino DURANTE a sessão (lote 2). Lógica pura: nada aqui grava.
 * - O rascunho guarda só escolhas do usuário (trocar, séries, reps, carga das próximas, adicionar,
 *   remover/encerrar, ordem). kg de exercício novo ou trocado vem da memória de carga do Coach.
 * - Séries já registradas nunca mudam: ficam no exercício em que foram feitas.
 * - Trocar no meio: o original fica com as séries de trabalho já feitas e o novo entra logo depois
 *   com as que faltavam. Séries não feitas não contam como falha (a progressão só lê o que foi feito).
 * - Aquecimento/aproximação continuam derivados da ordem por `estrutura-series` (sem estado extra).
 */
import type { AppState, EdicaoAoVivo, EstadoExercicio, Exercicio, Prescricao, Sessao } from "@/lib/domain";
import { ehSeriePreparatoria, type TecnicaFinal } from "@/lib/domain/enums";
import { exercicioAceitaTecnica, linhaTecnica, validarTecnicasSessao } from "@/lib/engine/tecnicas";
import { LIMITES_EDICAO, novaPrescricao, padraoParaNovo } from "@/lib/plan/editar-treino";
import { listarAlternativasTroca, permitido } from "@/lib/plan/trocar-exercicio";
import { preparacaoDaSessao } from "@/lib/treino/estrutura-series";

export const CARGA_MAX_AJUSTE = 1000;

export type ItemAoVivo = {
  /** Prescrição existente (null = exercício novo adicionado agora). */
  prescricao_id: string | null;
  exercicio_id: string;
  /** Troca escolhida (null = sem troca). */
  trocar_para: string | null;
  series: number;
  faixa_reps: [number, number];
  /** Carga das próximas séries ajustada pelo usuário (null = como o Coach deixou). */
  carga_kg: number | null;
  /** Encerrar aqui (exercício já começado): fica só com as séries de trabalho feitas. */
  encerrar: boolean;
  /** Técnica opcional na última série (lote 4). */
  tecnica_final?: TecnicaFinal | null;
};

export type RascunhoAoVivo = { sessao_id: string; atual_id: string | null; itens: ItemAoVivo[] };

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, Math.round(n)));
const fmtKg = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

export function sessaoAtiva(state: AppState): Sessao | null {
  const s = state.sessoes.find((x) => x.id === state.active_sessao_id);
  return s && s.status === "em_andamento" ? s : null;
}

export function podeEditarAoVivo(state: AppState): boolean {
  return !!sessaoAtiva(state);
}

function registrosDa(state: AppState, sessaoId: string, prescricaoId: string | null) {
  if (!prescricaoId) return [];
  return state.registros.filter((r) => r.sessao_id === sessaoId && r.prescricao_id === prescricaoId);
}

/** Séries de trabalho feitas e se o exercício já começou (qualquer série, inclusive aquecimento). */
export function feitosDoItem(state: AppState, sessaoId: string, it: Pick<ItemAoVivo, "prescricao_id">) {
  const regs = registrosDa(state, sessaoId, it.prescricao_id);
  return { trabalho: regs.filter((r) => !ehSeriePreparatoria(r.tipo_serie)).length, iniciado: regs.length > 0 };
}

/** kg de referência das próximas séries (o que o logger usa como âncora: top, ou trabalho). */
export function cargaReferencia(p: Pick<Prescricao, "carga">): number {
  return p.carga.top_set_kg ?? p.carga.trabalho_kg;
}

export function rascunhoAoVivo(state: AppState): RascunhoAoVivo | null {
  const s = sessaoAtiva(state);
  if (!s) return null;
  return {
    sessao_id: s.id,
    atual_id: state.logger_prescricao_id ?? s.prescricoes[0]?.id ?? null,
    itens: [...s.prescricoes]
      .sort((a, b) => a.ordem - b.ordem)
      .map((p) => ({
        prescricao_id: p.id,
        exercicio_id: p.exercicio_id,
        trocar_para: null,
        series: p.series,
        faixa_reps: [p.faixa_reps[0], p.faixa_reps[1]],
        carga_kg: null,
        encerrar: false,
        tecnica_final: p.tecnica_final ?? null,
      })),
  };
}

/** A técnica só pode mudar enquanto a última série de trabalho não foi feita. */
export function podeMudarTecnicaAoVivo(state: AppState, r: RascunhoAoVivo, idx: number): boolean {
  const it = r.itens[idx];
  if (!it || it.encerrar) return false;
  const ex = state.exercicios.find((e) => e.id === (it.trocar_para ?? it.exercicio_id));
  if (!exercicioAceitaTecnica(ex)) return false;
  return feitosDoItem(state, r.sessao_id, it).trabalho < it.series;
}

export function definirTecnicaAoVivo(state: AppState, r: RascunhoAoVivo, idx: number, tipo: TecnicaFinal | null): RascunhoAoVivo {
  if (!podeMudarTecnicaAoVivo(state, r, idx)) return r;
  return mapItem(r, idx, (x) => ({ ...x, tecnica_final: tipo }));
}

const idsNoRascunho = (r: RascunhoAoVivo) => r.itens.flatMap((i) => [i.exercicio_id, ...(i.trocar_para ? [i.trocar_para] : [])]);
const mapItem = (r: RascunhoAoVivo, idx: number, f: (it: ItemAoVivo) => ItemAoVivo): RascunhoAoVivo => ({
  ...r,
  itens: r.itens.map((it, i) => (i === idx ? f(it) : it)),
});

/** Séries: nunca abaixo das de trabalho já feitas; acrescentar entra depois da última série. */
export function ajustarSeriesAoVivo(state: AppState, r: RascunhoAoVivo, idx: number, series: number): RascunhoAoVivo {
  const it = r.itens[idx];
  if (!it || it.encerrar) return r;
  const { trabalho } = feitosDoItem(state, r.sessao_id, it);
  const min = Math.max(LIMITES_EDICAO.series_min, it.trocar_para && trabalho > 0 ? trabalho + 1 : trabalho);
  return mapItem(r, idx, (x) => ({ ...x, series: clamp(series, min, LIMITES_EDICAO.series_max) }));
}

export function ajustarRepsAoVivo(r: RascunhoAoVivo, idx: number, min: number, max: number): RascunhoAoVivo {
  let a = clamp(min, LIMITES_EDICAO.reps_min, LIMITES_EDICAO.reps_max);
  let b = clamp(max, LIMITES_EDICAO.reps_min, LIMITES_EDICAO.reps_max);
  if (a > b) [a, b] = [b, a];
  return mapItem(r, idx, (x) => (x.encerrar ? x : { ...x, faixa_reps: [a, b] }));
}

/** Ajuste do usuário na carga das PRÓXIMAS séries (não mexe no histórico nem na memória do Coach). */
export function ajustarCargaAoVivo(r: RascunhoAoVivo, idx: number, kg: number): RascunhoAoVivo {
  if (!Number.isFinite(kg)) return r;
  const v = Math.min(CARGA_MAX_AJUSTE, Math.max(0, Math.round(kg * 100) / 100));
  return mapItem(r, idx, (x) => (x.encerrar || x.trocar_para ? x : { ...x, carga_kg: v }));
}

/** Alternativas (mesmo movimento/músculo, equipamento e restrições), sem repetir o que já está no treino. */
export function alternativasAoVivo(state: AppState, r: RascunhoAoVivo, idx: number): Exercicio[] {
  const it = r.itens[idx];
  if (!it || it.encerrar) return [];
  return listarAlternativasTroca({
    exercicioId: it.exercicio_id,
    catalog: state.exercicios,
    perfil: state.perfil,
    excluir: idsNoRascunho(r),
    historico: { registros: state.registros ?? [], estados: state.estados, hojeIso: new Date().toISOString() },
  }).map((a) => a.exercicio);
}

export function trocarAoVivo(state: AppState, r: RascunhoAoVivo, idx: number, paraId: string): RascunhoAoVivo {
  if (!alternativasAoVivo(state, r, idx).some((e) => e.id === paraId)) return r;
  const it = r.itens[idx]!;
  const { trabalho } = feitosDoItem(state, r.sessao_id, it);
  if (trabalho > 0 && it.series <= trabalho) return r; // nada falta pra trocar
  const novo = state.exercicios.find((e) => e.id === paraId);
  return mapItem(r, idx, (x) => ({ ...x, trocar_para: paraId, carga_kg: null, tecnica_final: exercicioAceitaTecnica(novo) ? x.tecnica_final ?? null : null }));
}

export function desfazerTrocaNoRascunho(r: RascunhoAoVivo, idx: number): RascunhoAoVivo {
  return mapItem(r, idx, (x) => ({ ...x, trocar_para: null }));
}

/** Catálogo para adicionar: equipamento e restrições, sem repetir. */
export function candidatosAoVivo(state: AppState, r: RascunhoAoVivo): Exercicio[] {
  const ja = new Set(idsNoRascunho(r));
  return state.exercicios
    .filter((e) => !ja.has(e.id) && permitido(e, state.perfil))
    .sort((a, b) => a.grupo_primario.localeCompare(b.grupo_primario) || Number(b.composto) - Number(a.composto) || a.nome.localeCompare(b.nome));
}

/** Adiciona no fim ou logo depois do exercício atual. Séries/reps pelo Coach; kg na hora de montar. */
export function adicionarAoVivo(state: AppState, r: RascunhoAoVivo, exercicioId: string, onde: "fim" | "depois_atual"): RascunhoAoVivo {
  if (r.itens.length >= LIMITES_EDICAO.exercicios_max) return r;
  if (!candidatosAoVivo(state, r).some((e) => e.id === exercicioId)) return r;
  const ex = state.exercicios.find((e) => e.id === exercicioId)!;
  const pad = padraoParaNovo(state, ex);
  const novo: ItemAoVivo = {
    prescricao_id: null,
    exercicio_id: ex.id,
    trocar_para: null,
    series: pad.series,
    faixa_reps: pad.faixa_reps,
    carga_kg: null,
    encerrar: false,
  };
  const iAtual = r.itens.findIndex((i) => i.prescricao_id === r.atual_id);
  const pos = onde === "depois_atual" && iAtual >= 0 ? iAtual + 1 : r.itens.length;
  const itens = [...r.itens];
  itens.splice(pos, 0, novo);
  return { ...r, itens };
}

/** "remover" (não começou) ou "encerrar" (já tem série registrada). */
export function acaoRemover(state: AppState, r: RascunhoAoVivo, idx: number): "remover" | "encerrar" | null {
  const it = r.itens[idx];
  if (!it) return null;
  return feitosDoItem(state, r.sessao_id, it).iniciado ? "encerrar" : "remover";
}

export function removerAoVivo(state: AppState, r: RascunhoAoVivo, idx: number): RascunhoAoVivo {
  const acao = acaoRemover(state, r, idx);
  if (!acao) return r;
  if (acao === "encerrar") return mapItem(r, idx, (x) => ({ ...x, encerrar: true, trocar_para: null, carga_kg: null }));
  const restantes = r.itens.filter((_, i) => i !== idx);
  if (restantes.length < LIMITES_EDICAO.exercicios_min) return r;
  return { ...r, itens: restantes };
}

export function reabrirAoVivo(r: RascunhoAoVivo, idx: number): RascunhoAoVivo {
  return mapItem(r, idx, (x) => ({ ...x, encerrar: false }));
}

/** Reordena só o que ainda não começou (o que já foi feito fica onde está). */
export function podeMover(state: AppState, r: RascunhoAoVivo, idx: number, dir: -1 | 1): boolean {
  const j = idx + dir;
  const a = r.itens[idx];
  const b = r.itens[j];
  if (!a || !b) return false;
  return !feitosDoItem(state, r.sessao_id, a).iniciado && !feitosDoItem(state, r.sessao_id, b).iniciado;
}

export function moverAoVivo(state: AppState, r: RascunhoAoVivo, idx: number, dir: -1 | 1): RascunhoAoVivo {
  if (!podeMover(state, r, idx, dir)) return r;
  const itens = [...r.itens];
  const j = idx + dir;
  [itens[idx], itens[j]] = [itens[j]!, itens[idx]!];
  return { ...r, itens };
}

// ───────── montar / prévia ─────────

export type MontagemAoVivo = {
  prescricoes: Prescricao[];
  estadosNovos: EstadoExercicio[];
  logger_prescricao_id: string | null;
  /** Prescrições que saíram do treino (para cancelar o descanso, se for o caso). */
  removidas: string[];
  linhas: string[];
  mudou: boolean;
};

export function montarAoVivo(state: AppState, r: RascunhoAoVivo, sufixo = Date.now().toString(36)): MontagemAoVivo | null {
  const sess = state.sessoes.find((s) => s.id === r.sessao_id);
  if (!sess) return null;
  const nome = (id: string) => state.exercicios.find((e) => e.id === id)?.nome ?? "Exercício";
  const antes = [...sess.prescricoes].sort((a, b) => a.ordem - b.ordem);
  const excluir = idsNoRascunho(r);
  const rirBase = antes[0]?.rir_alvo ?? 2;
  const out: Prescricao[] = [];
  const estadosNovos: EstadoExercicio[] = [];
  const linhas: string[] = [];
  const novasIds = new Set<string>();
  let atual = r.atual_id;
  const idNovo = (exId: string) => {
    let id = `presc-${sess.id}-${exId}-av${sufixo}`;
    while (sess.prescricoes.some((p) => p.id === id) || novasIds.has(id)) id = `${id}x`;
    novasIds.add(id);
    return id;
  };
  const criar = (exId: string, id: string, series: number, faixa: [number, number], rir: number) => {
    const ex = state.exercicios.find((e) => e.id === exId)!;
    const { prescricao, estadoNovo } = novaPrescricao(state, sess, ex, { id, ordem: 0, series, faixa, rir, excluirIds: excluir });
    if (estadoNovo && !estadosNovos.some((e) => e.exercicio_id === exId)) estadosNovos.push(estadoNovo);
    return prescricao;
  };

  for (const it of r.itens) {
    const presc = it.prescricao_id ? antes.find((p) => p.id === it.prescricao_id) : undefined;
    const tf = it.encerrar ? null : it.tecnica_final ?? null;
    if (!presc) {
      const p = { ...criar(it.exercicio_id, idNovo(it.exercicio_id), it.series, it.faixa_reps, rirBase), tecnica_final: tf };
      out.push(p);
      if (tf) linhas.push(linhaTecnica(nome(it.exercicio_id), null, tf)!);
      linhas.push(`Adicionado: ${nome(it.exercicio_id)} (${it.series}× ${it.faixa_reps[0]}–${it.faixa_reps[1]} reps, ${fmtKg(p.carga.trabalho_kg)} kg pelo Coach)`);
      continue;
    }
    const { trabalho } = feitosDoItem(state, sess.id, it);
    if (it.encerrar) {
      if (trabalho === 0) {
        if (atual === presc.id) atual = null;
        linhas.push(`Encerrado: ${nome(presc.exercicio_id)} (sem séries de trabalho; o aquecimento fica no histórico)`);
        continue;
      }
      out.push({ ...presc, series: trabalho, tecnica_final: presc.tecnica_final ?? null });
      if (trabalho !== presc.series) linhas.push(`Encerrado aqui: ${nome(presc.exercicio_id)} fica com ${trabalho} ${trabalho === 1 ? "série" : "séries"}`);
      continue;
    }
    if (it.trocar_para) {
      if (trabalho === 0) {
        const p = criar(it.trocar_para, presc.id, it.series, it.faixa_reps, presc.rir_alvo);
        out.push({ ...p, descanso_seg: presc.descanso_seg, tecnica_final: tf });
        linhas.push(`Trocado: ${nome(presc.exercicio_id)} → ${nome(it.trocar_para)} (${fmtKg(p.carga.trabalho_kg)} kg pelo Coach)`);
        { const l = linhaTecnica(nome(it.trocar_para), presc.tecnica_final, tf); if (l) linhas.push(l); }
      } else {
        const faltam = Math.max(1, it.series - trabalho);
        out.push({ ...presc, series: trabalho, tecnica_final: null });
        const p = criar(it.trocar_para, idNovo(it.trocar_para), faltam, it.faixa_reps, presc.rir_alvo);
        out.push({ ...p, descanso_seg: presc.descanso_seg, tecnica_final: tf });
        { const l = linhaTecnica(nome(it.trocar_para), null, tf); if (l) linhas.push(l); }
        if (atual === presc.id) atual = p.id;
        linhas.push(
          `Trocado: ${nome(presc.exercicio_id)} → ${nome(it.trocar_para)}. ` +
            `${trabalho === 1 ? "A série feita fica" : `As ${trabalho} séries feitas ficam`} no ${nome(presc.exercicio_id)}; ` +
            `${faltam === 1 ? "a que falta vai" : `as ${faltam} que faltam vão`} pro ${nome(it.trocar_para)} (${fmtKg(p.carga.trabalho_kg)} kg pelo Coach)`,
        );
      }
      continue;
    }
    const faixa: [number, number] = [it.faixa_reps[0], it.faixa_reps[1]];
    let p: Prescricao = { ...presc, series: it.series, faixa_reps: faixa, tecnica_final: tf };
    const ms: string[] = [];
    if (presc.series !== it.series) ms.push(`${presc.series} → ${it.series} séries`);
    if (presc.faixa_reps[0] !== faixa[0] || presc.faixa_reps[1] !== faixa[1])
      ms.push(`reps ${presc.faixa_reps[0]}–${presc.faixa_reps[1]} → ${faixa[0]}–${faixa[1]}`);
    if (it.carga_kg !== null && it.carga_kg !== cargaReferencia(presc)) {
      ms.push(`próximas séries ${fmtKg(cargaReferencia(presc))} → ${fmtKg(it.carga_kg)} kg (ajuste seu)`);
      p = {
        ...p,
        carga: presc.carga.top_set_kg !== null
          ? { ...presc.carga, top_set_kg: it.carga_kg, origem: "usuario" }
          : { ...presc.carga, trabalho_kg: it.carga_kg, origem: "usuario" },
      };
    }
    if (ms.length) linhas.push(`${nome(presc.exercicio_id)}: ${ms.join(", ")}`);
    { const l = linhaTecnica(nome(presc.exercicio_id), presc.tecnica_final, tf); if (l) linhas.push(l); }
    out.push(p);
  }

  for (const p of antes) {
    if (!r.itens.some((i) => i.prescricao_id === p.id)) {
      linhas.push(`Removido: ${nome(p.exercicio_id)}`);
      if (atual === p.id) atual = null;
    }
  }
  const prescricoes = out.map((p, i) => ({ ...p, ordem: i + 1 }));
  // ordem dos que já estavam
  const ordemA = antes.map((p) => p.id).filter((id) => prescricoes.some((x) => x.id === id));
  const ordemD = prescricoes.map((p) => p.id).filter((id) => antes.some((x) => x.id === id));
  if (ordemA.join("|") !== ordemD.join("|")) linhas.push(`Nova ordem: ${prescricoes.map((p) => nome(p.exercicio_id)).join(" → ")}`);
  // aquecimento dos que entraram agora (mesma regra por grupo muscular)
  const preps = preparacaoDaSessao(prescricoes, state.exercicios);
  prescricoes.forEach((p, i) => {
    const entrou = !antes.some((a) => a.id === p.id && a.exercicio_id === p.exercicio_id);
    if (!entrou) return;
    linhas.push(
      preps[i] === "completa"
        ? `${nome(p.exercicio_id)} começa com aquecimento + aproximação (músculo ainda não aquecido hoje)`
        : preps[i] === "aproximacao"
          ? `${nome(p.exercicio_id)} começa com 1 aproximação (músculo já aquecido, movimento novo)`
          : `${nome(p.exercicio_id)} vai direto pras séries de trabalho (músculo já aquecido)`,
    );
  });
  {
    const regs = state.registros.filter((x) => x.sessao_id === sess.id);
    const pend = (p: Prescricao) => regs.filter((x) => x.prescricao_id === p.id && !ehSeriePreparatoria(x.tipo_serie)).length < p.series;
    const iAt = prescricoes.findIndex((p) => p.id === atual);
    // Atual saiu ou foi encerrado: segue pro próximo que falta (depois dele; senão o primeiro que falta).
    if (iAt < 0 || (!pend(prescricoes[iAt]!) && r.itens.find((i) => i.prescricao_id === atual)?.encerrar)) {
      const pendente = prescricoes.slice(Math.max(0, iAt)).find(pend) ?? prescricoes.find(pend);
      atual = pendente?.id ?? prescricoes.at(-1)?.id ?? null;
    }
  }
  const removidas = antes.filter((p) => !prescricoes.some((x) => x.id === p.id)).map((p) => p.id);
  const mudou = linhas.length > 0;
  return { prescricoes, estadosNovos, logger_prescricao_id: atual, removidas, linhas, mudou };
}

export function validarAoVivo(state: AppState, r: RascunhoAoVivo): string | null {
  const s = sessaoAtiva(state);
  if (!s || s.id !== r.sessao_id) return "Esse treino não está mais em andamento.";
  if (r.itens.length < LIMITES_EDICAO.exercicios_min || r.itens.length > LIMITES_EDICAO.exercicios_max)
    return "O treino precisa ter entre 1 e 12 exercícios.";
  if (r.itens.every((i) => i.encerrar && feitosDoItem(state, s.id, i).trabalho === 0)) return "O treino precisa ficar com pelo menos um exercício.";
  for (const it of r.itens) {
    for (const id of [it.exercicio_id, ...(it.trocar_para ? [it.trocar_para] : [])])
      if (!state.exercicios.some((e) => e.id === id)) return "Tem um exercício que não existe no catálogo.";
    if (it.series < 1 || it.series > LIMITES_EDICAO.series_max) return "Confira as séries: algum valor ficou fora do limite.";
    const { trabalho } = feitosDoItem(state, s.id, it);
    if (!it.encerrar && it.series < trabalho) return "Não dá pra tirar séries que você já fez.";
    if (it.prescricao_id && !s.prescricoes.some((p) => p.id === it.prescricao_id)) return "Esse exercício não está mais no treino.";
  }
  const ids = idsNoRascunho(r);
  if (new Set(ids).size !== ids.length) return "Tem exercício repetido no treino.";
  const m = montarAoVivo(state, r, "v");
  if (m) {
    const t = validarTecnicasSessao(state, m.prescricoes);
    if (t) return t;
  }
  return null;
}

export type ResultadoAoVivo = { ok: true; state: AppState; montagem: MontagemAoVivo } | { ok: false; erro: string };

/** Só chamado após "Confirmar". Guarda a versão anterior para Desfazer. */
export function aplicarEdicaoAoVivo(state: AppState, r: RascunhoAoVivo, agoraIso = new Date().toISOString()): ResultadoAoVivo {
  const erro = validarAoVivo(state, r);
  if (erro) return { ok: false, erro };
  const m = montarAoVivo(state, r);
  if (!m) return { ok: false, erro: "Não achei esse treino." };
  if (!m.mudou) return { ok: false, erro: "Nada mudou." };
  const sess = state.sessoes.find((s) => s.id === r.sessao_id)!;
  const ed: EdicaoAoVivo = {
    sessao_id: sess.id,
    editado_em: agoraIso,
    prescricoes: sess.prescricoes,
    logger_prescricao_id: state.logger_prescricao_id,
    estados_criados: m.estadosNovos.map((e) => e.exercicio_id),
    registros_n: state.registros.filter((x) => x.sessao_id === sess.id).length,
    resumo: m.linhas,
  };
  return {
    ok: true,
    montagem: m,
    state: {
      ...state,
      sessoes: state.sessoes.map((s) => (s.id === sess.id ? { ...s, prescricoes: m.prescricoes } : s)),
      estados: [...state.estados, ...m.estadosNovos],
      logger_prescricao_id: m.logger_prescricao_id,
      edicao_ao_vivo: ed,
    },
  };
}

/** Desfazer vale enquanto nenhuma série nova foi registrada depois da edição. */
export function podeDesfazerAoVivo(state: AppState): boolean {
  const ed = state.edicao_ao_vivo;
  const s = sessaoAtiva(state);
  if (!ed || !s || s.id !== ed.sessao_id) return false;
  return state.registros.filter((x) => x.sessao_id === s.id).length === ed.registros_n;
}

export function desfazerEdicaoAoVivo(state: AppState): { ok: true; state: AppState } | { ok: false; erro: string } {
  if (!podeDesfazerAoVivo(state)) return { ok: false, erro: "Já tem série registrada depois da edição, então ela fica como está." };
  const ed = state.edicao_ao_vivo!;
  const criados = new Set(ed.estados_criados);
  return {
    ok: true,
    state: {
      ...state,
      sessoes: state.sessoes.map((s) => (s.id === ed.sessao_id ? { ...s, prescricoes: ed.prescricoes } : s)),
      estados: state.estados.filter(
        (e) => !criados.has(e.exercicio_id) || state.registros.some((x) => x.exercicio_id === e.exercicio_id),
      ),
      logger_prescricao_id: ed.logger_prescricao_id,
      edicao_ao_vivo: null,
    },
  };
}

/** Validação de servidor: sessão editada ao vivo dentro dos limites e no catálogo. Estados antigos passam. */
export function validarEdicaoAoVivoNoEstado(state: AppState): string | null {
  const ed = state.edicao_ao_vivo;
  if (!ed) return null;
  const s = state.sessoes.find((x) => x.id === ed.sessao_id);
  if (!s) return "edição ao vivo de sessão inexistente";
  if (s.prescricoes.length > LIMITES_EDICAO.exercicios_max) return "sessão editada fora dos limites";
  for (const p of s.prescricoes) {
    if (p.series > 12) return "sessão editada fora dos limites";
    if (!state.exercicios.some((e) => e.id === p.exercicio_id)) return "exercício fora do catálogo";
  }
  return null;
}
