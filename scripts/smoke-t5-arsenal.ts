/**
 * Smoke: research arsenal + T5 guia-por-padrao + PAR-Q gate
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildCoachSystemWithArsenal,
  getResearchArsenal,
} from "../src/lib/llm/research-arsenal";
import { guiaPorPadrao } from "../src/lib/plan/guia-por-padrao";
import { avaliarParq, parqBloqueiaPrescricao } from "../src/lib/plan/parq";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fail++;
};

const root = path.join(process.cwd());
const files = [
  "research-tecnica-biomecanica-v1.txt",
  "research-acsm-parq-base-v1.txt",
  "research-acsm-2026-params-v1.txt",
];
for (const f of files) {
  const p = path.join(root, f);
  const exists = fs.existsSync(p);
  const size = exists ? fs.statSync(p).size : 0;
  ok(exists && size > 1000, `${f} exists size=${size} (>1KB)`);
}

const a = getResearchArsenal();
ok(a.acsm_params.length > 500, `arsenal acsm_params len=${a.acsm_params.length}`);
ok(a.acsm_parq.length > 500, `arsenal acsm_parq len=${a.acsm_parq.length}`);
// tecnica may be bridge (>=1KB) — loader requires >=1000 bytes
ok(
  a.tecnica.length > 500 || a.tecnica.length === 0,
  `arsenal tecnica len=${a.tecnica.length} (0=skip tiny ok)`,
);

const excerpt = a.excerptForPrompt(14000);
ok(/PAR-Q/i.test(excerpt), "excerpt contains PAR-Q");
ok(/ACSM/i.test(excerpt), "excerpt contains ACSM");
ok(
  /10|séries|series/i.test(excerpt),
  "excerpt mentions volume/séries",
);

const system = buildCoachSystemWithArsenal([
  "base coach line",
  "NUNCA invente kg",
]);
ok(/nao invent|NUNCA invent|não invent/i.test(system), "system has nao invent rules");
ok(/read-only|Read-only/i.test(system), "system has read-only");
ok(/PAR-Q/i.test(system), "system cites PAR-Q");
ok(/ACSM/i.test(system), "system cites ACSM");
ok(/Jayme/i.test(system), "system mentions Jayme process rule");

const g1 = guiaPorPadrao("empurrar_horizontal", "supino_x");
ok(g1.setup.length > 0 && g1.cues.length > 0, "guia empurrar_horizontal");
const g2 = guiaPorPadrao("agachamento", "agach_x");
ok(g2.setup.length > 0 && (g2.contraindicacoes?.length ?? 0) >= 0, "guia agachamento");
ok(!!g2.execucao?.length, "guia agachamento tem execucao");

const allNo = avaliarParq([false, false, false, false, false, false, false]);
ok(allNo.liberado === true && !allNo.algumSim, "PAR-Q all-no libera");
const oneYes = avaliarParq([false, true, false, false, false, false, false]);
ok(oneYes.liberado === false && oneYes.algumSim, "PAR-Q one-yes blocks");

ok(
  parqBloqueiaPrescricao({
    parq_liberado: true,
    parq_respondido_em: "2026-10-28",
  }) === false,
  "liberado+respondido não bloqueia",
);
ok(
  parqBloqueiaPrescricao({
    parq_liberado: false,
    parq_respondido_em: "2026-10-28",
  }) === true,
  "não liberado bloqueia",
);
ok(
  parqBloqueiaPrescricao({
    parq_liberado: false,
    parq_respondido_em: null,
  }) === true,
  "pendente bloqueia",
);

console.log(fail ? `SMOKE FAIL (${fail})` : "SMOKE OK");
process.exit(fail ? 1 : 0);
