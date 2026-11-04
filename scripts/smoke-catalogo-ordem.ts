/**
 * Smoke: ordenação da lista de exercícios (Por grupo / A–Z), grupos abdutores e adutores,
 * e "só entra no plano automático com ponto fraco".
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { imagemDoExercicio } from "../src/lib/catalog/imagens";
import { agruparPorGrupo, ordenarAZ, ORDEM_PADRAO, ROTULO_ORDEM } from "../src/lib/catalog/ordenar";
import { mergeCatalogoExercicios } from "../src/lib/catalog/merge";
import { AppStateSchema, ExercicioSchema, PerfilSchema, faixaVolume, type Perfil } from "../src/lib/domain";
import { cargaMaxKg, validarCarga } from "../src/lib/domain/limites";
import { labelGrupo, labelPadrao } from "../src/lib/labels";
import { gerarPlanoFromPerfil, parseRestricoes } from "../src/lib/plan/gerar-plano";
import { restricaoBane } from "../src/lib/plan/restricoes";
import { guiaPorPadrao } from "../src/lib/plan/guia-por-padrao";
import { listarAlternativasTroca } from "../src/lib/plan/trocar-exercicio";
import { paraPerfil } from "../src/lib/plan/coleta";
import { seedState } from "../src/lib/seed";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const byId = new Map(CATALOG_EXERCICIOS.map((e) => [e.id, e]));
const self = <T,>(e: T) => e as never;

// 1) Ordenação A–Z respeita acentos (pt-BR)
const fake = ["Remada", "Abdução", "Elevação", "abdominal", "Ágil", "Zebra", "Éclair", "Adução"].map((nome, i) => ({ id: `x${i}`, nome, grupo_primario: "peito" }));
const az = ordenarAZ(fake, self).map((e) => (e as { nome: string }).nome);
ok(JSON.stringify(az) === JSON.stringify(["abdominal", "Abdução", "Adução", "Ágil", "Éclair", "Elevação", "Remada", "Zebra"]), `A–Z com acentos: ${az.join(", ")}`);
const azCat = ordenarAZ(CATALOG_EXERCICIOS, (e) => e);
ok(azCat.every((e, i) => i === 0 || azCat[i - 1]!.nome.localeCompare(e.nome, "pt-BR", { sensitivity: "base" }) <= 0), "catálogo inteiro em A–Z (localeCompare pt-BR)");
ok(ORDEM_PADRAO === "grupo" && ROTULO_ORDEM.grupo === "Por grupo" && ROTULO_ORDEM.az === "A–Z", "padrão é Por grupo; rótulos Por grupo e A–Z");

// 2) Por grupo: cabeçalho por grupo, ordem do corpo, A–Z dentro do grupo, nada some
const grupos = agruparPorGrupo(CATALOG_EXERCICIOS, (e) => e);
ok(grupos.reduce((n, g) => n + g.itens.length, 0) === CATALOG_EXERCICIOS.length, "agrupar não perde nem duplica exercício");
ok(new Set(grupos.map((g) => g.grupo)).size === grupos.length, "um cabeçalho por grupo");
ok(grupos.every((g) => !/_/.test(g.titulo) && g.titulo[0] === g.titulo[0]!.toUpperCase()), `cabeçalhos legíveis: ${grupos.map((g) => g.titulo).join(", ")}`);
ok(grupos[0]!.grupo === "peito", "primeiro grupo: Peito");
const iAbd = grupos.findIndex((g) => g.grupo === "abdutores"), iAdu = grupos.findIndex((g) => g.grupo === "adutores"), iGlu = grupos.findIndex((g) => g.grupo === "gluteos");
ok(iAbd > iGlu && iAdu === iAbd + 1, "Abdutores e Adutores logo depois de Glúteos");
ok(grupos.every((g) => g.itens.every((e, i) => i === 0 || g.itens[i - 1]!.nome.localeCompare(e.nome, "pt-BR", { sensitivity: "base" }) <= 0)), "A–Z dentro de cada grupo");
const alts = listarAlternativasTroca({ exercicioId: "cadeira_abdutora", catalog: CATALOG_EXERCICIOS, perfil: null });
ok(agruparPorGrupo(alts, (a) => a.exercicio).length === 1, `troca da cadeira abdutora: ${alts.length} opções, todas em Abdutores`);

// 3) Grupos e exercícios novos
ok(labelGrupo("abdutores") === "Abdutores" && labelGrupo("adutores") === "Adutores", "labels Abdutores e Adutores");
ok(labelPadrao("abducao_quadril") === "abdução de quadril" && labelPadrao("aducao_quadril") === "adução de quadril", "padrões com acento na tela");
const novosAbd = ["cadeira_abdutora", "abducao_quadril_polia", "abducao_deitado_lado", "monster_walk", "fire_hydrant", "abducao_sentado_miniband"];
const novosAdu = ["cadeira_adutora", "aducao_quadril_polia", "copenhagen_plank", "agachamento_sumo_adutores", "aducao_deitado_lado"];
ok(novosAbd.every((id) => byId.get(id)?.grupo_primario === "abdutores" && byId.get(id)?.padrao === "abducao_quadril"), "abdutores: 6 exercícios, padrão abdução de quadril");
ok(novosAdu.every((id) => byId.get(id)?.grupo_primario === "adutores" && byId.get(id)?.padrao === "aducao_quadril"), "adutores: 5 exercícios, padrão adução de quadril");
ok([...novosAbd, ...novosAdu].every((id) => ExercicioSchema.safeParse(byId.get(id)).success), "todos passam no schema do catálogo");
ok(new Set(CATALOG_EXERCICIOS.map((e) => e.id)).size === CATALOG_EXERCICIOS.length, "ids únicos");
for (const id of [...novosAbd, ...novosAdu]) {
  const e = byId.get(id)!;
  const g = guiaPorPadrao(e.padrao, id);
  ok(g.setup.length > 0 && g.execucao.length > 0 && g.cues.length > 0 && g.contraindicacoes.length > 0 && !/_/.test(g.setup.join(" ")), `${e.nome}: guia completo`);
  const img = imagemDoExercicio(e);
  if (img) ok(existsSync(join(process.cwd(), "public", img.src)), `${e.nome}: imagem ${img.src}`);
  else console.log(`     ${e.nome}: placeholder`);
}
ok(["cadeira_abdutora", "cadeira_adutora", "aducao_quadril_polia", "monster_walk", "agachamento_sumo_adutores"].every((id) => imagemDoExercicio(id)?.origem === "propria"), "5 com imagem do Free Exercise DB");

// 4) Limites de carga plausíveis
ok(cargaMaxKg("abducao_quadril") === 250 && cargaMaxKg("aducao_quadril") === 250, "limite 250 kg nos padrões novos");
ok(validarCarga(80, "abducao_quadril") === null && validarCarga(400, "aducao_quadril") !== null, "80 kg passa, 400 kg é barrado");

// 5) Volume 10–20 e restrições
ok(faixaVolume("abdutores").min === 10 && faixaVolume("adutores").max === 20, "faixa de volume continua 10–20");
ok(restricaoBane(byId.get("copenhagen_plank")!, parseRestricoes(["joelho"])), "Copenhagen plank sai com restrição de joelho");

// 6) Só entra no plano automático com ponto fraco
const base: Perfil = {
  id: "smoke", peso_kg: 80, altura_cm: 178, experiencia: "intermediario", dias_por_semana: 4, minutos_por_sessao: 60,
  cardio_min_semana: 0, equipamentos: ["barra", "halteres", "maquina", "cabo", "peso_corporal"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: false, parq_liberado: true, parq_respondido_em: "2026-11-04T00:00:00Z", parq_respostas: [false, false, false, false, false, false, false],
  criado_em: "2026-11-04T00:00:00Z",
};
const grupoDe = (id: string) => byId.get(id)?.grupo_primario ?? "";
const NOVOS = ["abdutores", "adutores"];
for (const estilo of ["auto", "full_body", "upper_lower", "ppl", "hibrido_ppl_ul", "hibrido_fb_ul"] as const) {
  const p0 = gerarPlanoFromPerfil({ ...base, estilo_split: estilo }, CATALOG_EXERCICIOS);
  const ids0 = p0.sessoes.map((s) => s.prescricoes.map((x) => x.exercicio_id).join(",")).join("|");
  ok(!p0.sessoes.some((s) => s.prescricoes.some((x) => NOVOS.includes(grupoDe(x.exercicio_id)))), `${estilo}: sem ponto fraco, sem abdutores/adutores`);
  const p1 = gerarPlanoFromPerfil({ ...base, estilo_split: estilo, grupos_opcionais: ["abdutores", "adutores"] }, CATALOG_EXERCICIOS);
  const extras = p1.sessoes.flatMap((s) => s.prescricoes.filter((x) => NOVOS.includes(grupoDe(x.exercicio_id))));
  const resto = p1.sessoes.map((s) => s.prescricoes.filter((x) => !NOVOS.includes(grupoDe(x.exercicio_id))).map((x) => x.exercicio_id).join(",")).join("|");
  ok(resto === ids0, `${estilo}: resto do plano igual, só acrescenta`);
  const nA = extras.filter((x) => grupoDe(x.exercicio_id) === "abdutores").length;
  const nD = extras.filter((x) => grupoDe(x.exercicio_id) === "adutores").length;
  ok(nA >= 1 && nD >= 1 && extras.every((x) => x.series === 2), `${estilo}: leve (abdutores ${nA}×2, adutores ${nD}×2)`);
}
const pp = paraPerfil(base, { pontos_fracos: ["adutores", "peito", "abdutores"] } as never, { estilo_split: "auto", fase2_estilo: null, prioridades_musculares: [] } as never);
ok(JSON.stringify(pp.grupos_opcionais) === '["adutores","abdutores"]', "pontos fracos abdutores/adutores → grupos_opcionais");
ok(PerfilSchema.safeParse({ ...base, grupos_opcionais: ["abdomen", "antebracos", "abdutores", "adutores"] }).success, "perfil aceita os 4 opcionais");
ok(PerfilSchema.safeParse({ ...base, grupos_opcionais: ["abdomen"] }).success, "perfil antigo (só abdômen) continua válido");

// 7) Estado antigo continua carregando e ganha os novos exercícios
const antigo = JSON.parse(JSON.stringify(seedState));
antigo.exercicios = antigo.exercicios.filter((e: { grupo_primario: string }) => !NOVOS.includes(e.grupo_primario));
ok(AppStateSchema.safeParse(antigo).success, "estado sem os exercícios novos continua válido");
const merged = mergeCatalogoExercicios(antigo.exercicios);
ok([...novosAbd, ...novosAdu].every((id) => merged.some((e) => e.id === id)), "merge do catálogo acrescenta os novos");

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
