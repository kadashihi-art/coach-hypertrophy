import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { derivarRacional } from "../src/lib/plan/racional";
import { faseAtiva } from "../src/lib/plan/estrutura";
import { agendarSessoes } from "../src/lib/plan/calendario";
import { buildConversarStub } from "../src/lib/llm/coach";
import type { Perfil } from "../src/lib/domain";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK  " : "FAIL"} ${m}`); if (!c) fails++; };
const base: Perfil = {
  id: "p", peso_kg: 80, altura_cm: 178, experiencia: "intermediario", dias_por_semana: 3,
  minutos_por_sessao: 60, cardio_min_semana: 0, equipamentos: ["halteres", "maquina", "cabo", "barra", "banco", "rack"],
  restricoes: [], objetivo: "hipertrofia", onboarding_concluido: true, parq_liberado: true, parq_respostas: [false,false,false,false,false,false,false], parq_respondido_em: "2026-10-01", criado_em: new Date().toISOString(),
};
const MAJ = ["peito", "costas", "quadriceps"];

// 3 dias auto
const g3 = gerarPlanoFromPerfil(base, CATALOG_EXERCICIOS);
ok(g3.plano.divisao === "full_body" && !!g3.plano.racional, `3 dias → ${g3.plano.divisao} com racional`);
ok((g3.plano.racional?.alternativas.length ?? 0) >= 2, "3 dias: alternativas consideradas");
ok(g3.plano.racional!.alternativas.some((a) => a.divisao === "ppl"), "3 dias: explica por que não PPL");
// 6 dias auto
const g6 = gerarPlanoFromPerfil({ ...base, dias_por_semana: 6 }, CATALOG_EXERCICIOS);
ok(g6.plano.divisao === "ppl", `6 dias → ${g6.plano.divisao}`);
const f6 = g6.plano.racional!.frequencia_por_musculo;
ok(MAJ.every((g) => (f6.find((f) => f.grupo === g)?.vezes_semana ?? 0) >= 2), "6 dias PPL: grandes grupos ≥2×");
console.log("  6d microciclo:", g6.plano.racional!.fases[0].microciclo);

// Híbrido PPL + descanso + UL (5 treinos)
const gh = gerarPlanoFromPerfil({ ...base, dias_por_semana: 5, estilo_split: "hibrido_ppl_ul" }, CATALOG_EXERCICIOS);
const fh = gh.plano.estrutura!.fases[0];
const tipos = fh.microciclo.map((d) => d.tipo);
console.log("  híbrido microciclo:", tipos.join(" → "));
console.log("  descanso:", fh.descanso_porque.join(" | "));
ok(gh.plano.divisao === "ppl_upper_lower" && gh.sessoes.length === 5, "híbrido: 5 sessões PPL+UL");
ok(tipos.slice(0, 3).join() === "push,pull,legs" && tipos[3] === "descanso" && tipos[4] === "upper" && tipos[5] === "lower", "híbrido: PPL → descanso → UL");
const fr = gh.plano.racional!.frequencia_por_musculo;
console.log("  freq:", fr.map((f) => `${f.grupo}:${f.vezes_semana}`).join(" "));
ok(MAJ.every((g) => (fr.find((f) => f.grupo === g)?.vezes_semana ?? 0) >= 2), "híbrido: peito/costas/quadríceps ~2×");
const vol = gh.plano.racional!.volume_semanal;
console.log("  vol:", vol.map((v) => `${v.grupo}:${v.series_diretas}[${v.faixa_alvo}]`).join(" "));
ok(vol.filter((v) => MAJ.includes(v.grupo)).every((v) => v.series_diretas >= 8 && v.series_diretas <= 20), "híbrido: volume grandes grupos dentro de R10/R11 (≥8 diretas + indiretas, ≤20)");
ok(fh.descanso_porque.some((d) => /Legs/.test(d)), "híbrido: descanso após Legs explicado");

// 2 fases
const g2 = gerarPlanoFromPerfil({ ...base, dias_por_semana: 4, estilo_split: "upper_lower", fase2_estilo: "hibrido_ppl_ul", fase1_semanas: 4, fase2_semanas: 3 }, CATALOG_EXERCICIOS);
const fs = g2.plano.estrutura!.fases;
ok(fs.length === 2 && fs[1].semana_inicio === 5 && g2.plano.mesociclo.total_semanas === 7, "2 fases: UL 4 sem → híbrido semana 5 (total 7)");
ok(!!g2.plano.racional!.fases[1].troca, "2 fases: racional registra troca");
const p1 = { ...g2.plano, mesociclo: { ...g2.plano.mesociclo, data_inicio: "2026-11-02" } };
ok(faseAtiva(p1, "2026-11-10")?.id === "fase-1", "fase ativa semana 2 = fase-1");
ok(faseAtiva(p1, "2026-12-01")?.id === "fase-2", "fase ativa semana 5 = fase-2");
const ag = agendarSessoes(g2.sessoes, p1, "2026-11-02");
const f2first = ag.find((s) => s.id === fs[1].sessao_ids[0]);
ok(f2first?.data === "2026-11-30", `calendário: 1ª sessão fase 2 em 2026-11-30 (${f2first?.data})`);

// Plano antigo sem racional/estrutura → fallback derivado
const legacy = { ...g6.plano, racional: undefined, estrutura: undefined };
const rd = derivarRacional({ plano: legacy, sessoes: g6.sessoes, perfil: base, catalog: CATALOG_EXERCICIOS });
ok(rd.fonte === "derivado" && rd.fases.length === 1 && rd.split.divisao === "ppl", "legacy: racional derivado on-the-fly (1 fase)");
ok(faseAtiva(legacy) === null, "legacy: sem fases → 1 fase implícita");

// Stub coach responde "por que PPL e não UL"
const env = buildConversarStub({
  mensagem: "por que PPL e não upper lower?",
  contexto: { gerado_em: "", filtro: {}, checkin_hoje: null, plano: null, estados: [], volumes_semanais: [], decisoes_progressao: [], proxima_sessao: null, racional: g6.plano.racional },
});
ok(/Push\/Pull\/Legs/.test(env.mensagem_usuario ?? "") && /\[\[sugestao:/.test(env.mensagem_usuario ?? "") && !/meu-treino/.test(env.mensagem_usuario ?? ""), "stub coach explica split + CTA (sugestão, sem rota)");

console.log(fails ? `\n${fails} FAIL` : "\nALL OK");
process.exit(fails ? 1 : 0);
