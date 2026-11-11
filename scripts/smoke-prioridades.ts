/** smoke:prioridades — sugestão pelo histórico, prévia sem gravar, onboarding e remount. */
import { sugerirPrioridades, previaPrioridades, MOTIVOS_PRIORIDADE } from "../src/lib/plan/prioridades";
import { paraPerfil } from "../src/lib/plan/coleta";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { PerfilSchema, type Perfil } from "../src/lib/domain";

let fail = 0;
const ok = (c: boolean, m: string) => { if (c) console.log("PASS", m); else { fail++; console.log("FAIL", m); } };
const base: Perfil = {
  id: "smoke", peso_kg: 80, altura_cm: 178, experiencia: "intermediario", dias_por_semana: 4, minutos_por_sessao: 75,
  cardio_min_semana: 0, equipamentos: ["barra", "halteres", "maquina", "cabo", "peso_corporal"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: "2026-11-04T00:00:00Z", parq_respostas: [false, false, false, false, false, false, false],
  criado_em: "2026-11-04T00:00:00Z",
};

// 1) Schema: novo campo opcional; perfil antigo continua válido.
ok(PerfilSchema.safeParse(base).success, "perfil sem prioridades continua válido");
ok(PerfilSchema.safeParse({ ...base, prioridades_musculares: ["gluteos", "peito"], prioridade_motivo: "dificil_desenvolver" }).success, "perfil com prioridades válido");
ok(!PerfilSchema.safeParse({ ...base, prioridades_musculares: ["peito", "costas", "ombros", "biceps"] }).success, "no máximo 3 prioridades");
ok(MOTIVOS_PRIORIDADE.length === 5 && MOTIVOS_PRIORIDADE.every((m) => m.dica.length > 20), "motivos com dica");

// 2) Sugestão pelo histórico.
const vol = (semana_iso: string, grupo: string, series_efetivas: number) => ({ semana_iso, grupo, series_diretas: series_efetivas, series_indiretas: 0, series_efetivas });
const semanas = ["2026-W42", "2026-W43", "2026-W44", "2026-W45"];
const outros = ["costas", "ombros", "quadriceps", "isquiotibiais", "biceps", "triceps", "panturrilhas"];
const volumes = semanas.flatMap((s) => [vol(s, "peito", 14), vol(s, "gluteos", 6), ...outros.map((g) => vol(s, g, 13))]);
const ex = (id: string) => CATALOG_EXERCICIOS.find((e) => e.id === id)!;
const est = (exercicio_id: string, sessoes_sem_progresso: number) => ({ exercicio_id, sessoes_sem_progresso, primeira_sessao: false }) as never;
const sug = sugerirPrioridades({ perfil: base, exercicios: CATALOG_EXERCICIOS, volumes_semanais: volumes as never, estados: [est("rosca_direta", 4), est("supino_reto_convencional", 0)] });
ok(sug[0]?.grupo === "gluteos" || sug.some((s) => s.grupo === "gluteos"), `glúteo abaixo do piso entra na sugestão (${sug.map((s) => s.grupo).join(", ")})`);
ok(sug.some((s) => s.grupo === "biceps" && s.motivos.some((m) => m.includes(ex("rosca_direta").nome))), "exercício travado puxa o músculo dele");
ok(!sug.some((s) => s.grupo === "peito"), "peito em dia não é sugerido");
ok(sug.length <= 3, "no máximo 3 sugestões");
ok(sugerirPrioridades({ perfil: base, exercicios: CATALOG_EXERCICIOS, volumes_semanais: [], estados: [] }).length === 0, "sem histórico → sem sugestão inventada");

// 3) Prévia: só calcula (não grava), prioritário sobe.
const pv = previaPrioridades(base, ["gluteos"], CATALOG_EXERCICIOS);
const g = pv.linhas.find((l) => l.grupo === "gluteos")!;
ok(g.prioritario && g.depois > g.antes, `prévia: glúteo ${g.antes} → ${g.depois}`);
ok(pv.linhas.every((l) => l.depois <= 20), "prévia respeita o teto 20");
const vazio = previaPrioridades(base, [], CATALOG_EXERCICIOS);
ok(vazio.linhas.every((l) => l.antes === l.depois), "sem prioridade: prévia igual");

// 4) Onboarding: prioridades da estratégia viram perfil.
const pp = paraPerfil(base, {} as never, { estilo_split: "auto", fase2_estilo: null, prioridades_musculares: ["gluteos", "gluteos", "ombros"] } as never);
ok(JSON.stringify(pp.prioridades_musculares) === '["gluteos","ombros"]', "estratégia do onboarding → prioridades_musculares (sem duplicar)");
const pp0 = paraPerfil(base, {} as never, { estilo_split: "auto", fase2_estilo: null, prioridades_musculares: [] } as never);
ok(pp0.prioridades_musculares === undefined, "sem prioridade na estratégia → campo ausente");

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
