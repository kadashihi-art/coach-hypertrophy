/**
 * Proximidade da falha inteligente (lote 9). Lógica pura e determinística: nada aqui grava.
 *
 * - RIR alvo do dia por padrão de movimento, fase do mesociclo, nível, deload e recuperação.
 * - Calibração do RIR relatado: compara com o que a performance indica (e1RM e queda de reps).
 * - Feedback curto após cada série e liberação das técnicas avançadas.
 * - Séries efetivas (perto da falha) por músculo na semana.
 * Fontes e regras em docs/proximidade-falha.md.
 */
import type { Exercicio, GrupoMuscular, RegistroSerie } from "@/lib/domain";
import { ehSeriePreparatoria } from "@/lib/domain/enums";
import { e1rmEpley } from "./e1rm";
import { isoWeekDe } from "./volume";

/** Série conta como efetiva (perto da falha) com até 3 reps em reserva (estimadas). */
export const RIR_EFETIVO_MAX = 3;

export type TipoMovimento = "composto_livre" | "composto_guiado" | "isolador";

export function tipoMovimento(ex: Pick<Exercicio, "composto" | "equipamento"> | undefined | null): TipoMovimento {
  if (!ex) return "composto_livre";
  if (!ex.composto) return "isolador";
  return ex.equipamento === "maquina" || ex.equipamento === "cabo" ? "composto_guiado" : "composto_livre";
}

/** Piso de RIR por tipo: composto livre nunca pede falha. */
export const RIR_PISO: Record<TipoMovimento, number> = { composto_livre: 1, composto_guiado: 0, isolador: 0 };
const RIR_BASE: Record<TipoMovimento, number> = { composto_livre: 2, composto_guiado: 2, isolador: 1 };

export type ContextoRir = {
  exercicio: Pick<Exercicio, "composto" | "equipamento"> | undefined | null;
  experiencia?: string | null;
  foco?: string | null;
  semana_atual?: number | null;
  total_semanas?: number | null;
  /** Check-in de hoje (se houver). */
  checkin?: { sono_h: number; prontidao: number } | null;
};

export type RirDoDia = {
  alvo: number;
  tipo: TipoMovimento;
  deload: boolean;
  recuperacao_ruim: boolean;
  /** Frases curtas do porquê (sem códigos). */
  motivos: string[];
};

/** Recuperação ruim = mesma régua do check-in: sono < 6 h ou disposição 1–2. */
export function recuperacaoRuim(ck: ContextoRir["checkin"]): boolean {
  return !!ck && (ck.sono_h < 6 || ck.prontidao <= 2);
}

export function rirAlvoDoDia(ctx: ContextoRir): RirDoDia {
  const tipo = tipoMovimento(ctx.exercicio);
  const motivos: string[] = [];
  if (ctx.foco === "deload") {
    return { alvo: 3, tipo, deload: true, recuperacao_ruim: recuperacaoRuim(ctx.checkin), motivos: ["Semana de descanso ativo: pare com 3 reps sobrando."] };
  }
  let rir = RIR_BASE[tipo];
  motivos.push(
    tipo === "composto_livre"
      ? "Composto livre e pesado: mais margem pra manter a técnica."
      : tipo === "composto_guiado"
        ? "Composto em máquina ou cabo: dá pra ir mais perto da falha com segurança."
        : "Isolador: pode chegar bem perto da falha.",
  );
  // Fase: começa mais conservador e aperta ao longo do mesociclo.
  const total = Math.max(1, (ctx.total_semanas ?? 4) - 1); // última semana costuma ser deload
  const sem = Math.max(1, ctx.semana_atual ?? 1);
  const p = total <= 1 ? 0.5 : (sem - 1) / (total - 1);
  if (p < 0.25) {
    rir += 1;
    motivos.push("Início do bloco: mais 1 rep de margem.");
  } else if (p >= 0.67) {
    rir -= 1;
    motivos.push("Fim do bloco: hora de apertar mais.");
  }
  if (ctx.foco === "intensificacao" || ctx.foco === "realizacao") rir = Math.min(rir, RIR_BASE[tipo]);
  // Nível: iniciante calibra pior o RIR e a técnica ainda está firmando nos compostos.
  if (ctx.experiencia === "iniciante" && tipo !== "isolador") {
    rir += 1;
    motivos.push("Ainda aprendendo a sentir o RIR nos compostos: mais 1 de margem.");
  }
  const ruim = recuperacaoRuim(ctx.checkin);
  if (ruim) {
    rir += 1;
    motivos.push("Recuperação baixa hoje: mais 1 rep de margem.");
  }
  rir = Math.max(RIR_PISO[tipo], Math.min(4, rir));
  return { alvo: rir, tipo, deload: false, recuperacao_ruim: ruim, motivos };
}

type SerieLike = Pick<RegistroSerie, "carga_kg" | "reps" | "rir_percebido" | "tipo_serie"> & Partial<Pick<RegistroSerie, "dor" | "numero">>;

export type Calibracao = {
  /** RIR que a performance indica (null = sem dado suficiente). */
  rir_estimado: number | null;
  /** O que o app considera (relatado ajustado). */
  rir_interpretado: number;
  /** relatado − estimado (positivo = estava mais perto do que achou). */
  desvio: number;
  fonte: "e1rm" | "queda" | "relatado";
};

const arred = (n: number) => Math.round(n);

/**
 * Estima o RIR de uma série.
 * 1) e1RM de referência (melhor e1RM do histórico, ou da sessão): reps máximas previstas − reps feitas.
 * 2) Queda de reps na série seguinte com a mesma carga (perto da falha cai 2+; longe, quase não cai).
 * Só ajusta quando o sinal é forte (diferença de 2+ reps), pra não brigar com o usuário à toa.
 */
export function calibrarSerie(args: { serie: SerieLike; proxima?: SerieLike | null; e1rmRef?: number | null }): Calibracao {
  const { serie, proxima, e1rmRef } = args;
  const rel = serie.rir_percebido;
  let est: number | null = null;
  let fonte: Calibracao["fonte"] = "relatado";
  if (e1rmRef && e1rmRef > 0 && serie.carga_kg > 0 && serie.reps > 0 && serie.reps <= 15) {
    const repsMax = 30 * (e1rmRef / serie.carga_kg - 1);
    if (repsMax > 0 && repsMax <= 25) {
      est = Math.max(0, arred(repsMax - serie.reps));
      fonte = "e1rm";
    }
  }
  if (proxima && proxima.carga_kg === serie.carga_kg && !ehSeriePreparatoria(proxima.tipo_serie)) {
    const queda = serie.reps - proxima.reps;
    // Disse que estava longe, mas despencou na seguinte → estava perto.
    if (rel >= 3 && queda >= 3) {
      est = Math.min(est ?? rel, 1);
      fonte = "queda";
    }
    // Disse falha/quase, mas repetiu as reps (ou fez mais) na seguinte → sobrava.
    if (rel <= 1 && queda <= 0 && proxima.rir_percebido <= 1) {
      est = Math.max(est ?? rel, rel + 2);
      fonte = "queda";
    }
  }
  if (est == null) return { rir_estimado: null, rir_interpretado: rel, desvio: 0, fonte };
  const desvio = rel - est;
  const interp = Math.abs(desvio) >= 2 ? Math.max(0, Math.min(5, arred((rel + est) / 2))) : rel;
  return { rir_estimado: est, rir_interpretado: interp, desvio, fonte };
}

/** Viés pessoal médio (relatado − estimado) nas últimas séries com estimativa. */
export function viesPessoal(cals: Calibracao[]): number | null {
  const xs = cals.filter((c) => c.rir_estimado != null).slice(-12).map((c) => c.desvio);
  if (xs.length < 4) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function reps(n: number): string {
  return n === 1 ? "1 rep" : `${n} reps`;
}
function sobraria(n: number): string {
  return n === 0 ? "não sobraria nenhuma" : n === 1 ? "só sobraria 1" : `sobrariam ${n}`;
}

export type FeedbackSerie = {
  zona: "longe" | "efetiva" | "falha" | "aquecimento";
  texto: string;
  /** Aviso de calibração (null = RIR relatado bate com a performance). */
  calibracao: string | null;
};

/** Frase curta logo depois da série: está na zona efetiva? o que fazer na próxima? */
export function feedbackSerie(args: {
  serie: SerieLike;
  faixa: [number, number];
  alvo: RirDoDia;
  cal: Calibracao;
  ultima: boolean;
}): FeedbackSerie {
  const { serie, faixa, alvo, cal, ultima } = args;
  if (ehSeriePreparatoria(serie.tipo_serie)) {
    return { zona: "aquecimento", texto: "Aquecimento é pra preparar, longe da falha. Guarde energia pras séries de trabalho.", calibracao: null };
  }
  const r = cal.rir_interpretado;
  const a = alvo.alvo;
  let calibracao: string | null = null;
  if (cal.rir_estimado != null && Math.abs(cal.desvio) >= 2) {
    calibracao =
      cal.desvio > 0
        ? `Você marcou RIR ${serie.rir_percebido}, mas ${cal.fonte === "queda" ? "a queda de reps na série seguinte" : "seu histórico de carga"} mostra que estava mais perto da falha, ${cal.rir_estimado <= 1 ? `com ${cal.rir_estimado === 0 ? "nenhuma rep" : "só 1 rep"}` : `com umas ${reps(cal.rir_estimado)}`} sobrando. Vou considerar ${r}.`
        : `Você marcou RIR ${serie.rir_percebido}, mas ${cal.fonte === "queda" ? "você repetiu as reps na série seguinte" : "pelo seu histórico de carga"}, então provavelmente sobravam umas ${reps(cal.rir_estimado)}. Vou considerar ${r}.`;
  }
  const prox = ultima ? "na próxima vez" : "na próxima";
  const Prox = ultima ? "Na próxima vez" : "Na próxima";
  if (serie.dor) {
    return { zona: r <= RIR_EFETIVO_MAX ? "efetiva" : "longe", texto: "Com dor, não força a proximidade da falha. Segura a margem e, se repetir, troca ou para.", calibracao };
  }
  if (r === 0 && alvo.tipo === "composto_livre") {
    return {
      zona: "falha",
      texto: `Foi até a falha num composto pesado. ${Prox}, pare com 1–2 reps sobrando: o estímulo é quase o mesmo e a fadiga bem menor.`,
      calibracao,
    };
  }
  if (r < a - 1 || r < RIR_PISO[alvo.tipo]) {
    return {
      zona: "falha",
      texto: `Passou do ponto de hoje (o alvo era deixar ${reps(a)}). ${Prox}, pare quando sentir que ${sobraria(a)}.`,
      calibracao,
    };
  }
  if (r > RIR_EFETIVO_MAX || r >= a + 2) {
    const d = r - a;
    const dTxt = d >= 2 ? `${d - 1}–${d}` : String(d);
    const extraFaixa = serie.reps >= faixa[1] ? " Se passar do topo da faixa, a carga sobe na próxima sessão." : "";
    return {
      zona: "longe",
      texto: `Dava mais ${dTxt} reps. ${Prox}, vai até sentir que ${sobraria(a)}.${extraFaixa}`,
      calibracao,
    };
  }
  if (serie.reps > faixa[1]) {
    return { zona: "efetiva", texto: `Boa, série efetiva e acima da faixa: a carga sobe na próxima sessão. ${Prox}, mantém essa intensidade.`, calibracao };
  }
  if (r === a + 1) {
    return { zona: "efetiva", texto: `Na zona efetiva. Se quiser apertar, ${prox} vai até sentir que ${sobraria(a)}.`, calibracao };
  }
  return { zona: "efetiva", texto: `Na zona efetiva, no ponto certo. ${Prox}, repete essa intensidade.`, calibracao };
}

/** Calibra todas as séries de trabalho de uma prescrição na sessão (na ordem). */
export function calibrarSessao(series: SerieLike[], e1rmRef?: number | null): Calibracao[] {
  const trab = series.filter((s) => !ehSeriePreparatoria(s.tipo_serie));
  const ref = e1rmRef && e1rmRef > 0 ? e1rmRef : null;
  return trab.map((s, i) => calibrarSerie({ serie: s, proxima: trab[i + 1] ?? null, e1rmRef: ref }));
}

// ───────── técnicas avançadas: só quando já perto da falha e recuperado ─────────

export type LiberacaoTecnicas = { liberado: boolean; texto: string };

/**
 * Técnicas só são sugeridas se:
 * - há pelo menos 6 séries de trabalho nos últimos 14 dias, e 70%+ delas efetivas (RIR interpretado ≤ 2);
 * - recuperação ok hoje (sem sono < 6 h nem disposição 1–2) e fora do deload.
 */
export function liberacaoTecnicas(args: {
  registros: RegistroSerie[];
  hojeIso: string;
  checkin?: { sono_h: number; prontidao: number } | null;
  deload?: boolean;
  e1rmPorExercicio?: Record<string, number>;
}): LiberacaoTecnicas {
  if (args.deload) return { liberado: false, texto: "Na semana de descanso ativo, as técnicas ficam de fora." };
  if (recuperacaoRuim(args.checkin)) {
    return { liberado: false, texto: "Hoje sua recuperação está baixa. Eu deixaria técnicas pra outro dia: séries normais bem feitas rendem mais." };
  }
  const limite = new Date(`${args.hojeIso}T12:00:00Z`).getTime() - 14 * 86400000;
  const recentes = args.registros.filter((r) => !ehSeriePreparatoria(r.tipo_serie) && new Date(r.executado_em).getTime() >= limite);
  const porGrupo = new Map<string, RegistroSerie[]>();
  for (const r of recentes) {
    const k = `${r.sessao_id}|${r.prescricao_id}`;
    porGrupo.set(k, [...(porGrupo.get(k) ?? []), r]);
  }
  let total = 0;
  let perto = 0;
  for (const [, ss] of porGrupo) {
    const ord = [...ss].sort((a, b) => a.numero - b.numero);
    const cals = calibrarSessao(ord, args.e1rmPorExercicio?.[ord[0]!.exercicio_id]);
    for (const c of cals) {
      total++;
      if (c.rir_interpretado <= 2) perto++;
    }
  }
  if (total < 6) {
    return { liberado: false, texto: "Primeiro quero ver umas séries suas chegando perto da falha. Com 1–2 reps sobrando de forma consistente, as técnicas passam a fazer sentido." };
  }
  if (perto / total < 0.7) {
    return {
      liberado: false,
      texto: `Nas últimas 2 semanas, ${perto} de ${total} séries ficaram a 1–2 reps da falha. Antes de técnica, vale levar as séries normais mais perto: é isso que mais faz crescer.`,
    };
  }
  return { liberado: true, texto: "Você tem chegado perto da falha com consistência e está recuperado. Se quiser, dá pra usar uma técnica na última série." };
}

// ───────── resumo semanal de séries efetivas ─────────

export type EfetivasGrupo = { grupo: GrupoMuscular; efetivas: number; total: number };

/** Séries diretas de trabalho da semana ISO, e quantas foram efetivas (RIR interpretado ≤ 3). */
export function seriesEfetivasSemana(
  registros: RegistroSerie[],
  exercicios: Pick<Exercicio, "id" | "grupo_primario">[],
  semanaIso: string,
  e1rmPorExercicio?: Record<string, number>,
): EfetivasGrupo[] {
  const da = registros.filter((r) => !ehSeriePreparatoria(r.tipo_serie) && isoWeekDe(new Date(r.executado_em)) === semanaIso);
  const porPresc = new Map<string, RegistroSerie[]>();
  for (const r of da) {
    const k = `${r.sessao_id}|${r.prescricao_id}|${r.exercicio_id}`;
    porPresc.set(k, [...(porPresc.get(k) ?? []), r]);
  }
  const out = new Map<GrupoMuscular, EfetivasGrupo>();
  for (const [, ss] of porPresc) {
    const ex = exercicios.find((e) => e.id === ss[0]!.exercicio_id);
    if (!ex) continue;
    const ord = [...ss].sort((a, b) => a.numero - b.numero);
    const cals = calibrarSessao(ord, e1rmPorExercicio?.[ex.id]);
    const cur = out.get(ex.grupo_primario) ?? { grupo: ex.grupo_primario, efetivas: 0, total: 0 };
    for (const c of cals) {
      cur.total++;
      if (c.rir_interpretado <= RIR_EFETIVO_MAX) cur.efetivas++;
    }
    out.set(ex.grupo_primario, cur);
  }
  return [...out.values()].sort((a, b) => b.total - a.total);
}

/** e1RM de referência por exercício, a partir do histórico (excluindo uma sessão, se pedido). */
export function e1rmReferencia(registros: RegistroSerie[], excluirSessaoId?: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of registros) {
    if (ehSeriePreparatoria(r.tipo_serie) || r.sessao_id === excluirSessaoId || r.reps > 12) continue;
    // Só séries declaradas perto da falha servem de referência (RIR ≤ 1): e1RM = carga × (1 + (reps + RIR)/30).
    if (r.rir_percebido > 1) continue;
    const e = e1rmEpley(r.carga_kg, r.reps + r.rir_percebido);
    if (e > (out[r.exercicio_id] ?? 0)) out[r.exercicio_id] = e;
  }
  return out;
}
