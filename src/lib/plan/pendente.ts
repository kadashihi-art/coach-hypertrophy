/**
 * Treino pendente: um treino planejado que passou da data sem ser feito NÃO é pulado.
 * A sequência anda por treino (ordem do plano), não por data: o pendente vira o treino de hoje
 * e os seguintes ocupam, em ordem, os próximos dias de treino. Se faltar dia no fim, o plano
 * ganha dias novos no mesmo ritmo da semana (sem buraco no fim do mesociclo).
 *
 * Calculado só na leitura (determinístico). Nada é gravado: s.data salvo continua igual.
 * Pulo explícito (status "pulada") é respeitado: não entra na fila e mantém a data.
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
};

export function agendaEfetiva(
  state: Pick<AppState, "sessoes" | "plano"> & Partial<AppState>,
  hoje: string | null | undefined,
): AgendaEfetiva {
  const base = { sessoes: state.sessoes, pendentes: [] as Pendente[] };
  if (!hoje || !state.plano?.mesociclo?.data_inicio) return base;
  const ordered = sessoesDoPlano(state as AppState, hoje);
  const fila = ordered.filter((s) => s.status === "planejada" && !!s.data);
  const pendentes = fila.filter((s) => s.data! < hoje);
  if (pendentes.length === 0) return base;

  // Hoje já tem treino feito/em andamento? O pendente vai para o próximo dia.
  const ocupadoHoje = state.sessoes.some(
    (s) => s.data === hoje && (s.status === "concluida" || s.status === "parcial" || s.status === "em_andamento"),
  );
  const inicio = ocupadoHoje ? somaDias(hoje, 1) : hoje;
  const slots = [...new Set([inicio, ...fila.map((s) => s.data!).filter((d) => d >= inicio)])].sort();
  const porSemana = Math.max(1, state.plano.dias_por_semana ?? 3);
  while (slots.length < fila.length) {
    const ref = slots[slots.length - porSemana];
    const ultimo = slots[slots.length - 1]!;
    let novo = ref ? somaDias(ref, 7) : somaDias(ultimo, 1);
    if (novo <= ultimo) novo = somaDias(ultimo, 1);
    slots.push(novo);
  }
  const nova = new Map<string, string>();
  fila.forEach((s, i) => nova.set(s.id, slots[i]!));
  return {
    sessoes: state.sessoes.map((s) => (nova.has(s.id) && nova.get(s.id) !== s.data ? { ...s, data: nova.get(s.id)! } : s)),
    pendentes: pendentes.map((s) => ({ sessao_id: s.id, nome: s.nome, data_original: s.data! })),
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
