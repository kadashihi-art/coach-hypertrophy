/** Smoke lote 3: variações ligadas ao exercício-base, memória de carga própria, seleção nas edições, sem ids na tela. */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { mergeCatalogoExercicios } from "../src/lib/catalog/merge";
import { VARIACOES_DEFS, familiaDoExercicio, infoVariacao } from "../src/lib/catalog/variacoes";
import { AppStateSchema, ExercicioSchema, type AppState, type Perfil, type RegistroSerie } from "../src/lib/domain";
import { listarAlternativasTroca } from "../src/lib/plan/trocar-exercicio";
import { cargaSugeridaParaExercicio } from "../src/lib/engine/memoria-carga";
import { alternativasParaItem, candidatosAdicionar, rascunhoDaSessao, trocarItem } from "../src/lib/plan/editar-treino";
import { alternativasAoVivo, rascunhoAoVivo } from "../src/lib/treino/editar-durante-treino";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const C = CATALOG_EXERCICIOS;
const V = C.filter((e) => e.base_id);

// 1) Catálogo
ok(V.length === VARIACOES_DEFS.length, `todas as ${VARIACOES_DEFS.length} variações têm base existente`);
ok(new Set(C.map((e) => e.id)).size === C.length, "ids únicos");
ok(new Set(C.map((e) => e.nome.toLowerCase())).size === C.length, "nomes únicos");
for (const v of V) {
  const b = C.find((e) => e.id === v.base_id)!;
  ok(!!b && !b.base_id && b.padrao === v.padrao && b.grupo_primario === v.grupo_primario, `${v.nome}: ligada à base ${b?.nome} (mesmo padrão/músculo)`);
  ok(ExercicioSchema.safeParse(v).success, `${v.nome}: schema válido`);
  ok(!/_|motor/.test(v.nome) && !/_/.test(v.variacao ?? ""), `${v.nome}: nome sem id/enum`);
}
for (const id of ["leg_press_45", "leg_press_horizontal", "leg_press_articulado"]) ok(V.some((v) => v.id === id), `leg press: ${id} existe`);
ok(!V.some((v) => v.grupo_primario === "abdomen" || v.grupo_primario === "antebracos"), "sem abdômen/antebraço (lote 5)");
ok(familiaDoExercicio("leg_press_45", C).map((e) => e.id).includes("leg_press") && familiaDoExercicio("leg_press", C).length >= 4, "família base ↔ variações");

// 2) Blob antigo ganha variações no merge
const antigo = C.filter((e) => !e.base_id).slice(0, 10);
const merged = mergeCatalogoExercicios(antigo);
ok(V.every((v) => merged.some((m) => m.id === v.id)), "merge adiciona variações a estado antigo");

// 3) Plano gerado não escolhe variação sozinho
const perfil: Perfil = {
  id: "smoke-var", peso_kg: 80, altura_cm: 178, experiencia: "intermediario",
  dias_por_semana: 4, minutos_por_sessao: 60, cardio_min_semana: 0,
  equipamentos: ["barra", "halteres", "maquina", "cabo"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: new Date().toISOString(),
  parq_respostas: [false, false, false, false, false, false, false], criado_em: new Date().toISOString(),
};
for (const dias of [2, 3, 4, 5, 6] as const) {
  const g = gerarPlanoFromPerfil({ ...perfil, dias_por_semana: dias }, C);
  const ids = g.sessoes.flatMap((s) => s.prescricoes.flatMap((p) => [p.exercicio_id, p.alternativa_equipamento_ocupado ?? ""]));
  ok(!ids.some((id) => V.some((v) => v.id === id)), `${dias} dias: plano e alternativa de ocupado sem variação automática`);
}

// 4) Alternativas: variações primeiro, explicação humana; restrição herdada
const alts = listarAlternativasTroca({ exercicioId: "leg_press", catalog: C, perfil });
const nVarLp = V.filter((v) => v.base_id === "leg_press").length;
ok(alts.slice(0, nVarLp).every((a) => a.exercicio.base_id === "leg_press"), "leg press: variações aparecem primeiro");
ok(alts.slice(0, nVarLp).every((a) => /carga dessa versão fica guardada separada/.test(a.explicacao) && !/_/.test(a.explicacao)), "explicação de variação humana");
const altsVar = listarAlternativasTroca({ exercicioId: "leg_press_45", catalog: C, perfil });
ok(altsVar[0]?.exercicio.id === "leg_press" || altsVar[0]?.exercicio.base_id === "leg_press", "da variação dá pra voltar pra base/irmãs");
const joelho = listarAlternativasTroca({ exercicioId: "leg_press", catalog: C, perfil: { ...perfil, restricoes: ["dor no joelho"] } });
ok(!joelho.some((a) => a.exercicio.id === "agachamento_smith" || a.exercicio.id === "agachamento_frontal"), "joelho: variações de agachamento barra bloqueadas");
const lombar = listarAlternativasTroca({ exercicioId: "remada_maquina", catalog: C, perfil: { ...perfil, restricoes: ["lombar"] } });
ok(!lombar.some((a) => ["remada_curvada_supinada", "remada_cavalinho"].includes(a.exercicio.id)), "lombar: variações de remada curvada bloqueadas");
const soMaq = listarAlternativasTroca({ exercicioId: "supino_reto_convencional", catalog: C, perfil: { ...perfil, equipamentos: ["maquina"] } });
ok(soMaq.some((a) => a.exercicio.id === "supino_reto_smith") && soMaq.every((a) => ["maquina", "peso_corporal"].includes(a.exercicio.equipamento)), "equipamento respeitado nas variações");

// 5) Memória de carga própria
const g = gerarPlanoFromPerfil(perfil, C);
const reg = (id: string, ex: string, kg: number, em: string): RegistroSerie => ({ id, sessao_id: "s-" + em, prescricao_id: "p", exercicio_id: ex, numero: 1, tipo_serie: "trabalho" as RegistroSerie["tipo_serie"], carga_kg: kg, reps: 10, rir_percebido: 2, dor: false, executado_em: em });
const registros = [reg("a", "leg_press_45", 200, "2026-10-28T10:00:00Z"), reg("b", "leg_press_articulado", 120, "2026-10-30T10:00:00Z")];
const st: AppState = AppStateSchema.parse({
  perfil, exercicios: C, guias: [], plano: g.plano, sessoes: g.sessoes, registros, estados: g.estados,
  checkins: [], alertas: [], decisoes: [], volumes_semanais: g.volumes_semanais, active_sessao_id: null, logger_prescricao_id: null,
});
const c45 = cargaSugeridaParaExercicio(st, "leg_press_45", 50);
const cArt = cargaSugeridaParaExercicio(st, "leg_press_articulado", 50);
ok(c45.origem === "historico" && cArt.origem === "historico" && c45.carga_kg !== cArt.carga_kg, `memória separada: 45° ${c45.carga_kg} kg x articulado ${cArt.carga_kg} kg`);
ok(c45.carga_kg >= 190 && cArt.carga_kg >= 110, "sugestão parte da carga real de cada versão");
const lp45 = C.find((e) => e.id === "leg_press_45")!;
const info = infoVariacao(lp45, C, registros);
ok(info === "Variação de leg press · Última vez aqui: 200 kg".replace(" · Ú", " · ú"), `info na tela: "${info}"`);
ok(infoVariacao(C.find((e) => e.id === "leg_press")!, C, [])?.startsWith("Tem variações") === true, "base mostra que tem variações");

// 6) Seleção no Editar treino e no Editar durante treino
const comVar = (id: string) => V.some((v) => v.base_id === id);
const sessComLp = st.sessoes.find((s) => st.plano!.sessoes.includes(s.id) && s.prescricoes.some((p) => comVar(p.exercicio_id)));
const BASE = sessComLp?.prescricoes.find((p) => comVar(p.exercicio_id))?.exercicio_id ?? "";
const [VA, VB] = V.filter((v) => v.base_id === BASE).map((v) => v.id);
console.log(`(edição testada com ${BASE} → ${VA}/${VB})`);
if (sessComLp) {
  const r = rascunhoDaSessao(sessComLp);
  const idx = r.itens.findIndex((i) => i.exercicio_id === BASE);
  const altsEd = alternativasParaItem(st, r, idx);
  ok(altsEd.some((e) => e.id === VA), "Editar treino: variação na troca");
  const r2 = trocarItem(st, r, idx, VA!);
  ok(JSON.stringify(r2) !== JSON.stringify(r), "Editar treino: troca pra variação no rascunho (nada salvo)");
  ok(candidatosAdicionar(st, r).some((e) => e.id === (VB ?? VA)), "Editar treino: adicionar variação");
  const ao: AppState = { ...st, active_sessao_id: sessComLp.id, logger_prescricao_id: sessComLp.prescricoes[0]!.id, sessoes: st.sessoes.map((s) => (s.id === sessComLp.id ? { ...s, status: "em_andamento" as const } : s)) };
  const rv = rascunhoAoVivo(ao);
  ok(!!rv, "ao vivo: rascunho abre");
  if (rv) {
    const i2 = rv.itens.findIndex((i) => i.exercicio_id === BASE);
    ok(alternativasAoVivo(ao, rv, i2).some((e) => e.id === VA), "Editar durante treino: variação disponível");
  }
} else ok(false, "plano sem exercício com variação");

console.log(fail ? `\n${fail} falha(s)` : "\nOK smoke:variacoes");
process.exit(fail ? 1 : 0);
