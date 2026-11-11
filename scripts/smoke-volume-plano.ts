/** smoke:volume-plano — equilíbrio de volume do gerador (docs/series-validas.md). */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { alvoSemanalGrupo, GRUPOS_PRINCIPAIS, MAX_SERIES_SESSAO_GRUPO, volumeSemanalDasSessoes } from "../src/lib/plan/equilibrar-volume";
import type { Perfil } from "../src/lib/domain";

let fail = 0;
const ok = (c: boolean, m: string) => { if (c) console.log("PASS", m); else { fail++; console.log("FAIL", m); } };
const byId = new Map(CATALOG_EXERCICIOS.map((e) => [e.id, e]));
const base: Perfil = {
  id: "smoke", peso_kg: 80, altura_cm: 178, experiencia: "intermediario", dias_por_semana: 4, minutos_por_sessao: 60,
  cardio_min_semana: 0, equipamentos: ["barra", "halteres", "maquina", "cabo", "peso_corporal"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: false, parq_liberado: true, parq_respondido_em: "2026-11-04T00:00:00Z", parq_respostas: [false, false, false, false, false, false, false],
  criado_em: "2026-11-04T00:00:00Z",
};
const gerar = (p: Partial<Perfil>) => gerarPlanoFromPerfil({ ...base, ...p } as Perfil, CATALOG_EXERCICIOS);
const ef = (g: ReturnType<typeof gerar>) => volumeSemanalDasSessoes(g.sessoes, CATALOG_EXERCICIOS);

// 1) Tetos: 20/semana e 10 diretas por sessão, em qualquer perfil e estilo.
for (const experiencia of ["iniciante", "intermediario", "avancado"] as const)
  for (const dias of [2, 3, 4, 5, 6])
    for (const minutos_por_sessao of [45, 60, 90])
      for (const estilo_split of ["auto", "ppl", "upper_lower", "full_body"] as const) {
        const g = gerar({ experiencia, dias_por_semana: dias, minutos_por_sessao, estilo_split });
        const tag = `${experiencia} ${dias}d ${minutos_por_sessao}min ${estilo_split}`;
        const v = ef(g);
        const acima = [...v.entries()].filter(([gr, x]) => x.efetivo > alvoSemanalGrupo(gr, base).max + 1e-9);
        if (acima.length) ok(false, `${tag}: acima do teto ${JSON.stringify(acima)}`);
        for (const s of g.sessoes) {
          const porG = new Map<string, number>();
          for (const p of s.prescricoes) { const gr = byId.get(p.exercicio_id)!.grupo_primario; porG.set(gr, (porG.get(gr) ?? 0) + p.series); }
          const max = Math.max(0, ...porG.values());
          if (max > MAX_SERIES_SESSAO_GRUPO) ok(false, `${tag} ${s.nome}: ${max} séries do mesmo músculo`);
          if (s.prescricoes.some((p) => p.series < 2 || p.series > 5)) ok(false, `${tag} ${s.nome}: séries fora de 2–5`);
        }
      }
ok(fail === 0, "tetos 20/semana e 10/sessão respeitados em todos os perfis");

// 2) Com tempo (90 min, 4 e 6 dias), todo grupo principal chega no piso do nível.
for (const experiencia of ["iniciante", "intermediario", "avancado"] as const)
  for (const dias of [4, 6]) {
    const g = gerar({ experiencia, dias_por_semana: dias, minutos_por_sessao: 90 });
    const v = ef(g);
    const abaixo = GRUPOS_PRINCIPAIS.filter((gr) => (v.get(gr)?.efetivo ?? 0) < alvoSemanalGrupo(gr, { ...base, experiencia }).min - 1e-9);
    ok(abaixo.length === 0, `${experiencia} ${dias}d 90min: todos os grupos principais no piso (${abaixo.join(", ") || "ok"})`);
  }

// 3) 5 dias no automático: continua Push/Pull/Legs (calendário igual ao de antes).
{
  const g = gerar({ dias_por_semana: 5 });
  const v = ef(g);
  ok(g.plano.divisao === "ppl", `5 dias auto → ${g.plano.divisao}`);
  ok(g.sessoes.map((s) => s.nome).join(",") === "Push A,Pull A,Legs A,Push B,Pull B", `5 dias: mesma sequência (${g.sessoes.map((s) => s.nome).join(", ")})`);
  ok(/Push\/Pull\/Legs/.test(g.plano.justificativa.texto), "justificativa do split de 5 dias como antes");
  // Pernas 1×/semana: o equilíbrio tira o que pode da sessão e explica a causa certa.
  ok((v.get("quadriceps")?.efetivo ?? 0) >= 9, `5 dias: quadríceps subiu dentro do treino de pernas (${v.get("quadriceps")?.efetivo})`);
  ok(/só 1×\/semana/.test(g.plano.justificativa.texto), "justificativa explica que pernas treinam 1×/semana");
  const legs = g.sessoes.find((s) => /Legs/.test(s.nome))!;
  const porG = new Map<string, number>();
  for (const p of legs.prescricoes) { const gr = byId.get(p.exercicio_id)!.grupo_primario; porG.set(gr, (porG.get(gr) ?? 0) + p.series); }
  ok(Math.max(...porG.values()) <= MAX_SERIES_SESSAO_GRUPO, "teto de 10 por músculo no treino de pernas");
}

// 4) Avançado ≠ intermediário (com tempo pra isso).
{
  const tot = (g: ReturnType<typeof gerar>) => g.sessoes.reduce((a, s) => a + s.prescricoes.reduce((b, p) => b + p.series, 0), 0);
  const i = gerar({ experiencia: "intermediario", dias_por_semana: 4, minutos_por_sessao: 90 });
  const a = gerar({ experiencia: "avancado", dias_por_semana: 4, minutos_por_sessao: 90 });
  ok(tot(a) > tot(i), `avançado tem mais séries que intermediário (${tot(a)} > ${tot(i)})`);
  ok(alvoSemanalGrupo("peito", { ...base, experiencia: "avancado" }).min === 14 && alvoSemanalGrupo("peito", base).min === 12 && alvoSemanalGrupo("peito", { ...base, experiencia: "iniciante" }).min === 10, "piso por nível 10/12/14");
}

// 5) Prioridade muscular: +séries, composto primeiro, e sem prioridade nada muda.
{
  const p0 = gerar({ dias_por_semana: 4, minutos_por_sessao: 75 });
  const p1 = gerar({ dias_por_semana: 4, minutos_por_sessao: 75, prioridades_musculares: ["gluteos", "peito"] });
  const v0 = ef(p0), v1 = ef(p1);
  ok((v1.get("gluteos")?.efetivo ?? 0) > (v0.get("gluteos")?.efetivo ?? 0), `glúteo prioritário sobe (${v0.get("gluteos")?.efetivo} → ${v1.get("gluteos")?.efetivo})`);
  ok((v1.get("peito")?.efetivo ?? 0) > (v0.get("peito")?.efetivo ?? 0), `peito prioritário sobe (${v0.get("peito")?.efetivo} → ${v1.get("peito")?.efetivo})`);
  ok((v1.get("gluteos")?.efetivo ?? 0) <= 20 && (v1.get("peito")?.efetivo ?? 0) <= 20, "prioritário respeita o teto 20");
  const lowerB = p1.sessoes.find((s) => s.prescricoes.some((p) => p.exercicio_id.startsWith("hip_thrust")))!;
  const iHip = lowerB.prescricoes.findIndex((p) => p.exercicio_id.startsWith("hip_thrust"));
  ok(iHip === 0, `composto do prioritário vem primeiro (${lowerB.prescricoes.map((p) => p.exercicio_id).join(" → ")})`);
  ok(lowerB.prescricoes.every((p, i) => p.ordem === i + 1), "ordem renumerada");
  ok(/Prioridade \(glúteos, peito\)/.test(p1.plano.justificativa.texto), "justificativa cita a prioridade");
  const pVazio = gerar({ dias_por_semana: 4, minutos_por_sessao: 75, prioridades_musculares: [] });
  ok(JSON.stringify(pVazio.sessoes.map((s) => s.prescricoes.map((p) => [p.exercicio_id, p.series]))) === JSON.stringify(p0.sessoes.map((s) => s.prescricoes.map((p) => [p.exercicio_id, p.series]))), "lista vazia = plano igual");
  ok(alvoSemanalGrupo("gluteos", { ...base, prioridades_musculares: ["gluteos"] }).min === 16, "piso do prioritário = nível + 4");
}

// 6) Pouco tempo: avisa em vez de inventar volume.
{
  const g = gerar({ dias_por_semana: 2, minutos_por_sessao: 45 });
  ok(/abaixo do ideal/.test(g.plano.justificativa.texto), "2 dias × 45 min: justificativa avisa que faltou tempo");
}

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
