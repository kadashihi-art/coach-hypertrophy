/**
 * Fechamento de bloco (determinístico, só leitura).
 *
 * Na última semana do bloco (ou depois que ele terminou), cruza por músculo:
 *  - volume feito: média semanal de séries que valem nas semanas de trabalho do bloco;
 *  - progresso: variação do 1RM estimado dos exercícios do músculo (início × fim do bloco);
 *  - recuperação: feedback por músculo (bem dolorido / articulação).
 * E propõe o ajuste de volume do próximo bloco (séries efetivas por semana):
 *  - sinais de excesso (2+ vezes dolorido/articulação) → −2;
 *  - progrediu 2%+ → mantém (não mexe no que funciona);
 *  - pouco progresso com o volume cumprido e recuperação ok → +2 (até o teto de 20);
 *  - pouco progresso sem cumprir o volume → mantém (o problema não é o plano);
 *  - sem dados → mantém.
 * O ajuste acumula no perfil (`ajuste_volume_musculo`, −4…+4). Nada muda sem "Confirmar e começar":
 * quem remonta é o gerador, e o novo bloco começa na data confirmada.
 */
import type { AppState, Exercicio, GrupoMuscular, Perfil, RegistroSerie } from "@/lib/domain";
import { ehSeriePreparatoria, faixaVolume } from "@/lib/domain";
import { e1rmEpley } from "@/lib/engine/e1rm";
import { voltarParaBase } from "@/lib/engine/rampa-volume";
import { isoWeekDoDia } from "@/lib/engine/volume";
import { GRUPO_LABEL } from "@/lib/labels";
import { alvoSemanalGrupo, GRUPOS_PRINCIPAIS, volumeSemanalDasSessoes } from "@/lib/plan/equilibrar-volume";
import { gerarPlanoFromPerfil } from "@/lib/plan/gerar-plano";
import { inicioDoBloco, mesocicloEfetivo } from "@/lib/plan/mesociclo";
import { pontosHistoricoPorExercicio } from "@/lib/plan/sugestao-exercicio";
import { ocorrenciasDoMusculo } from "./volume-autorregulado";

export const AJUSTE_BLOCO = 2;
export const AJUSTE_ACUMULADO_MAX = 4;
/** Progresso mínimo do 1RM estimado no bloco pra contar como "respondeu". */
export const PROGRESSO_BOM_PCT = 2;

export type VereditoMusculo = "respondeu" | "pouco_progresso" | "excesso" | "faltou_volume" | "no_teto" | "sem_dados";

export type AnaliseMusculo = {
  grupo: GrupoMuscular;
  /** Média semanal de séries efetivas nas semanas de trabalho (null sem registro). */
  volume_medio: number | null;
  /** Variação % do 1RM estimado (média dos exercícios do músculo). null sem dados. */
  progresso_pct: number | null;
  veredito: VereditoMusculo;
  /** Mudança proposta pro próximo bloco (séries/semana). */
  delta: number;
  texto: string;
};

export type FechamentoBloco = {
  fase: "ultima_semana" | "terminou";
  semana: number;
  total: number;
  inicio: string;
  musculos: AnaliseMusculo[];
  /** Novo ajuste acumulado do perfil (só entradas ≠ 0). */
  ajuste_volume_musculo: Partial<Record<GrupoMuscular, number>>;
  resumo: string;
};

const DIA = 86400000;
const addDias = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * DIA).toISOString().slice(0, 10);
const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const nomeG = (g: string) => GRUPO_LABEL[g] ?? g;
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

const e1rmSerie = (r: RegistroSerie) => e1rmEpley(r.carga_kg, r.reps + Math.min(3, Math.max(0, r.rir_percebido)));

/** Variação % do 1RM estimado do exercício no período (precisa de 3+ sessões). */
export function progressoDoExercicio(registros: RegistroSerie[], exercicioId: string, desde: string, ate: string): number | null {
  const por = new Map<string, { dia: string; melhor: number }>();
  for (const r of registros) {
    if (r.exercicio_id !== exercicioId || ehSeriePreparatoria(r.tipo_serie) || r.carga_kg <= 0 || r.reps <= 0 || r.reps > 15) continue;
    const dia = (r.executado_em ?? "").slice(0, 10);
    if (!dia || dia < desde || dia > ate) continue;
    const cur = por.get(r.sessao_id + dia) ?? { dia, melhor: 0 };
    cur.melhor = Math.max(cur.melhor, e1rmSerie(r));
    por.set(r.sessao_id + dia, cur);
  }
  const s = [...por.values()].sort((a, b) => a.dia.localeCompare(b.dia)).map((x) => x.melhor);
  if (s.length < 3) return null;
  const n = s.length >= 4 ? 2 : 1;
  const ini = media(s.slice(0, n));
  const fim = media(s.slice(-n));
  return ini > 0 ? (fim / ini - 1) * 100 : null;
}

export function fecharBloco(
  state: Pick<AppState, "plano" | "registros" | "exercicios" | "volumes_semanais" | "feedbacks_musculo" | "perfil">,
  hojeIso: string,
): FechamentoBloco | null {
  const perfil = state.perfil;
  const meso = mesocicloEfetivo(state, hojeIso);
  const inicio = inicioDoBloco(state);
  if (!perfil || !meso || !inicio || meso.semana_atual < meso.total_semanas) return null;
  const fase = meso.semana_atual === meso.total_semanas ? "ultima_semana" : "terminou";

  // Janela da análise: o bloco. Se ele terminou faz tempo e o plano não foi refeito, as últimas
  // `total` semanas (dados de meses atrás não dizem como você responde hoje).
  const atrasado = meso.semana_atual > meso.total_semanas + 1;
  const desde = atrasado ? addDias(hojeIso, -7 * meso.total_semanas) : inicio;
  // Semanas de trabalho já fechadas (sem a semana leve do bloco).
  const semanaAtual = isoWeekDoDia(hojeIso);
  const semanaLeve = isoWeekDoDia(addDias(inicio, 7 * (meso.total_semanas - 1)));
  const semanas: string[] = [];
  for (let d = desde; isoWeekDoDia(d) < semanaAtual; d = addDias(d, 7)) {
    const w = isoWeekDoDia(d);
    if (w !== semanaLeve && !semanas.includes(w)) semanas.push(w);
  }
  const treinadas = semanas.filter((w) => state.volumes_semanais.some((v) => v.semana_iso === w && v.series_efetivas > 0));
  const atual = perfil.ajuste_volume_musculo ?? {};
  const novo: Partial<Record<GrupoMuscular, number>> = {};

  const musculos: AnaliseMusculo[] = GRUPOS_PRINCIPAIS.map((grupo) => {
    const volume_medio = treinadas.length
      ? media(treinadas.map((w) => state.volumes_semanais.find((v) => v.semana_iso === w && v.grupo === grupo)?.series_efetivas ?? 0))
      : null;
    const progs = state.exercicios
      .filter((e) => e.grupo_primario === grupo)
      .map((e) => progressoDoExercicio(state.registros, e.id, desde, hojeIso))
      .filter((p): p is number => p != null);
    const progresso_pct = progs.length ? Math.round(media(progs) * 10) / 10 : null;
    const negativos = ocorrenciasDoMusculo(state.feedbacks_musculo ?? [], grupo, desde).filter((o) => o.delta < 0).length;
    const piso = alvoSemanalGrupo(grupo, { ...perfil, prioridades_musculares: [] }).min;
    const acumulado = atual[grupo] ?? 0;

    let veredito: VereditoMusculo;
    let delta = 0;
    let texto: string;
    if (negativos >= 2) {
      veredito = "excesso";
      delta = -AJUSTE_BLOCO;
      texto = `Chegou dolorido ou incomodou a articulação ${negativos} vezes: passou do que você recupera. Tiro ${AJUSTE_BLOCO} séries por semana.`;
    } else if (progresso_pct == null) {
      veredito = "sem_dados";
      texto = "Poucos treinos registrados pra concluir. Mantenho o volume.";
    } else if (progresso_pct >= PROGRESSO_BOM_PCT) {
      veredito = "respondeu";
      texto = `Força estimada subiu ${fmt(progresso_pct)}%${volume_medio != null ? ` com ~${fmt(volume_medio)} séries por semana` : ""}. Não mexo no que funciona.`;
    } else if (volume_medio != null && volume_medio < piso - 2) {
      veredito = "faltou_volume";
      texto = `Pouco progresso (${fmt(progresso_pct)}%), mas você fez ~${fmt(volume_medio)} séries por semana, abaixo das ${piso} planejadas. Antes de subir o volume, vale cumprir o que já está no plano.`;
    } else if ((volume_medio ?? 0) >= faixaVolume(grupo).max - 1) {
      veredito = "no_teto";
      texto = `Pouco progresso (${fmt(progresso_pct)}%) já com ~${fmt(volume_medio ?? 0)} séries por semana. Mais volume não resolve: vale trocar os exercícios parados por uma variação.`;
    } else {
      veredito = "pouco_progresso";
      delta = AJUSTE_BLOCO;
      texto = `Pouco progresso (${fmt(progresso_pct)}%) com o volume cumprido e recuperação em dia. Subo ${AJUSTE_BLOCO} séries por semana.`;
    }
    const total = Math.max(-AJUSTE_ACUMULADO_MAX, Math.min(AJUSTE_ACUMULADO_MAX, acumulado + delta));
    if (total !== acumulado + delta) {
      delta = total - acumulado;
      if (delta === 0) texto += " (Já está no limite de ajuste: mantenho.)";
    }
    if (total !== 0) novo[grupo] = total;
    return { grupo, volume_medio: volume_medio != null ? Math.round(volume_medio * 10) / 10 : null, progresso_pct, veredito, delta, texto };
  });

  const sobem = musculos.filter((m) => m.delta > 0).map((m) => nomeG(m.grupo).toLowerCase());
  const descem = musculos.filter((m) => m.delta < 0).map((m) => nomeG(m.grupo).toLowerCase());
  const bem = musculos.filter((m) => m.veredito === "respondeu").length;
  const partes = [
    `${bem} de ${musculos.length} músculos responderam bem`,
    sobem.length ? `mais volume em ${sobem.join(", ")}` : null,
    descem.length ? `menos volume em ${descem.join(", ")}` : null,
  ].filter(Boolean);
  return {
    fase,
    semana: meso.semana_atual,
    total: meso.total_semanas,
    inicio,
    musculos,
    ajuste_volume_musculo: novo,
    resumo: partes.join("; ") + ".",
  };
}

export type PreviaProximoBloco = {
  volume: { grupo: GrupoMuscular; antes: number; depois: number }[];
  saem: string[];
  entram: string[];
};

/**
 * Prévia do próximo bloco: gera o plano em memória (mesmo cálculo de "remontar", com a memória dos
 * exercícios) e compara com o plano atual. Não grava nada.
 */
export function previaProximoBloco(
  state: Pick<AppState, "sessoes" | "registros" | "estados" | "exercicios">,
  perfil: Perfil,
  ajuste: Partial<Record<GrupoMuscular, number>>,
  catalog: Exercicio[],
  hojeIso: string,
): PreviaProximoBloco {
  const historico = state.registros.length
    ? pontosHistoricoPorExercicio(catalog, { registros: state.registros, estados: state.estados, hojeIso })
    : undefined;
  const novo = gerarPlanoFromPerfil({ ...perfil, ajuste_volume_musculo: ajuste }, catalog, { historico });
  const fase1 = (s: { id: string }) => !s.id.startsWith("f2-");
  const atuais = state.sessoes.filter(fase1).map((s) => ({ prescricoes: voltarParaBase(s.prescricoes) }));
  const va = volumeSemanalDasSessoes(atuais, catalog);
  const vb = volumeSemanalDasSessoes(novo.sessoes.filter(fase1), catalog);
  const r = (n: number) => Math.round(n * 2) / 2;
  const idsA = new Set(atuais.flatMap((s) => s.prescricoes.map((p) => p.exercicio_id)));
  const idsB = new Set(novo.sessoes.filter(fase1).flatMap((s) => s.prescricoes.map((p) => p.exercicio_id)));
  const nome = (id: string) => catalog.find((e) => e.id === id)?.nome ?? id;
  return {
    volume: GRUPOS_PRINCIPAIS.map((g) => ({ grupo: g, antes: r(va.get(g)?.efetivo ?? 0), depois: r(vb.get(g)?.efetivo ?? 0) })).filter((l) => l.antes !== l.depois),
    saem: [...idsA].filter((id) => !idsB.has(id)).map(nome),
    entram: [...idsB].filter((id) => !idsA.has(id)).map(nome),
  };
}
