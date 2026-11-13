/** smoke:tempo-curto — "hoje só tenho X minutos": corta o que menos rende, só no dia. */
import { estimateDurationMin, gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS as C } from "../src/lib/catalog/exercicios";
import { ativos, encurtarTreino, limparPulos, opcoesDeTempo } from "../src/lib/inteligencia/tempo-curto";
import { marcarAjusteDoDia, voltarParaBase } from "../src/lib/engine/rampa-volume";
import { PrescricaoSchema, type Perfil } from "../src/lib/domain";

let fail = 0;
const ok = (c: boolean, m: string) => { if (c) console.log("PASS", m); else { fail++; console.log("FAIL", m); } };
const base: Perfil = {
  id: "smoke", peso_kg: 80, altura_cm: 178, experiencia: "intermediario", dias_por_semana: 4, minutos_por_sessao: 75,
  cardio_min_semana: 0, equipamentos: ["barra", "halteres", "maquina", "cabo", "peso_corporal"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: "2026-09-01T00:00:00Z", parq_respostas: [false, false, false, false, false, false, false],
  criado_em: "2026-09-01T00:00:00Z",
};
const byId = new Map(C.map((e) => [e.id, e]));
const dur = (ps: Parameters<typeof estimateDurationMin>[0]) => estimateDurationMin(ps, C);
const g = gerarPlanoFromPerfil(base, C);

for (const sess of g.sessoes) {
  const cheio = dur(sess.prescricoes);
  for (const minutos of [60, 45, 30]) {
    if (minutos >= cheio) continue;
    const r = encurtarTreino({ prescricoes: sess.prescricoes, exercicios: C, minutos, duracao: dur });
    const tag = `${sess.nome} ${cheio}→${minutos}min`;
    const vivos = ativos(r.prescricoes);
    ok(r.duracao_antes === cheio && r.duracao_depois === dur(vivos), `${tag}: durações coerentes (${r.duracao_depois} min)`);
    ok(r.cabe ? r.duracao_depois <= minutos : vivos.every((p) => p.series === 2), `${tag}: cabe, ou já está no mínimo`);
    ok(vivos.length >= 2 && vivos.every((p) => p.series >= 2), `${tag}: ≥2 exercícios e ≥2 séries em cada`);
    // o primeiro composto de cada músculo nunca é pulado
    const primeiros = new Map<string, string>();
    for (const p of sess.prescricoes) { const e = byId.get(p.exercicio_id)!; if (e.composto && !primeiros.has(e.grupo_primario)) primeiros.set(e.grupo_primario, p.id); }
    ok([...primeiros.values()].every((id) => vivos.some((p) => p.id === id)), `${tag}: 1º composto de cada músculo fica`);
    ok(r.prescricoes.length === sess.prescricoes.length, `${tag}: nada some do plano (pulado só é marcado)`);
    ok(r.prescricoes.every((p) => PrescricaoSchema.safeParse(p).success), `${tag}: prescrições válidas`);
  }
}

// Ordem dos cortes: séries antes de pular; isolador não prioritário antes de composto
const up = g.sessoes[0]!;
const leve = encurtarTreino({ prescricoes: up.prescricoes, exercicios: C, minutos: dur(up.prescricoes) - 6, duracao: dur });
ok(leve.mudancas.length > 0 && leve.mudancas.every((m) => !m.pulado), "corte pequeno: só tira séries, não pula exercício");
ok(leve.mudancas.every((m) => !byId.get(m.exercicio_id)!.composto), `corte pequeno sai dos isoladores (${leve.mudancas.map((m) => m.exercicio_id).join(", ")})`);
// prioridade protege
const pri = encurtarTreino({ prescricoes: up.prescricoes, exercicios: C, minutos: dur(up.prescricoes) - 6, prioridades: ["biceps", "triceps", "ombros"], duracao: dur });
ok(pri.mudancas.every((m) => !["biceps", "triceps", "ombros"].includes(byId.get(m.exercicio_id)!.grupo_primario)), "músculo prioritário é o último a perder série");
// sem necessidade: nada muda
const folga = encurtarTreino({ prescricoes: up.prescricoes, exercicios: C, minutos: 200, duracao: dur });
ok(folga.mudancas.length === 0 && folga.cabe, "tempo sobrando: treino igual");
// só do dia: a base volta inteira
const curto = encurtarTreino({ prescricoes: up.prescricoes, exercicios: C, minutos: 30, duracao: dur });
const gravado = marcarAjusteDoDia(up.prescricoes, curto.prescricoes);
const deVolta = limparPulos(voltarParaBase(gravado));
ok(JSON.stringify(deVolta.map((p) => [p.id, p.series])) === JSON.stringify(up.prescricoes.map((p) => [p.id, p.series])) && deVolta.every((p) => !p.pulado_hoje), "semana seguinte: treino volta inteiro");
ok(curto.mudancas.some((m) => m.pulado) && ativos(gravado).length < gravado.length, "30 min: pula exercícios");
// opções
ok(JSON.stringify(opcoesDeTempo(75)) === "[60,45,30]" && JSON.stringify(opcoesDeTempo(48)) === "[30]" && opcoesDeTempo(32).length === 0, "opções só abaixo do treino completo");

console.log(fail ? `FAIL ${fail}` : "ALL PASS");
process.exit(fail ? 1 : 0);
