/** Tipo de carga por exercício: rótulo claro e alternância só na tela (gravado não muda). */
import assert from "node:assert/strict";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { AMBIGUOS, alternativaCarga, rotuloCarga, textoCarga, tipoCarga } from "../src/lib/catalog/tipo-carga";
import { textoUltimaVez } from "../src/lib/engine/memoria-carga";
import { textoAquecimento } from "../src/lib/treino/estrutura-series";

const ex = (id: string) => {
  const e = CATALOG_EXERCICIOS.find((x) => x.id === id);
  assert.ok(e, id);
  return e!;
};
// Todo exercício do catálogo tem um tipo; os com carga externa têm rótulo.
for (const e of CATALOG_EXERCICIOS) {
  const t = tipoCarga(e);
  if (e.equipamento === "halteres") assert.equal(t, "por_halter", e.id);
  if (e.equipamento === "cabo") assert.equal(t, "pilha", e.id);
  if (t !== "elastico") assert.ok(rotuloCarga(e), e.id);
}
for (const id of Object.keys(AMBIGUOS)) ex(id);

assert.equal(textoCarga(20, ex("supino_halteres")), "20 kg por halter");
assert.equal(textoCarga(20, ex("supino_halteres"), true), "40 kg total (2 halteres)");
assert.equal(textoCarga(100, ex("agachamento_barra")), "100 kg total com a barra");
assert.equal(textoCarga(100, ex("agachamento_barra"), true), "40 kg por lado (sem a barra de 20 kg)");
assert.equal(textoCarga(15, ex("agachamento_barra"), true), "15 kg total com a barra", "abaixo da barra: não converte");
assert.equal(textoCarga(160, ex("leg_press")), "160 kg total");
assert.equal(textoCarga(160, ex("leg_press_45"), true), "80 kg por lado");
assert.equal(textoCarga(45, ex("puxada_frontal")), "45 kg na pilha");
assert.equal(textoCarga(45, ex("cadeira_extensora")), "45 kg na pilha");
assert.equal(textoCarga(12.5, ex("rosca_direta")), "12,5 kg total com a barra");
assert.equal(alternativaCarga(ex("rosca_direta")), null, "barra de peso variável: sem por lado");
assert.equal(alternativaCarga(ex("agachamento_goblet")), null, "um halter só: sem total");
assert.equal(alternativaCarga(ex("puxada_frontal")), null);
assert.equal(textoCarga(60, ex("agachamento_smith")), "60 kg total no Smith");
assert.equal(textoCarga(0, ex("flexao_solo")), "peso do corpo");
assert.equal(textoCarga(10, ex("flexao_solo")), "10 kg de carga extra");
assert.equal(textoCarga(30, null), "30 kg");
// Logger: última vez e aquecimento com o rótulo.
const m = { ultima_carga_kg: 22.5, ultimas_reps: 10, ultimo_rir: 2 } as never;
assert.equal(textoUltimaVez(m, ex("supino_halteres")), "22,5 kg por halter × 10 reps @ RIR 2");
assert.equal(textoUltimaVez(m), "22,5 kg × 10 reps @ RIR 2");
assert.match(textoAquecimento(100, 5, ex("agachamento_barra")), /^Aquecimento: 60 kg total com a barra/);
assert.match(textoAquecimento(100, 5, ex("agachamento_barra"), true), /^Aquecimento: 20 kg por lado/);
// Alternância nunca muda o valor: só o texto.
const antes = JSON.stringify(CATALOG_EXERCICIOS);
textoCarga(80, ex("leg_press"), true);
assert.equal(JSON.stringify(CATALOG_EXERCICIOS), antes);
console.log("smoke-tipo-carga OK");
