/** smoke:inteligencia — volume autorregulado por músculo e briefing do treino. */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { ajusteDoMusculo, aplicarVolumeAutorregulado, ocorrenciasDoMusculo, textosAutorregulado } from "../src/lib/inteligencia/volume-autorregulado";
import { metaDoExercicio, montarBriefing } from "../src/lib/inteligencia/briefing";
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

// 4) Estado antigo sem o campo continua válido
ok(AppStateSchema.safeParse({ perfil: null, plano: null }).success, "estado sem feedbacks_musculo continua válido");

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
