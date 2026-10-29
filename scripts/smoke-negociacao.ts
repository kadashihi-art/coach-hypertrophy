import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { aplicarAjustes, gerarProposta, interpretarFeedbackHeuristico, AjustesPlanoSchema } from "../src/lib/plan/negociacao";
import { POST } from "../src/app/api/plan/negociar/route";
import type { Perfil } from "../src/lib/domain";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK  " : "FAIL"} ${m}`); if (!c) fails++; };
const base: Perfil = {
  id: "p", peso_kg: 80, altura_cm: 178, experiencia: "intermediario", dias_por_semana: 6,
  minutos_por_sessao: 60, cardio_min_semana: 0, equipamentos: ["halteres", "maquina", "cabo", "barra", "banco", "rack"],
  restricoes: [], objetivo: "hipertrofia", onboarding_concluido: true, parq_liberado: true, parq_respostas: [false,false,false,false,false,false,false], parq_respondido_em: "2026-10-01", criado_em: new Date().toISOString(),
};

(async () => {
  delete process.env.COACH_LLM_API_KEY;
  const p0 = gerarProposta(base, CATALOG_EXERCICIOS);
  ok(p0.ok && p0.gerado.plano.divisao === "ppl", `proposta inicial (6d) → ${p0.ok ? p0.gerado.plano.divisao : "erro"}, não salva`);

  // feedback via rota (sem LLM → heurística) 
  const res = await POST(new Request("http://x/api/plan/negociar", { method: "POST", body: JSON.stringify({ mensagem: "prefiro UL, 4 dias", proposta: { split: "PPL" } }) }));
  const r = (await res.json()) as { resposta: string; ajustes: unknown; condicoes: string[]; fonte: string };
  console.log("  rota:", r.fonte, JSON.stringify(r.ajustes), "|", r.resposta.slice(0, 90));
  ok(AjustesPlanoSchema.safeParse(r.ajustes).success, "ajustes validados por schema");
  const p1perfil = aplicarAjustes(base, r.ajustes, r.condicoes);
  const p1 = gerarProposta(p1perfil, CATALOG_EXERCICIOS);
  ok(p1.ok && p1.gerado.plano.divisao === "upper_lower" && p1.gerado.sessoes.length === 4, `nova proposta → ${p1.ok ? p1.gerado.plano.divisao + " " + p1.gerado.sessoes.length + "x" : "erro"}`);
  if (p1.ok) console.log("  microciclo:", p1.racional.fases[0].microciclo);

  // confirmar = mesmo caminho do completeOnboarding
  const salvo = gerarPlanoFromPerfil(p1perfil, CATALOG_EXERCICIOS);
  ok(salvo.plano.racional!.acordos.length >= 2 && salvo.plano.racional!.acordos.some((a) => /Upper/.test(a)), `confirmar salva racional com acordos: ${salvo.plano.racional!.acordos.join(" / ")}`);

  // ajuste malicioso/inválido é descartado; PAR-Q intocado
  const hack = aplicarAjustes({ ...base, parq_liberado: false }, { parq_liberado: true, carga_kg: 200 } as unknown);
  ok(hack.parq_liberado === false, "ajuste fora do schema ignorado; PAR-Q não é liberado");
  const bloq = gerarProposta({ ...base, parq_liberado: false, parq_respostas: [true, false, false, false, false, false, false] }, CATALOG_EXERCICIOS);
  ok(!bloq.ok, "PAR-Q bloqueado → sem proposta");
  const r403 = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ mensagem: "x", parq_bloqueado: true }) }));
  ok(r403.status === 403, "rota recusa com PAR-Q bloqueado");

  // lesão vira restrição; descanso fixo respeitado
  const h = interpretarFeedbackHeuristico("tenho lesão no ombro e só 45 minutos");
  ok((h.ajustes.restricoes_adicionar ?? []).some((x) => x.includes("ombro")) && h.ajustes.minutos_por_sessao === 45, "lesão→restrição, tempo→minutos");
  const fx = gerarPlanoFromPerfil({ ...base, dias_por_semana: 4, estilo_split: "upper_lower", dias_descanso_fixos: [0, 6] }, CATALOG_EXERCICIOS);
  const mic = fx.plano.estrutura!.fases[0].microciclo;
  ok(mic[0].tipo === "descanso" && mic[6].tipo === "descanso", `descansos fixos dia 1 e 7: ${mic.map((d) => d.tipo).join("→")}`);

  console.log(fails ? `\n${fails} FAIL` : "\nALL OK");
  process.exit(fails ? 1 : 0);
})();
