/** smoke:fechamento-bloco — análise por músculo no fim do bloco e proposta do próximo. */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS as C } from "../src/lib/catalog/exercicios";
import { alvosComAjustePessoal, volumeSemanalDasSessoes } from "../src/lib/plan/equilibrar-volume";
import { fecharBloco, previaProximoBloco, progressoDoExercicio } from "../src/lib/inteligencia/fechamento-bloco";
import { isoWeekDoDia } from "../src/lib/engine/volume";
import { AppStateSchema, PerfilSchema, type Perfil } from "../src/lib/domain";

let fail = 0;
const ok = (c: boolean, m: string) => { if (c) console.log("PASS", m); else { fail++; console.log("FAIL", m); } };
const base: Perfil = {
  id: "smoke", peso_kg: 80, altura_cm: 178, experiencia: "intermediario", dias_por_semana: 4, minutos_por_sessao: 75,
  cardio_min_semana: 0, equipamentos: ["barra", "halteres", "maquina", "cabo", "peso_corporal"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: "2026-09-01T00:00:00Z", parq_respostas: [false, false, false, false, false, false, false],
  criado_em: "2026-09-01T00:00:00Z",
};
const addDias = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

// 1) Perfil e gerador
ok(PerfilSchema.safeParse(base).success, "perfil sem ajuste continua válido");
ok(PerfilSchema.safeParse({ ...base, ajuste_volume_musculo: { peito: 2, costas: -2 } }).success, "perfil com ajuste parcial válido");
ok(!PerfilSchema.safeParse({ ...base, ajuste_volume_musculo: { peito: 5 } }).success, "ajuste limitado a ±4");
const g0 = gerarPlanoFromPerfil(base, C);
const g1 = gerarPlanoFromPerfil({ ...base, ajuste_volume_musculo: { peito: 2, costas: -2 } }, C);
const v0 = volumeSemanalDasSessoes(g0.sessoes, C), v1 = volumeSemanalDasSessoes(g1.sessoes, C);
ok(v1.get("peito")!.efetivo === v0.get("peito")!.efetivo + 2, `peito +2 (${v0.get("peito")!.efetivo} → ${v1.get("peito")!.efetivo})`);
ok(v1.get("costas")!.efetivo === v0.get("costas")!.efetivo - 2, `costas −2 (${v0.get("costas")!.efetivo} → ${v1.get("costas")!.efetivo})`);
ok([...v1.values()].every((x) => x.efetivo <= 20), "teto 20 respeitado com ajuste");
const gVazio = gerarPlanoFromPerfil({ ...base, ajuste_volume_musculo: {} }, C);
ok(JSON.stringify(gVazio.sessoes.map((s) => s.prescricoes.map((p) => [p.exercicio_id, p.series]))) === JSON.stringify(g0.sessoes.map((s) => s.prescricoes.map((p) => [p.exercicio_id, p.series]))), "ajuste vazio = plano igual");
const alvos = alvosComAjustePessoal(new Map([["peito", { diretas: 19, indiretas: 0, efetivo: 19 }], ["costas", { diretas: 11, indiretas: 0, efetivo: 11 }]]) as never, { peito: 4, costas: -4 }, base);
ok(alvos.get("peito")!.min <= 20 && alvos.get("costas")!.max === 10, "sobe até 20 e nunca desce de 10");

// 2) Progresso do exercício
const R = (sessao_id: string, dia: string, exercicio_id: string, carga_kg: number, reps: number, rir = 2) =>
  ({ id: `${sessao_id}-${exercicio_id}-${dia}`, sessao_id, prescricao_id: "p", exercicio_id, numero: 1, tipo_serie: "top_set", carga_kg, reps, rir_percebido: rir, dor: false, executado_em: `${dia}T15:00:00Z` }) as never;
const inicio = "2026-09-28"; // segunda
const hoje = addDias(inicio, 7 * 6 + 1); // semana 7: bloco de 6 terminou
const dias = [0, 7, 14, 21, 28].map((d) => addDias(inicio, d));
const sobe = dias.map((d, i) => R(`a${i}`, d, "supino_reto_convencional", 80 + i * 2.5, 8));
const parado = dias.map((d, i) => R(`b${i}`, d, "agachamento_barra", 100, 8));
ok(progressoDoExercicio(sobe, "supino_reto_convencional", inicio, hoje)! > 5, "progresso positivo medido");
ok(Math.abs(progressoDoExercicio(parado, "agachamento_barra", inicio, hoje)!) < 0.01, "parado = 0%");
ok(progressoDoExercicio(sobe.slice(0, 2), "supino_reto_convencional", inicio, hoje) === null, "menos de 3 sessões → sem dado");

// 3) Fechamento
const semanas = [0, 1, 2, 3, 4].map((k) => isoWeekDoDia(addDias(inicio, 7 * k)));
const vol = (grupo: string, n: number) => semanas.map((semana_iso) => ({ semana_iso, grupo, series_diretas: n, series_indiretas: 0, series_efetivas: n }));
let t = 0;
const fb = (grupo: string, momento: "pos" | "pre", extra: object, dia: string) =>
  ({ id: `f${t}`, grupo, data: dia, momento, sessao_id: momento === "pos" ? `s${t}` : null, registrado_em: new Date(Date.parse(dia + "T10:00:00Z") + t++ * 60000).toISOString(), ...extra });
const feedbacks = [
  fb("ombros", "pos", { estimulo: 2 }, dias[0]!), fb("ombros", "pre", { dor_muscular: 2 }, dias[1]!),
  fb("ombros", "pos", { estimulo: 2 }, dias[1]!), fb("ombros", "pre", { dor_muscular: 2 }, dias[2]!),
  fb("ombros", "pos", { estimulo: 1 }, dias[2]!),
];
const plano = { ...g0.plano, mesociclo: { ...g0.plano.mesociclo, data_inicio: inicio } };
const mk = (over: object = {}) => AppStateSchema.parse({
  perfil: base, exercicios: C, plano, sessoes: g0.sessoes, estados: g0.estados,
  registros: [...sobe, ...parado, ...dias.map((d, i) => R(`c${i}`, d, "rosca_direta", 30, 10))],
  volumes_semanais: [...vol("peito", 12), ...vol("quadriceps", 14), ...vol("biceps", 6), ...vol("ombros", 16)],
  feedbacks_musculo: feedbacks, ...over,
});
const st = mk();
ok(fecharBloco(st, addDias(inicio, 10)) === null, "meio do bloco: sem fechamento");
ok(fecharBloco(st, addDias(inicio, 7 * 5 + 1))?.fase === "ultima_semana", "semana 6 de 6: última semana");
const f = fecharBloco(st, hoje)!;
ok(f.fase === "terminou", "depois da semana 6: terminou");
const m = (g: string) => f.musculos.find((x) => x.grupo === g)!;
ok(m("peito").veredito === "respondeu" && m("peito").delta === 0, `peito respondeu → mantém (${m("peito").texto})`);
ok(m("quadriceps").veredito === "pouco_progresso" && m("quadriceps").delta === 2, `quadríceps parado com volume cumprido → +2`);
ok(m("biceps").veredito === "faltou_volume" && m("biceps").delta === 0, "bíceps parado sem cumprir o volume → mantém");
ok(m("ombros").veredito === "excesso" && m("ombros").delta === -2, "ombros dolorido 2× → −2");
ok(m("panturrilhas").veredito === "sem_dados" && m("panturrilhas").delta === 0, "sem dados → mantém");
ok(JSON.stringify(f.ajuste_volume_musculo) === JSON.stringify({ ombros: -2, quadriceps: 2 }) || (f.ajuste_volume_musculo.quadriceps === 2 && f.ajuste_volume_musculo.ombros === -2 && Object.keys(f.ajuste_volume_musculo).length === 2), "ajuste novo só com o que muda");
ok(/mais volume em quadríceps/.test(f.resumo) && /menos volume em ombros/.test(f.resumo), `resumo: ${f.resumo}`);
ok(f.musculos.every((x) => !/\bmotor\b|R\d{1,2}\b/.test(x.texto)), "textos sem 'motor' nem código");
// acumulado com limite
const f2 = fecharBloco(mk({ perfil: { ...base, ajuste_volume_musculo: { quadriceps: 4 } } }), hoje)!;
ok(f2.ajuste_volume_musculo.quadriceps === 4 && f2.musculos.find((x) => x.grupo === "quadriceps")!.delta === 0, "acumulado não passa de +4");
// no teto
const f3 = fecharBloco(mk({ volumes_semanais: [...vol("quadriceps", 20)] }), hoje)!;
ok(f3.musculos.find((x) => x.grupo === "quadriceps")!.veredito === "no_teto", "parado já com 20 séries → não sobe, sugere variar");
// bloco terminado há muito tempo: janela recente
const velho = fecharBloco(st, addDias(inicio, 7 * 20))!;
ok(velho.fase === "terminou" && velho.musculos.every((x) => x.veredito === "sem_dados"), "bloco antigo: dados de meses atrás não contam");

// 4) Prévia do próximo bloco (não grava)
const pv = previaProximoBloco(st, base, f.ajuste_volume_musculo, C, hoje);
const q = pv.volume.find((l) => l.grupo === "quadriceps"), o = pv.volume.find((l) => l.grupo === "ombros");
ok(!!q && q.depois === q.antes + 2, `prévia: quadríceps ${q?.antes} → ${q?.depois}`);
ok(!!o && o.depois === o.antes - 2, `prévia: ombros ${o?.antes} → ${o?.depois}`);
const pv0 = previaProximoBloco(mk({ registros: [] }), base, {}, C, hoje);
ok(pv0.volume.length === 0 && pv0.saem.length === 0, "sem ajuste e sem histórico: próximo bloco igual");

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
