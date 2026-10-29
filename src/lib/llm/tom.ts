/** Tom do Coach (WhatsApp de treinador experiente) + limpeza de saída. */
import { AJUSTAR_PLANO_NOME } from "@/lib/nav";
import { acentuar } from "@/lib/labels";

import { humanizarSplits } from "@/lib/plan/split-label";
export const TOM_COACH = [
  "TOM: fale em primeira pessoa, como um treinador experiente conversando no WhatsApp. PT-BR natural, frases curtas, calor humano, sem enrolação.",
  "Use \"eu montei\", \"eu coloquei\", \"posso ajustar\", \"se quiser, eu troco\". NUNCA use a palavra \"motor\" (nem \"o motor\", \"do motor\", \"pelo motor\"), nem \"o sistema\" ou \"o algoritmo\" — quem monta e ajusta o plano é você, o coach. NUNCA cite códigos internos de regra (R1–R12, N1/N2): diga o conteúdo em palavras (ex.: \"10–20 séries/semana, que é a faixa que mais rende pra hipertrofia\").",
  "Na PRIMEIRA mensagem de uma conversa de montagem/ajuste de plano, deixe claro, do seu jeito, que a pessoa pode discordar ou trazer condições (rotina, lesão, gosto) e que você vai ser sincero sobre o que funciona e o que não.",
  "PROIBIDO: títulos/headers (#, ##), relatório em seções (ex. \"Por que não as outras:\"), listas longas, tabelas, caminhos/rotas técnicas (ex. /meu-treino), nomes de campos JSON.",
  "Padrão: 2–5 frases. Só aprofunde se a pessoa pedir. No máximo 3 itens curtos se uma lista ajudar muito. Negrito com moderação.",
  "Evidência de leve, sem palestra: \"os estudos mostram...\", \"a literatura aponta...\". Seja honesto quando a evidência é fraca.",
  "Quando fizer sentido, termine com uma pergunta ou um próximo passo concreto.",
  `Se você sugerir um ajuste no plano, diga que dá pra ver em "${AJUSTAR_PLANO_NOME}" e que só muda se a pessoa confirmar. Nesse caso, na ÚLTIMA linha escreva exatamente: [[sugestao: <rótulo curto de botão, até 40 caracteres, ex. Ver opção com pernas 2×>]]`,
].join("\n");

/** Frase de abertura (onboarding e ajuste): convida a discordar e promete sinceridade. */
export const ABERTURA_SINCERA =
  "Pode discordar de mim ou trazer suas condições (rotina, lesão, o que você curte ou não). Eu ajusto e vou ser sincero sobre o que funciona e o que não funciona pra você.";

/** Garante a abertura sincera na 1ª mensagem, se a fala ainda não convidar a discordar. */
export function comAberturaSincera(texto: string): string {
  const t = (texto ?? "").trim();
  if (/discord|sincer/i.test(t)) return t;
  return t ? `${t}\n\n${ABERTURA_SINCERA}` : ABERTURA_SINCERA;
}

/** Salvaguarda: troca "motor" por coach/plano sem quebrar "motora", "psicomotor", "motorista". */
export function semMotor(texto: string): string {
  const W = "(?<![\\p{L}\\p{N}_])";
  const E = "(?![\\p{L}\\p{N}_])";
  const r = (p: string) => new RegExp(`${W}${p}${E}`, "giu");
  return texto
    .replace(r("(d|n)o motor"), (_m, a: string) => `${a}o plano`)
    .replace(r("(p)elo motor"), (_m, a: string) => `${a}elo coach`)
    .replace(r("(a)o motor"), (_m, a: string) => `${a}o coach`)
    .replace(r("(o) motor"), (_m, a: string) => `${a} coach`)
    .replace(r("motores"), "cálculos")
    .replace(r("motor"), (m) => (m[0] === "M" ? "Coach" : "coach"));
}

/** Remove headers, rotas técnicas e menções ao "motor"; extrai a sugestão de CTA. */
/**
 * Códigos internos de regra (R1–R12) nunca aparecem pro usuário.
 * Conteúdo fica, só some o código: "(R10/R11)" → "", "[R10: x]" → "x", "R9: x" → "x".
 */
export function semCodigoRegra(texto: string): string {
  const COD = String.raw`R(?:1[0-2]|[1-9])`;
  const LISTA = String.raw`${COD}(?:\s*(?:\/|,|\+|e)\s*${COD})*`;
  return texto
    .replace(new RegExp(String.raw`\s*\(\s*${LISTA}\s*\)`, "g"), "")
    .replace(new RegExp(String.raw`\[\s*${LISTA}\s*:\s*([^\]]*)\]`, "g"), "$1")
    .replace(new RegExp(String.raw`\b${LISTA}\s*:\s*`, "g"), "")
    .replace(new RegExp(String.raw`\s*\b${LISTA}\b`, "g"), "")
    .replace(/ {2,}/g, " ")
    .replace(/\s+([.,;:!?)])/g, "$1");
}

/** Remove ids/enum snake_case e nomes de tipos internos de qualquer texto de saída. */
export function semIdsInternos(t: string): string {
  return t
    .replace(/\bEstadoExercicio\b/g, "histórico")
    .replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, (m) => m.replace(/_/g, " "));
}

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
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  t = semIdsInternos(acentuar(humanizarSplits(semCodigoRegra(semMotor(t)))));
  return { texto: t, sugestao };
}
