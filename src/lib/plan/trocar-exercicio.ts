/**
 * Troca permanente de exercício no plano salvo.
 * Determinístico: alternativas (mesmo padrão + mesmo músculo-alvo, filtradas por
 * equipamento e restrições), números herdados da prescrição atual (séries/reps/RIR/descanso)
 * e kg do EstadoExercicio do novo exercício (ou estimativa conservadora do gerador).
 * Nada aqui grava: `aplicarTroca` só devolve um novo estado; quem persiste é o app após "Confirmar troca".
 */
import type {
  AppState,
  EstadoExercicio,
  Exercicio,
  GrupoMuscular,
  Perfil,
  Prescricao,
  Sessao,
} from "@/lib/domain";
import { volumeEfetivo } from "@/lib/domain";
import { cargaDoEstado, findAlt } from "@/lib/plan/alternativa";
import {
  estimarCargaKg,
  exerciseAllowed,
  parseRestricoes,
  patternBlocked,
} from "@/lib/plan/gerar-plano";
import { labelGrupo } from "@/lib/labels";

const EQUIP_TXT: Record<string, string> = {
  barra: "a barra",
  halteres: "halteres",
  maquina: "a máquina",
  cabo: "o cabo",
  kettlebell: "o kettlebell",
  peso_corporal: "o peso do corpo",
  banco: "o banco",
  rack: "o rack",
  elastico: "o elástico",
  outros: "outro equipamento",
};
const EQUIP_POR: Record<string, string> = {
  barra: "pela barra", halteres: "por halteres", maquina: "pela máquina", cabo: "pelo cabo",
  kettlebell: "pelo kettlebell", peso_corporal: "pelo peso do corpo", banco: "pelo banco",
  rack: "pelo rack", elastico: "pelo elástico", outros: "por outro equipamento",
};

export type AlternativaTroca = {
  exercicio: Exercicio;
  /** Explicação curta em tom humano (regra/metadados; a LLM pode reescrever só o texto). */
  explicacao: string;
  /** true quando os músculos auxiliares mudam (o músculo-alvo continua igual). */
  secundarios_mudam: boolean;
};

export type PreviaTroca = {
  de: Exercicio;
  para: Exercicio;
  series: number;
  faixa_reps: [number, number];
  rir_alvo: number;
  carga_kg: number;
  carga_origem: "historico" | "estimativa";
  sessoes_afetadas: { id: string; nome: string }[];
  volume_antes: VolumePlano;
  volume_depois: VolumePlano;
};

export type VolumePlano = Record<string, { diretas: number; indiretas: number; efetivas: number }>;

function equipsDoPerfil(perfil: Perfil | null | undefined): Set<string> | null {
  const eq = perfil?.equipamentos ?? [];
  if (!eq.length) return null;
  return new Set<string>([...eq, "peso_corporal"]);
}

function permitido(ex: Exercicio, perfil: Perfil | null | undefined): boolean {
  const restr = parseRestricoes(perfil?.restricoes ?? []);
  if (patternBlocked(ex.padrao, restr)) return false;
  const equips = equipsDoPerfil(perfil);
  // sem equipamentos cadastrados: não filtra por equipamento, só por restrição
  return exerciseAllowed(ex, equips ?? new Set([ex.equipamento]), restr);
}

function mesmoConjunto(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function explicar(de: Exercicio, para: Exercicio, perfil: Perfil | null | undefined): string {
  const alvo = labelGrupo(para.grupo_primario).toLowerCase();
  const partes: string[] = [];
  if (para.equipamento !== de.equipamento) {
    partes.push(`Mesmo movimento, trocando ${EQUIP_TXT[de.equipamento] ?? "o equipamento atual"} ${EQUIP_POR[para.equipamento] ?? "por outra opção"}`);
  } else {
    partes.push(`Mesmo movimento e mesmo equipamento, com outro ângulo`);
  }
  partes.push(`continua focando ${alvo}`);
  let t = partes.join(", ") + ".";
  if (para.equipamento === "maquina" || para.equipamento === "cabo") t += " Trajetória mais guiada, fácil de manter a técnica perto da falha.";
  else if (para.equipamento === "halteres") t += " Cada lado trabalha sozinho, bom pra corrigir assimetria.";
  else if (para.equipamento === "barra") t += " Dá pra progredir carga de forma bem consistente.";
  else if (para.equipamento === "peso_corporal") t += " Não depende de aparelho livre.";
  const restr = parseRestricoes(perfil?.restricoes ?? []);
  if (restr.size && (para.equipamento === "maquina" || para.equipamento === "cabo")) {
    t += " Costuma ser mais tranquilo pra quem tem dor ou lesão.";
  }
  return t;
}

/** Alternativas do MESMO padrão e MESMO músculo-alvo, respeitando equipamento e restrições. */
export function listarAlternativasTroca(args: {
  exercicioId: string;
  catalog: Exercicio[];
  perfil: Perfil | null | undefined;
  /** ids já presentes na(s) sessão(ões) onde a troca acontece (evita duplicar). */
  excluir?: string[];
}): AlternativaTroca[] {
  const de = args.catalog.find((e) => e.id === args.exercicioId);
  if (!de) return [];
  const excl = new Set([de.id, ...(args.excluir ?? [])]);
  const lista = args.catalog
    .filter(
      (e) =>
        !excl.has(e.id) &&
        e.padrao === de.padrao &&
        e.grupo_primario === de.grupo_primario &&
        permitido(e, args.perfil),
    )
    .map((e) => ({
      exercicio: e,
      explicacao: explicar(de, e, args.perfil),
      secundarios_mudam: !mesmoConjunto(e.grupos_secundarios, de.grupos_secundarios),
    }));
  // mesmos auxiliares primeiro (volume idêntico em todos os músculos), depois o resto
  return lista.sort((a, b) => Number(a.secundarios_mudam) - Number(b.secundarios_mudam));
}

/** Volume semanal planejado por músculo (diretas + 0,5×indiretas), a partir das prescrições. */
export function volumePlanejado(sessoes: Sessao[], catalog: Exercicio[]): VolumePlano {
  const out: VolumePlano = {};
  const add = (g: GrupoMuscular, d: number, i: number) => {
    const cur = out[g] ?? { diretas: 0, indiretas: 0, efetivas: 0 };
    cur.diretas += d;
    cur.indiretas += i;
    cur.efetivas = volumeEfetivo(cur.diretas, cur.indiretas);
    out[g] = cur;
  };
  for (const s of sessoes) {
    for (const p of s.prescricoes) {
      const ex = catalog.find((e) => e.id === p.exercicio_id);
      if (!ex) continue;
      add(ex.grupo_primario, p.series, 0);
      for (const g of ex.grupos_secundarios) add(g, 0, p.series);
    }
  }
  return out;
}

function sessoesDoPlano(state: AppState): Sessao[] {
  const ids = state.plano?.sessoes ?? [];
  return state.sessoes.filter((s) => ids.includes(s.id));
}

/** Prescrições trocáveis: todas as sessões do plano que ainda não foram concluídas/puladas no passado. */
function trocavel(s: Sessao): boolean {
  return s.status !== "em_andamento";
}

function substituir(p: Prescricao, para: Exercicio, catalog: Exercicio[], equips: Set<string> | null, carga: number): Prescricao {
  return {
    ...p,
    id: p.id.replace(p.exercicio_id, para.id),
    exercicio_id: para.id,
    padrao: para.padrao,
    // números: herdados da prescrição atual (séries/reps/RIR/descanso/técnica); kg do estado do novo exercício
    carga: { trabalho_kg: carga, top_set_kg: p.carga.top_set_kg != null ? carga : null, origem: p.carga.origem },
    alternativa_equipamento_ocupado: findAlt(catalog, para.padrao, equips, para.id),
    guia_id: para.guia_id ?? null,
  };
}

/** Prévia determinística (nada é gravado). */
export function previaTroca(state: AppState, deId: string, paraId: string): PreviaTroca | null {
  const catalog = state.exercicios;
  const de = catalog.find((e) => e.id === deId);
  const para = catalog.find((e) => e.id === paraId);
  if (!de || !para || !state.plano) return null;
  const sessoes = sessoesDoPlano(state);
  const alvo = sessoes.filter((s) => trocavel(s) && s.prescricoes.some((p) => p.exercicio_id === deId));
  const base = alvo[0]?.prescricoes.find((p) => p.exercicio_id === deId);
  if (!base) return null;
  const ok = listarAlternativasTroca({ exercicioId: deId, catalog, perfil: state.perfil }).some((a) => a.exercicio.id === paraId);
  if (!ok) return null;
  const temEstado = state.estados.some((e) => e.exercicio_id === paraId);
  const estimativa = state.perfil
    ? estimarCargaKg(state.perfil.peso_kg, state.perfil.experiencia, para.padrao, para.composto, para.equipamento)
    : base.carga.trabalho_kg;
  const carga = cargaDoEstado(state.estados, paraId, estimativa);
  const depois = aplicarTroca(state, deId, paraId);
  if (!depois) return null;
  return {
    de,
    para,
    series: base.series,
    faixa_reps: base.faixa_reps,
    rir_alvo: base.rir_alvo,
    carga_kg: carga,
    carga_origem: temEstado ? "historico" : "estimativa",
    sessoes_afetadas: alvo.map((s) => ({ id: s.id, nome: s.nome })),
    volume_antes: volumePlanejado(sessoes, catalog),
    volume_depois: volumePlanejado(sessoesDoPlano(depois), catalog),
  };
}

/**
 * Aplica a troca em todas as sessões do plano onde o exercício aparece (exceto a em andamento).
 * Registros/histórico não são tocados. Retorna novo estado (puro) ou null se inválida.
 */
export function aplicarTroca(state: AppState, deId: string, paraId: string): AppState | null {
  const catalog = state.exercicios;
  const para = catalog.find((e) => e.id === paraId);
  if (!para || !state.plano) return null;
  const valid = listarAlternativasTroca({ exercicioId: deId, catalog, perfil: state.perfil }).some((a) => a.exercicio.id === paraId);
  if (!valid) return null;
  const estimativa = state.perfil
    ? estimarCargaKg(state.perfil.peso_kg, state.perfil.experiencia, para.padrao, para.composto, para.equipamento)
    : 0;
  const carga = cargaDoEstado(state.estados, paraId, estimativa);
  const equips = equipsDoPerfil(state.perfil);
  const ids = new Set(state.plano.sessoes);
  const conflito = state.sessoes.some(
    (s) => ids.has(s.id) && trocavel(s) && s.prescricoes.some((p) => p.exercicio_id === deId) && s.prescricoes.some((p) => p.exercicio_id === paraId),
  );
  if (conflito) return null;
  let mudou = false;
  let ref: Prescricao | null = null;
  const sessoes = state.sessoes.map((s) => {
    if (!ids.has(s.id) || !trocavel(s)) return s;
    if (!s.prescricoes.some((p) => p.exercicio_id === deId)) return s;
    mudou = true;
    return {
      ...s,
      prescricoes: s.prescricoes.map((p) => {
        if (p.exercicio_id !== deId) return p;
        ref = ref ?? p;
        return substituir(p, para, catalog, equips, carga);
      }),
    };
  });
  if (!mudou || !ref) return null;
  const r = ref as Prescricao;
  let estados = state.estados;
  if (!estados.some((e) => e.exercicio_id === paraId)) {
    const novo: EstadoExercicio = {
      exercicio_id: paraId,
      carga_atual_kg: carga,
      faixa_reps: r.faixa_reps,
      rir_alvo: r.rir_alvo,
      alvo_proxima_sessao: { carga_kg: carga, faixa_reps: r.faixa_reps, rir_alvo: r.rir_alvo },
      sessoes_sem_progresso: 0,
      ultima_progressao_em: null,
      e1rm_estimado_kg: Math.round(carga * (1 + r.faixa_reps[1] / 30) * 10) / 10,
      pr_carga_kg: carga,
      pr_reps: 0,
      origem_carga: "estimativa_conservadora",
      primeira_sessao: true,
      ultimo_top_kg: null,
      ultimo_back_off_kg: null,
      ultimo_rir: null,
      ultima_sessao_em: null,
      atualizado_em: new Date().toISOString(),
    } as EstadoExercicio;
    estados = [...estados, novo];
  }
  return { ...state, sessoes, estados };
}

/** Detecta pedido de troca no chat ("troca o leg press por outro") e devolve o exercício do plano citado. */
export function detectarPedidoTroca(texto: string, state: AppState): Exercicio | null | "generico" {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!/\b(troca|trocar|substitui|substituir|mudar|muda|outro exercicio)\b/.test(t)) return null;
  const noPlano = new Set(sessoesDoPlano(state).flatMap((s) => s.prescricoes.map((p) => p.exercicio_id)));
  const cands = state.exercicios
    .filter((e) => noPlano.has(e.id))
    .sort((a, b) => b.nome.length - a.nome.length);
  for (const e of cands) {
    const n = e.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (t.includes(n) || t.includes(e.id.replace(/_/g, " "))) return e;
  }
  return /exercicio/.test(t) ? "generico" : null;
}

/** Exercícios do plano (únicos), para o seletor no Coach. */
export function exerciciosDoPlano(state: AppState): Exercicio[] {
  const ids: string[] = [];
  for (const s of sessoesDoPlano(state)) for (const p of s.prescricoes) if (!ids.includes(p.exercicio_id)) ids.push(p.exercicio_id);
  return ids.map((id) => state.exercicios.find((e) => e.id === id)).filter((e): e is Exercicio => !!e);
}

/** Ids presentes nas sessões onde `deId` aparece (para não sugerir duplicata). */
export function idsNasSessoesDe(state: AppState, deId: string): string[] {
  return sessoesDoPlano(state)
    .filter((s) => s.prescricoes.some((p) => p.exercicio_id === deId))
    .flatMap((s) => s.prescricoes.map((p) => p.exercicio_id));
}
