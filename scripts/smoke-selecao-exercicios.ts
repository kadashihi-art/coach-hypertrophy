/** smoke:selecao-exercicios — escolha de exercícios por evidência de hipertrofia (nota, cobertura, porquê). */
import { gerarPlanoFromPerfil, estimateDurationMin } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS as C } from "../src/lib/catalog/exercicios";
import { garantirCobertura } from "../src/lib/plan/cobertura-exercicios";
import { ESTUDOS, MERITO, porqueDoExercicio, porqueEspecifico, REGRAS_COBERTURA } from "../src/lib/plan/evidencia-exercicio";
import { listarAlternativasTroca } from "../src/lib/plan/trocar-exercicio";
import type { Perfil, Prescricao } from "../src/lib/domain";

let fail = 0;
const ok = (c: boolean, m: string) => { if (c) console.log("PASS", m); else { fail++; console.log("FAIL", m); } };
const base: Perfil = {
  id: "smoke", peso_kg: 80, altura_cm: 178, experiencia: "intermediario", dias_por_semana: 4, minutos_por_sessao: 60,
  cardio_min_semana: 0, equipamentos: ["barra", "halteres", "maquina", "cabo", "peso_corporal"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: "2026-09-01T00:00:00Z", parq_respostas: [false, false, false, false, false, false, false],
  criado_em: "2026-09-01T00:00:00Z",
} as Perfil;
const byId = new Map(C.map((e) => [e.id, e]));
const idsDoPlano = (g: ReturnType<typeof gerarPlanoFromPerfil>) => g.sessoes.flatMap((s) => s.prescricoes.map((p) => p.exercicio_id));

// 1) Base de evidências coerente: todo mérito aponta pra exercício e estudo que existem.
ok(Object.keys(MERITO).every((id) => byId.has(id)), "todo exercício com mérito existe no catálogo");
ok(Object.values(MERITO).every((m) => !m!.estudo || !!ESTUDOS[m!.estudo]), "todo mérito cita um estudo cadastrado");
ok(REGRAS_COBERTURA.every((r) => r.preferir.every((id) => byId.get(id) && r.cumpre(byId.get(id)!))), "candidatos de cada regra cumprem a regra");
ok(Object.values(ESTUDOS).every((e) => e.ref.length > 5 && e.achado.length > 20), "estudos com referência e achado");

// 2) Plano padrão (4 dias, 60 min): cobre as regiões.
for (const dias of [3, 4, 5, 6]) {
  const g = gerarPlanoFromPerfil({ ...base, dias_por_semana: dias }, C);
  const ids = idsDoPlano(g);
  const tem = (f: (id: string) => boolean) => ids.some(f);
  ok(tem((id) => id === "triceps_overhead_cabo"), `${dias}d: tem tríceps acima da cabeça`);
  ok(tem((id) => byId.get(id)?.padrao === "extensao_joelho"), `${dias}d: tem extensora`);
  ok(tem((id) => byId.get(id)?.padrao === "flexao_joelho"), `${dias}d: tem flexão de joelho`);
  ok(tem((id) => byId.get(id)?.padrao === "empurrar_inclinado"), `${dias}d: tem supino inclinado`);
  // Sentada é a flexora principal; a deitada só entra como volume extra, junto com ela.
  ok(ids.includes("cadeira_flexora_sentada"), `${dias}d: flexora sentada como principal (Maeo 2021)`);
  ok(/Maeo et al\., 2023/.test(g.plano.justificativa.texto), `${dias}d: a justificativa cita o estudo da troca`);
  // estados só dos exercícios que ficaram
  ok(g.estados.every((e) => ids.includes(e.exercicio_id)) && new Set(ids).size === g.estados.length, `${dias}d: estados só dos exercícios do plano`);
  // determinístico
  ok(JSON.stringify(idsDoPlano(gerarPlanoFromPerfil({ ...base, dias_por_semana: dias }, C))) === JSON.stringify(ids), `${dias}d: mesmo perfil, mesmo plano`);
}

// 3) Restrições e equipamento mandam.
{
  const ombro = idsDoPlano(gerarPlanoFromPerfil({ ...base, restricoes: ["ombro"] }, C));
  ok(!ombro.includes("triceps_overhead_cabo"), "dor no ombro: não força tríceps acima da cabeça");
  const semCabo = idsDoPlano(gerarPlanoFromPerfil({ ...base, equipamentos: ["halteres", "maquina", "barra", "peso_corporal"] }, C));
  ok(semCabo.every((id) => byId.get(id)!.equipamento !== "cabo"), "sem cabo: nenhum exercício de cabo");
  const casa = gerarPlanoFromPerfil({ ...base, equipamentos: ["halteres", "peso_corporal"] }, C);
  ok(idsDoPlano(casa).every((id) => ["halteres", "peso_corporal"].includes(byId.get(id)!.equipamento)), "só halteres: plano só com halteres e peso do corpo");
}

// 4) Cobertura direta: troca isolador redundante; acrescenta só se couber no tempo.
{
  const mk = (sessao_id: string, id: string, ordem: number, series = 3): Prescricao => ({
    id: `p-${sessao_id}-${id}`, sessao_id, exercicio_id: id, padrao: byId.get(id)!.padrao, ordem, series, faixa_reps: [8, 12], rir_alvo: 2,
    descanso_seg: 90, cadencia: "2-0-1-0", tecnica: "padrao", carga: { trabalho_kg: 20, top_set_kg: null, origem: "estimativa_conservadora" },
    alternativa_equipamento_ocupado: null, guia_id: null, evidencia: "moderado",
  } as Prescricao);
  const ctx = (limiteMin: number) => ({
    catalog: C, equips: new Set(["barra", "halteres", "maquina", "cabo", "peso_corporal"]), restr: new Set<never>(),
    criarPrescricao: (ex: (typeof C)[number], sess: { id: string }, series: number, ordem: number) => mk(sess.id, ex.id, ordem, series),
    duracao: (ps: Prescricao[]) => estimateDurationMin(ps, C), limiteMin, seriesNovo: 3,
  });
  const s1 = [{ id: "a", tipo: "upper" as const, prescricoes: [mk("a", "supino_reto_convencional", 1), mk("a", "triceps_corda", 2), mk("a", "triceps_pulley", 3)] }];
  const r1 = garantirCobertura(s1, ctx(90));
  ok(s1[0]!.prescricoes.some((p) => p.exercicio_id === "triceps_overhead_cabo") && s1[0]!.prescricoes.length === 3, "tríceps: troca um isolador por overhead, sem mudar o tamanho do treino");
  ok(s1[0]!.prescricoes.find((p) => p.exercicio_id === "triceps_overhead_cabo")!.series === 3, "a troca mantém as séries");
  ok(r1.notas.some((n) => n.includes("Tríceps") && n.includes("Maeo")), "nota da troca com o estudo");

  const s2 = [{ id: "b", tipo: "lower" as const, prescricoes: [mk("b", "leg_press", 1, 4)] }];
  garantirCobertura(s2, ctx(90));
  ok(s2[0]!.prescricoes.some((p) => p.exercicio_id === "cadeira_extensora"), "quadríceps só com leg press: acrescenta extensora quando cabe");
  ok(s2[0]!.prescricoes[0]!.exercicio_id === "leg_press", "o composto principal não é trocado");
  const s3 = [{ id: "c", tipo: "lower" as const, prescricoes: [mk("c", "leg_press", 1, 4)] }];
  garantirCobertura(s3, ctx(5));
  ok(s3[0]!.prescricoes.length === 1, "sem tempo: não acrescenta nada");
}

// 5) Troca de exercício: ciência no ranking e no texto.
{
  const alts = listarAlternativasTroca({ exercicioId: "triceps_corda", catalog: C, perfil: base });
  ok(alts[0]?.exercicio.id === "triceps_overhead_cabo" && !!alts[0].recomendado, `troca do tríceps corda: overhead em 1º e recomendado (${alts[0]?.exercicio.id})`);
  ok(!!alts[0]?.ciencia && alts[0].ciencia.includes("Maeo"), "troca mostra a vantagem com o estudo");
  const flex = listarAlternativasTroca({ exercicioId: "mesa_flexora", catalog: C, perfil: base });
  ok(flex[0]?.exercicio.id === "cadeira_flexora_sentada", "troca da flexora deitada: sentada em 1º");
}

// 6) Porquê: específico com estudo, geral sem inventar.
ok(porqueEspecifico("triceps_overhead_cabo")!.includes("(Maeo et al., 2023)"), "porquê específico cita o estudo");
ok(porqueEspecifico("remada_maquina") === null, "exercício sem vantagem específica: sem porquê inventado");
ok(porqueDoExercicio(byId.get("remada_maquina")!).vantagem.startsWith("Composto"), "porquê geral pelo tipo do exercício");

if (fail) { console.error(`\n${fail} falha(s)`); process.exit(1); }
console.log("\nsmoke:selecao-exercicios OK");
