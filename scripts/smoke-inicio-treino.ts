/** smoke:inicio-treino — começar o treino sem misturar dias (fuso de SP, treino esquecido aberto). */
import { seedState } from "../src/lib/seed";
import type { AppState, RegistroSerie, Sessao } from "../src/lib/domain";
import { hojeIsoSaoPaulo, proximaSessao } from "../src/lib/plan/proxima-sessao";
import { corrigirDataDoTreinoNoturno, liberarParaHoje, treinoAbertoAntigo } from "../src/lib/treino/sessao-aberta";
import { marcarDia } from "../src/lib/plan/calendario";
import { trocarTreinoHoje } from "../src/lib/plan/trocar-hoje";

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

// 6b) Execução guardada ao repetir (…#feito-…) com séries da noite anterior: volta pro dia das séries.
{
  const av = { ...s0, id: `${s0.id}#feito-2026-11-13`, status: "concluida" as const, data: "2026-11-13", data_manual: true, prescricoes: [] };
  const st: AppState = {
    ...base,
    sessoes: [...base.sessoes, av],
    registros: [reg(av.id, "2026-11-13T00:30:00Z", 1), reg(av.id, "2026-11-13T01:10:00Z", 2)],
  };
  const r = corrigirDataDoTreinoNoturno(st);
  ok(r.sessoes.find((s) => s.id === av.id)!.data === "2026-11-12", "repetido com séries às 21h30 de 12/nov: volta pra 12/nov");
  const tarde: AppState = { ...st, registros: [reg(av.id, "2026-11-13T16:00:00Z", 1)] };
  ok(corrigirDataDoTreinoNoturno(tarde) === tarde, "séries da tarde de 13/nov: não muda");
  const semSerie: AppState = { ...st, registros: [] };
  ok(corrigirDataDoTreinoNoturno(semSerie) === semSerie, "sem série: não muda");
}

// 7) Próxima sessão continua sugerindo o treino aberto (pra começar do zero ou continuar).
{
  const st = comSessao({ status: "em_andamento", data: "2026-11-10", iniciada_em: "2026-11-10T22:00:00Z" });
  ok(proximaSessao(st, "2026-11-13")?.id === s0.id, "treino aberto continua sendo o sugerido");
}

// 8) Trocar o treino de hoje: o escolhido vira o de hoje (sugestão e calendário); o anterior volta pra fila.
{
  const ids = base.sessoes.filter((s) => s.prescricoes.length > 0).map((s) => s.id);
  const [a, b2] = [ids[0]!, ids[1]!];
  const st: AppState = {
    ...base,
    plano: base.plano ? { ...base.plano, mesociclo: { ...base.plano.mesociclo, data_inicio: "2026-11-09" } } : base.plano,
    sessoes: base.sessoes.map((s) => (s.id === a ? { ...s, status: "planejada" as const, data: "2026-11-13" } : s.id === b2 ? { ...s, status: "planejada" as const, data: null } : s)),
    active_sessao_id: null,
  };
  const r = marcarDia(st, st.sessoes, "2026-11-13", a, "trocar", b2);
  const escolhido = r.sessoes.find((s) => s.id === b2)!;
  const saiu = r.sessoes.find((s) => s.id === a)!;
  ok(escolhido.data === "2026-11-13" && !!escolhido.data_manual && escolhido.status === "planejada", "trocar hoje: o escolhido fica fixo hoje");
  ok(saiu.data === null && saiu.status === "planejada", "trocar hoje: o que estava hoje volta pra fila");
  ok(proximaSessao(r, "2026-11-13")?.id === b2, "trocar hoje: o escolhido vira o treino sugerido de hoje");
}

// 9) Trocar com o treino de hoje aberto (tocou em Começar e voltou, sem série): fecha e troca.
{
  const ids = base.sessoes.filter((s) => s.prescricoes.length > 0).map((s) => s.id);
  const [a, b2] = [ids[0]!, ids[1]!];
  const st: AppState = {
    ...base,
    plano: base.plano ? { ...base.plano, mesociclo: { ...base.plano.mesociclo, data_inicio: "2026-11-02" } } : base.plano,
    sessoes: base.sessoes.map((s) =>
      s.id === a ? { ...s, status: "em_andamento" as const, data: "2026-11-13", iniciada_em: "2026-11-13T20:30:00Z" } : s.id === b2 ? { ...s, status: "planejada" as const, data: null } : s,
    ),
    registros: [],
    active_sessao_id: a,
  };
  const r = trocarTreinoHoje(st, b2, "2026-11-13");
  ok(r.ok, "aberto sem série: a troca acontece");
  if (r.ok) {
    ok(r.state.active_sessao_id === null, "aberto sem série: o treino aberto é fechado");
    ok(r.state.sessoes.find((s) => s.id === a)!.status === "planejada" && r.state.sessoes.find((s) => s.id === a)!.data === null, "aberto sem série: volta pra fila");
    ok(r.state.sessoes.find((s) => s.id === b2)!.data === "2026-11-13", "aberto sem série: o escolhido fica hoje no calendário");
    ok(proximaSessao(r.state, "2026-11-13")?.id === b2, "aberto sem série: o escolhido aparece no Hoje");
    ok(r.saiu === a, "aberto sem série: avisa qual treino saiu");
  }
  const comSerie = trocarTreinoHoje({ ...st, registros: [reg(a, "2026-11-13T20:35:00Z", 1)] }, b2, "2026-11-13");
  ok(!comSerie.ok && comSerie.motivo === "com_series", "aberto com série: não troca (as séries ficariam sem treino)");

  // Sem data de início do plano: a troca também fica gravada e aparece no Hoje.
  const semData: AppState = { ...st, plano: st.plano ? { ...st.plano, mesociclo: { ...st.plano.mesociclo, data_inicio: null } } : st.plano };
  const r2 = trocarTreinoHoje(semData, b2, "2026-11-13");
  ok(r2.ok && r2.state.sessoes.find((s) => s.id === b2)!.data === "2026-11-13", "sem data de início: o escolhido fica hoje");
  ok(r2.ok && proximaSessao(r2.state, "2026-11-13")?.id === b2, "sem data de início: o escolhido aparece no Hoje");

  // Treino ativo antigo apontando pra outro treino (já fechado): a troca limpa e o Hoje mostra o escolhido.
  const ativoVelho: AppState = { ...st, sessoes: st.sessoes.map((s) => (s.id === a ? { ...s, status: "planejada" as const, data: "2026-11-13" } : s)), active_sessao_id: a };
  const r3 = trocarTreinoHoje(ativoVelho, b2, "2026-11-13");
  ok(r3.ok && r3.state.active_sessao_id === null && proximaSessao(r3.state, "2026-11-13")?.id === b2, "ativo antigo: limpo, e o escolhido aparece no Hoje");

  // Escolhido já marcado como feito HOJE (caso real): sem série → tira a marcação e vira o de hoje.
  const feitoHojeSemSerie: AppState = {
    ...st,
    sessoes: st.sessoes.map((s) => (s.id === b2 ? { ...s, status: "concluida" as const, data: "2026-11-13", finalizada_em: "2026-11-13T15:00:00Z" } : s)),
  };
  const r4 = trocarTreinoHoje(feitoHojeSemSerie, b2, "2026-11-13");
  const b2r4 = r4.ok ? r4.state.sessoes.find((s) => s.id === b2)! : null;
  ok(r4.ok && b2r4!.status === "planejada" && b2r4!.data === "2026-11-13", "feito hoje sem série: a marcação sai e ele vira o treino de hoje");
  ok(r4.ok && !r4.state.sessoes.some((s) => s.id.startsWith(`${b2}#`)), "feito hoje sem série: não cria registro avulso vazio");
  ok(r4.ok && proximaSessao(r4.state, "2026-11-13")?.id === b2, "feito hoje sem série: aparece no Hoje");

  // Feito hoje COM série: a execução fica guardada (avulso de hoje, com as séries) e o treino repete hoje.
  const feitoHojeComSerie: AppState = { ...feitoHojeSemSerie, registros: [{ ...reg(a, "2026-11-13T14:00:00Z", 1), sessao_id: b2 }] };
  const r5 = trocarTreinoHoje(feitoHojeComSerie, b2, "2026-11-13");
  const av = r5.ok ? r5.state.sessoes.find((s) => s.id.startsWith(`${b2}#`)) : undefined;
  ok(r5.ok && !!av && av.data === "2026-11-13" && r5.state.registros.every((r) => r.sessao_id === av.id), "feito hoje com série: execução guardada com as séries");
  ok(r5.ok && r5.state.sessoes.find((s) => s.id === b2)!.status === "planejada" && proximaSessao(r5.state, "2026-11-13")?.id === b2, "feito hoje com série: repete hoje");

  // Outro treino marcado como feito HOJE sem série (ex.: Finalizar num treino vazio) segurava o dia: volta pra fila.
  const c = ids[2]!;
  const ocupado: AppState = { ...st, sessoes: st.sessoes.map((s) => (s.id === c ? { ...s, status: "concluida" as const, data: "2026-11-13" } : s)) };
  const r6 = trocarTreinoHoje(ocupado, b2, "2026-11-13");
  ok(r6.ok && r6.desmarcados.includes(c) && r6.state.sessoes.find((s) => s.id === c)!.status === "planejada", "feito hoje sem série: a marcação falsa sai e avisa");
  // Feito hoje com série continua feito e é avisado.
  const real: AppState = { ...ocupado, registros: [{ ...reg(a, "2026-11-13T14:00:00Z", 1), sessao_id: c }] };
  const r7 = trocarTreinoHoje(real, b2, "2026-11-13");
  ok(r7.ok && r7.feitosHoje.includes(c) && r7.state.sessoes.find((s) => s.id === c)!.status === "concluida", "feito hoje com série: continua feito e é avisado");
}

if (fail) { console.error(`\n${fail} falha(s)`); process.exit(1); }
console.log("\nsmoke:inicio-treino OK");
