import { interpretarFeedbackHeuristico as h } from "../src/lib/plan/negociacao";
import { limparSaidaCoach } from "../src/lib/llm/tom";
const r = h("PPL + descanso + UL");
if (r.ajustes.estilo_split !== "hibrido_ppl_ul" || r.ajustes.dias_por_semana !== 5) throw new Error("hibrido chip " + JSON.stringify(r));
const l = limparSaidaCoach("## Título\nAbra /meu-treino.\n[[sugestao: Ver opção com pernas 2×]]");
if (l.texto.includes("#") || l.texto.includes("/meu-treino") || l.sugestao !== "Ver opção com pernas 2×") throw new Error("limpeza " + JSON.stringify(l));
console.log("hibrido+limpeza OK", JSON.stringify(r.ajustes), JSON.stringify(l));
