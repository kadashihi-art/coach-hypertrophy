/** Smoke sono-agua: virada da noite, média, regularidade, meta de água, janelas 7/14, estado vazio e textos sem código. */
import {
  avaliarAgua, avaliarSono, desvio, estadoVazio, horaDoEixo, metaAguaMl, minutosEixoNoite,
  pesoAtual, resumirAgua, resumirSono, serieDias,
} from "../src/lib/sono-agua/avaliacao";
import { calcularDuracaoSono, feedbackSono } from "../src/lib/domain/sono";
import { GRUPO_LABEL } from "../src/lib/labels";

const SEM_ACENTO = Object.entries(GRUPO_LABEL).filter(([k, v]) => k !== v.toLowerCase()).map(([k]) => k);
const RE_SEM_ACENTO = new RegExp(String.raw`(?<![\p{L}_])(${SEM_ACENTO.join("|")})(?![\p{L}_])`, "iu");
function problemas(t: string): string[] {
  const out: string[] = [];
  if (/\w+:\d{4}-W\d+/.test(t)) out.push("id de semana");
  if (/\bN[0-2]\b/.test(t)) out.push("N0/N1/N2");
  if (/\(s\)|\(es\)/.test(t)) out.push("plural (s)");
  if (/\bmotor\b/i.test(t)) out.push("motor");
  if (RE_SEM_ACENTO.test(t)) out.push("músculo sem acento");
  if (/\bR(?:1[0-2]|[1-9])\b/.test(t)) out.push("código de regra");
  if (/\b[a-z]+_[a-z_]+\b/.test(t)) out.push("id snake_case");
  if (/\b1 (noites|dias|check-ins)\b|\b([02-9]|\d\d) (noite|dia)\b/.test(t)) out.push("plural errado");
  return out;
}

let falhas = 0;
function ok(c: boolean, m: string) {
  console.log(c ? "✓" : "✗", m);
  if (!c) { falhas++; process.exitCode = 1; }
}
const HOJE = "2026-11-04";
const d = (n: number) => { const x = new Date(`${HOJE}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - n); return x.toISOString().slice(0, 10); };
function ck(n: number, ini: string, fim: string, agua?: number, peso?: number) {
  return { data: d(n), sono_inicio: ini, sono_fim: fim, sono_h: calcularDuracaoSono(ini, fim), agua_ml: agua, peso_kg: peso, prontidao: 4 };
}

// virada da noite
ok(calcularDuracaoSono("23:30", "06:45") === 7.25, "23:30 → 06:45 = 7,25 h");
ok(minutosEixoNoite("23:30")! < minutosEixoNoite("00:30")!, "00:30 vem depois de 23:30 no eixo da noite");
ok(horaDoEixo(minutosEixoNoite("00:15")!) === "00:15", "ida e volta do eixo");
const dorm = ["23:30", "00:30"].map((h) => minutosEixoNoite(h)!);
ok(Math.round(desvio(dorm)!) === 30, "desvio 23:30 e 00:30 = 30 min (não 11 h)");

// meta de água
ok(metaAguaMl(80) === 2750, "80 kg → 2,75 L (35 ml/kg, múltiplo de 250)");
ok(metaAguaMl(40) === 1500, "mínimo 1,5 L");
ok(metaAguaMl(150) === 4000, "máximo 4 L");
ok(metaAguaMl(null) === 2500, "sem peso → 2,5 L");
ok(pesoAtual([{ data: d(3), sono_h: 7, peso_kg: 82 }, { data: d(1), sono_h: 7, peso_kg: 80 }], 90) === 80, "peso mais recente do check-in");
ok(pesoAtual([], 90) === 90, "sem check-in com peso → perfil");

// estado vazio
const vazio = serieDias([], HOJE, 7);
ok(vazio.length === 7 && vazio[6]!.data === HOJE, "série de 7 dias termina hoje");
ok(estadoVazio(vazio, 7)?.titulo.startsWith("Ainda sem") === true, "estado vazio sem registros");
ok(avaliarSono(vazio, 7) === null && avaliarAgua(vazio, 2500, 7) === null, "sem avaliação sem dados");
const dois = serieDias([ck(0, "23:00", "07:00"), ck(1, "23:00", "07:00")], HOJE, 7);
const v2 = estadoVazio(dois, 7);
ok(v2?.titulo === "Quase lá" && /2 noites registradas/.test(v2.texto) && /1 check-in /.test(v2.texto), `estado parcial: ${v2?.texto}`);

// semana boa
const boa = Array.from({ length: 7 }, (_, i) => ck(i, "23:00", "07:00", 3000, 80));
const sb = serieDias(boa, HOJE, 7);
const rs = resumirSono(sb);
ok(rs.noites === 7 && rs.media_h === 8 && rs.abaixo7 === 0 && rs.variacao_dormir_min === 0, "média 8 h, regular");
const aBoa = avaliarSono(sb, 7)!;
ok(aBoa.titulo === "Sono na faixa boa" && aBoa.urgencia === "info", `semanal boa: ${aBoa.porque}`);
const agB = avaliarAgua(sb, metaAguaMl(80), 7)!;
ok(agB.titulo === "Água em dia" && /7 de 7 dias/.test(agB.porque), `água boa: ${agB.porque}`);

// semana ruim com noites < 6 h (cita o treino mais leve)
const ruim = [ck(0, "01:00", "06:00", 1500), ck(1, "00:30", "06:15", 1000), ck(2, "23:30", "06:30", 2000), ck(3, "01:30", "07:00", 1500), ck(4, "23:00", "07:30", 3000)];
const sr = serieDias(ruim, HOJE, 7);
const aR = avaliarSono(sr, 7)!;
ok(aR.titulo === "Sono abaixo do ideal" && aR.urgencia === "atencao", "semanal ruim: atenção");
ok(/treino fica mais leve/.test(aR.porque) && /Dessas, 3 ficaram abaixo de 6 h/.test(aR.porque), `liga com o treino: ${aR.porque}`);
ok(aR.acao?.tipo === "link" && aR.acao.href === "/checkin", "ação registrar check-in");
const agR = avaliarAgua(sr, 2750, 7)!;
ok(agR.titulo === "Água abaixo da meta" && /1 de 5 dias/.test(agR.porque), `água ruim: ${agR.porque}`);
ok(resumirAgua(sr, 2750).batidos === 1, "1 dia com meta batida");

// irregular com boa duração
const irr = [ck(0, "22:00", "06:30"), ck(1, "01:00", "09:30"), ck(2, "22:30", "07:00"), ck(3, "01:30", "09:30"), ck(4, "22:00", "06:00")];
const aI = avaliarSono(serieDias(irr, HOJE, 7), 7)!;
ok(aI.titulo === "Horário de dormir irregular", `irregular: ${aI.porque}`);

// quinzenal
const q = Array.from({ length: 14 }, (_, i) => (i < 7 ? ck(i, "23:00", "07:00", 3000) : ck(i, "00:30", "05:45", 1000)));
const s14 = serieDias(q, HOJE, 14);
ok(s14.length === 14 && resumirSono(s14).noites === 14, "janela de 14 dias");
const a14 = avaliarSono(s14, 14)!;
ok(/últimas 2 semanas/.test(a14.porque) && a14.titulo === "Sono abaixo do ideal", `quinzenal: ${a14.porque}`);
ok(avaliarSono(serieDias(q, HOJE, 7), 7)!.titulo === "Sono na faixa boa", "semanal só olha 7 dias");
ok(estadoVazio(serieDias(q.slice(0, 4), HOJE, 14), 14)?.titulo === "Quase lá", "14 dias precisa de 5 noites");

// textos sem código
const textos: string[] = [];
for (const a of [aBoa, agB, aR, agR, aI, a14]) textos.push(a.titulo, a.porque, a.dica ?? "", a.acao?.rotulo ?? "");
for (const h of [4, 6.5, 8, 10]) { const f = feedbackSono(h, [5, 8, 9]); textos.push(f.titulo, f.dica); }
textos.push(estadoVazio(vazio, 7)!.texto, v2!.texto);
for (const t of textos) {
  const p = [...problemas(t)];
  if (/\(R\d+\)|R9/.test(t)) p.push("R9");
  if (/\d+(\.\d+)? ?h\b/.test(t) && /\d\.\d/.test(t)) p.push("decimal com ponto");
  ok(p.length === 0, `texto limpo: "${t.slice(0, 70)}"${p.length ? " → " + p.join(", ") : ""}`);
}

console.log("\nexemplos:");
for (const a of [aBoa, aR, aI, agB, agR]) console.log(`- ${a.titulo}: ${a.porque} ${a.dica ?? ""}`);
console.log(falhas ? `\n${falhas} falha(s)` : "\nsmoke:sono-agua OK");
