import {
  assertR1,
  assertR4,
  assertR7,
  assertR8Subir,
  assertR8Reduzir,
  assertR8Manter,
  assertR8NaoBloqueiaR1,
} from "../src/lib/engine/progression.fixtures";

const results = [
  assertR1(),
  assertR4(),
  assertR7(),
  assertR8Subir(),
  assertR8Reduzir(),
  assertR8Manter(),
  assertR8NaoBloqueiaR1(),
];
for (const r of results) {
  console.log(r.ok ? "✓" : "✗", r.msg);
}
if (results.some((x) => !x.ok)) process.exit(1);
console.log("smoke:engine OK");
