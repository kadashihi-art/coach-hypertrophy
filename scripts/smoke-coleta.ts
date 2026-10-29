import { validarEstrategia, paraPerfil, faltando, mesclarPerfil } from "../src/lib/plan/coleta";
import { gerarProposta } from "../src/lib/plan/negociacao";
import { seedState } from "../src/lib/seed";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(c ? "OK  " : "FAIL", m); if (!c) fails++; };
const base = { ...seedState.perfil!, parq_liberado: true, parq_respostas: [false,false,false,false,false,false,false], parq_respondido_em: "2026-10-01", onboarding_concluido: true };
// Persona A: iniciante, 3 dias, ombro lesionado; LLM propõe PPL (inválido p/ 3 dias sem pedido) → motor corrige p/ FB
const a = mesclarPerfil({}, { objetivo: "hipertrofia", experiencia: "iniciante", peso_kg: 70, altura_cm: 172, dias_por_semana: 3, minutos_por_sessao: 50, equipamentos: ["halteres", "maquina", "cabo", "banco"], restricoes: ["ombro"], lixo: 1 });
ok(faltando(a).length === 0, "persona A completa");
const va = validarEstrategia(a, { estilo_split: "ppl", porque: ["teste"] });
ok(va.estrategia.estilo_split === "full_body" && va.correcoes.length > 0, `A: ppl→${va.estrategia.estilo_split} (${va.correcoes[0]})`);
const pa = gerarProposta(paraPerfil(base, a, va.estrategia, va.correcoes), CATALOG_EXERCICIOS);
ok(pa.ok && /full/i.test(pa.racional.split.nome), `A split: ${pa.ok ? pa.racional.split.nome : "bloq"}`);
ok(pa.ok && pa.racional.acordos.some((x) => /Ajuste técnico/.test(x)), "A racional traz correção");
// Persona B: avançado, 6 dias, prioridade pernas; LLM propõe UL 6 → aceita
const b = mesclarPerfil({}, { objetivo: "hipertrofia", experiencia: "avancado", peso_kg: 88, altura_cm: 183, dias_por_semana: 6, minutos_por_sessao: 75, equipamentos: ["barra", "halteres", "maquina", "cabo", "banco", "rack"], restricoes: [] });
const vb = validarEstrategia(b, { estilo_split: "upper_lower", prioridades_musculares: ["quadriceps", "isquiotibiais", "gluteos"], porque: ["pernas 3×"] });
ok(vb.estrategia.estilo_split === "upper_lower" && vb.correcoes.length === 0, "B: UL 6 aceito");
const pb = gerarProposta(paraPerfil(base, b, vb.estrategia), CATALOG_EXERCICIOS);
ok(pb.ok && /upper/i.test(pb.racional.split.nome) && pb.racional.acordos.some((x) => /Prioridade: quadriceps/.test(x)), `B split: ${pb.ok ? pb.racional.split.nome : "?"}`);
ok(pa.ok && pb.ok && pa.racional.split.nome !== pb.racional.split.nome, "estratégias diferentes");
// Sem estratégia → auto, nunca híbrido por padrão (2..6 dias)
for (const d of [2, 3, 4, 5, 6]) {
  const v = validarEstrategia({ ...b, dias_por_semana: d }, null);
  const p = gerarProposta(paraPerfil(base, { ...b, dias_por_semana: d }, v.estrategia), CATALOG_EXERCICIOS);
  ok(p.ok && !/h[ií]brido/i.test(p.racional.split.nome), `auto ${d} dias → ${p.ok ? p.racional.split.nome : "?"}`);
}
// Híbrido só com 5 dias
ok(validarEstrategia({ ...a, dias_por_semana: 4 }, { estilo_split: "hibrido_ppl_ul" }).estrategia.estilo_split === "upper_lower", "híbrido 4 dias corrigido");
process.exit(fails ? 1 : 0);
