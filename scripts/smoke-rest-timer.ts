/** Smoke rest-timer: descanso por fase/composto, ±15s com piso 0, pular, retomada pelo endAt. */
import { ajustar, descansoSugerido, iniciar, progresso, pular, restanteSeg, retomar, serializar, terminou, formatar, rotuloFase } from "../src/lib/treino/rest-timer";
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

// fase × composto (prescrito 150 composto, 90 isolado)
eq(descansoSugerido({ fase: "trabalho", composto: true, prescritoSeg: 150 }), 150, "trabalho usa prescrito");
eq(descansoSugerido({ fase: "back_off", composto: true, prescritoSeg: 150 }), 150, "back-off usa prescrito");
eq(descansoSugerido({ fase: "aquecimento", composto: true, prescritoSeg: 150 }), 60, "aquecimento composto curto");
eq(descansoSugerido({ fase: "aquecimento", composto: false, prescritoSeg: 90 }), 35, "aquecimento isolado curto");
eq(descansoSugerido({ fase: "top_set", composto: true, prescritoSeg: 150 }), 190, "top set mais longo");
eq(descansoSugerido({ fase: "top_set", composto: true, prescritoSeg: 280 }), 300, "top set teto 5 min");
eq(descansoSugerido({ fase: "drop", composto: false, prescritoSeg: 90 }), 15, "drop mínimo");
if (!(descansoSugerido({ fase: "trabalho", composto: true }) > descansoSugerido({ fase: "trabalho", composto: false }))) throw new Error("composto deve descansar mais sem prescrição");
if (!(descansoSugerido({ fase: "top_set", composto: true, prescritoSeg: 150 }) > descansoSugerido({ fase: "trabalho", composto: true, prescritoSeg: 150 }))) throw new Error("top > trabalho");
if (/_/.test(rotuloFase("top_set")) || /_/.test(rotuloFase("back_off"))) throw new Error("rótulo com enum");

// iniciar / ±15 / piso 0
const T0 = 1_000_000;
let t = iniciar(90, "trabalho", T0);
eq(restanteSeg(t, T0), 90, "inicia em 90");
eq(restanteSeg(t, T0 + 30_000), 60, "30 s depois");
t = ajustar(t, +15, T0 + 30_000);
eq(restanteSeg(t, T0 + 30_000), 75, "+15");
t = ajustar(t, -15, T0 + 30_000);
t = ajustar(t, -15, T0 + 30_000);
eq(restanteSeg(t, T0 + 30_000), 45, "−15 duas vezes");
const z = ajustar(iniciar(10, "trabalho", T0), -15, T0);
eq(restanteSeg(z, T0), 0, "−15 com piso em 0");
eq(terminou(z, T0), true, "piso 0 termina");

// pular
const p = pular(iniciar(120, "top_set", T0), T0 + 5_000);
eq(restanteSeg(p, T0 + 5_000), 0, "pular zera");
eq(terminou(p, T0 + 5_000), true, "pular termina");
eq(progresso(p, T0 + 5_000), 1, "pular progresso 1");

// retomada pelo endAt (app em background 70 s; sem ticks)
const r = iniciar(120, "trabalho", T0);
const volta = retomar(serializar(r));
if (!volta) throw new Error("retomar null");
eq(restanteSeg(volta, T0 + 70_000), 50, "retoma pelo endAt");
eq(terminou(volta, T0 + 121_000), true, "acabou enquanto fora");
eq(retomar("{lixo"), null, "json inválido");
eq(formatar(75), "1:15", "formatar");
console.log("rest-timer OK");
