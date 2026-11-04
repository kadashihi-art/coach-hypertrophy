/**
 * Smoke lote 5: abdômen e antebraço como grupos opcionais.
 * Catálogo + variações, labels com acento, faixas de volume, alertas, troca/adicionar
 * e gerador (só entra se o perfil pedir, leve, sem mexer nos splits existentes).
 */
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { ExercicioSchema, faixaVolume, type Perfil, type VolumeSemanal } from "../src/lib/domain";
import { labelGrupo } from "../src/lib/labels";
import { gerarPlanoFromPerfil, patternBlocked, parseRestricoes } from "../src/lib/plan/gerar-plano";
import { listarAlternativasTroca } from "../src/lib/plan/trocar-exercicio";
import { avaliarAlertasVolume } from "../src/lib/engine/alertas-volume";
import { apresentarAlerta } from "../src/lib/alertas/apresentar";
import { paraPerfil } from "../src/lib/plan/coleta";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) fail++;
};
const byId = new Map(CATALOG_EXERCICIOS.map((e) => [e.id, e]));

// 1) Catálogo
const abd = ["prancha", "abdominal_cabo", "elevacao_pernas", "crunch_maquina"];
const ant = ["rosca_punho", "rosca_inversa", "farmer_walk", "rosca_punho_invertida"];
ok(abd.every((id) => byId.get(id)?.grupo_primario === "abdomen"), "abdômen: prancha, abdominal na polia, elevação de pernas, crunch na máquina");
ok(ant.every((id) => byId.get(id)?.grupo_primario === "antebracos"), "antebraço: rosca punho, rosca inversa, farmer walk, rosca punho invertida");
ok(byId.get("abdominal_cabo")?.nome === "Abdominal na polia", "nome: Abdominal na polia");
const varAbd = CATALOG_EXERCICIOS.filter((e) => e.base_id && e.grupo_primario === "abdomen");
const varAnt = CATALOG_EXERCICIOS.filter((e) => e.base_id && e.grupo_primario === "antebracos");
ok(varAbd.length >= 3 && varAnt.length >= 4, `variações: ${varAbd.length} de abdômen, ${varAnt.length} de antebraço`);
ok([...varAbd, ...varAnt, ...abd.map((i) => byId.get(i)!), ...ant.map((i) => byId.get(i)!)].every((e) => ExercicioSchema.safeParse(e).success), "todos passam no schema");
ok(new Set(CATALOG_EXERCICIOS.map((e) => e.id)).size === CATALOG_EXERCICIOS.length, "ids únicos");

// 2) Labels
ok(labelGrupo("abdomen") === "Abdômen" && labelGrupo("antebracos") === "Antebraço", "labels com acento");

// 3) Faixas de volume
ok(faixaVolume("abdomen").min === 0 && faixaVolume("abdomen").max === 12, "abdômen 0–12");
ok(faixaVolume("antebracos").min === 0 && faixaVolume("antebracos").max === 12, "antebraço 0–12");
ok(faixaVolume("peito").min === 10 && faixaVolume("peito").max === 20, "demais grupos continuam 10–20");

// 4) Alertas
const vols = (g: VolumeSemanal["grupo"], a: number, b: number): VolumeSemanal[] => [
  { semana_iso: "2026-W44", grupo: g, series_diretas: a, series_indiretas: 0, series_efetivas: a },
  { semana_iso: "2026-W45", grupo: g, series_diretas: b, series_indiretas: 0, series_efetivas: b },
];
const semana_iso = "2026-W45";
ok(avaliarAlertasVolume({ volumes_semanais: vols("abdomen", 2, 3), semana_iso }).length === 0, "abdômen com pouco volume: sem alerta (opcional)");
ok(avaliarAlertasVolume({ volumes_semanais: vols("antebracos", 4, 6), semana_iso }).length === 0, "antebraço 6: sem alerta");
const alto = avaliarAlertasVolume({ volumes_semanais: vols("antebracos", 10, 14), semana_iso });
ok(alto.length === 1 && alto[0]!.regra === "R11", "antebraço 14: alerta de excesso");
const ap = apresentarAlerta(alto[0]!);
const txt = [ap.titulo, ap.porque, ap.dica, ap.acao?.rotulo].join(" ");
ok(/Antebraço/.test(txt) && !/antebracos|R11|N1|2026-W/.test(txt), `alerta humano: ${ap.titulo}`);
// Regra do primeiro registro: R10 olha as 2 últimas semanas FECHADAS (W43 e W44 quando a atual é W45).
// W45 ainda está em andamento, então 7→5 em W44→W45 não alerta.
ok(avaliarAlertasVolume({ volumes_semanais: vols("quadriceps", 7, 5), semana_iso }).length === 0, "quadríceps 7→5 com a semana atual em andamento: sem alerta (semana não fechada)");
// Caso equivalente com semanas cheias e fechadas: 7→5 em W43→W44, início antes de W43 → alerta.
const quadFechadas: VolumeSemanal[] = [
  { semana_iso: "2026-W43", grupo: "quadriceps", series_diretas: 7, series_indiretas: 0, series_efetivas: 7 },
  { semana_iso: "2026-W44", grupo: "quadriceps", series_diretas: 5, series_indiretas: 0, series_efetivas: 5 },
];
const quadAlerta = avaliarAlertasVolume({ volumes_semanais: quadFechadas, semana_iso, inicio: "2026-10-12" });
ok(quadAlerta.length === 1 && quadAlerta[0]!.regra === "R10", "quadríceps 7→5 em 2 semanas cheias e fechadas continua alertando (regra 10–20 intacta)");
// Mesmo volume, mas a primeira semana é parcial (início no meio de W43): não alerta.
ok(avaliarAlertasVolume({ volumes_semanais: quadFechadas, semana_iso, inicio: "2026-10-22" }).length === 0, "quadríceps 7→5 com a 1ª semana parcial: sem alerta");

// 5) Troca e adicionar
const altPunho = listarAlternativasTroca({ exercicioId: "rosca_punho", catalog: CATALOG_EXERCICIOS, perfil: null });
ok(altPunho.some((a) => a.exercicio.id === "rosca_punho_barra") && altPunho.every((a) => a.exercicio.grupo_primario === "antebracos"), `troca rosca punho → ${altPunho.length} opções de antebraço`);
ok(altPunho[0]!.exercicio.base_id === "rosca_punho", "variações da mesma família primeiro");
const altAbd = listarAlternativasTroca({ exercicioId: "abdominal_cabo", catalog: CATALOG_EXERCICIOS, perfil: null });
ok(altAbd.some((a) => a.exercicio.id === "crunch_maquina"), "troca abdominal na polia → crunch na máquina");
ok(patternBlocked("antebraco_pegada", parseRestricoes(["punho"])), "restrição de punho bloqueia antebraço");

// 6) Gerador
const base: Perfil = {
  id: "smoke", peso_kg: 80, altura_cm: 178, experiencia: "intermediario", dias_por_semana: 4, minutos_por_sessao: 60,
  cardio_min_semana: 0, equipamentos: ["barra", "halteres", "maquina", "cabo", "peso_corporal"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: false, parq_liberado: true, parq_respondido_em: "2026-11-04T00:00:00Z", parq_respostas: [false, false, false, false, false, false, false],
  criado_em: "2026-11-04T00:00:00Z",
};
const grupoDe = (id: string) => byId.get(id)?.grupo_primario;
for (const estilo of ["auto", "full_body", "upper_lower", "ppl", "hibrido_ppl_ul", "hibrido_fb_ul"] as const) {
  const p0 = gerarPlanoFromPerfil({ ...base, estilo_split: estilo }, CATALOG_EXERCICIOS);
  const ids0 = p0.sessoes.map((s) => s.prescricoes.map((x) => x.exercicio_id).join(",")).join("|");
  ok(!p0.sessoes.some((s) => s.prescricoes.some((x) => ["abdomen", "antebracos"].includes(grupoDe(x.exercicio_id) ?? ""))), `${estilo}: sem pedido, sem abdômen/antebraço`);
  const p1 = gerarPlanoFromPerfil({ ...base, estilo_split: estilo, grupos_opcionais: ["abdomen", "antebracos"] }, CATALOG_EXERCICIOS);
  const extras = p1.sessoes.flatMap((s) => s.prescricoes.filter((x) => ["abdomen", "antebracos"].includes(grupoDe(x.exercicio_id) ?? "")));
  const semExtras = p1.sessoes.map((s) => s.prescricoes.filter((x) => !["abdomen", "antebracos"].includes(grupoDe(x.exercicio_id) ?? "")).map((x) => x.exercicio_id).join(",")).join("|");
  ok(semExtras === ids0, `${estilo}: split igual, só acrescenta`);
  const nAbd = extras.filter((x) => grupoDe(x.exercicio_id) === "abdomen").length;
  const nAnt = extras.filter((x) => grupoDe(x.exercicio_id) === "antebracos").length;
  ok(nAbd === 1 && nAnt === 1 && extras.every((x) => x.series === 2), `${estilo}: leve (abdômen ${nAbd}×2, antebraço ${nAnt}×2)`);
}
const comPunho = gerarPlanoFromPerfil({ ...base, restricoes: ["punho"], grupos_opcionais: ["antebracos"] }, CATALOG_EXERCICIOS);
ok(!comPunho.sessoes.some((s) => s.prescricoes.some((x) => grupoDe(x.exercicio_id) === "antebracos")), "punho lesionado: antebraço não entra");

// 7) Onboarding: ponto fraco vira grupo opcional
const pp = paraPerfil(base, { pontos_fracos: ["abdomen", "peito"] } as never, { estilo_split: "auto", fase2_estilo: null, prioridades_musculares: [] } as never);
ok(JSON.stringify(pp.grupos_opcionais) === '["abdomen"]', "pontos fracos → grupos_opcionais");

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
