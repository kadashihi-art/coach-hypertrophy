/** smoke:inteligencia — volume autorregulado por músculo e briefing do treino. */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { ajusteDoMusculo, aplicarVolumeAutorregulado, ocorrenciasDoMusculo, textosAutorregulado } from "../src/lib/inteligencia/volume-autorregulado";
import { metaDoExercicio, montarBriefing } from "../src/lib/inteligencia/briefing";
import { diagnosticarEstagnacao, preverForca } from "../src/lib/inteligencia/diagnostico";
import { e1rmNormal, lerDia } from "../src/lib/inteligencia/leitura-dia";
import { revisarSemana, segundaDaRevisao } from "../src/lib/inteligencia/revisao-semanal";
import { e1rmEpley } from "../src/lib/engine/e1rm";
import { AppStateSchema, type FeedbackMusculo, type Perfil } from "../src/lib/domain";

let fail = 0;
const ok = (c: boolean, m: string) => { if (c) console.log("PASS", m); else { fail++; console.log("FAIL", m); } };
let t = 0;
const fb = (grupo: string, momento: "pos" | "pre", extra: Partial<FeedbackMusculo>, data = "2026-11-01"): FeedbackMusculo =>
  ({ id: `f${t}`, grupo, data, momento, sessao_id: momento === "pos" ? `s${t}` : null, registrado_em: new Date(Date.UTC(2026, 10, 1, 0, t++)).toISOString(), ...extra }) as FeedbackMusculo;

// 1) Regras por ocorrência
{
  t = 0;
  const f = [fb("peito", "pos", { estimulo: 0 }), fb("peito", "pre", { dor_muscular: 0 })];
  ok(ajusteDoMusculo(f, "peito").ajuste === 1, "recuperado + estímulo fraco → +1");
  ok(/recuperado e o estímulo foi fraco/.test(ajusteDoMusculo(f, "peito").motivo ?? ""), "motivo em texto de gente");
  const g = [fb("quadriceps", "pos", { estimulo: 2 }), fb("quadriceps", "pre", { dor_muscular: 2 })];
  ok(ajusteDoMusculo(g, "quadriceps").ajuste === -1, "bem dolorido → −1");
  const h = [fb("ombros", "pos", { estimulo: 0, articulacao: true }), fb("ombros", "pre", { dor_muscular: 0 })];
  ok(ajusteDoMusculo(h, "ombros").ajuste === -1, "articulação → −1 (mesmo com estímulo fraco)");
  const i = [fb("costas", "pos", { estimulo: 1 }), fb("costas", "pre", { dor_muscular: 0 })];
  ok(ajusteDoMusculo(i, "costas").ajuste === 0, "recuperado + estímulo bom → 0 (a rampa cuida)");
  ok(ajusteDoMusculo([fb("biceps", "pos", { estimulo: 0 })], "biceps").ajuste === 0, "sem resposta de recuperação → não sobe");
  // acumulado com teto
  const muitos = Array.from({ length: 6 }, () => [fb("gluteos", "pos", { estimulo: 0 }), fb("gluteos", "pre", { dor_muscular: 0 })]).flat();
  ok(ajusteDoMusculo(muitos, "gluteos").ajuste === 2, "acumulado limitado a +2");
  // pareamento: a recuperação vale pro treino anterior, não pro seguinte
  const par = [fb("peito", "pos", { estimulo: 0 }), fb("peito", "pre", { dor_muscular: 0 }), fb("peito", "pos", { estimulo: 2 })];
  const oc = ocorrenciasDoMusculo(par, "peito");
  ok(oc.length === 2 && oc[0]!.dor_muscular === 0 && oc[1]!.dor_muscular === null, "recuperação pareada com o treino anterior");
  // desde o início do bloco
  ok(ajusteDoMusculo([fb("peito", "pos", { estimulo: 0 }, "2026-10-01"), fb("peito", "pre", { dor_muscular: 0 }, "2026-10-03")], "peito", "2026-10-15").ajuste === 0, "feedback de antes do bloco não conta");
}

// 2) Aplicado no treino: exercício principal, travas
const base: Perfil = {
  id: "smoke", peso_kg: 80, altura_cm: 178, experiencia: "intermediario", dias_por_semana: 4, minutos_por_sessao: 60,
  cardio_min_semana: 0, equipamentos: ["barra", "halteres", "maquina", "cabo", "peso_corporal"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: "2026-11-04T00:00:00Z", parq_respostas: [false, false, false, false, false, false, false],
  criado_em: "2026-11-04T00:00:00Z",
};
const g = gerarPlanoFromPerfil(base, CATALOG_EXERCICIOS);
const upper = g.sessoes[0]!;
const meso = { ...g.plano.mesociclo, semana_atual: 2, data_inicio: null };
{
  t = 0;
  const f = [fb("peito", "pos", { estimulo: 0 }), fb("peito", "pre", { dor_muscular: 0 }), fb("costas", "pos", { estimulo: 2 }), fb("costas", "pre", { dor_muscular: 2 })];
  const r = aplicarVolumeAutorregulado({ prescricoes: upper.prescricoes, exercicios: CATALOG_EXERCICIOS, feedbacks: f, mesociclo: meso, sessoesDaSemana: g.sessoes });
  const peitoP = upper.prescricoes.find((p) => CATALOG_EXERCICIOS.find((e) => e.id === p.exercicio_id)?.grupo_primario === "peito")!;
  const aj = r.ajustes.find((a) => a.grupo === "peito");
  const ajC = r.ajustes.find((a) => a.grupo === "costas");
  ok(!!aj && aj.prescricao_id === peitoP.id && aj.series_depois === aj.series_antes + 1, `peito +1 no exercício principal (${aj?.series_antes}→${aj?.series_depois})`);
  ok(!!ajC && ajC.series_depois === ajC.series_antes - 1, "costas −1");
  ok(r.prescricoes.every((p) => p.series >= 2 && p.series <= 5), "séries entre 2 e 5");
  ok(textosAutorregulado(r, CATALOG_EXERCICIOS).some((x) => /^\+1 série em .+: você chegou recuperado/.test(x)), "frase do ajuste");
  // deload / check-in ruim: só reduz
  const ruim = aplicarVolumeAutorregulado({ prescricoes: upper.prescricoes, exercicios: CATALOG_EXERCICIOS, feedbacks: f, mesociclo: meso, checkin: { sono_h: 5, prontidao: 3 }, sessoesDaSemana: g.sessoes });
  ok(!ruim.ajustes.some((a) => a.grupo === "peito") && ruim.ajustes.some((a) => a.grupo === "costas"), "recuperação ruim: não sobe, mas reduz");
  const del = aplicarVolumeAutorregulado({ prescricoes: upper.prescricoes, exercicios: CATALOG_EXERCICIOS, feedbacks: f, mesociclo: { ...meso, semana_atual: meso.total_semanas }, sessoesDaSemana: g.sessoes });
  ok(!del.ajustes.some((a) => a.series_depois > a.series_antes), "deload: nunca sobe");
  // sem feedback: nada muda
  const nada = aplicarVolumeAutorregulado({ prescricoes: upper.prescricoes, exercicios: CATALOG_EXERCICIOS, feedbacks: [], mesociclo: meso, sessoesDaSemana: g.sessoes });
  ok(nada.prescricoes === upper.prescricoes && nada.ajustes.length === 0, "sem feedback: treino igual");
  // articulação → sugestão de troca
  const art = aplicarVolumeAutorregulado({ prescricoes: upper.prescricoes, exercicios: CATALOG_EXERCICIOS, feedbacks: [fb("peito", "pos", { estimulo: 1, articulacao: true })], mesociclo: meso, sessoesDaSemana: g.sessoes });
  ok(art.trocar.some((x) => x.exercicio_id === peitoP.exercicio_id), `articulação → sugere trocar o exercício (${JSON.stringify(art.trocar)})`);
}

// 3) Briefing
{
  const ex = CATALOG_EXERCICIOS.find((e) => e.id === "supino_reto_convencional")!;
  ok(/1 rep a mais/.test(metaDoExercicio({ ex, cargaHoje: 80, faixa: [8, 12], rir: 2, ultimaCarga: 80, ultimasReps: 9 })) && /× 10/.test(metaDoExercicio({ ex, cargaHoje: 80, faixa: [8, 12], rir: 2, ultimaCarga: 80, ultimasReps: 9 })), "mesma carga → 1 rep a mais");
  ok(/^Carga nova/.test(metaDoExercicio({ ex, cargaHoje: 82.5, faixa: [8, 12], rir: 2, ultimaCarga: 80, ultimasReps: 12 })), "carga subiu → carga nova");
  ok(/passo atrás/.test(metaDoExercicio({ ex, cargaHoje: 75, faixa: [8, 12], rir: 2, ultimaCarga: 80, ultimasReps: 6 })), "carga desceu → passo atrás");
  ok(/^Primeira vez/.test(metaDoExercicio({ ex, cargaHoje: 60, faixa: [8, 12], rir: 2, ultimaCarga: null, ultimasReps: null })), "sem histórico → primeira vez");
  const st = AppStateSchema.parse({ perfil: base, exercicios: CATALOG_EXERCICIOS, plano: g.plano, sessoes: g.sessoes, estados: g.estados });
  const b = montarBriefing({ state: st, prescricoes: upper.prescricoes, mesociclo: meso, hojeIso: "2026-11-11", baseSeries: new Map(upper.prescricoes.map((p) => [p.id, p.series - 1])) });
  ok(b.itens.length === upper.prescricoes.length, "1 item por exercício");
  ok(b.itens.every((i) => i.delta_series === 1), "delta do dia sobre a base");
  ok(b.itens[0]!.prep === "aquece + aproximação antes", "preparação do 1º exercício");
  ok(/^Semana 2 de 6/.test(b.cabecalho), `cabeçalho: ${b.cabecalho}`);
  ok(b.itens.every((i) => !/\bmotor\b|R\d{1,2}\b/.test([i.meta, i.porque ?? ""].join(" "))), "sem 'motor' nem código de regra");
}

// 4) Diagnóstico de estagnação e previsão
{
  const reg = (sessao_id: string, dia: string, carga_kg: number, reps: number, rir: number, extra: Record<string, unknown> = {}) =>
    ({ id: `${sessao_id}-${reps}-${carga_kg}-${Math.random()}`, sessao_id, prescricao_id: "p", exercicio_id: "supino_reto_convencional", numero: 1, tipo_serie: "top_set", carga_kg, reps, rir_percebido: rir, dor: false, executado_em: `${dia}T12:00:00Z`, ...extra }) as never;
  const estado = (sessoes_sem_progresso: number) => ({ exercicio_id: "supino_reto_convencional", carga_atual_kg: 80, faixa_reps: [8, 12], rir_alvo: 2, alvo_proxima_sessao: { carga_kg: 80, faixa_reps: [8, 12], rir_alvo: 2 }, sessoes_sem_progresso, primeira_sessao: false }) as never;
  const st = (over: Record<string, unknown>) => ({ estados: [estado(3)], registros: [], exercicios: CATALOG_EXERCICIOS, checkins: [], volumes_semanais: [], perfil: base, feedbacks_musculo: [], ...over }) as never;
  ok(diagnosticarEstagnacao(st({ estados: [estado(1)] }), "supino_reto_convencional", "2026-11-11") === null, "sem estagnação → sem diagnóstico");
  const longe = diagnosticarEstagnacao(st({ registros: ["2026-11-01", "2026-11-04", "2026-11-08"].map((d, i) => reg(`s${i}`, d, 80, 9, 4)) }), "supino_reto_convencional", "2026-11-11")!;
  ok(longe.causas[0]!.id === "longe_falha" && /RIR médio de 4/.test(longe.causas[0]!.evidencia), `RIR alto → longe da falha (${longe.causas[0]!.evidencia})`);
  const sono = diagnosticarEstagnacao(st({ checkins: ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"].map((data) => ({ id: data, data, sono_h: 5.5, prontidao: 3, dor: [] })) }), "supino_reto_convencional", "2026-11-11")!;
  ok(sono.causas.some((c) => c.id === "sono"), "sono curto aparece como causa");
  const prot = diagnosticarEstagnacao(st({ checkins: ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"].map((data) => ({ id: data, data, sono_h: 8, prontidao: 4, dor: [], proteina_g: 90 })) }), "supino_reto_convencional", "2026-11-11")!;
  ok(prot.causas.some((c) => c.id === "proteina" && /90 g/.test(c.evidencia)), "proteína abaixo da meta (80 kg → mín 130 g)");
  const dor = diagnosticarEstagnacao(st({ registros: [reg("s1", "2026-11-05", 80, 9, 2, { dor: true })] }), "supino_reto_convencional", "2026-11-11")!;
  ok(dor.causas[0]!.id === "dor", "dor no exercício vem primeiro");
  const nada = diagnosticarEstagnacao(st({}), "supino_reto_convencional", "2026-11-11")!;
  ok(nada.causas.length === 1 && nada.causas[0]!.id === "adaptacao", "sem sinal nos dados → adaptação (variar)");
  ok([longe, sono, prot, dor, nada].every((d) => d.causas.every((c) => !/\bmotor\b|R\d{1,2}\b/.test(c.acao + c.evidencia))), "textos sem 'motor' nem código de regra");

  // Previsão: ~+1 kg/semana no e1RM
  const prog = [0, 7, 14, 21, 28].map((d, i) => reg(`p${i}`, new Date(Date.UTC(2026, 9, 14 + d)).toISOString().slice(0, 10), 80 + i * 0.75, 10, 2));
  const pv = preverForca(prog, "supino_reto_convencional", "2026-11-11");
  ok(!!pv && pv.kg_por_semana > 0.5 && pv.kg_por_semana < 1.5 && pv.marco_kg % 5 === 0 && pv.semanas >= 1, `previsão: ${pv?.texto}`);
  ok(preverForca(prog.slice(0, 3), "supino_reto_convencional", "2026-11-11") === null, "menos de 4 sessões → sem previsão");
  const parado = [0, 7, 14, 21].map((d, i) => reg(`q${i}`, new Date(Date.UTC(2026, 9, 14 + d)).toISOString().slice(0, 10), 80, 10, 2));
  ok(preverForca(parado, "supino_reto_convencional", "2026-11-11") === null, "sem ritmo → sem previsão (não promete)");
}

// 5) Leitura do dia (durante o treino)
{
  const R = (sessao_id: string, dia: string, exercicio_id: string, carga_kg: number, reps: number, rir: number, tipo_serie = "top_set", prescricao_id = "x") =>
    ({ id: `${sessao_id}-${exercicio_id}-${Math.random()}`, sessao_id, prescricao_id, exercicio_id, numero: 1, tipo_serie, carga_kg, reps, rir_percebido: rir, dor: false, executado_em: `${dia}T12:00:00Z` }) as never;
  const sup = upper.prescricoes[0]!;
  const hist = ["2026-10-20", "2026-10-27", "2026-11-03"].map((d, i) => R(`h${i}`, d, sup.exercicio_id, 80, 8, 2));
  ok(Math.abs(e1rmNormal(hist, sup.exercicio_id, "hoje")! - e1rmEpley(80, 10)) < 0.01, "normal = mediana das últimas sessões (não o recorde)");
  ok(e1rmNormal(hist.slice(0, 1), sup.exercicio_id, "hoje") === null, "1 sessão só → sem normal");
  const sessao = { id: "hoje", prescricoes: upper.prescricoes } as never;
  // dia ruim: 72 × 8 RIR 2 (~10% abaixo)
  const ruim = lerDia({ sessao, registros: [...hist, R("hoje", "2026-11-10", sup.exercicio_id, 72, 8, 2, "top_set", sup.id)], exercicios: CATALOG_EXERCICIOS })!;
  ok(ruim?.tipo === "ruim" && /~10% abaixo/.test(ruim.texto), `dia ruim detectado: ${ruim?.texto.slice(0, 60)}`);
  ok(ruim.mudancas.every((m) => m.para === m.de - 1 && m.para >= 2), "ruim: −1 série em cada exercício (mín. 2)");
  ok(ruim.mudancas.find((m) => m.prescricao_id === sup.id)!.para >= 2, "exercício atual mantém pelo menos a série feita + 1");
  ok(!/\bmotor\b|R\d{1,2}\b/.test(ruim.texto), "texto sem 'motor' nem código");
  // dia forte
  const bom = lerDia({ sessao, registros: [...hist, R("hoje", "2026-11-10", sup.exercicio_id, 85, 8, 2, "top_set", sup.id)], exercicios: CATALOG_EXERCICIOS })!;
  ok(bom?.tipo === "bom" && bom.mudancas.length === 1 && bom.mudancas[0]!.para === bom.mudancas[0]!.de + 1, "dia forte: +1 série no exercício atual");
  // normal: nada
  ok(lerDia({ sessao, registros: [...hist, R("hoje", "2026-11-10", sup.exercicio_id, 80, 8, 2, "top_set", sup.id)], exercicios: CATALOG_EXERCICIOS }) === null, "dentro do normal: não propõe nada");
  // já respondeu: não pergunta de novo
  ok(lerDia({ sessao: { ...(sessao as object), leitura_dia: { tipo: "ruim", razao: 0.9, resposta: "mantida", em: "x" } } as never, registros: [...hist, R("hoje", "2026-11-10", sup.exercicio_id, 72, 8, 2, "top_set", sup.id)], exercicios: CATALOG_EXERCICIOS }) === null, "resposta guardada: não repete");
  // aquecimento não conta
  ok(lerDia({ sessao, registros: [...hist, R("hoje", "2026-11-10", sup.exercicio_id, 40, 8, 5, "aquecimento", sup.id)], exercicios: CATALOG_EXERCICIOS }) === null, "aquecimento não dispara leitura");
}

// 6) Revisão semanal
{
  ok(segundaDaRevisao("2026-11-15") === "2026-11-09", "domingo → revisa a semana que está fechando");
  ok(segundaDaRevisao("2026-11-11") === "2026-11-02", "quarta → revisa a semana anterior");
  ok(segundaDaRevisao("2026-11-09") === "2026-11-02", "segunda → revisa a semana anterior");
  const R = (sessao_id: string, dia: string, exercicio_id: string, carga_kg: number, reps: number, rir: number) =>
    ({ id: `${sessao_id}-${exercicio_id}-${Math.random()}`, sessao_id, prescricao_id: `${sessao_id}-${exercicio_id}`, exercicio_id, numero: 1, tipo_serie: "top_set", carga_kg, reps, rir_percebido: rir, dor: false, executado_em: `${dia}T15:00:00Z` }) as never;
  const registros = [
    R("a0", "2026-10-28", "supino_reto_convencional", 80, 8, 2),
    R("a1", "2026-11-03", "supino_reto_convencional", 82.5, 8, 2),
    R("a1", "2026-11-03", "agachamento_barra", 100, 8, 2),
    R("a2", "2026-11-05", "remada_curvada", 70, 10, 5),
  ];
  const st = AppStateSchema.parse({
    perfil: base, exercicios: CATALOG_EXERCICIOS, plano: g.plano, sessoes: g.sessoes, estados: g.estados, registros,
    checkins: ["2026-11-03", "2026-11-04", "2026-11-05"].map((data) => ({ id: data, data, sono_h: 6, prontidao: 3, dor: [], proteina_g: 100 })),
    volumes_semanais: [{ semana_iso: "2026-W45", grupo: "peito", series_diretas: 4, series_indiretas: 0, series_efetivas: 4 }],
  });
  const r = revisarSemana(st, "2026-11-11")!;
  ok(!!r && r.semana_iso === "2026-W45" && r.rotulo === "2 a 8 de nov", `semana revisada: ${r?.rotulo}`);
  ok(r.treinos.feitos === 2 && r.treinos.planejados === 4, "2 de 4 treinos");
  ok(r.destaques.some((d) => /Supino.*novo melhor/.test(d)), "recorde do supino aparece nos destaques");
  ok(r.atencao.some((d) => /2 de 4 treinos/.test(d)) && r.atencao.some((d) => /Sono médio de 6 h/.test(d)) && r.atencao.some((d) => /Proteína média de 100 g/.test(d)), "atenção: treinos, sono e proteína");
  ok(r.atencao.some((d) => /Abaixo de 10 séries: peito \(4\)/.test(d)), "músculo abaixo da faixa");
  ok(r.proxima.length >= 1 && r.proxima.some((d) => /Semana \d de 6/.test(d)), `próxima semana: ${r.proxima[0]}`);
  ok(/^2\/4 treinos/.test(r.resumo), `resumo: ${r.resumo}`);
  ok(revisarSemana(AppStateSchema.parse({ perfil: base, plano: g.plano }), "2026-11-11") === null, "semana sem treino → sem revisão");
  ok([...r.destaques, ...r.atencao, ...r.proxima].every((t) => !/\bmotor\b|R\d{1,2}\b/.test(t)), "sem 'motor' nem código");
}

// 7) Estado antigo sem o campo continua válido
ok(AppStateSchema.safeParse({ perfil: null, plano: null }).success, "estado sem feedbacks_musculo continua válido");

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
