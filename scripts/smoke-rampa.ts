/**
 * Rampa de volume (item 4): +séries no principal de cada grupo ao longo do bloco, ajuste só do dia.
 */
import type { EstadoExercicio, Exercicio, Mesociclo, Prescricao, RegistroSerie, Sessao } from "../src/lib/domain";
import {
  aplicarRampaVolume,
  extraDaSemana,
  marcarAjusteDoDia,
  resumoRampa,
  seriesBase,
  voltarParaBase,
} from "../src/lib/engine/rampa-volume";
import { montarSessao, rascunhoDaSessao } from "../src/lib/plan/editar-treino";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  console.log(cond ? "✓" : "✗", msg);
  if (!cond) falhas++;
}

const exs: Exercicio[] = [
  { id: "supino", nome: "Supino", padrao: "empurrar_horizontal", grupo_primario: "peito", grupos_secundarios: ["triceps"], equipamento: "barra", composto: true, unilateral: false },
  { id: "crucifixo", nome: "Crucifixo", padrao: "empurrar_horizontal", grupo_primario: "peito", grupos_secundarios: [], equipamento: "cabo", composto: false, unilateral: false },
  { id: "remada", nome: "Remada", padrao: "puxar_horizontal", grupo_primario: "costas", grupos_secundarios: ["biceps"], equipamento: "cabo", composto: true, unilateral: false },
  { id: "abdominal", nome: "Abdominal", padrao: "core_antiextensao", grupo_primario: "abdomen", grupos_secundarios: [], equipamento: "peso_corporal", composto: false, unilateral: false },
] as Exercicio[];

const presc = (exercicio_id: string, ordem: number, series = 3): Prescricao =>
  ({ id: `p-${exercicio_id}`, sessao_id: "s1", exercicio_id, padrao: "empurrar_horizontal", ordem, series, faixa_reps: [8, 12], rir_alvo: 2,
    descanso_seg: 120, cadencia: "2-0-1-0", tecnica: "padrao", carga: { trabalho_kg: 60, top_set_kg: null, origem: "historico" },
    alternativa_equipamento_ocupado: null, guia_id: null, evidencia: "moderado" }) as Prescricao;
const treino = (): Prescricao[] => [presc("supino", 1), presc("crucifixo", 2), presc("remada", 3), presc("abdominal", 4, 2)];
const sessao = (ps: Prescricao[], id = "s1"): Sessao => ({ id, prescricoes: ps.map((p) => ({ ...p, sessao_id: id })) }) as unknown as Sessao;
const semana = (n = 2) => Array.from({ length: n }, (_, i) => sessao(treino(), `s${i + 1}`));
const meso = (sem: number): Mesociclo => ({ semana_atual: sem, total_semanas: 6, foco: "acumulo", data_inicio: "2026-09-07" });

function rodar(sem: number, over: Partial<Parameters<typeof aplicarRampaVolume>[0]> = {}) {
  return aplicarRampaVolume({
    prescricoes: treino(), exercicios: exs, estados: [], mesociclo: meso(sem), experiencia: "intermediario",
    checkin: null, sessoesDaSemana: semana(), registros: [], hojeIso: "2026-10-01", ...over,
  });
}
const series = (r: ReturnType<typeof rodar>, id: string) => r.prescricoes.find((p) => p.exercicio_id === id)!.series;

// 1) Extra por semana.
ok([1, 2, 3, 4, 5, 6, 7].map((s) => extraDaSemana(meso(s))).join(",") === "0,0,1,1,2,0,0", "extras: 0,0,1,1,2 e 0 no deload e depois do bloco");
ok(extraDaSemana(meso(5), "iniciante") === 1, "iniciante sobe no máximo +1");

// 2) Só o principal de cada grupo ganha; opcionais (abdômen) ficam fora.
{
  const r = rodar(3);
  ok(series(r, "supino") === 4 && series(r, "crucifixo") === 3, "semana 3: supino (principal de peito) 3→4, crucifixo fica");
  ok(series(r, "remada") === 4, "semana 3: remada (principal de costas) 3→4");
  ok(series(r, "abdominal") === 2, "abdômen (opcional) não entra na rampa");
  ok(resumoRampa(r, exs) === "Semana de subir volume: +1 série em Supino, +1 série em Remada.", `resumo: ${resumoRampa(r, exs)}`);
  ok(series(rodar(5), "supino") === 5, "semana 5: +2 (3→5)");
  ok(series(rodar(1), "supino") === 3 && series(rodar(6), "supino") === 3, "semana 1 e deload ficam na base");
}

// 3) Travas.
{
  ok(series(rodar(5, { checkin: { sono_h: 5, prontidao: 3 } }), "supino") === 3, "sono < 6 h: sem rampa");
  const travado = { exercicio_id: "supino", sessoes_sem_progresso: 2, rir_alvo: 2, ultimo_rir: 2 } as EstadoExercicio;
  const r = rodar(5, { estados: [travado] });
  ok(series(r, "supino") === 3 && r.travas.some((t) => t.motivo.includes("travado")), "exercício travado não ganha volume");
  const limite = { exercicio_id: "supino", sessoes_sem_progresso: 0, rir_alvo: 2, ultimo_rir: 0 } as EstadoExercicio;
  ok(series(rodar(5, { estados: [limite] }), "supino") === 3, "última sessão no limite (RIR 0 com alvo 2): sem rampa");
  const dor = [{ exercicio_id: "supino", dor: true, executado_em: "2026-09-25T10:00:00.000Z" }] as RegistroSerie[];
  ok(series(rodar(5, { registros: dor }), "supino") === 3, "dor nos últimos 14 dias: sem rampa");
  const dorVelha = [{ exercicio_id: "supino", dor: true, executado_em: "2026-08-01T10:00:00.000Z" }] as RegistroSerie[];
  ok(series(rodar(5, { registros: dorVelha }), "supino") === 5, "dor antiga não trava");
  // Teto semanal: peito base 12 (2 treinos × 6) — com teto 20, cabe +4/semana → +2 por treino ok.
  // 4 treinos na semana: base 24 > 20 → sem espaço.
  const cheio = rodar(5, { sessoesDaSemana: semana(4) });
  ok(series(cheio, "supino") === 3 && cheio.travas.some((t) => t.motivo.includes("teto")), "volume da semana no teto: sem rampa");
  ok(series(rodar(5, { prescricoes: [presc("supino", 1, 5)] }), "supino") === 5, "exercício já com 5 séries não passa disso");
}

// 4) Ajuste do dia não acumula de uma semana pra outra.
{
  const r = rodar(5);
  const dia = marcarAjusteDoDia(treino(), r.prescricoes);
  const sup = dia.find((p) => p.exercicio_id === "supino")!;
  ok(sup.series === 5 && sup.ajuste_series_dia === 2 && seriesBase(sup) === 3, "dia guarda +2 como ajuste, base continua 3");
  ok(!("ajuste_series_dia" in dia.find((p) => p.exercicio_id === "crucifixo")!), "sem ajuste, o campo não aparece");
  const proxima = voltarParaBase(dia);
  ok(proxima.find((p) => p.exercicio_id === "supino")!.series === 3, "próximo início volta pra base (não vira 5 + rampa)");
  // Editor mostra a base e salvar sem mudar nada mantém tudo.
  const sess = sessao(dia);
  const rasc = rascunhoDaSessao(sess);
  ok(rasc.itens[0]!.series === 3, "editar treino mostra a base (3), não o ajuste do dia");
  const state = { exercicios: exs, estados: [], sessoes: [sess], registros: [], plano: null, perfil: null } as never;
  const salvo = montarSessao(state, sess, rasc).sessao.prescricoes.find((p) => p.exercicio_id === "supino")!;
  ok(salvo.series === 5 && salvo.ajuste_series_dia === 2, "salvar sem mudar nada não transforma o ajuste em base");
  const mudou = montarSessao(state, sess, { ...rasc, itens: rasc.itens.map((it, i) => (i === 0 ? { ...it, series: 4 } : it)) }).sessao.prescricoes.find((p) => p.exercicio_id === "supino")!;
  ok(mudou.series === 4 && mudou.ajuste_series_dia === undefined, "mudar as séries no editor define a nova base");
}

if (falhas > 0) {
  console.error(`smoke:rampa FALHOU (${falhas})`);
  process.exit(1);
}
console.log("smoke:rampa OK");
