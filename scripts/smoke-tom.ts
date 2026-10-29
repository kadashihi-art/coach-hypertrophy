import { interpretarFeedbackHeuristico as h } from "../src/lib/plan/negociacao";
import { limparSaidaCoach } from "../src/lib/llm/tom";
const r = h("PPL + descanso + UL");
if (r.ajustes.estilo_split !== "hibrido_ppl_ul" || r.ajustes.dias_por_semana !== 5) throw new Error("hibrido chip " + JSON.stringify(r));
const l = limparSaidaCoach("## Título\nAbra /meu-treino.\n[[sugestao: Ver opção com pernas 2×]]");
if (l.texto.includes("#") || l.texto.includes("/meu-treino") || l.sugestao !== "Ver opção com pernas 2×") throw new Error("limpeza " + JSON.stringify(l));
console.log("hibrido+limpeza OK", JSON.stringify(r.ajustes), JSON.stringify(l));

// "motor" nunca aparece na saída (salvaguarda), sem quebrar "motora"/"psicomotor"
import { ABERTURA_SINCERA, comAberturaSincera, semMotor, semCodigoRegra } from "../src/lib/llm/tom";
import { racionalDoPlano } from "../src/lib/plan/racional";
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
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
// Sem códigos de regra (R1–R12) no texto visível; conteúdo fica
const RCOD = /\bR\d{1,2}\b/;
const rc = limparSaidaCoach("Mantive 10–20 séries/semana (R10/R11). [R10: quads abaixo] R9: sono baixo. Regra R3 e R12 ok. Preço R$ 10.").texto;
if (RCOD.test(rc)) throw new Error("codigo de regra na saida: " + rc);
if (!rc.includes("10–20 séries/semana") || !rc.includes("quads abaixo") || !rc.includes("sono baixo") || !rc.includes("R$ 10")) throw new Error("conteudo perdido: " + rc);
if (semCodigoRegra("Coordenação, RPE 8, Rir 2") !== "Coordenação, RPE 8, Rir 2") throw new Error("falso positivo");
{
  const now = new Date().toISOString();
  const pf = { id: "t", peso_kg: 80, altura_cm: 178, experiencia: "intermediario", dias_por_semana: 3, minutos_por_sessao: 60, cardio_min_semana: 0, equipamentos: ["barra","halteres","maquina","cabo"], restricoes: [], objetivo: "hipertrofia", onboarding_concluido: true, parq_liberado: true, parq_respondido_em: now, parq_respostas: [false,false,false,false,false,false,false], criado_em: now } as never;
  const g = gerarPlanoFromPerfil(pf, CATALOG_EXERCICIOS);
  const rac = JSON.stringify(g.plano.racional ?? racionalDoPlano({ plano: g.plano, sessoes: g.sessoes, perfil: pf, catalog: CATALOG_EXERCICIOS }));
  if (RCOD.test(rac)) throw new Error("racional visivel com codigo de regra: " + rac.match(/.{40}\bR\d{1,2}\b.{20}/)?.[0]);
}
console.log("sem-motor+abertura+guard+sem-RNN OK", JSON.stringify(m));
