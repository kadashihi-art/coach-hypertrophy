/**
 * Prioridade muscular: ajuda a escolher (sugestão a partir do histórico) e mostra o efeito
 * no plano antes de confirmar. Determinístico e só leitura: nada é gravado aqui.
 * Quem remonta é o motor, só depois de "Confirmar e remontar".
 */
import type { AppState, Exercicio, GrupoMuscular, Perfil } from "@/lib/domain";
import { GRUPO_LABEL } from "@/lib/labels";
import { gerarPlanoFromPerfil } from "./gerar-plano";
import { alvoSemanalGrupo, GRUPOS_PRINCIPAIS, volumeSemanalDasSessoes } from "./equilibrar-volume";

export const MAX_PRIORIDADES = 3;

export type MotivoPrioridade = NonNullable<Perfil["prioridade_motivo"]>;

export const MOTIVOS_PRIORIDADE: { id: MotivoPrioridade; label: string; dica: string }[] = [
  { id: "dificil_desenvolver", label: "Demora a crescer", dica: "Mais séries semanais e esse músculo treinado primeiro, quando você está descansado." },
  { id: "estetica", label: "Estética / proporção", dica: "Mais volume onde você quer ver mudança, sem passar de 20 séries por semana." },
  { id: "assimetria", label: "Um lado menor", dica: "Mais volume e, quando der, exercícios unilaterais. Comece pelo lado mais fraco." },
  { id: "esporte", label: "Esporte / função", dica: "Mais volume no músculo que o seu esporte mais exige." },
  { id: "outro", label: "Outro motivo", dica: "Mais séries semanais e o composto dele no início do treino." },
];

export type SugestaoPrioridade = { grupo: GrupoMuscular; pontos: number; motivos: string[] };

/**
 * Sugere até 3 músculos pelo histórico real:
 * - semanas recentes abaixo do piso de volume (séries que valem);
 * - exercícios travados (2+ sessões sem progresso) daquele músculo;
 * - progresso de e1RM bem abaixo dos outros grupos.
 * Sem histórico, devolve lista vazia (a tela explica como escolher).
 */
export function sugerirPrioridades(
  state: Pick<AppState, "volumes_semanais" | "estados" | "exercicios" | "perfil">,
  semanas = 4,
): SugestaoPrioridade[] {
  const perfil = state.perfil;
  if (!perfil) return [];
  const byId = new Map(state.exercicios.map((e) => [e.id, e]));
  const pontos = new Map<GrupoMuscular, { p: number; m: string[] }>();
  const add = (g: GrupoMuscular, p: number, m: string) => {
    if (!GRUPOS_PRINCIPAIS.includes(g)) return;
    const cur = pontos.get(g) ?? { p: 0, m: [] };
    cur.p += p;
    if (!cur.m.includes(m)) cur.m.push(m);
    pontos.set(g, cur);
  };

  // 1) Volume real das últimas semanas.
  const semanasIso = [...new Set(state.volumes_semanais.map((v) => v.semana_iso))].sort().slice(-semanas);
  if (semanasIso.length >= 2) {
    for (const g of GRUPOS_PRINCIPAIS) {
      const min = alvoSemanalGrupo(g, { ...perfil, prioridades_musculares: [] }).min;
      const abaixo = semanasIso.filter((sem) => {
        const v = state.volumes_semanais.find((x) => x.semana_iso === sem && x.grupo === g);
        return (v?.series_efetivas ?? 0) < min;
      }).length;
      if (abaixo >= Math.ceil(semanasIso.length / 2)) {
        add(g, abaixo, `Ficou abaixo de ${min} séries que valem em ${abaixo} das últimas ${semanasIso.length} semanas.`);
      }
    }
  }

  // 2) Exercícios travados.
  for (const est of state.estados) {
    const ex = byId.get(est.exercicio_id);
    if (!ex || est.primeira_sessao) continue;
    if (est.sessoes_sem_progresso >= 2) {
      add(ex.grupo_primario, 1 + Math.min(3, est.sessoes_sem_progresso - 1), `${ex.nome} está parado há ${est.sessoes_sem_progresso} treinos.`);
    }
  }

  return [...pontos.entries()]
    .map(([grupo, x]) => ({ grupo, pontos: x.p, motivos: x.m }))
    .sort((a, b) => b.pontos - a.pontos || GRUPOS_PRINCIPAIS.indexOf(a.grupo) - GRUPOS_PRINCIPAIS.indexOf(b.grupo))
    .slice(0, MAX_PRIORIDADES);
}

export type LinhaPrevia = { grupo: GrupoMuscular; antes: number; depois: number; prioritario: boolean };

/**
 * Prévia: séries que valem por semana em cada grupo principal, com e sem as prioridades.
 * Gera dois planos em memória (motor), sem gravar nada.
 */
export function previaPrioridades(
  perfil: Perfil,
  prioridades: GrupoMuscular[],
  catalog: Exercicio[],
): { linhas: LinhaPrevia[]; notas: string[] } {
  const semPri = { ...perfil, prioridades_musculares: [] };
  const comPri = { ...perfil, prioridades_musculares: prioridades.slice(0, MAX_PRIORIDADES) };
  const a = gerarPlanoFromPerfil(semPri, catalog);
  const b = gerarPlanoFromPerfil(comPri, catalog);
  // Com fase 2, a prévia mostra a fase 1 (a que começa agora).
  const ehFase1 = (s: { id: string }) => !s.id.startsWith("f2-");
  const va = volumeSemanalDasSessoes(a.sessoes.filter(ehFase1), catalog);
  const vb = volumeSemanalDasSessoes(b.sessoes.filter(ehFase1), catalog);
  const linhas = GRUPOS_PRINCIPAIS.map((g) => ({
    grupo: g,
    antes: Math.round((va.get(g)?.efetivo ?? 0) * 2) / 2,
    depois: Math.round((vb.get(g)?.efetivo ?? 0) * 2) / 2,
    prioritario: prioridades.includes(g),
  }));
  const notas: string[] = [];
  const texto = b.plano.justificativa.texto;
  const m = texto.match(/Com \d+ min por treino[^.]*\.[^.]*\./);
  if (m) notas.push(m[0]);
  return { linhas, notas };
}

export function nomeGrupo(g: string): string {
  return GRUPO_LABEL[g] ?? g;
}
