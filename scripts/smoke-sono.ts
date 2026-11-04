import {
  calcularDuracaoSono,
  feedbackSono,
  formatarDuracaoSono,
  resumoSonoCheckin,
} from "../src/lib/domain/sono";

function ok(c: boolean, m: string) {
  console.log(c ? "✓" : "✗", m);
  if (!c) process.exitCode = 1;
}

ok(calcularDuracaoSono("23:30", "06:45") === 7.25, "23:30→06:45 = 7.25h");
ok(formatarDuracaoSono(7.25) === "7h15", "format 7.25 → 7h15");
ok(calcularDuracaoSono("22:00", "06:00") === 8, "22:00→06:00 = 8h");
ok(calcularDuracaoSono("00:00", "07:00") === 7, "00:00→07:00 = 7h");
ok(calcularDuracaoSono("07:00", "07:00") === 24, "mesmo horário = 24h (virada)");
ok(formatarDuracaoSono(6) === "6h", "format 6 → 6h");
ok(formatarDuracaoSono(6.5) === "6h30", "format 6.5 → 6h30");

const baixo = feedbackSono(5);
ok(baixo.r9_sono && baixo.nivel === "baixo", "feedback <6h → baixo + r9");
const bom = feedbackSono(8);
ok(bom.nivel === "ok" && !bom.r9_sono, "feedback 8h → ok");
const inconsistente = feedbackSono(8, [{ sono_h: 8, sono_inicio: "21:30" }, { sono_h: 8, sono_inicio: "01:30" }], "23:00");
ok(inconsistente.nivel === "inconsistente", "horário de dormir variando > 1 h → irregular");
ok(feedbackSono(8, [5, 9]).nivel === "ok", "só a duração variando não marca irregular (regra do resumo semanal)");
ok(feedbackSono(8, [{ sono_h: 8, sono_inicio: "23:00" }, { sono_h: 6, sono_inicio: "23:20" }], "23:10").nivel === "ok", "mesmo horário → faixa boa, igual ao resumo");

ok(
  resumoSonoCheckin({
    sono_h: 7.25,
    sono_inicio: "23:30",
    sono_fim: "06:45",
  }) === "23:30–06:45 (7h15)",
  "resumo com horários",
);
ok(
  resumoSonoCheckin({ sono_h: 7.5 }) === "7h30",
  "resumo só duração (legado)",
);

console.log(process.exitCode ? "FAIL" : "OK smoke-sono");
