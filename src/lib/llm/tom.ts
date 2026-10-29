/** Tom do Coach (WhatsApp de treinador experiente) + limpeza de saída. */
import { AJUSTAR_PLANO_NOME } from "@/lib/nav";

export const TOM_COACH = [
  "TOM: fale em primeira pessoa, como um treinador experiente conversando no WhatsApp. PT-BR natural, frases curtas, calor humano, sem enrolação.",
  "Use \"eu montei\", \"eu coloquei\", \"posso ajustar\", \"se quiser, eu troco\". NUNCA fale de \"o motor\", \"o sistema\" ou \"o algoritmo\" em terceira pessoa — o plano é seu (do coach).",
  "PROIBIDO: títulos/headers (#, ##), relatório em seções (ex. \"Por que não as outras:\"), listas longas, tabelas, caminhos/rotas técnicas (ex. /meu-treino), nomes de campos JSON.",
  "Padrão: 2–5 frases. Só aprofunde se a pessoa pedir. No máximo 3 itens curtos se uma lista ajudar muito. Negrito com moderação.",
  "Evidência de leve, sem palestra: \"os estudos mostram...\", \"a literatura aponta...\". Seja honesto quando a evidência é fraca.",
  "Quando fizer sentido, termine com uma pergunta ou um próximo passo concreto.",
  `Se você sugerir um ajuste no plano, diga que dá pra ver em "${AJUSTAR_PLANO_NOME}" e que só muda se a pessoa confirmar. Nesse caso, na ÚLTIMA linha escreva exatamente: [[sugestao: <rótulo curto de botão, até 40 caracteres, ex. Ver opção com pernas 2×>]]`,
].join("\n");

/** Remove headers, rotas técnicas e menções ao "motor"; extrai a sugestão de CTA. */
export function limparSaidaCoach(texto: string): { texto: string; sugestao: string | null } {
  let sugestao: string | null = null;
  let t = texto.replace(/\[\[\s*sugest[aã]o\s*:\s*([^\]]{2,80})\]\]/gi, (_m, s: string) => {
    sugestao = s.trim().slice(0, 48);
    return "";
  });
  t = t
    .split("\n")
    .map((l) => l.replace(/^\s{0,3}#{1,6}\s+(.*)$/, "**$1**"))
    .join("\n")
    .replace(/\s*\(?\b(em|no|na)\s+\/meu-treino\)?/gi, ` em "${AJUSTAR_PLANO_NOME}"`)
    .replace(/\/meu-treino/gi, `"${AJUSTAR_PLANO_NOME}"`)
    .replace(/\/plano\/ajustar/gi, `"${AJUSTAR_PLANO_NOME}"`)
    .replace(/\bdo motor\b/gi, "do plano")
    .replace(/\bo motor\b/gi, "eu")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { texto: t, sugestao };
}
