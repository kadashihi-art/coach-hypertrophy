/**
 * Cobertura por músculo na semana (gerador do plano, determinístico).
 *
 * Cada regra de `REGRAS_COBERTURA` pede um tipo de exercício que pega uma região que os outros não
 * pegam bem (ex.: tríceps acima da cabeça, extensora, flexora). Se a semana não tem:
 *  1) troca um exercício redundante do mesmo músculo (isolador, ou composto repetido), mantendo as séries;
 *  2) se não há o que trocar e a regra permite, acrescenta um exercício curto onde cabe no tempo;
 *  3) se nada disso dá (equipamento, restrição, tempo), deixa como está.
 * Cada mudança vira uma nota com o porquê e o estudo.
 */
import type { Exercicio, Prescricao } from "@/lib/domain";
import { GRUPO_LABEL } from "@/lib/labels";
import { exerciseAllowed, patternBlocked, type RestricaoKey } from "./restricoes";
import type { SessaoParaEquilibrar } from "./equilibrar-volume";
import { ESTUDOS, REGRAS_COBERTURA, refCurta, type RegraCobertura } from "./evidencia-exercicio";

export type CtxCobertura = {
  catalog: Exercicio[];
  equips: Set<string>;
  restr: Set<RestricaoKey>;
  /** Monta a prescrição (e o estado inicial) de um exercício na sessão. */
  criarPrescricao: (ex: Exercicio, sess: SessaoParaEquilibrar, series: number, ordem: number, used: Set<string>) => Prescricao;
  duracao: (ps: Prescricao[]) => number;
  /** Minutos máximos por treino ao acrescentar (perfil +10%). */
  limiteMin: number;
  /** Séries do exercício acrescentado. */
  seriesNovo: number;
  /** Pontos do histórico (exercício que você já faz e evolui é trocado por último). */
  historico?: Map<string, number>;
  /** Regras a usar (padrão: todas). */
  regras?: RegraCobertura[];
};

export type MudancaCobertura = {
  regra: string;
  sessao_id: string;
  /** null quando o exercício foi acrescentado. */
  de: string | null;
  para: string;
};

type Ocorrencia = { sess: SessaoParaEquilibrar; p: Prescricao; ex: Exercicio; iSess: number; iPresc: number };

const nome = (ex: Exercicio | undefined) => ex?.nome ?? "";

export function garantirCobertura(
  sessoes: SessaoParaEquilibrar[],
  ctx: CtxCobertura,
): { mudancas: MudancaCobertura[]; notas: string[] } {
  const byId = new Map(ctx.catalog.map((e) => [e.id, e]));
  const mudancas: MudancaCobertura[] = [];
  const notas: string[] = [];

  for (const regra of ctx.regras ?? REGRAS_COBERTURA) {
    if (regra.naoCom?.some((r) => ctx.restr.has(r))) continue;
    if (patternBlocked(regra.padrao, ctx.restr)) continue;

    const ocorr: Ocorrencia[] = [];
    sessoes.forEach((sess, iSess) =>
      sess.prescricoes.forEach((p, iPresc) => {
        const ex = byId.get(p.exercicio_id);
        if (ex && ex.grupo_primario === regra.grupo) ocorr.push({ sess, p, ex, iSess, iPresc });
      }),
    );
    if (ocorr.length === 0 || ocorr.length < regra.minExercicios) continue;
    if (ocorr.some((o) => regra.cumpre(o.ex))) continue;

    const candidato = (sess: SessaoParaEquilibrar): Exercicio | null => {
      const usados = new Set(sess.prescricoes.map((p) => p.exercicio_id));
      for (const id of regra.preferir) {
        const ex = byId.get(id);
        if (ex && !usados.has(id) && exerciseAllowed(ex, ctx.equips, ctx.restr)) return ex;
      }
      return null;
    };

    // Vítima: isolador do músculo, ou composto repetido (outro composto do músculo antes, no mesmo treino;
    // ou, se a regra deixa, em outro treino da semana). O primeiro composto de cada treino fica.
    const compostos = ocorr.filter((o) => o.ex.composto);
    const podeTrocar = (o: Ocorrencia): boolean => {
      if (!o.ex.composto) return true;
      const antesNoTreino = compostos.some((c) => c.sess === o.sess && c.iPresc < o.iPresc);
      if (antesNoTreino) return true;
      return regra.trocaComposto && compostos.some((c) => c.sess !== o.sess);
    };
    const pontos = (o: Ocorrencia) => ctx.historico?.get(o.ex.id) ?? 0;
    const vitimas = ocorr
      .filter(podeTrocar)
      // Composto primeiro quando a regra é de composto; depois o que você menos usa; depois o mais tarde na semana.
      .sort(
        (a, b) =>
          Number(!!regra.poupar?.includes(a.ex.id)) - Number(!!regra.poupar?.includes(b.ex.id)) ||
          (regra.trocaComposto ? Number(b.ex.composto) - Number(a.ex.composto) : Number(a.ex.composto) - Number(b.ex.composto)) ||
          pontos(a) - pontos(b) ||
          b.iSess - a.iSess ||
          b.iPresc - a.iPresc,
      );

    let feito = false;
    for (const v of vitimas) {
      const ex = candidato(v.sess);
      if (!ex) continue;
      const usados = new Set(v.sess.prescricoes.map((p) => p.exercicio_id));
      const nova = ctx.criarPrescricao(ex, v.sess, v.p.series, v.p.ordem, usados);
      // Muda no lugar: as sessões do plano compartilham essa lista.
      v.sess.prescricoes.splice(v.iPresc, 1, nova);
      mudancas.push({ regra: regra.id, sessao_id: v.sess.id, de: v.ex.id, para: ex.id });
      notas.push(
        `${GRUPO_LABEL[regra.grupo] ?? regra.grupo}: troquei ${nome(v.ex)} por ${nome(ex)} em um dos treinos. ${ESTUDOS[regra.estudo].achado} (${refCurta(ESTUDOS[regra.estudo])})`,
      );
      feito = true;
      break;
    }
    if (feito || !regra.acrescentar) continue;

    // Acrescenta no treino mais curto onde o músculo já treina, se couber no tempo.
    const sessoesDoGrupo = [...new Set(ocorr.map((o) => o.sess))].sort((a, b) => ctx.duracao(a.prescricoes) - ctx.duracao(b.prescricoes));
    for (const sess of sessoesDoGrupo) {
      const ex = candidato(sess);
      if (!ex) continue;
      const usados = new Set(sess.prescricoes.map((p) => p.exercicio_id));
      const nova = ctx.criarPrescricao(ex, sess, ctx.seriesNovo, sess.prescricoes.length + 1, usados);
      if (ctx.duracao([...sess.prescricoes, nova]) > ctx.limiteMin) continue;
      sess.prescricoes.push(nova);
      mudancas.push({ regra: regra.id, sessao_id: sess.id, de: null, para: ex.id });
      notas.push(
        `${GRUPO_LABEL[regra.grupo] ?? regra.grupo}: acrescentei ${nome(ex)} (${ctx.seriesNovo} séries). ${ESTUDOS[regra.estudo].achado} (${refCurta(ESTUDOS[regra.estudo])})`,
      );
      break;
    }
  }
  return { mudancas, notas };
}
