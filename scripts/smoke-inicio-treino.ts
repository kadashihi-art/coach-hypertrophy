/** smoke:inicio-treino — começar o treino sem misturar dias (fuso de SP, treino esquecido aberto). */
import { seedState } from "../src/lib/seed";
import type { AppState, RegistroSerie, Sessao } from "../src/lib/domain";
import { hojeIsoSaoPaulo, proximaSessao } from "../src/lib/plan/proxima-sessao";
import { corrigirDataDoTreinoNoturno, liberarParaHoje, treinoAbertoAntigo } from "../src/lib/treino/sessao-aberta";

let fail = 0;
const ok = (c: boolean, m: string) => { if (c) console.log("PASS", m); else { fail++; console.log("FAIL", m); } };
const ms = (iso: string) => Date.parse(iso);

// 1) Dia de São Paulo: 22h30 de 12/nov em SP já é 13/nov em UTC.
ok(hojeIsoSaoPaulo(ms("2026-11-13T01:30:00Z")) === "2026-11-12", "22h30 em SP continua sendo o dia 12");

const base = structuredClone(seedState) as AppState;
const s0 = base.sessoes.find((s) => s.prescricoes.length > 0)!;
const p0 = s0.prescricoes[0]!;
const reg = (sessao_id: string, quando: string, n: number): RegistroSerie => ({
  id: `r-${n}`, sessao_id, prescricao_id: p0.id, exercicio_id: p0.exercicio_id, numero: n, tipo_serie: "top_set",
  carga_kg: 80, reps: 8, rir_percebido: 2, dor: false, executado_em: quando,
});
const comSessao = (patch: Partial<Sessao>, registros: RegistroSerie[] = []): AppState => ({
  ...base,
  sessoes: base.sessoes.map((s) => (s.id === s0.id ? { ...s, ...patch } : s)),
  registros,
  active_sessao_id: patch.status === "em_andamento" ? s0.id : null,
});

// 2) Treino aberto: atravessar a meia-noite não é "esquecido"; 12 h+ é.
const agora = ms("2026-11-13T21:00:00Z"); // sexta 18h em SP
ok(!treinoAbertoAntigo({ status: "em_andamento", data: "2026-11-12", iniciada_em: "2026-11-13T02:30:00Z" }, ms("2026-11-13T03:40:00Z")), "treino que passou da meia-noite continua (não é esquecido)");
ok(treinoAbertoAntigo({ status: "em_andamento", data: "2026-11-12", iniciada_em: "2026-11-12T20:00:00Z" }, agora), "treino aberto desde ontem é esquecido");
ok(!treinoAbertoAntigo({ status: "concluida", data: "2026-11-12", iniciada_em: "2026-11-12T20:00:00Z" }, agora), "treino concluído não conta como aberto");

// 3) Esquecido com séries: vira parcial do dia dele, guardado à parte; o modelo fica livre e sem séries.
{
  const st = comSessao({ status: "em_andamento", data: "2026-11-10", iniciada_em: "2026-11-10T22:00:00Z" }, [
    reg(s0.id, "2026-11-10T22:05:00Z", 1), reg(s0.id, "2026-11-10T22:10:00Z", 2),
  ]);
  const r = liberarParaHoje(st, s0.id, agora);
  const livre = r.sessoes.find((s) => s.id === s0.id)!;
  const avulso = r.sessoes.find((s) => s.id.startsWith(`${s0.id}#`));
  ok(livre.status === "planejada" && livre.data === null, "esquecido: o treino volta a ficar livre pra hoje");
  ok(!!avulso && avulso.status === "parcial" && avulso.data === "2026-11-10", `esquecido: séries guardadas como parcial de 10/nov (${avulso?.status} ${avulso?.data})`);
  ok(r.registros.every((x) => x.sessao_id === avulso?.id), "esquecido: nenhuma série antiga fica no treino de hoje");
}

// 4) Esquecido sem séries: só volta a ser planejado.
{
  const st = comSessao({ status: "em_andamento", data: "2026-11-10", iniciada_em: "2026-11-10T22:00:00Z" });
  const r = liberarParaHoje(st, s0.id, agora);
  ok(r.sessoes.find((s) => s.id === s0.id)!.status === "planejada" && r.sessoes.length === st.sessoes.length, "esquecido sem séries: volta a planejado, sem registro avulso");
}

// 5) Feito em outro dia: guardado no dia dele. Feito hoje: não muda aqui.
{
  const st = comSessao({ status: "concluida", data: "2026-11-06", iniciada_em: "2026-11-06T20:00:00Z", finalizada_em: "2026-11-06T21:00:00Z" }, [reg(s0.id, "2026-11-06T20:10:00Z", 1)]);
  const r = liberarParaHoje(st, s0.id, agora);
  ok(r.sessoes.some((s) => s.id.startsWith(`${s0.id}#`) && s.data === "2026-11-06"), "feito na semana passada: execução guardada no dia dela");
  const hoje = comSessao({ status: "concluida", data: "2026-11-13", iniciada_em: "2026-11-13T19:00:00Z" });
  ok(liberarParaHoje(hoje, s0.id, agora) === hoje, "feito hoje: não arquiva");
}

// 6) Data de amanhã gravada pelo treino da noite: corrigida pro dia de SP (só nesse caso).
{
  const st = comSessao({ status: "concluida", data: "2026-11-13", iniciada_em: "2026-11-13T01:30:00Z", finalizada_em: "2026-11-13T02:30:00Z" });
  const r = corrigirDataDoTreinoNoturno(st);
  ok(r.sessoes.find((s) => s.id === s0.id)!.data === "2026-11-12", "treino das 22h30 de 12/nov sai de 13/nov e volta pra 12/nov");
  const manual = comSessao({ status: "concluida", data: "2026-11-13", data_manual: true, iniciada_em: "2026-11-13T01:30:00Z" });
  ok(corrigirDataDoTreinoNoturno(manual) === manual, "data escolhida à mão não muda");
  const tarde = comSessao({ status: "concluida", data: "2026-11-12", iniciada_em: "2026-11-12T20:00:00Z" });
  ok(corrigirDataDoTreinoNoturno(tarde) === tarde, "treino da tarde não muda");
  // Depois da correção, hoje (13/nov) o treino da noite anterior não aparece como feito hoje.
  ok(r.sessoes.find((s) => s.id === s0.id)!.data !== hojeIsoSaoPaulo(ms("2026-11-13T15:00:00Z")), "hoje não aparece como feito por causa do treino de ontem à noite");
}

// 7) Próxima sessão continua sugerindo o treino aberto (pra começar do zero ou continuar).
{
  const st = comSessao({ status: "em_andamento", data: "2026-11-10", iniciada_em: "2026-11-10T22:00:00Z" });
  ok(proximaSessao(st, "2026-11-13")?.id === s0.id, "treino aberto continua sendo o sugerido");
}

if (fail) { console.error(`\n${fail} falha(s)`); process.exit(1); }
console.log("\nsmoke:inicio-treino OK");
