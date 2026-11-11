/**
 * Leitura do dia (durante o treino, determinística).
 *
 * Depois da primeira série pesada (top ou trabalho) de um exercício com histórico, compara o 1RM
 * estimado de hoje (carga × reps + RIR, Epley) com o NORMAL recente dele (mediana das 3 últimas
 * sessões, não o recorde):
 *  - ≥ 8% abaixo → dia ruim. Proposta: manter as cargas e tirar 1 série de cada exercício que falta
 *    (mínimo 2). Em dia ruim, cortar volume preserva a qualidade; a carga fica, e as reps caem sozinhas.
 *  - ≥ 4% acima → dia forte. Proposta: +1 back-off no exercício atual (até 5 séries).
 * Nada muda sem o usuário tocar em "Ajustar". A resposta fica em `sessao.leitura_dia` e não pergunta de novo.
 * Não mexe em kg nem RIR: só no número de séries do dia.
 */
import type { Exercicio, Prescricao, RegistroSerie, Sessao } from "@/lib/domain";
import { ehSeriePreparatoria } from "@/lib/domain";
import { e1rmEpley } from "@/lib/engine/e1rm";

export const LIMIAR_RUIM = 0.92;
export const LIMIAR_BOM = 1.04;
const SERIES_MIN = 2;
const SERIES_MAX = 5;

export type MudancaSeries = { prescricao_id: string; exercicio_id: string; de: number; para: number };

export type LeituraDoDia = {
  tipo: "ruim" | "bom";
  exercicio_id: string;
  razao: number;
  e1rm_hoje: number;
  e1rm_normal: number;
  titulo: string;
  texto: string;
  mudancas: MudancaSeries[];
};

const e1rmSerie = (r: Pick<RegistroSerie, "carga_kg" | "reps" | "rir_percebido">) =>
  e1rmEpley(r.carga_kg, r.reps + Math.min(3, Math.max(0, r.rir_percebido)));

/** Normal recente: mediana do e1RM da série mais pesada nas últimas 3 sessões (sem a de hoje). null com < 2. */
export function e1rmNormal(registros: RegistroSerie[], exercicioId: string, excluirSessaoId: string): number | null {
  const por = new Map<string, { em: string; melhor: number }>();
  for (const r of registros) {
    if (r.exercicio_id !== exercicioId || r.sessao_id === excluirSessaoId) continue;
    if (ehSeriePreparatoria(r.tipo_serie) || r.carga_kg <= 0 || r.reps <= 0 || r.reps > 15) continue;
    const e = e1rmSerie(r);
    const cur = por.get(r.sessao_id);
    if (!cur) por.set(r.sessao_id, { em: r.executado_em ?? "", melhor: e });
    else {
      cur.melhor = Math.max(cur.melhor, e);
      if ((r.executado_em ?? "") < cur.em) cur.em = r.executado_em ?? "";
    }
  }
  const ult = [...por.values()].sort((a, b) => a.em.localeCompare(b.em)).slice(-3).map((x) => x.melhor);
  if (ult.length < 2) return null;
  const o = [...ult].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2]! : (o[o.length / 2 - 1]! + o[o.length / 2]!) / 2;
}

const pct = (r: number) => Math.round(Math.abs(1 - r) * 100);

export function lerDia(args: {
  sessao: Pick<Sessao, "id" | "prescricoes" | "leitura_dia">;
  registros: RegistroSerie[];
  exercicios: Pick<Exercicio, "id" | "nome">[];
}): LeituraDoDia | null {
  const { sessao, registros } = args;
  if (sessao.leitura_dia) return null;
  const hoje = registros
    .filter((r) => r.sessao_id === sessao.id && (r.tipo_serie === "top_set" || r.tipo_serie === "trabalho") && r.carga_kg > 0 && r.reps > 0 && !r.dor)
    .sort((a, b) => (a.executado_em ?? "").localeCompare(b.executado_em ?? ""));
  // A primeira série pesada de um exercício com histórico decide (uma leitura por treino).
  for (const r of hoje) {
    const normal = e1rmNormal(registros, r.exercicio_id, sessao.id);
    if (!normal) continue;
    const e = e1rmSerie(r);
    const razao = e / normal;
    const presc = sessao.prescricoes.find((p) => p.id === r.prescricao_id) ?? sessao.prescricoes.find((p) => p.exercicio_id === r.exercicio_id);
    const nome = args.exercicios.find((x) => x.id === r.exercicio_id)?.nome ?? r.exercicio_id;
    const feitas = (p: Prescricao) =>
      registros.filter((x) => x.sessao_id === sessao.id && x.prescricao_id === p.id && !ehSeriePreparatoria(x.tipo_serie)).length;
    if (razao <= LIMIAR_RUIM) {
      const mudancas: MudancaSeries[] = [];
      for (const p of sessao.prescricoes) {
        const f = feitas(p);
        const para = Math.max(SERIES_MIN, f + (p.id === presc?.id ? 1 : 0), p.series - 1);
        if (para < p.series && f < p.series) mudancas.push({ prescricao_id: p.id, exercicio_id: p.exercicio_id, de: p.series, para });
      }
      if (mudancas.length === 0) return null;
      const menos = mudancas.reduce((a, m) => a + (m.de - m.para), 0);
      return {
        tipo: "ruim",
        exercicio_id: r.exercicio_id,
        razao,
        e1rm_hoje: e,
        e1rm_normal: normal,
        titulo: "Hoje o corpo veio mais devagar",
        texto: `No ${nome}, você rendeu ~${pct(razao)}% abaixo do seu normal (1RM estimado de ${Math.round(e)} kg contra ~${Math.round(normal)} kg). Acontece: sono, estresse, comida. Minha sugestão é manter as cargas e tirar ${menos} ${menos === 1 ? "série" : "séries"} do resto do treino. Hoje a qualidade vale mais que o volume.`,
        mudancas,
      };
    }
    if (razao >= LIMIAR_BOM && presc && presc.series < SERIES_MAX && feitas(presc) < presc.series) {
      return {
        tipo: "bom",
        exercicio_id: r.exercicio_id,
        razao,
        e1rm_hoje: e,
        e1rm_normal: normal,
        titulo: "Dia forte",
        texto: `No ${nome}, você rendeu ~${pct(razao)}% acima do seu normal (1RM estimado de ${Math.round(e)} kg contra ~${Math.round(normal)} kg). Se quiser aproveitar, faço mais 1 série nele.`,
        mudancas: [{ prescricao_id: presc.id, exercicio_id: presc.exercicio_id, de: presc.series, para: presc.series + 1 }],
      };
    }
    return null; // dentro do normal: nada a propor
  }
  return null;
}
