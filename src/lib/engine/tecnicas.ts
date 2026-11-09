/**
 * Técnicas avançadas enxutas (lote 4). Lógica pura e determinística: nada aqui grava.
 *
 * Regras:
 * - Opcionais: só entram se o usuário ativar (Editar treino / Editar durante o treino) e confirmar.
 * - Só na ÚLTIMA série de trabalho de isoladores ou exercícios em máquina/cabo.
 *   Nunca em exercício com top set + back-off, nem em semana de deload.
 * - Limite: LIMITE_TECNICAS_SESSAO por treino (bi-set conta 1, mesmo usando 2 exercícios).
 * - Carga: o Coach decide. Drop-set = −20 a 25% arredondado no degrau do exercício.
 *   Rest-pause, myo-reps, parciais e bi-set usam a mesma carga da série.
 * - Registro: carga_kg/reps da série = bloco principal. A extensão fica em `registro.tecnica`.
 *
 * Volume e recorde (conservador; ver docs/tecnicas-avancadas.md):
 * - e1RM/PR e progressão leem só o bloco principal. Drop, mini-séries e parciais nunca entram.
 * - Drop-set, rest-pause e myo-reps: a extensão soma +0,5 série direta no músculo principal
 *   (nada nos secundários). Parciais: +0. Bi-set: cada exercício conta as próprias séries.
 */
import { ehSemanaDeload, mesocicloEfetivo } from "@/lib/plan/mesociclo";
import { hojeIsoSaoPaulo } from "@/lib/plan/proxima-sessao";
import type { AppState, Exercicio, Prescricao, RegistroSerie, Sessao, TecnicaFinal } from "@/lib/domain";
import { ehSeriePreparatoria, incrementoCargaKg } from "@/lib/domain/enums";

export const LIMITE_TECNICAS_SESSAO = 2;
/** Bônus de volume da extensão (séries diretas), por técnica. */
export const VOLUME_EXTRA_TECNICA: Record<TecnicaFinal, number> = {
  drop_set: 0.5,
  rest_pause: 0.5,
  myo_reps: 0.5,
  parciais: 0,
  bi_set: 0,
};

export type InfoTecnica = {
  tipo: TecnicaFinal;
  nome: string;
  curto: string;
  quando: string;
  como: string[];
};

export const TECNICAS: InfoTecnica[] = [
  {
    tipo: "drop_set",
    nome: "Drop-set",
    curto: "Chega perto da falha, tira peso e continua.",
    quando: "Quando o tempo está curto ou você quer um estímulo extra no fim do exercício, sem somar séries.",
    como: [
      "Faça a última série normal, até 0–1 rep em reserva.",
      "Na hora, sem descanso, baixe a carga pro valor sugerido (cerca de 20–25% a menos).",
      "Continue até quase a falha de novo, com a mesma técnica.",
    ],
  },
  {
    tipo: "rest_pause",
    nome: "Rest-pause",
    curto: "Pausas curtas pra arrancar mais algumas reps.",
    quando: "Quando você quer mais reps difíceis com a mesma carga, em máquina ou cabo onde dá pra parar com segurança.",
    como: [
      "Faça a última série até 0–1 rep em reserva.",
      "Descanse 15–20 segundos segurando a posição ou soltando o aparelho.",
      "Faça mais reps até quase a falha. Repita a pausa mais uma vez (2 mini-blocos).",
    ],
  },
  {
    tipo: "myo_reps",
    nome: "Myo-reps",
    curto: "Uma série longa e várias mini-séries com poucas respirações de pausa.",
    quando: "Em isoladores com carga moderada (12–20 reps), pra economizar tempo mantendo séries efetivas.",
    como: [
      "Série de ativação no topo da faixa de reps, até 1 rep em reserva.",
      "Respire 3–5 vezes (uns 15 segundos) e faça 3–5 reps.",
      "Repita até 4 mini-séries. Pare quando não sair 3 reps.",
    ],
  },
  {
    tipo: "bi_set",
    nome: "Bi-set",
    curto: "Dois exercícios seguidos, sem descanso entre eles.",
    quando: "Pra ganhar tempo juntando dois isoladores, de preferência de músculos diferentes ou do mesmo músculo com ângulos diferentes.",
    como: [
      "Faça a última série deste exercício normalmente.",
      "Vá direto pro próximo exercício, sem descanso.",
      "Descanse só depois da série dele.",
    ],
  },
  {
    tipo: "parciais",
    nome: "Parciais no final",
    curto: "Depois da última rep completa, algumas reps parciais na parte alongada.",
    quando: "Quando você já não completa a amplitude toda, mas ainda dá pra mover na metade mais alongada do movimento.",
    como: [
      "Faça a última série até não completar mais uma rep inteira.",
      "Sem parar, faça 4–6 reps curtas na metade em que o músculo está alongado.",
      "Mantenha o controle: nada de tranco nem roubar com o corpo.",
    ],
  },
];

export function infoTecnica(t: TecnicaFinal): InfoTecnica {
  return TECNICAS.find((x) => x.tipo === t)!;
}

export function nomeTecnica(t: TecnicaFinal | null | undefined): string {
  return t ? infoTecnica(t).nome : "Nenhuma";
}

/** Isolador, ou exercício em máquina/cabo (seguro levar perto da falha). */
export function exercicioAceitaTecnica(ex: Pick<Exercicio, "composto" | "equipamento"> | undefined): boolean {
  if (!ex) return false;
  return !ex.composto || ex.equipamento === "maquina" || ex.equipamento === "cabo";
}

export function prescricaoAceitaTecnica(p: Pick<Prescricao, "tecnica">, ex: Exercicio | undefined): boolean {
  return p.tecnica !== "top_set_backoff" && exercicioAceitaTecnica(ex);
}

/** Deload: foco do plano, ou a semana de deload programado do bloco (semana real, por data). */
export function emDeload(state: Pick<AppState, "plano"> & Partial<Pick<AppState, "registros">>, hojeIso?: string | null): boolean {
  if (state.plano?.mesociclo.foco === "deload") return true;
  return ehSemanaDeload(mesocicloEfetivo(state, hojeIso ?? hojeIsoSaoPaulo()));
}

/** Drop: −20 a 25% no degrau do exercício (o mais perto de −22,5%), sempre abaixo da carga. */
export function cargaDrop(cargaKg: number, stepKg: number): number {
  if (!(cargaKg > 0)) return 0;
  const step = stepKg > 0 ? stepKg : 2.5;
  const alvo = cargaKg * 0.775;
  const lo = cargaKg * 0.75;
  const hi = cargaKg * 0.8;
  const cands: number[] = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9; k++) cands.push(k * step);
  let kg = cands.length ? cands.reduce((a, b) => (Math.abs(b - alvo) < Math.abs(a - alvo) ? b : a)) : Math.round(alvo / step) * step;
  if (kg >= cargaKg) kg = cargaKg - step;
  return Math.max(0, Math.round(kg * 100) / 100);
}

export type PlanoTecnica = {
  tipo: TecnicaFinal;
  nome: string;
  /** kg da extensão (drop) ou da série (demais). */
  carga_kg: number;
  texto: string;
  /** Campos de reps extras que o logger mostra. */
  campos: { rotulo: string; sugestao: number }[];
  /** Bi-set: descanso logo após a série é 0. */
  sem_descanso: boolean;
};

/** O que fazer na última série (determinístico). cargaSerieKg = kg da última série. */
export function planoTecnica(
  tipo: TecnicaFinal,
  cargaSerieKg: number,
  ex: Pick<Exercicio, "grupo_primario">,
  faixa: [number, number],
  parNome?: string,
): PlanoTecnica {
  const step = incrementoCargaKg(ex.grupo_primario);
  const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
  switch (tipo) {
    case "drop_set": {
      const kg = cargaDrop(cargaSerieKg, step);
      const reps = Math.max(4, Math.round(faixa[0] * 0.6));
      return {
        tipo, nome: "Drop-set", carga_kg: kg, sem_descanso: false,
        texto: `Acabou a série, baixe pra ${fmt(kg)} kg e continue sem descanso, até quase a falha (umas ${reps} reps).`,
        campos: [{ rotulo: `Reps no drop (${fmt(kg)} kg)`, sugestao: reps }],
      };
    }
    case "rest_pause": {
      const r = Math.max(2, Math.round(faixa[0] / 3));
      return {
        tipo, nome: "Rest-pause", carga_kg: cargaSerieKg, sem_descanso: false,
        texto: `Mesma carga (${fmt(cargaSerieKg)} kg). Pausa de 15–20 segundos e mais umas ${r} reps, duas vezes.`,
        campos: [{ rotulo: "Reps após a 1ª pausa", sugestao: r }, { rotulo: "Reps após a 2ª pausa", sugestao: Math.max(1, r - 1) }],
      };
    }
    case "myo_reps":
      return {
        tipo, nome: "Myo-reps", carga_kg: cargaSerieKg, sem_descanso: false,
        texto: `Mesma carga (${fmt(cargaSerieKg)} kg). Depois da ativação, 3–5 respirações e 3–5 reps, até 4 vezes. Pare quando não sair 3.`,
        campos: [1, 2, 3, 4].map((i) => ({ rotulo: `Mini-série ${i}`, sugestao: i <= 3 ? 4 : 3 })),
      };
    case "parciais":
      return {
        tipo, nome: "Parciais no final", carga_kg: cargaSerieKg, sem_descanso: false,
        texto: "Quando não completar mais uma rep inteira, faça 4–6 reps curtas na parte alongada.",
        campos: [{ rotulo: "Reps parciais", sugestao: 5 }],
      };
    case "bi_set":
      return {
        tipo, nome: "Bi-set", carga_kg: cargaSerieKg, sem_descanso: true,
        texto: parNome ? `Terminou, vá direto para ${parNome}, sem descanso. Descanse só depois da série dele.` : "Terminou, vá direto pro próximo exercício, sem descanso.",
        campos: [],
      };
  }
}

/** Volume extra (séries diretas) de um registro com técnica. */
export function volumeExtraDoRegistro(r: Pick<RegistroSerie, "tipo_serie" | "tecnica">): number {
  if (!r.tecnica || ehSeriePreparatoria(r.tipo_serie)) return 0;
  const feitas = r.tecnica.reps_extra.reduce((a, b) => a + b, 0);
  if (feitas <= 0) return 0;
  return VOLUME_EXTRA_TECNICA[r.tecnica.tipo] ?? 0;
}

// ───────── validação na sessão ─────────

type PrescLike = { exercicio_id: string; tecnica?: Prescricao["tecnica"]; tecnica_final?: TecnicaFinal | null };

/** Quantas técnicas a sessão usa (bi-set conta 1). */
export function contarTecnicas(ps: PrescLike[]): number {
  return ps.filter((p) => !!p.tecnica_final).length;
}

/**
 * Valida a lista ordenada (já na ordem final). null = ok.
 * Bi-set: o próximo exercício também precisa aceitar técnica e não ter outra.
 */
export function validarTecnicasSessao(state: Pick<AppState, "exercicios" | "plano"> & Partial<Pick<AppState, "registros">>, ps: PrescLike[]): string | null {
  const com = ps.filter((p) => p.tecnica_final);
  if (com.length === 0) return null;
  if (emDeload(state)) return "Na semana de descanso ativo (deload) as técnicas avançadas ficam desligadas.";
  if (com.length > LIMITE_TECNICAS_SESSAO) return `Use no máximo ${LIMITE_TECNICAS_SESSAO} técnicas por treino.`;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!;
    if (!p.tecnica_final) continue;
    const ex = state.exercicios.find((e) => e.id === p.exercicio_id);
    const nome = ex?.nome ?? "Esse exercício";
    if (!prescricaoAceitaTecnica({ tecnica: p.tecnica ?? "padrao" }, ex))
      return `${nome} não combina com técnica avançada. Elas ficam pra isoladores e máquinas.`;
    if (p.tecnica_final === "bi_set") {
      const prox = ps[i + 1];
      const exP = prox ? state.exercicios.find((e) => e.id === prox.exercicio_id) : undefined;
      if (!prox || !prescricaoAceitaTecnica({ tecnica: prox.tecnica ?? "padrao" }, exP))
        return `O bi-set de ${nome} precisa de um isolador ou máquina logo depois.`;
      if (prox.tecnica_final) return `O exercício depois do bi-set de ${nome} não pode ter outra técnica.`;
    }
  }
  return null;
}

/** Parceiro do bi-set (próximo exercício na ordem). */
export function parceiroBiSet(sessao: Pick<Sessao, "prescricoes">, prescricaoId: string): Prescricao | null {
  const ord = [...sessao.prescricoes].sort((a, b) => a.ordem - b.ordem);
  const i = ord.findIndex((p) => p.id === prescricaoId);
  return i >= 0 ? ord[i + 1] ?? null : null;
}

/** Linha de resumo pra confirmação ("Técnica na última série: …"). */
export function linhaTecnica(nomeEx: string, antes: TecnicaFinal | null | undefined, depois: TecnicaFinal | null | undefined): string | null {
  if ((antes ?? null) === (depois ?? null)) return null;
  if (!depois) return `${nomeEx}: sem técnica na última série`;
  return `${nomeEx}: ${nomeTecnica(depois)} na última série`;
}

/** Validação de servidor: nenhuma sessão passa do limite nem usa técnica onde não cabe. Estados antigos passam. */
export function validarTecnicasNoEstado(state: Pick<AppState, "sessoes" | "exercicios">): string | null {
  for (const s of state.sessoes) {
    const ps = s.prescricoes.filter((p) => p.tecnica_final);
    if (ps.length === 0) continue;
    if (ps.length > LIMITE_TECNICAS_SESSAO) return "técnicas acima do limite";
    for (const p of ps) {
      const ex = state.exercicios.find((e) => e.id === p.exercicio_id);
      if (!prescricaoAceitaTecnica(p, ex)) return "técnica fora de isolador/máquina";
    }
  }
  return null;
}
