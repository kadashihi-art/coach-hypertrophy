/**
 * smoke:agenda-semanal — calendário, faixa e Hoje saem da mesma agenda.
 * Simula 6 semanas de um Upper/Lower 5x (início num domingo, folga dom e qua), com dias treinados,
 * dias perdidos, troca do treino de hoje e treino parcial, e checa todo dia:
 *  - treino só em dia de treino do microciclo (folga continua folga);
 *  - semana sem falta tem os 5 treinos; treino perdido não some (vira pendente no próximo dia de treino);
 *  - o treino sugerido no Hoje é o mesmo que o calendário mostra;
 *  - parcial aparece como feito.
 */
import { CATALOG_EXERCICIOS as C } from "../src/lib/catalog/exercicios";
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { agendarSessoes, derivarDias, registrarFeitoNoDia } from "../src/lib/plan/calendario";
import { agendaEfetiva } from "../src/lib/plan/pendente";
import { projetarOcorrencias } from "../src/lib/plan/projecao";
import { proximaSessao } from "../src/lib/plan/proxima-sessao";
import { arquivarConclusao } from "../src/lib/plan/repetir";
import { ehDiaDeTreino, montarAgendaSemanal } from "../src/lib/plan/agenda-semanal";
import { trocarTreinoHoje } from "../src/lib/plan/trocar-hoje";
import { seedState } from "../src/lib/seed";
import type { AppState, Perfil } from "../src/lib/domain";

let fail = 0;
const ok = (c: boolean, m: string) => { if (c) console.log("PASS", m); else { fail++; console.log("FAIL", m); } };
const add = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const dow = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay(); // 0 = domingo

const perfil = {
  ...seedState.perfil!, id: "agenda", peso_kg: 80, altura_cm: 178, experiencia: "intermediario", dias_por_semana: 5, minutos_por_sessao: 90,
  equipamentos: ["barra", "halteres", "maquina", "cabo"], restricoes: [], objetivo: "recomposicao", estilo_split: "upper_lower",
  dias_descanso_fixos: [0, 3], onboarding_concluido: true, parq_liberado: true, parq_respostas: [false, false, false, false, false, false, false], parq_respondido_em: "2026-10-01T00:00:00Z",
} as Perfil;
const INI = "2026-11-01"; // domingo
const g = gerarPlanoFromPerfil(perfil, C);
const plano = { ...g.plano, mesociclo: { ...g.plano.mesociclo, data_inicio: INI } };
const inicial: AppState = { ...structuredClone(seedState), perfil, plano, sessoes: agendarSessoes(g.sessoes, plano, INI), estados: g.estados, registros: [], active_sessao_id: null, dias_limpos: [] };
const folgas = new Set([0, 3]); // dom, qua
ok([...Array(7).keys()].every((i) => ehDiaDeTreino(plano, add(INI, i)) === !folgas.has(dow(add(INI, i)))), "microciclo: seg, ter, qui, sex, sáb (folga dom e qua)");

// Faz o treino do dia (como o app: repetir guarda a execução anterior no dia dela).
function treinar(st: AppState, id: string, dia: string, status: "concluida" | "parcial" = "concluida"): AppState {
  let s = st;
  const t = s.sessoes.find((x) => x.id === id)!;
  if ((t.status === "concluida" || t.status === "parcial") && t.data && t.data !== dia) s = arquivarConclusao(s, id);
  return { ...s, sessoes: s.sessoes.map((x) => (x.id === id ? { ...x, status, data: dia, data_manual: undefined, finalizada_em: `${dia}T20:00:00Z` } : x)) };
}

function checarDia(st: AppState, hoje: string, tag: string) {
  const ag = agendaEfetiva(st, hoje);
  const proj = projetarOcorrencias(st, hoje, ag);
  const futuras = proj.filter((s) => s.data && s.data >= hoje && s.status === "planejada");
  ok(futuras.every((s) => ehDiaDeTreino(plano, s.data!) || !!st.sessoes.find((x) => x.id === s.id)?.data_manual), `${tag}: nenhum treino em dia de folga`);
  ok(new Set(futuras.map((s) => s.data)).size === futuras.length, `${tag}: no máximo um treino planejado por dia`);
  const prox = proximaSessao(st, hoje);
  const primeiro = futuras.sort((a, b) => a.data!.localeCompare(b.data!))[0];
  ok(!!prox && !!primeiro && prox.id === primeiro.id.split("#")[0], `${tag}: o Hoje sugere o mesmo treino que o calendário (${prox?.nome} × ${primeiro?.nome} em ${primeiro?.data})`);
  return { ag, proj, futuras };
}

// 1) Semanas sem falta: todo dia de treino tem treino e cada semana tem os 5.
{
  let st = inicial;
  for (let i = 0; i < 21; i++) {
    const hoje = add(INI, i);
    const { futuras } = checarDia(st, hoje, `sem falta ${hoje}`);
    const deHoje = futuras.find((s) => s.data === hoje);
    ok(!!deHoje === ehDiaDeTreino(plano, hoje), `sem falta ${hoje}: ${ehDiaDeTreino(plano, hoje) ? "dia de treino com treino" : "folga sem treino"}`);
    if (deHoje) st = treinar(st, deHoje.id.split("#")[0]!, hoje);
  }
  const proj = projetarOcorrencias(st, add(INI, 21), agendaEfetiva(st, add(INI, 21)));
  for (let w = 0; w < 3; w++) {
    const ini = add(INI, w * 7), fim = add(ini, 6);
    const n = proj.filter((s) => s.data && s.data >= ini && s.data <= fim && (s.status === "concluida" || s.status === "parcial")).length;
    ok(n === 5, `semana ${w + 1}: 5 treinos feitos e no calendário (${n})`);
  }
  const futuras = proj.filter((s) => s.data && s.data >= add(INI, 21) && s.data <= add(INI, 27) && s.status === "planejada");
  ok(futuras.length === 5, `semana 4 (futura): 5 treinos previstos (${futuras.length})`);
}

// 2) Perdeu a terça: o treino não some, vai pro próximo dia de treino (quinta, não a quarta de folga).
{
  let st = inicial;
  const seg = add(INI, 8), ter = add(INI, 9), qua = add(INI, 10), qui = add(INI, 11);
  for (let i = 0; i < 8; i++) {
    const hoje = add(INI, i);
    const d = projetarOcorrencias(st, hoje).find((s) => s.data === hoje && s.status === "planejada");
    if (d) st = treinar(st, d.id.split("#")[0]!, hoje);
  }
  const segTreino = projetarOcorrencias(st, seg).find((s) => s.data === seg && s.status === "planejada")!;
  st = treinar(st, segTreino.id.split("#")[0]!, seg);
  const terPrevisto = projetarOcorrencias(st, ter).find((s) => s.data === ter && s.status === "planejada")!;
  // não treinou terça
  const { futuras, ag } = checarDia(st, qua, "perdeu terça, hoje quarta");
  ok(!futuras.some((s) => s.data === qua), "quarta (folga) continua sem treino");
  const naQuinta = futuras.find((s) => s.data === qui);
  ok(naQuinta?.id.split("#")[0] === terPrevisto.id.split("#")[0], `o treino de terça (${terPrevisto.nome}) vai pra quinta`);
  ok(ag.pendentes.some((p) => p.sessao_id === terPrevisto.id.split("#")[0]), "ele aparece como pendente (aviso no Hoje)");
  const semana = futuras.filter((s) => s.data! <= add(INI, 13));
  ok(semana.length === 3, `quinta, sexta e sábado continuam com treino (${semana.length})`);
  const terca = derivarDias(projetarOcorrencias(st, qua, ag), [ter])[0]!;
  ok(terca.status === "planejado" && terca.nome === terPrevisto.nome, `a terça perdida aparece como pendente com ${terPrevisto.nome} (não como folga)`);

  // "Treinei na terça, só não registrei": registrar no dia tira o pendente e a quinta volta ao normal.
  const reg = registrarFeitoNoDia(st, ag.sessoes, ter, terca.sessao_id, terPrevisto.id.split("#")[0]!, qua);
  const ag2 = agendaEfetiva(reg, qua);
  ok(ag2.pendentes.length === 0, "registrado na terça: nada pendente");
  const qui2 = projetarOcorrencias(reg, qua, ag2).find((s) => s.data === qui && s.status === "planejada");
  ok(!!qui2 && qui2.id.split("#")[0] !== terPrevisto.id.split("#")[0], `registrado na terça: quinta segue o plano (${qui2?.nome})`);
}

// 3) Trocar o treino de hoje: o escolhido fica hoje e a fila segue sem treino em folga.
{
  let st = inicial;
  const seg = add(INI, 8);
  const r = trocarTreinoHoje(st, st.sessoes.find((s) => s.nome === "Lower B")!.id, seg);
  ok(r.ok, "troca de hoje aceita");
  if (r.ok) {
    st = r.state;
    const { futuras } = checarDia(st, seg, "depois da troca");
    ok(futuras.find((s) => s.data === seg)?.nome === "Lower B", "hoje mostra o escolhido no calendário");
  }
}

// 4) Parcial aparece como feito; treino feito na semana passada aparece de novo nesta (sem dizer "descanso").
{
  let st = inicial;
  const seg1 = add(INI, 1);
  const t = projetarOcorrencias(st, seg1).find((s) => s.data === seg1 && s.status === "planejada")!;
  st = treinar(st, t.id.split("#")[0]!, seg1, "parcial");
  const dia = derivarDias(projetarOcorrencias(st, add(INI, 2)), [seg1])[0]!;
  ok(dia.status === "feito", "treino parcial aparece como feito no calendário");
  const seg2 = add(INI, 8);
  const proj = projetarOcorrencias(st, seg2);
  ok(proj.some((s) => s.data === seg2 && s.status === "planejada"), "segunda da semana 2 tem treino (não é descanso)");
}

// 5) Agenda é só leitura e determinística.
{
  const antes = JSON.stringify(inicial);
  const a = JSON.stringify(montarAgendaSemanal(inicial, add(INI, 3)));
  ok(JSON.stringify(inicial) === antes && a === JSON.stringify(montarAgendaSemanal(inicial, add(INI, 3))), "não grava nada e dá sempre o mesmo resultado");
}

if (fail) { console.error(`\n${fail} falha(s)`); process.exit(1); }
console.log("\nsmoke:agenda-semanal OK");
