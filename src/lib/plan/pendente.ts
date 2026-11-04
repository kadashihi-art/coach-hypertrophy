/**
 * Treino pendente: um treino planejado que passou da data sem ser feito NÃO é pulado.
 * A sequência anda por treino (ordem do plano), não por data: o pendente vira o treino de hoje
 * e os seguintes ocupam, em ordem, os próximos dias de treino. Se faltar dia no fim, o plano
 * ganha dias novos no mesmo ritmo da semana (sem buraco no fim do mesociclo).
 *
 * Calculado só na leitura (determinístico). Nada é gravado: s.data salvo continua igual.
 * Pulo explícito (status "pulada") é respeitado no dia em que foi pulado: o dia continua
 * aparecendo como pulado. Depois que o dia passa, o treino volta na próxima rodada do plano
 * (fila, na ordem do plano). Sem isso, pular treinos esvaziava a agenda dali para frente.
 * Marcações manuais do calendário também: dia limpo nunca recebe treino, e treino com data
 * marcada à mão (data_manual, futura) fica no dia. Treino tirado de um dia (Limpar dia) volta
 * para a fila sem data e entra no próximo dia de treino livre, na ordem do plano.
 */
import type { AppState, Sessao } from "@/lib/domain";
import { sessoesDoPlano } from "./proxima-sessao";

function somaDias(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
}

export type Pendente = { sessao_id: string; nome: string; data_original: string };

export type AgendaEfetiva = {
  /** Mesmas sessões do estado, com `data` efetiva nas planejadas que andaram. Só leitura. */
  sessoes: Sessao[];
  /** Treinos que passaram da data sem ser feitos (na ordem do plano). */
  pendentes: Pendente[];
  /** Dias já passados em que um treino foi pulado (o treino em si voltou para a fila). Só para mostrar. */
  pulos: Sessao[];
};

/** Sessões para o calendário e a faixa: agenda + marcas de pulo dos dias que já passaram. */
export function sessoesDoCalendario(a: AgendaEfetiva): Sessao[] {
  return [...a.sessoes, ...a.pulos];
}

export function agendaEfetiva(
  state: Pick<AppState, "sessoes" | "plano"> & Partial<AppState>,
  hoje: string | null | undefined,
): AgendaEfetiva {
  const base = { sessoes: state.sessoes, pendentes: [] as Pendente[], pulos: [] as Sessao[] };
  if (!hoje || !state.plano?.mesociclo?.data_inicio) return base;
  const limpos = new Set(state.dias_limpos ?? []);
  const ordered = sessoesDoPlano(state as AppState, hoje);
  // Marcação manual no calendário (data futura) fica onde o usuário pôs.
  const manualFixa = (s: Sessao) => !!s.data_manual && !!s.data && s.data >= hoje;
  // Pulado em dia que já passou: volta na próxima rodada (depois dos planejados, na ordem do plano).
  const voltaDoPulo = (s: Sessao) => s.status === "pulada" && !!s.data && s.data < hoje;
  const planejadas = ordered.filter((s) => s.status === "planejada" && !manualFixa(s));
  const voltam = ordered.filter(voltaDoPulo);
  const fila = [...planejadas, ...voltam];
  const pendentes = planejadas.filter((s) => !!s.data && s.data < hoje);
  const semData = planejadas.filter((s) => !s.data);
  const emDiaLimpo = planejadas.filter((s) => !!s.data && limpos.has(s.data));
  if (pendentes.length === 0 && semData.length === 0 && emDiaLimpo.length === 0 && voltam.length === 0) return base;

  // Dias que a agenda não pode usar: limpos, com treino feito/em andamento, ou marcados à mão.
  const bloqueado = new Set<string>(limpos);
  for (const s of state.sessoes) {
    if (!s.data) continue;
    if (s.status === "concluida" || s.status === "parcial" || s.status === "em_andamento" || s.status === "pulada" || manualFixa(s)) {
      bloqueado.add(s.data);
    }
  }
  const datas = planejadas.map((s) => s.data).filter((d): d is string => !!d && d >= hoje && !bloqueado.has(d));
  if (pendentes.length > 0) {
    let ini = hoje;
    while (bloqueado.has(ini)) ini = somaDias(ini, 1);
    datas.push(ini);
  }
  const slots = [...new Set(datas)].sort();
  const porSemana = Math.max(1, state.plano.dias_por_semana ?? 3);
  if (slots.length === 0) {
    let d = hoje;
    while (bloqueado.has(d)) d = somaDias(d, 1);
    slots.push(d);
  }
  // Ritmo da semana: conta também os dias de treino que já passaram (quando a fila inteira anda).
  const historico = [...new Set(state.sessoes.map((s) => s.data).filter((d): d is string => !!d && d < slots[0]!))].sort();
  while (slots.length < fila.length) {
    const ritmo = [...historico, ...slots];
    const ref = ritmo[ritmo.length - porSemana];
    const ultimo = slots[slots.length - 1]!;
    let novo = ref ? somaDias(ref, 7) : somaDias(ultimo, 1);
    if (novo <= ultimo) novo = somaDias(ultimo, 1);
    while (bloqueado.has(novo)) novo = somaDias(novo, 1);
    slots.push(novo);
  }
  const nova = new Map<string, string>();
  fila.forEach((s, i) => nova.set(s.id, slots[i]!));
  const volta = new Set(voltam.map((s) => s.id));
  return {
    sessoes: state.sessoes.map((s) =>
      volta.has(s.id)
        ? { ...s, data: nova.get(s.id)!, status: "planejada" as const, data_manual: undefined }
        : nova.has(s.id) && nova.get(s.id) !== s.data
          ? { ...s, data: nova.get(s.id)! }
          : s,
    ),
    pendentes: pendentes.map((s) => ({ sessao_id: s.id, nome: s.nome, data_original: s.data! })),
    pulos: voltam.map((s) => ({ ...s, id: `${s.id}#pulo-${s.data}` })),
  };
}

/** "Treino de ontem ficou pendente" / "Treino de 02/11 ficou pendente" / "2 treinos ficaram pendentes". */
export function avisoPendente(pendentes: Pendente[], hoje: string): { titulo: string; texto: string } | null {
  const p = pendentes[0];
  if (!p) return null;
  const quando = (d: string) => (d === somaDias(hoje, -1) ? "ontem" : `${d.slice(8, 10)}/${d.slice(5, 7)}`);
  const titulo =
    pendentes.length === 1
      ? `Treino de ${quando(p.data_original)} ficou pendente`
      : `${pendentes.length} treinos ficaram pendentes`;
  const texto =
    pendentes.length === 1
      ? `O ${p.nome} não foi feito, então ele é o próximo. Os outros treinos andam um dia de treino pra frente, na mesma ordem.`
      : `O próximo é o ${p.nome}, de ${quando(p.data_original)}. Nenhum treino foi pulado: os seguintes andam pra frente, na mesma ordem.`;
  return { titulo, texto };
}
