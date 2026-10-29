import { interpretarFeedbackHeuristico as h } from "../src/lib/plan/negociacao";
import { limparSaidaCoach } from "../src/lib/llm/tom";
const r = h("PPL + descanso + UL");
if (r.ajustes.estilo_split !== "hibrido_ppl_ul" || r.ajustes.dias_por_semana !== 5) throw new Error("hibrido chip " + JSON.stringify(r));
const l = limparSaidaCoach("## Título\nAbra /meu-treino.\n[[sugestao: Ver opção com pernas 2×]]");
if (l.texto.includes("#") || l.texto.includes("/meu-treino") || l.sugestao !== "Ver opção com pernas 2×") throw new Error("limpeza " + JSON.stringify(l));
console.log("hibrido+limpeza OK", JSON.stringify(r.ajustes), JSON.stringify(l));

// "motor" nunca aparece na saída (salvaguarda), sem quebrar "motora"/"psicomotor"
import { ABERTURA_SINCERA, comAberturaSincera, semMotor } from "../src/lib/llm/tom";
import { mensagemApiValida, mensagemEnviavel } from "../src/lib/chat-input";
const m = limparSaidaCoach("O motor manteve a carga. Isso vem do motor, decidido pelo motor. Motor: ok. Coordenação motora e psicomotor.").texto;
if (/(?<![\p{L}])motor(?![\p{L}])/iu.test(m)) throw new Error("saida contem motor: " + m);
if (!m.includes("motora") || !m.includes("psicomotor")) throw new Error("quebrou palavra: " + m);
if (semMotor("motorista") !== "motorista") throw new Error("motorista");
// Abertura sincera: convida a discordar + promete sinceridade (onboarding e ajuste)
if (!/discord/i.test(ABERTURA_SINCERA) || !/sincer/i.test(ABERTURA_SINCERA)) throw new Error("abertura");
const ab = comAberturaSincera("Montei pra você um Upper/Lower.");
if (!ab.includes(ABERTURA_SINCERA)) throw new Error("abertura ausente");
if (comAberturaSincera("Pode discordar, vou ser sincero.") !== "Pode discordar, vou ser sincero.") throw new Error("abertura duplicada");
// Guard de mensagem: "C" acidental não envia; vazio só como abertura na API
if (mensagemEnviavel("C") || mensagemEnviavel("  c ") || !mensagemEnviavel("ok")) throw new Error("guard UI");
if (mensagemApiValida("C", true) || !mensagemApiValida("", true) || mensagemApiValida("", false)) throw new Error("guard API");
console.log("sem-motor+abertura+guard OK", JSON.stringify(m));
