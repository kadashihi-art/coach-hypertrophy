/** smoke:falha — proximidade da falha inteligente (lote 9). */
import {
  calibrarSerie,
  calibrarSessao,
  e1rmReferencia,
  feedbackSerie,
  liberacaoTecnicas,
  rirAlvoDoDia,
  seriesEfetivasSemana,
} from "../src/lib/engine/proximidade-falha";
import { isoWeekDe } from "../src/lib/engine/volume";
import { feedbackSono } from "../src/lib/domain/sono";
import type { RegistroSerie } from "../src/lib/domain";

let falhas = 0;
function ok(c: boolean, m: string) {
  console.log(c ? "✓" : "✗", m);
  if (!c) falhas++;
}
const livre = { composto: true, equipamento: "barra" as const };
const maquina = { composto: true, equipamento: "maquina" as const };
const iso = { composto: false, equipamento: "halteres" as const };
const meso = { total_semanas: 5, foco: "acumulo" };

// 1) RIR alvo
const a = (ex: typeof livre | typeof maquina | typeof iso, extra: Record<string, unknown> = {}) =>
  rirAlvoDoDia({ exercicio: ex, experiencia: "intermediario", semana_atual: 2, ...meso, ...extra } as never).alvo;
ok(a(livre) > a(iso), `composto livre (${a(livre)}) mais conservador que isolador (${a(iso)})`);
ok(a(iso, { semana_atual: 4 }) === 0, "isolador no fim do bloco chega a 0");
ok(a(livre, { semana_atual: 4 }) >= 1, "composto livre nunca pede falha");
ok(a(livre, { semana_atual: 1 }) > a(livre, { semana_atual: 4 }), "exigência sobe ao longo das semanas");
ok(a(maquina, { experiencia: "iniciante" }) > a(maquina), "iniciante mais conservador");
ok(a(iso, { foco: "deload" }) === 3, "deload: RIR 3");
ok(a(iso, { checkin: { sono_h: 5, prontidao: 4 } }) > a(iso), "sono curto: mais margem");
ok(a(iso, { checkin: { sono_h: 8, prontidao: 2 } }) > a(iso), "check-in ruim: mais margem");

// 2) Calibração
const c1 = calibrarSerie({ serie: { carga_kg: 100, reps: 8, rir_percebido: 3, tipo_serie: "trabalho" }, proxima: { carga_kg: 100, reps: 4, rir_percebido: 1, tipo_serie: "trabalho" } });
ok(c1.rir_interpretado < 3 && c1.desvio > 0, `RIR 3 com queda de 4 reps → interpretado ${c1.rir_interpretado}`);
const c2 = calibrarSerie({ serie: { carga_kg: 60, reps: 10, rir_percebido: 0, tipo_serie: "trabalho" }, proxima: { carga_kg: 60, reps: 10, rir_percebido: 0, tipo_serie: "trabalho" } });
ok(c2.rir_interpretado >= 1 && c2.desvio < 0, `RIR 0 repetindo as reps → interpretado ${c2.rir_interpretado}`);
const c3 = calibrarSerie({ serie: { carga_kg: 80, reps: 8, rir_percebido: 3, tipo_serie: "trabalho" }, e1rmRef: 80 * (1 + 9 / 30) });
ok(c3.rir_estimado === 1 && c3.rir_interpretado === 2, `e1RM indica 1 sobrando com RIR 3 marcado → ${c3.rir_interpretado}`);
const c4 = calibrarSerie({ serie: { carga_kg: 80, reps: 8, rir_percebido: 2, tipo_serie: "trabalho" }, e1rmRef: 80 * (1 + 11 / 30) });
ok(c4.rir_interpretado === 2, "diferença pequena: respeita o relatado");

// 3) Feedback
const alvoIso = rirAlvoDoDia({ exercicio: iso, experiencia: "intermediario", semana_atual: 2, ...meso });
const alvoLivre = rirAlvoDoDia({ exercicio: livre, experiencia: "intermediario", semana_atual: 2, ...meso });
const rel = (r: number) => ({ rir_estimado: null, rir_interpretado: r, desvio: 0, fonte: "relatado" as const });
const f1 = feedbackSerie({ serie: { carga_kg: 20, reps: 12, rir_percebido: 3, tipo_serie: "trabalho" }, faixa: [10, 15], alvo: alvoIso, cal: rel(3), ultima: false });
ok(f1.zona === "longe" && /Dava mais 1–2 reps; |Dava mais/.test(f1.texto) && /só sobraria 1/.test(f1.texto), `longe: ${f1.texto}`);
const f2 = feedbackSerie({ serie: { carga_kg: 20, reps: 12, rir_percebido: 1, tipo_serie: "trabalho" }, faixa: [10, 15], alvo: alvoIso, cal: rel(1), ultima: false });
ok(f2.zona === "efetiva", `efetiva: ${f2.texto}`);
const f3 = feedbackSerie({ serie: { carga_kg: 100, reps: 6, rir_percebido: 0, tipo_serie: "trabalho" }, faixa: [6, 10], alvo: alvoLivre, cal: rel(0), ultima: false });
ok(f3.zona === "falha" && /1–2 reps/.test(f3.texto), `falha em composto: ${f3.texto}`);
const f4 = feedbackSerie({ serie: { carga_kg: 100, reps: 8, rir_percebido: 3, tipo_serie: "trabalho" }, faixa: [6, 10], alvo: alvoLivre, cal: c1, ultima: false });
ok(!!f4.calibracao && /mais perto/.test(f4.calibracao), `calibração: ${f4.calibracao}`);
const f5 = feedbackSerie({ serie: { carga_kg: 40, reps: 10, rir_percebido: 2, tipo_serie: "aquecimento" }, faixa: [6, 10], alvo: alvoLivre, cal: rel(2), ultima: false });
ok(f5.zona === "aquecimento", "aquecimento não é cobrado");

const f6 = feedbackSerie({ serie: { carga_kg: 100, reps: 8, rir_percebido: 4, tipo_serie: "trabalho" }, faixa: [6, 10], alvo: { ...alvoLivre, alvo: 3 }, cal: rel(4), ultima: false });
ok(/Dava mais 1 rep\./.test(f6.texto), `singular: ${f6.texto}`);
// mesma sessão não calibra a si mesma
const s1: RegistroSerie[] = [4, 1].map((rir, i) => ({ ...mkBase(i), carga_kg: 60, reps: 8, rir_percebido: rir }));
const efS = seriesEfetivasSemana(s1, [{ id: "rosca", grupo_primario: "biceps" }], isoWeekDe(new Date("2026-11-03T12:00:00Z")));
ok(efS[0]?.efetivas === 1, `RIR 4 não vira efetiva usando a própria sessão: ${efS[0]?.efetivas}/${efS[0]?.total}`);

// 4) Técnicas
function mkBase(i: number): RegistroSerie {
  return { id: `b${i}`, sessao_id: "sx", prescricao_id: "px", exercicio_id: "rosca", numero: i + 1, tipo_serie: "trabalho", carga_kg: 60, reps: 8, rir_percebido: 2, dor: false, executado_em: "2026-11-03T12:00:00.000Z" };
}
const mk = (i: number, rir: number, dia = "2026-11-03"): RegistroSerie => ({
  id: `r${i}`, sessao_id: `s${Math.floor(i / 3)}`, prescricao_id: `p${Math.floor(i / 3)}`, exercicio_id: "rosca", numero: (i % 3) + 1,
  tipo_serie: "trabalho", carga_kg: 14, reps: 10, rir_percebido: rir, dor: false, executado_em: `${dia}T12:00:00.000Z`,
});
const perto = Array.from({ length: 9 }, (_, i) => mk(i, i % 3 === 2 ? 2 : 1));
const longe = Array.from({ length: 9 }, (_, i) => ({ ...mk(i, 4), carga_kg: 8 }));
ok(!liberacaoTecnicas({ registros: perto.slice(0, 3), hojeIso: "2026-11-04" }).liberado, "poucas séries: técnicas ainda não");
ok(!liberacaoTecnicas({ registros: longe, hojeIso: "2026-11-04" }).liberado, "longe da falha: técnicas não");
ok(liberacaoTecnicas({ registros: perto, hojeIso: "2026-11-04" }).liberado, "perto da falha e recuperado: libera");
ok(!liberacaoTecnicas({ registros: perto, hojeIso: "2026-11-04", checkin: { sono_h: 5, prontidao: 4 } }).liberado, "sono curto: não libera");
ok(!liberacaoTecnicas({ registros: perto, hojeIso: "2026-11-04", deload: true }).liberado, "deload: não libera");

// 5) Séries efetivas da semana
const sem = isoWeekDe(new Date("2026-11-03T12:00:00Z"));
const ef = seriesEfetivasSemana([...perto.slice(0, 3), ...longe.slice(3, 6).map((r) => ({ ...r, sessao_id: "x", prescricao_id: "x" }))], [{ id: "rosca", grupo_primario: "biceps" }], sem);
ok(ef[0]?.grupo === "biceps" && ef[0].total === 6 && ef[0].efetivas === 3, `bíceps: ${ef[0]?.efetivas}/${ef[0]?.total}`);
ok(calibrarSessao(perto.slice(0, 3)).length === 3, "calibra cada série de trabalho");
ok((e1rmReferencia(perto)["rosca"] ?? 0) > 0, "e1RM de referência só com séries perto da falha");

// 6) Sono alinhado ao resumo semanal
ok(feedbackSono(8, [{ sono_h: 6.5, sono_inicio: "23:00" }, { sono_h: 9, sono_inicio: "23:15" }], "23:05").titulo === "Sono na faixa boa", "duração variando não vira 'irregular'");
ok(feedbackSono(8, [{ sono_h: 8, sono_inicio: "21:00" }, { sono_h: 8, sono_inicio: "01:30" }], "23:00").titulo === "Horário de dormir irregular", "horário variando > 1 h → mesmo título do resumo");

// Textos: sem códigos, sem "motor"
const textos = [f1, f2, f3, f4, f5].flatMap((f) => [f.texto, f.calibracao ?? ""]);
textos.push(...[perto, longe].map((r) => liberacaoTecnicas({ registros: r, hojeIso: "2026-11-04" }).texto), ...alvoLivre.motivos);
for (const t of textos) ok(!/motor|_|\bR\d+\b|\d\.\d/.test(t), `texto limpo: "${t.slice(0, 80)}"`);

console.log("\nexemplos:");
for (const f of [f1, f2, f3, f4]) console.log(`- ${f.texto}${f.calibracao ? ` | ${f.calibracao}` : ""}`);
console.log(falhas ? `\n${falhas} falha(s)` : "\nsmoke:falha OK");
if (falhas) process.exit(1);
