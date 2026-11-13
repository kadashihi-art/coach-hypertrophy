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
import { cargaParaExercicio, findAlt } from "@/lib/plan/alternativa";
import {
  estimarCargaKg,
  exerciseAllowed,
  parseRestricoes,
  patternBlocked,
} from "@/lib/plan/gerar-plano";
import type { RestricaoKey } from "@/lib/plan/restricoes";
import { labelGrupo } from "@/lib/labels";
import { pontosHistorico, sinalDoExercicio, textoMemoria, type FonteHistorico } from "@/lib/plan/sugestao-exercicio";
import { bonusHipertrofia, porqueEspecifico } from "@/lib/plan/evidencia-exercicio";

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
  /** O que o app lembra desse exercício ("Você já fez: 40 kg × 10 reps…" / aviso de dor). null = nunca fez. */
  memoria?: string | null;
  /** Primeira da lista quando o histórico indica uma escolha clara. */
  recomendado?: boolean;
  /** Por que é a recomendada (texto curto). */
  motivo_recomendacao?: string | null;
  /** Vantagem pra hipertrofia com o estudo, quando há (ex.: "Braço acima da cabeça… (Maeo et al., 2023)"). */
  ciencia?: string | null;
};

export type PreviaTroca = {
  de: Exercicio;
  para: Exercicio;
  series: number;
  faixa_reps: [number, number];
  rir_alvo: number;
  carga_kg: number;
  carga_origem: "historico" | "mesmo_padrao" | "estimativa";
  sessoes_afetadas: { id: string; nome: string }[];
  volume_antes: VolumePlano;
  volume_depois: VolumePlano;
};

export type VolumePlano = Record<string, { diretas: number; indiretas: number; efetivas: number }>;

export function equipsDoPerfil(perfil: Perfil | null | undefined): Set<string> | null {
  const eq = perfil?.equipamentos ?? [];
  if (!eq.length) return null;
  return new Set<string>([...eq, "peso_corporal"]);
}

export function permitido(ex: Exercicio, perfil: Perfil | null | undefined): boolean {
  const restr = parseRestricoes(perfil?.restricoes ?? []);
  if (patternBlocked(ex.padrao, restr)) return false;
  const equips = equipsDoPerfil(perfil);
  // sem equipamentos cadastrados: não filtra por equipamento, só por restrição
  return exerciseAllowed(ex, equips ?? new Set([ex.equipamento]), restr);
}

function mesmoConjunto(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export function mesmaFamilia(a: Exercicio, b: Exercicio): boolean {
  return (a.base_id ?? a.id) === (b.base_id ?? b.id);
}

function explicar(de: Exercicio, para: Exercicio, perfil: Perfil | null | undefined): string {
  const alvo = labelGrupo(para.grupo_primario).toLowerCase();
  if (mesmaFamilia(de, para)) {
    const qual = para.variacao ? `Versão ${para.variacao} do mesmo exercício` : "Versão principal do mesmo exercício";
    return `${qual}, continua focando ${alvo}. A carga dessa versão fica guardada separada, então eu lembro o que você usa em cada uma.`;
  }
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

/**
 * Alternativas do MESMO padrão e MESMO músculo-alvo, respeitando equipamento e restrições.
 * Com `historico`, a ordem usa o que você já fez: exercício conhecido e evoluindo sobe,
 * travado ou caindo desce um pouco, com dor recente vai pro fim (com aviso).
 */
export function listarAlternativasTroca(args: {
  exercicioId: string;
  catalog: Exercicio[];
  perfil: Perfil | null | undefined;
  /** ids já presentes na(s) sessão(ões) onde a troca acontece (evita duplicar). */
  excluir?: string[];
  historico?: FonteHistorico;
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
  // variações do mesmo exercício primeiro, depois mesmos auxiliares (volume idêntico), depois o resto
  const base = lista.sort(
    (a, b) =>
      Number(!mesmaFamilia(de, a.exercicio)) - Number(!mesmaFamilia(de, b.exercicio)) ||
      Number(a.secundarios_mudam) - Number(b.secundarios_mudam),
  );
  const hist = args.historico;
  // Pontos: estrutura (família +6, mesmos auxiliares +3) + evidência de hipertrofia + histórico.
  // Empate mantém a ordem acima.
  const pont = base.map((a, i) => {
    const sinal = hist ? sinalDoExercicio(a.exercicio, hist) : null;
    const pts =
      (mesmaFamilia(de, a.exercicio) ? 6 : 0) + (a.secundarios_mudam ? 0 : 3) + bonusHipertrofia(a.exercicio.id) + pontosHistorico(sinal);
    const ciencia = porqueEspecifico(a.exercicio.id);
    return { a: { ...a, ciencia, ...(sinal ? { memoria: textoMemoria(sinal, a.exercicio) } : {}) }, pts, i, sinal };
  });
  pont.sort((x, y) => y.pts - x.pts || x.i - y.i);
  const top = pont[0];
  const feito = !!(top?.sinal?.memoria && top.sinal.memoria.sessoes > 0 && !top.sinal.dor_em && !top.sinal.travado);
  // Sem histórico decidindo: recomenda pela ciência quando a vantagem é clara (bônus alto) e sem dor.
  const pelaCiencia = !feito && !!top && bonusHipertrofia(top.a.exercicio.id) >= 6 && !top.sinal?.dor_em;
  return pont.map((p, idx) => {
    if (idx === 0 && pelaCiencia) {
      return { ...p.a, recomendado: true, motivo_recomendacao: "Melhor opção pra hipertrofia nos estudos." };
    }
    if (idx !== 0 || !feito) return p.a;
    const tend = p.sinal?.memoria?.tendencia_pct ?? null;
    return {
      ...p.a,
      recomendado: true,
      motivo_recomendacao:
        tend != null && tend >= 0.5
          ? "Você já faz e vem evoluindo nele: dá pra seguir a progressão de onde parou."
          : "Você já fez e eu sei sua carga: começa sem chute.",
    };
  });
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

function substituir(
  p: Prescricao,
  para: Exercicio,
  catalog: Exercicio[],
  equips: Set<string> | null,
  carga: number,
  opts: { restr: Set<RestricaoKey>; excludeIds: Iterable<string> },
): Prescricao {
  return {
    ...p,
    id: p.id.replace(p.exercicio_id, para.id),
    exercicio_id: para.id,
    padrao: para.padrao,
    // números: herdados da prescrição atual (séries/reps/RIR/descanso/técnica); kg do estado do novo exercício
    carga: { trabalho_kg: carga, top_set_kg: p.carga.top_set_kg != null ? carga : null, origem: p.carga.origem },
    alternativa_equipamento_ocupado: findAlt(catalog, para.padrao, equips, para.id, opts),
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
  const estimativa = state.perfil
    ? estimarCargaKg(state.perfil.peso_kg, state.perfil.experiencia, para.padrao, para.composto, para.equipamento, {
        sexo: state.perfil.sexo,
        idade: state.perfil.idade,
        grupo: para.grupo_primario,
      })
    : base.carga.trabalho_kg;
  const sugerida = cargaParaExercicio(state, paraId, estimativa);
  const carga = sugerida.carga_kg;
  const depois = aplicarTroca(state, deId, paraId);
  if (!depois) return null;
  return {
    de,
    para,
    series: base.series,
    faixa_reps: base.faixa_reps,
    rir_alvo: base.rir_alvo,
    carga_kg: carga,
    carga_origem:
      sugerida.origem === "estimativa"
        ? "estimativa"
        : sugerida.origem === "mesmo_padrao"
          ? "mesmo_padrao"
          : "historico",
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
    ? estimarCargaKg(state.perfil.peso_kg, state.perfil.experiencia, para.padrao, para.composto, para.equipamento, {
        sexo: state.perfil.sexo,
        idade: state.perfil.idade,
        grupo: para.grupo_primario,
      })
    : 0;
  const carga = cargaParaExercicio(state, paraId, estimativa).carga_kg;
  const equips = equipsDoPerfil(state.perfil);
  const restr = parseRestricoes(state.perfil?.restricoes ?? []);
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
    const outros = s.prescricoes.map((p) => p.exercicio_id);
    return {
      ...s,
      prescricoes: s.prescricoes.map((p) => {
        if (p.exercicio_id !== deId) return p;
        ref = ref ?? p;
        return substituir(p, para, catalog, equips, carga, {
          restr,
          excludeIds: outros,
        });
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
      e1rm_estimado_kg: 0, // sem dados até o 1º treino real
      pr_carga_kg: 0,
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
