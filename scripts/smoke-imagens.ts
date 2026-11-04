/** Smoke lote 6: todo exercício do catálogo tem imagem própria, da base ou placeholder declarado; arquivos existem; alt em português. */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { IMAGEM_ORIGEM, arquivoImagem, imagemDoExercicio } from "../src/lib/catalog/imagens";

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.log("FAIL " + m); fail++; } };
/** Exercícios que ainda não têm imagem fiel: mostram placeholder neutro (lista explícita, para nada ficar sem nada por acidente). */
const PLACEHOLDER = new Set(["hip_thrust_maquina", "puxada_articulada", "elevacao_lateral_maquina", "rdl_unilateral",
  // abdutores/adutores sem foto fiel no Free Exercise DB
  "abducao_quadril_polia", "abducao_deitado_lado", "fire_hydrant", "abducao_sentado_miniband", "copenhagen_plank", "aducao_deitado_lado"]);
const ids = new Set(CATALOG_EXERCICIOS.map((e) => e.id));
let propria = 0, base = 0, ph = 0;
for (const k of Object.keys(IMAGEM_ORIGEM)) {
  ok(ids.has(k), `imagem mapeada para exercício inexistente: ${k}`);
  const f = join(process.cwd(), "public", arquivoImagem(k));
  ok(existsSync(f), `arquivo não existe: ${f}`);
  if (existsSync(f)) ok(statSync(f).size < 80_000, `arquivo grande demais: ${f}`);
}
for (const e of CATALOG_EXERCICIOS) {
  const img = imagemDoExercicio(e);
  if (!img) {
    ph++;
    ok(PLACEHOLDER.has(e.id), `${e.nome}: sem imagem nem fallback`);
    continue;
  }
  ok(existsSync(join(process.cwd(), "public", img.src)), `${e.nome}: arquivo referenciado não existe (${img.src})`);
  ok(img.alt.includes(e.nome) && !/_/.test(img.alt), `${e.nome}: alt em português, sem id`);
  if (img.origem === "propria") propria++; else base++;
}
ok(imagemDoExercicio("leg_press_45")?.src === arquivoImagem("leg_press"), "variação sem imagem própria usa a da base");
ok(imagemDoExercicio("id_que_nao_existe") === null, "id desconhecido cai no placeholder");
console.log(`Imagem própria: ${propria} · da base: ${base} · placeholder: ${ph} · total: ${CATALOG_EXERCICIOS.length}`);
console.log(fail ? `FALHOU (${fail})` : "OK smoke:imagens");
process.exit(fail ? 1 : 0);
