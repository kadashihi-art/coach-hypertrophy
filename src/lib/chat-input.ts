/** Guard de mensagem livre pro coach (UI + API). Chips não passam por aqui. */
export const MIN_MSG_CHARS = 2;
export const COMPOSER_PLACEHOLDER =
  "Me conta qualquer coisa: rotina, lesão, o que você curte. Eu ajusto o plano e te digo a real";

/** true se o texto (trimado) tem ao menos MIN_MSG_CHARS. */
export function mensagemEnviavel(texto: string): boolean {
  return texto.trim().length >= MIN_MSG_CHARS;
}

/** API: vazio = abertura da conversa (ok quando permitido); 1 caractere = rejeita. */
export function mensagemApiValida(texto: string, permitirVazia: boolean): boolean {
  const t = texto.trim();
  if (!t) return permitirVazia;
  return t.length >= MIN_MSG_CHARS;
}
