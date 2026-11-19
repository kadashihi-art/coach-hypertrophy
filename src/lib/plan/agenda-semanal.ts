/**
 * Agenda única do plano (determinística, só leitura): Hoje, faixa de dias e calendário usam esta.
 *
 * Regras (planos com `estrutura.fases`; planos antigos seguem a agenda legada de `pendente.ts`):
 * - Cada semana do plano (contada a partir da data de início) tem os treinos do microciclo da fase
 *   daquela semana, na ordem do microciclo, e só cai em dia de treino do microciclo. Folga continua folga.
 * - O que já aconteceu tira o treino da fila: feito, parcial, em andamento, pulado (o pulo vale pra
 *   semana) e treino marcado à mão num dia (ex.: "Trocar o treino de hoje").
 * - Treino que passou do dia sem ser feito nos últimos 7 dias não some: vira pendente e entra no
 *   próximo dia de treino livre; os seguintes andam pra frente, na mesma ordem. Mais antigo que isso,
 *   a semana recomeça (uma pausa longa não empurra o plano todo).
 * - Dias limpos, dias com treino feito/em andamento/pulado e dias marcados à mão não recebem outro treino.
 * - Passado não é inventado: antes de hoje só aparece o que aconteceu de verdade.
 * - Com `perfil.dias_treino_semana` (ex.: seg, ter, qui, sex, sáb), os treinos caem nesses dias da
 *   semana, na ordem do microciclo; sem isso, valem as posições do microciclo contadas da data de início.
 */
import type { AppState, FasePlano, Perfil, Plano, Sessao } from "@/lib/domain";

const DIA_MS = 86400_000;
const somaDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DIA_MS);

export type OcorrenciaAgenda = {
  sessao_id: string;
  data: string;
  /** Semana do plano (1-based). */
  semana: number;
  /** Dia em que o treino estava previsto, quando já passou (pendente). */
  pendente_de: string | null;
  /** Marcado à mão nesse dia. */
  fixo: boolean;
};

export type AgendaSemanal = {
  /** De hoje em diante, em ordem de data. */
  ocorrencias: OcorrenciaAgenda[];
};

function faseDaSemana(fases: FasePlano[], semana: number): FasePlano {
  let atual = fases[0]!;
  for (const f of fases) {
    if (semana >= f.semana_inicio) atual = f;
    else break;
  }
  return atual;
}

export function semanaDoPlano(dataInicio: string, iso: string): number {
  return Math.floor(diasEntre(dataInicio, iso) / 7) + 1;
}

/** Dia da semana (0 = domingo) de uma data AAAA-MM-DD. */
export const diaDaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Dias da semana escolhidos pelo usuário (sem repetição, em ordem), ou null. */
export function diasEscolhidos(perfil: Pick<Perfil, "dias_treino_semana"> | null | undefined): number[] | null {
  const d = perfil?.dias_treino_semana;
  return d?.length ? [...new Set(d)].sort((a, b) => a - b) : null;
}

/**
 * Dia de treino: pelos dias da semana escolhidos, se houver; senão pelo microciclo da fase daquela
 * semana (antes do início: nunca).
 */
export function ehDiaDeTreino(plano: Pick<Plano, "mesociclo" | "estrutura">, iso: string, dias?: number[] | null): boolean {
  const ini = plano.mesociclo?.data_inicio;
  const fases = plano.estrutura?.fases;
  if (!ini || !fases?.length || iso < ini) return false;
  if (dias?.length) return dias.includes(diaDaSemana(iso));
  const semana = semanaDoPlano(ini, iso);
  const off = diasEntre(ini, iso) % 7;
  return faseDaSemana(fases, semana).microciclo.some((d) => d.dia === off && !!d.sessao_id);
}

const ehBase = (s: Sessao) => !s.id.includes("#");
const baseId = (id: string) => id.split("#")[0]!;

export function montarAgendaSemanal(
  state: Pick<AppState, "sessoes" | "plano"> & Partial<AppState>,
  hoje: string | null | undefined,
): AgendaSemanal | null {
  const plano = state.plano;
  const ini = plano?.mesociclo?.data_inicio;
  const fases = plano?.estrutura?.fases;
  if (!hoje || !plano || !ini || !fases?.length) return null;

  const validos = new Set(state.sessoes.filter((s) => ehBase(s) && (s.prescricoes?.length ?? 0) > 0).map((s) => s.id));
  const totalSemanas = Math.max(plano.mesociclo.total_semanas || 6, ...fases.map((f) => f.semana_inicio + f.semanas - 1));
  const inicioSemana = (w: number) => somaDias(ini, (w - 1) * 7);
  const dias = diasEscolhidos(state.perfil);
  // Com dias escolhidos: o k-ésimo treino da semana do plano cai no k-ésimo dia escolhido dela.
  const diasDaSemanaDoPlano = (w: number) =>
    dias ? Array.from({ length: 7 }, (_, i) => somaDias(inicioSemana(w), i)).filter((d) => dias.includes(diaDaSemana(d))) : [];
  const daSemana = (w: number) => {
    const itens = [...faseDaSemana(fases, w).microciclo]
      .filter((d) => !!d.sessao_id && validos.has(d.sessao_id))
      .sort((a, b) => a.dia - b.dia);
    if (!dias) return itens.map((d) => ({ id: d.sessao_id!, previsto: somaDias(inicioSemana(w), d.dia) }));
    const datas = diasDaSemanaDoPlano(w);
    const ultimo = datas[datas.length - 1] ?? somaDias(inicioSemana(w), 6);
    return itens.map((d, k) => ({ id: d.sessao_id!, previsto: datas[k] ?? ultimo }));
  };

  const inicio = hoje < ini ? ini : hoje;
  const semanaAtual = semanaDoPlano(ini, inicio);
  const semanaFila = Math.max(1, semanaAtual - 1);
  const limpos = new Set(state.dias_limpos ?? []);

  // O que já aconteceu (ou está fixo) ocupa o dia e tira o treino da fila.
  const ocupado = new Set<string>();
  const fixos = new Map<string, string>();
  const consumo: Array<{ id: string; data: string }> = [];
  for (const s of state.sessoes) {
    if (!s.data) continue;
    const feito = s.status === "concluida" || s.status === "parcial" || s.status === "em_andamento";
    if (feito || s.status === "pulada") {
      ocupado.add(s.data);
      consumo.push({ id: baseId(s.id), data: s.data });
    } else if (s.status === "planejada" && s.data_manual && s.data >= inicio && ehBase(s) && validos.has(s.id)) {
      fixos.set(s.data, s.id);
      consumo.push({ id: s.id, data: s.data });
    }
  }
  consumo.sort((a, b) => a.data.localeCompare(b.data));

  const fila: Array<{ id: string; previsto: string }> = [];
  const consumir = (ate: string, desde: string) => {
    for (const ev of consumo) {
      if (ev.data < desde || ev.data > ate) continue;
      const i = fila.findIndex((f) => f.id === ev.id);
      if (i >= 0) fila.splice(i, 1);
    }
  };
  for (let w = semanaFila; w <= semanaAtual; w++) fila.push(...daSemana(w));
  consumir(somaDias(inicioSemana(semanaAtual), 6), inicioSemana(semanaFila));
  // Só anda pra frente o que foi perdido nos últimos 7 dias. Mais antigo que isso (ex.: uma semana
  // inteira de pausa), a semana recomeça em vez de empurrar o plano todo.
  const limitePendente = somaDias(inicio, -7);
  for (let i = fila.length - 1; i >= 0; i--) if (fila[i]!.previsto < limitePendente) fila.splice(i, 1);

  const fimPlano = somaDias(inicioSemana(totalSemanas), 6);
  // Depois do fim do plano, a fila que sobrou usa o padrão da última fase.
  const ehTreino = (d: string) =>
    dias
      ? ehDiaDeTreino(plano, d, dias)
      : d <= fimPlano
        ? ehDiaDeTreino(plano, d)
        : ehDiaDeTreino(plano, somaDias(inicioSemana(totalSemanas), diasEntre(ini, d) % 7));
  const ocorrencias: OcorrenciaAgenda[] = [];
  let semana = semanaAtual;
  for (let d = inicio, n = 0; n < 7 * (totalSemanas + 6); d = somaDias(d, 1), n++) {
    const w = semanaDoPlano(ini, d);
    if (w > semana) {
      semana = w;
      if (w <= totalSemanas) {
        fila.push(...daSemana(w));
        consumir(somaDias(inicioSemana(w), 6), inicioSemana(w));
      }
    }
    if (d > fimPlano && fila.length === 0) break;
    if (limpos.has(d)) continue;
    const fixo = fixos.get(d);
    if (fixo) {
      ocorrencias.push({ sessao_id: fixo, data: d, semana: w, pendente_de: null, fixo: true });
      continue;
    }
    if (ocupado.has(d) || !ehTreino(d)) continue;
    const it = fila.shift();
    if (!it) continue;
    ocorrencias.push({ sessao_id: it.id, data: d, semana: w, pendente_de: it.previsto < hoje ? it.previsto : null, fixo: false });
  }
  return { ocorrencias };
}

/**
 * Dias da semana (0 = domingo) em que o microciclo da semana atual põe treino, contando da data de
 * início do plano. Serve de sugestão inicial na escolha dos dias.
 */
export function diasDoMicrociclo(plano: Pick<Plano, "mesociclo" | "estrutura"> | null | undefined, hoje: string): number[] {
  const ini = plano?.mesociclo?.data_inicio;
  const fases = plano?.estrutura?.fases;
  if (!ini || !fases?.length) return [];
  const w = semanaDoPlano(ini, hoje < ini ? ini : hoje);
  const inicio = somaDias(ini, (w - 1) * 7);
  return faseDaSemana(fases, w)
    .microciclo.filter((d) => !!d.sessao_id)
    .map((d) => diaDaSemana(somaDias(inicio, d.dia)))
    .sort((a, b) => a - b);
}

/** Quantos treinos o microciclo da semana atual tem. */
export function treinosNaSemana(plano: Pick<Plano, "mesociclo" | "estrutura"> | null | undefined, hoje: string): number {
  const ini = plano?.mesociclo?.data_inicio;
  const fases = plano?.estrutura?.fases;
  if (!fases?.length) return 0;
  const w = ini ? semanaDoPlano(ini, hoje < ini ? ini : hoje) : 1;
  return faseDaSemana(fases, w).microciclo.filter((d) => !!d.sessao_id).length;
}
