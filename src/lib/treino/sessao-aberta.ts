/**
 * Início do treino sem misturar dias.
 *
 * O "hoje" do treino é o dia de São Paulo, nunca o UTC: depois das 21h o UTC já é amanhã, e o
 * treino da noite ficava com a data do dia seguinte (no outro dia, o app achava que ele era de hoje).
 *
 * Treino aberto e esquecido (em andamento há mais de 12 h, sem "Finalizar"): ao começar de novo,
 * as séries já feitas ficam guardadas no dia em que foram feitas (registro avulso, como
 * treino parcial) e o treino de hoje começa do zero. Antes, ele voltava com as séries antigas e
 * as novas eram anotadas junto, na mesma sessão.
 */
import type { AppState, Sessao } from "@/lib/domain";
import { hojeIsoSaoPaulo } from "@/lib/plan/proxima-sessao";
import { arquivarConclusao } from "@/lib/plan/repetir";

/** Depois disso sem finalizar, o treino em andamento conta como esquecido. */
export const HORAS_TREINO_ABERTO = 12;

/** Treino em andamento que ficou aberto de outro dia. */
export function treinoAbertoAntigo(
  s: Pick<Sessao, "status" | "data" | "iniciada_em"> | undefined | null,
  agoraMs: number,
): boolean {
  if (!s || s.status !== "em_andamento") return false;
  const t = s.iniciada_em ? Date.parse(s.iniciada_em) : NaN;
  if (Number.isFinite(t)) return agoraMs - t > HORAS_TREINO_ABERTO * 3600_000;
  return !!s.data && s.data < hojeIsoSaoPaulo(agoraMs);
}

/**
 * Deixa o treino pronto pra começar hoje sem misturar dias:
 *  - aberto e esquecido com séries: vira parcial do dia em que foi feito e é guardado;
 *  - aberto e esquecido sem séries: volta a ser só planejado;
 *  - feito (ou parcial) em outro dia: a execução anterior é guardada no dia dela.
 * Treino feito hoje não muda aqui (quem chama decide se reinicia).
 */
export function liberarParaHoje(state: AppState, sessaoId: string, agoraMs: number): AppState {
  const hoje = hojeIsoSaoPaulo(agoraMs);
  let s = state;
  const sess = s.sessoes.find((x) => x.id === sessaoId);
  if (!sess) return s;

  if (treinoAbertoAntigo(sess, agoraMs)) {
    const regs = (s.registros ?? []).filter((r) => r.sessao_id === sessaoId);
    if (regs.length === 0) {
      return {
        ...s,
        sessoes: s.sessoes.map((x) =>
          x.id === sessaoId ? { ...x, status: "planejada" as const, data: null, iniciada_em: undefined, finalizada_em: undefined } : x,
        ),
      };
    }
    const tempos = regs.map((r) => r.executado_em).filter(Boolean).sort();
    const primeiro = tempos[0] ? Date.parse(tempos[0]) : NaN;
    const dia = Number.isFinite(primeiro) ? hojeIsoSaoPaulo(primeiro) : sess.data ?? hoje;
    s = {
      ...s,
      sessoes: s.sessoes.map((x) =>
        x.id === sessaoId
          ? { ...x, status: "parcial" as const, data: dia, finalizada_em: tempos[tempos.length - 1] ?? `${dia}T12:00:00.000Z` }
          : x,
      ),
    };
    // Mesmo dia (raro: aberto há 12 h+ dentro do dia): fica como parcial de hoje, sem arquivar.
    return dia !== hoje ? arquivarConclusao(s, sessaoId) : s;
  }

  if ((sess.status === "concluida" || sess.status === "parcial") && sess.data && sess.data !== hoje) {
    return arquivarConclusao(s, sessaoId);
  }
  return s;
}

/** Data UTC (AAAA-MM-DD) de um instante. */
const diaUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const diaSeguinte = (iso: string) => new Date(Date.parse(iso + "T12:00:00Z") + 86400_000).toISOString().slice(0, 10);

/**
 * Corrige treinos que ficaram com a data de amanhã por terem começado depois das 21h (o início
 * gravava o dia em UTC). Dois sinais, os dois exatos:
 *  1) treino do plano: a data salva é o dia UTC do início e difere do dia de São Paulo
 *     (nunca em data escolhida à mão nem em registro avulso);
 *  2) treino feito com séries (inclusive a execução guardada ao repetir, `…#feito-…`): todas as
 *     séries são do mesmo dia em São Paulo, e a data salva é o dia seguinte, igual ao dia UTC
 *     da primeira série. Sem série, nada muda.
 */
export function corrigirDataDoTreinoNoturno(state: AppState): AppState {
  const porSessao = new Map<string, number[]>();
  for (const r of state.registros ?? []) {
    const ms = Date.parse(r.executado_em);
    if (!Number.isFinite(ms)) continue;
    const l = porSessao.get(r.sessao_id) ?? [];
    l.push(ms);
    porSessao.set(r.sessao_id, l);
  }
  let mudou = false;
  const sessoes = state.sessoes.map((s) => {
    if (!s.data) return s;
    if (s.status !== "concluida" && s.status !== "parcial" && s.status !== "em_andamento") return s;
    // 1) Pelo início do treino.
    if (s.iniciada_em && !s.data_manual && !s.id.includes("#")) {
      const t = Date.parse(s.iniciada_em);
      if (Number.isFinite(t)) {
        const sp = hojeIsoSaoPaulo(t);
        if (s.data === diaUtc(t) && s.data !== sp) {
          mudou = true;
          return { ...s, data: sp };
        }
      }
    }
    // 2) Pelas séries registradas.
    if (s.status === "em_andamento") return s;
    const ms = (porSessao.get(s.id) ?? []).sort((a, b) => a - b);
    if (!ms.length) return s;
    const diasSp = new Set(ms.map((m) => hojeIsoSaoPaulo(m)));
    if (diasSp.size !== 1) return s;
    const diaSp = [...diasSp][0]!;
    if (s.data !== diaSeguinte(diaSp) || s.data !== diaUtc(ms[0]!)) return s;
    mudou = true;
    return { ...s, data: diaSp };
  });
  return mudou ? { ...state, sessoes } : state;
}
