/**
 * Revisão semanal (determinística, só leitura).
 *
 * No domingo, olha a semana que está fechando. Nos outros dias, a semana anterior. Junta:
 *  - treinos feitos x planejados e séries que valeram (perto da falha);
 *  - destaques: novos melhores 1RM estimados da semana;
 *  - pontos de atenção: músculos fora da faixa, exercícios parados (com a causa), sono e proteína;
 *  - próxima semana: fase do bloco, ajustes por músculo que vêm do feedback e o foco principal.
 * Nada muda aqui. Ajustes do dia já entram sozinhos; mudança de plano continua em Plano → Ajustar.
 */
import type { AppState, GrupoMuscular } from "@/lib/domain";
import { ehSeriePreparatoria, faixaVolume } from "@/lib/domain";
import { e1rmEpley } from "@/lib/engine/e1rm";
import { seriesEfetivasSemana } from "@/lib/engine/proximidade-falha";
import { isoWeekDe, isoWeekDoDia } from "@/lib/engine/volume";
import { GRUPO_LABEL } from "@/lib/labels";
import { ehSemanaDeload, mesocicloEfetivo } from "@/lib/plan/mesociclo";
import { metaProteina } from "@/lib/sono-agua/avaliacao";
import { GRUPOS_PRINCIPAIS } from "@/lib/plan/equilibrar-volume";
import { diagnosticarEstagnacao } from "./diagnostico";
import { ajusteDoMusculo } from "./volume-autorregulado";

export type RevisaoSemanal = {
  semana_iso: string;
  /** "3 a 9 de nov" */
  rotulo: string;
  treinos: { feitos: number; planejados: number };
  series: { valeram: number; total: number };
  destaques: string[];
  atencao: string[];
  proxima: string[];
  /** Uma linha pro /hoje e pro coach. */
  resumo: string;
};

const DIA = 86400000;
const addDias = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * DIA).toISOString().slice(0, 10);
const nomeG = (g: string) => (GRUPO_LABEL[g] ?? g).toLowerCase();
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Segunda-feira da semana a revisar: a atual no domingo, senão a anterior. */
export function segundaDaRevisao(hojeIso: string): string {
  const dow = new Date(hojeIso + "T12:00:00Z").getUTCDay(); // 0 = domingo
  const segundaAtual = addDias(hojeIso, dow === 0 ? -6 : 1 - dow);
  return dow === 0 ? segundaAtual : addDias(segundaAtual, -7);
}

function rotuloSemana(segunda: string): string {
  const fim = addDias(segunda, 6);
  const f = (iso: string, mes: boolean) =>
    new Date(iso + "T12:00:00Z").toLocaleDateString("pt-BR", { day: "numeric", ...(mes ? { month: "short" } : {}), timeZone: "UTC" }).replace(".", "");
  return `${f(segunda, segunda.slice(5, 7) !== fim.slice(5, 7))} a ${f(fim, true)}`;
}

export function revisarSemana(
  state: Pick<AppState, "registros" | "exercicios" | "estados" | "checkins" | "volumes_semanais" | "perfil" | "plano" | "feedbacks_musculo">,
  hojeIso: string,
): RevisaoSemanal | null {
  const segunda = segundaDaRevisao(hojeIso);
  const semana = isoWeekDoDia(segunda);
  const daSemana = state.registros.filter((r) => !ehSeriePreparatoria(r.tipo_serie) && isoWeekDe(new Date(r.executado_em)) === semana);
  if (daSemana.length === 0) return null;
  const nome = (id: string) => state.exercicios.find((e) => e.id === id)?.nome ?? id;

  const feitos = new Set(daSemana.map((r) => r.sessao_id)).size;
  const planejados = state.plano?.dias_por_semana ?? feitos;
  const ef = seriesEfetivasSemana(state.registros, state.exercicios, semana);
  const valeram = ef.reduce((a, g) => a + g.efetivas, 0);
  const total = ef.reduce((a, g) => a + g.total, 0);

  // Destaques: melhor 1RM estimado da semana acima do melhor de antes.
  const destaques: string[] = [];
  const antes = state.registros.filter((r) => !ehSeriePreparatoria(r.tipo_serie) && (r.executado_em ?? "").slice(0, 10) < segunda);
  const melhor = (rs: typeof antes, id: string) =>
    Math.max(0, ...rs.filter((r) => r.exercicio_id === id && r.carga_kg > 0 && r.reps > 0 && r.reps <= 15).map((r) => e1rmEpley(r.carga_kg, r.reps)));
  for (const id of new Set(daSemana.map((r) => r.exercicio_id))) {
    const agora = melhor(daSemana, id);
    const prev = melhor(antes, id);
    if (prev > 0 && agora > prev + 0.5) destaques.push(`${nome(id)}: novo melhor, 1RM estimado de ${fmt(agora)} kg (+${fmt(agora - prev)} kg).`);
  }
  if (total > 0 && valeram / total >= 0.8) destaques.push(`${valeram} de ${total} séries perto da falha: estímulo bem aproveitado.`);
  if (feitos >= planejados && planejados > 0) destaques.push(`Todos os ${planejados} treinos feitos.`);

  // Atenção.
  const atencao: string[] = [];
  if (feitos < planejados) atencao.push(`${feitos} de ${planejados} treinos feitos.`);
  if (total > 0 && valeram / total < 0.6) atencao.push(`Só ${valeram} de ${total} séries chegaram perto da falha. As outras renderam pouco.`);
  const vol = state.volumes_semanais.filter((v) => v.semana_iso === semana);
  const baixos: string[] = [];
  const altos: string[] = [];
  for (const g of GRUPOS_PRINCIPAIS) {
    const v = vol.find((x) => x.grupo === g)?.series_efetivas ?? 0;
    const f = faixaVolume(g);
    if (v > 0 && v < f.min) baixos.push(`${nomeG(g)} (${fmt(v)})`);
    if (v > f.max) altos.push(`${nomeG(g)} (${fmt(v)})`);
  }
  if (baixos.length) atencao.push(`Abaixo de 10 séries: ${baixos.join(", ")}.`);
  if (altos.length) atencao.push(`Acima de 20 séries: ${altos.join(", ")}.`);
  const parados = [...new Set(daSemana.map((r) => r.exercicio_id))]
    .map((id) => diagnosticarEstagnacao(state, id, hojeIso))
    .filter((d): d is NonNullable<typeof d> => !!d);
  for (const d of parados.slice(0, 3)) atencao.push(`${nome(d.exercicio_id)} parado há ${d.sessoes_sem_progresso} treinos: ${d.causas[0]!.titulo.toLowerCase()}.`);
  const cks = state.checkins.filter((c) => c.data >= segunda && c.data <= addDias(segunda, 6));
  const sonos = cks.map((c) => c.sono_h).filter((h) => h > 0);
  if (sonos.length >= 3) {
    const m = sonos.reduce((a, b) => a + b, 0) / sonos.length;
    if (m < 7) atencao.push(`Sono médio de ${fmt(m)} h. Abaixo de 7 h a recuperação e a força caem.`);
  }
  const meta = metaProteina(state.perfil?.peso_kg, state.perfil?.objetivo);
  const prot = cks.filter((c) => c.proteina_g != null).map((c) => c.proteina_g!);
  if (meta && prot.length >= 3) {
    const m = prot.reduce((a, b) => a + b, 0) / prot.length;
    if (m < meta.min_g) atencao.push(`Proteína média de ${Math.round(m)} g por dia (meta: ${meta.min_g}–${meta.max_g} g).`);
  }

  // Próxima semana.
  const proxima: string[] = [];
  const segundaProx = addDias(segunda, 7);
  const meso = mesocicloEfetivo(state, segundaProx < hojeIso ? hojeIso : segundaProx);
  if (meso) {
    if (ehSemanaDeload(meso)) proxima.push(`Semana ${meso.semana_atual} de ${meso.total_semanas}: semana leve (deload). RIR 3 em tudo, pra recuperar e voltar mais forte.`);
    else if (meso.semana_atual > meso.total_semanas) proxima.push("O bloco terminou. A proposta do próximo bloco está no Hoje, esperando a sua confirmação.");
    else proxima.push(`Semana ${meso.semana_atual} de ${meso.total_semanas}: seguimos subindo aos poucos.`);
  }
  const desde = state.plano?.mesociclo?.data_inicio ?? null;
  for (const g of [...new Set((state.feedbacks_musculo ?? []).map((f) => f.grupo))] as GrupoMuscular[]) {
    const a = ajusteDoMusculo(state.feedbacks_musculo ?? [], g, desde);
    if (a.ajuste !== 0 && a.motivo) proxima.push(`${GRUPO_LABEL[g] ?? g}: ${a.ajuste > 0 ? "+" : "−"}${Math.abs(a.ajuste)} ${Math.abs(a.ajuste) === 1 ? "série" : "séries"} no principal (${a.motivo}).`);
  }
  const foco = parados[0]?.causas[0];
  if (foco) proxima.push(`Foco: ${foco.acao}`);
  else if (total > 0 && valeram / total < 0.6) proxima.push("Foco: terminar cada série com no máximo 2–3 reps sobrando.");
  else if (feitos < planejados) proxima.push(`Foco: fazer os ${planejados} treinos. Constância rende mais que qualquer ajuste fino.`);

  const resumo =
    `${feitos}/${planejados} treinos, ${valeram}/${total} séries que valeram` +
    (destaques.some((d) => d.includes("novo melhor")) ? `, ${destaques.filter((d) => d.includes("novo melhor")).length} recorde(s)` : "") +
    (atencao.length ? `, ${atencao.length} ponto(s) de atenção` : "") +
    ".";

  return { semana_iso: semana, rotulo: rotuloSemana(segunda), treinos: { feitos, planejados }, series: { valeram, total }, destaques, atencao, proxima, resumo };
}
