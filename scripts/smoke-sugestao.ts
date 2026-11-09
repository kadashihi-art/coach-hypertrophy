/**
 * Sugestões de exercício com memória (item 5).
 * - Troca: exercício que você já faz e evolui sobe e vem marcado "Recomendado"; dor recente vai pro fim.
 * - Linha de memória ("Você já fez: …") e aviso de dor.
 * - Gerador (refazer o plano): histórico desempata a escolha do slot; plano novo sem histórico não muda.
 */
import type { EstadoExercicio, Perfil, RegistroSerie } from "../src/lib/domain";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { listarAlternativasTroca } from "../src/lib/plan/trocar-exercicio";
import { pontosHistorico, pontosHistoricoPorExercicio, sinalDoExercicio } from "../src/lib/plan/sugestao-exercicio";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  console.log(cond ? "✓" : "✗", msg);
  if (!cond) falhas++;
}

const HOJE = "2026-11-09T12:00:00.000Z";
let n = 0;
/** Sessões do exercício, uma por semana até hoje, com carga subindo `passo` kg por sessão. */
function historico(exId: string, sessoes: number, kg0: number, passo: number, dor = false): RegistroSerie[] {
  const out: RegistroSerie[] = [];
  for (let i = 0; i < sessoes; i++) {
    const dia = new Date(Date.parse(HOJE) - (sessoes - i) * 7 * 86400000).toISOString();
    n++;
    for (let k = 1; k <= 3; k++) {
      out.push({ id: `r${n}-${k}`, sessao_id: `s${n}`, prescricao_id: "p", exercicio_id: exId, numero: k, tipo_serie: "trabalho",
        carga_kg: kg0 + passo * i, reps: 10, rir_percebido: 2, dor: dor && i === sessoes - 1, executado_em: dia });
    }
  }
  return out;
}
const fonte = (registros: RegistroSerie[], estados: EstadoExercicio[] = []) => ({ registros, estados, hojeIso: HOJE });
const ids = (xs: { exercicio: { id: string } }[]) => xs.map((x) => x.exercicio.id);

// 1) Troca sem histórico: ordem de sempre (variações da família primeiro).
const semHist = listarAlternativasTroca({ exercicioId: "puxada_frontal", catalog: CATALOG_EXERCICIOS, perfil: null });
const comVazio = listarAlternativasTroca({ exercicioId: "puxada_frontal", catalog: CATALOG_EXERCICIOS, perfil: null, historico: fonte([]) });
ok(ids(semHist).join() === ids(comVazio).join(), "sem nada feito, a ordem não muda");
ok(!comVazio.some((a) => a.recomendado), "sem histórico, nada vem marcado como recomendado");

// 2) Já faz a puxada articulada e vem evoluindo → primeira, recomendada, com a última carga.
{
  const regs = historico("puxada_articulada", 4, 50, 2.5);
  const alts = listarAlternativasTroca({ exercicioId: "puxada_frontal", catalog: CATALOG_EXERCICIOS, perfil: null, historico: fonte(regs) });
  ok(alts[0]?.exercicio.id === "puxada_articulada", `conhecida e evoluindo vai pro topo (got ${alts[0]?.exercicio.id})`);
  ok(alts[0]?.recomendado === true && /evoluindo/.test(alts[0]?.motivo_recomendacao ?? ""), `recomendada: ${alts[0]?.motivo_recomendacao}`);
  ok(/^Você já fez: 57,5 kg( total)? × 10 reps @ RIR 2 · \+[\d,]+% no e1RM\.$/.test(alts[0]?.memoria ?? ""), `memória: ${alts[0]?.memoria}`);
}

// 3) Dor recente na variação da família → vai pro fim, com aviso, e não é recomendada.
{
  const regs = historico("puxada_supinada", 3, 40, 2.5, true);
  const alts = listarAlternativasTroca({ exercicioId: "puxada_frontal", catalog: CATALOG_EXERCICIOS, perfil: null, historico: fonte(regs) });
  const ult = alts[alts.length - 1]!;
  ok(ult.exercicio.id === "puxada_supinada", `dor recente vai pro fim (got ${ult.exercicio.id})`);
  ok(/^Você marcou dor nele em/.test(ult.memoria ?? ""), `aviso: ${ult.memoria}`);
  ok(!alts.some((a) => a.recomendado), "nada recomendado só por ter dor no histórico");
  // Dor de 2 meses atrás não conta.
  const velha = historico("puxada_supinada", 3, 40, 2.5, true).map((r) => ({ ...r, executado_em: "2026-08-01T10:00:00.000Z" }));
  ok(sinalDoExercicio(CATALOG_EXERCICIOS.find((e) => e.id === "puxada_supinada")!, fonte(velha)).dor_em === null, "dor de mais de 30 dias não pesa");
}

// 4) Travado (3+ sessões sem progresso) perde pontos.
{
  const regs = historico("puxada_neutra", 4, 50, 0);
  const ex = CATALOG_EXERCICIOS.find((e) => e.id === "puxada_neutra")!;
  const livre = pontosHistorico(sinalDoExercicio(ex, fonte(regs)));
  const travado = pontosHistorico(sinalDoExercicio(ex, fonte(regs, [{ exercicio_id: "puxada_neutra", sessoes_sem_progresso: 3 } as EstadoExercicio])));
  ok(travado < livre, `travado pesa menos (${travado} < ${livre})`);
}

// 5) Gerador: sem histórico, igual a antes; com histórico, o exercício conhecido entra no slot.
{
  const perfil: Perfil = {
    id: "smoke", peso_kg: 80, altura_cm: 178, experiencia: "intermediario", dias_por_semana: 4, minutos_por_sessao: 60,
    cardio_min_semana: 60, equipamentos: ["barra", "halteres", "maquina", "cabo"], restricoes: [], objetivo: "hipertrofia",
    onboarding_concluido: false, parq_liberado: true, parq_respondido_em: HOJE,
    parq_respostas: [false, false, false, false, false, false, false], criado_em: HOJE,
  } as Perfil;
  const usados = (h?: Map<string, number>) =>
    new Set(gerarPlanoFromPerfil(perfil, CATALOG_EXERCICIOS, { historico: h }).sessoes.flatMap((s) => s.prescricoes.map((p) => p.exercicio_id)));
  const base = usados();
  const igual = usados(new Map());
  ok([...base].sort().join() === [...igual].sort().join(), "histórico vazio não muda o plano");
  // Leg press não entra no plano padrão (o slot prefere o agachamento livre); quem já faz leg press e
  // evolui nele recebe o leg press ao refazer. O 1º preferido de cada slot só perde com diferença real.
  const alvo = CATALOG_EXERCICIOS.find((e) => e.id === "leg_press")!;
  ok(!base.has(alvo.id), "leg press fora do plano padrão");
  const regs = historico(alvo.id, 4, 50, 2.5);
  const pts = pontosHistoricoPorExercicio(CATALOG_EXERCICIOS, fonte(regs));
  ok((pts.get(alvo.id) ?? 0) > 0, `${alvo.id} ganha pontos (${pts.get(alvo.id)})`);
  ok(usados(pts).has(alvo.id), `refazer o plano escolhe ${alvo.id}, que você já faz`);
  const dor = pontosHistoricoPorExercicio(CATALOG_EXERCICIOS, fonte(historico([...base].find((id) => CATALOG_EXERCICIOS.find((e) => e.id === id)?.padrao === "puxar_vertical")!, 2, 50, 0, true)));
  const comDor = usados(dor);
  const tirado = [...dor.keys()][0]!;
  ok(!comDor.has(tirado), `exercício com dor recente sai do plano refeito (${tirado})`);
}

if (falhas > 0) {
  console.error(`smoke:sugestao FALHOU (${falhas})`);
  process.exit(1);
}
console.log("smoke:sugestao OK");
