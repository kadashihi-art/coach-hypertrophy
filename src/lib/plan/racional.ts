/**
 * Racional determinístico do plano (fonte da verdade = motor).
 * Usado na montagem/remount e como fallback on-the-fly para planos antigos.
 */
import type { Exercicio, GrupoMuscular, Perfil, Plano, PlanoRacional, Sessao, TipoDia } from "@/lib/domain";
import { labelExp, labelObjetivo } from "@/lib/labels";
import { SPLIT_LABEL, humanizarSplits } from "./split-label";
import { MUSCULOS_POR_TIPO, microcicloTexto, posicionarDescanso } from "./estrutura";

const MAIORES: GrupoMuscular[] = ["peito", "costas", "ombros", "quadriceps", "isquiotibiais", "gluteos"];
const NOME_DIV: Record<string, string> = SPLIT_LABEL;

function faixaAlvo(g: GrupoMuscular, objetivo: string): [number, number] {
  const major = MAIORES.includes(g);
  if (objetivo === "forca" || objetivo === "saude") return major ? [8, 16] : [6, 14];
  return major ? [10, 20] : [6, 16];
}

function tipoDe(s: Sessao): TipoDia {
  const id = s.id.toLowerCase();
  for (const t of ["push", "pull", "legs", "upper", "lower"] as const) if (id.includes(t)) return t;
  return "full";
}

function alternativas(divisao: string, dias: number, minutos: number, exp?: string) {
  const out: PlanoRacional["alternativas"] = [];
  const add = (d: string, porNao: string, quando: string) => {
    if (d !== divisao) out.push({ divisao: d, nome: NOME_DIV[d] ?? d, por_que_nao: porNao, quando_faria_sentido: quando });
  };
  add("full_body",
    dias >= 4 ? `com ${dias} dias, FB repetiria todos os grupos quase todo dia — pouca recuperação local e sessões longas para bater volume` : "—",
    "2–3 dias/semana, pouco tempo, iniciante, ou rotina imprevisível");
  add("upper_lower",
    dias <= 3 ? `com ${dias} dias, UL deixa um lado (superior/inferior) só 1×/semana` : dias >= 5 ? `com ${dias} dias, UL duplicaria sessões e acumularia fadiga sem ganho de frequência` : "—",
    "4 dias/semana: 2× frequência por grupo com sessões de ~60 min");
  add("ppl",
    dias < 5 ? `com ${dias} dias, PPL deixa grupos só 1×/semana (evidência favorece ≥2× para volume moderado/alto — Schoenfeld 2016/2019)` : "—",
    `5–6 dias/semana e sessões ${minutos <= 50 ? "curtas" : "médias"}; PPL×2 com 6 dias = 2× por grupo`);
  add("ppl_upper_lower",
    dias < 5 ? `precisa de 5 treinos/semana; você tem ${dias}` : "opção equivalente; eu só uso híbrido quando você escolhe",
    "5 dias: PPL + descanso + Upper/Lower dá ~2× por grupo e um dia off estratégico");
  add("hibrido",
    "variação de FB+UL; útil para quem quer frequência 2× com mais variação",
    "3–4 dias quando você quer FB + UL na mesma semana");
  if (exp === "iniciante") out.forEach((a) => (a.por_que_nao += a.por_que_nao === "—" ? "" : "; iniciante progride bem com estruturas simples"));
  return out.filter((a) => a.por_que_nao !== "—");
}

export function derivarRacional(args: {
  plano: Plano;
  sessoes: Sessao[];
  perfil?: Perfil | null;
  catalog: Exercicio[];
  whyPorFase?: string[];
  fonte?: "motor" | "derivado";
}): PlanoRacional {
  const { plano, perfil, catalog } = args;
  const exById = new Map(catalog.map((e) => [e.id, e]));
  const fasesEst = plano.estrutura?.fases;
  const fase1Ids = new Set(fasesEst?.[0]?.sessao_ids ?? plano.sessoes);
  const sess1 = args.sessoes.filter((s) => fase1Ids.has(s.id) && s.prescricoes.length > 0);

  const vol = new Map<GrupoMuscular, number>();
  const freq = new Map<GrupoMuscular, Set<string>>();
  for (const s of sess1) {
    for (const p of s.prescricoes) {
      const ex = exById.get(p.exercicio_id);
      if (!ex) continue;
      vol.set(ex.grupo_primario, (vol.get(ex.grupo_primario) ?? 0) + p.series);
      if (!freq.has(ex.grupo_primario)) freq.set(ex.grupo_primario, new Set());
      freq.get(ex.grupo_primario)!.add(s.id);
    }
  }
  const objetivo = plano.objetivo;
  const volume_semanal = [...vol.entries()]
    .map(([grupo, series]) => {
      const f = faixaAlvo(grupo, objetivo);
      return { grupo, series_diretas: series, faixa_alvo: f, status: series < f[0] ? "abaixo (compostos e trabalho indireto completam)" : series > f[1] ? "acima (vigiar fadiga)" : "dentro" };
    })
    .sort((a, b) => b.series_diretas - a.series_diretas);
  const frequencia_por_musculo = [...freq.entries()]
    .map(([grupo, set]) => ({ grupo, vezes_semana: set.size }))
    .sort((a, b) => b.vezes_semana - a.vezes_semana);

  const dias = plano.dias_por_semana;
  const why1 = humanizarSplits(args.whyPorFase?.[0] ?? (plano.justificativa?.texto?.split(".")[0] ?? ""));
  const porque = [
    why1,
    `${dias} dias/semana, ${plano.minutos_por_sessao} min/sessão${perfil ? `, nível ${labelExp(perfil.experiencia)}` : ""}, objetivo ${labelObjetivo(objetivo)}.`,
    perfil && (perfil.cardio_min_semana ?? 0) > 120 ? `Cardio ${perfil.cardio_min_semana} min/sem: volume de força levemente reduzido.` : "",
    "Minha prioridade: cada grande grupo ≥2×/semana e 10–20 séries/semana, que é a faixa que mais rende pra hipertrofia, em sessões que cabem no seu tempo.",
  ].filter(Boolean);

  // Fases (planos antigos → 1 fase derivada)
  let fasesR: PlanoRacional["fases"];
  if (fasesEst?.length) {
    fasesR = fasesEst.map((f, i) => ({
      id: f.id,
      nome: f.nome,
      estilo: f.estilo,
      semanas: `semanas ${f.semana_inicio}–${f.semana_inicio + f.semanas - 1}`,
      porque: [humanizarSplits(args.whyPorFase?.[i] ?? "")].filter(Boolean),
      descanso: f.descanso_porque,
      microciclo: microcicloTexto(f.microciclo.map((d) => d.tipo)),
      ...(i > 0 ? { troca: `Troca para ${f.nome} na semana ${f.semana_inicio} (variação de estímulo/frequência; volume reavaliado pelo coach).` } : {}),
    }));
  } else {
    const ord = [...sess1].sort((a, b) => a.ordem - b.ordem);
    const { dias: micro, porque: dp } = posicionarDescanso(ord.map(tipoDe));
    fasesR = [{ id: "fase-1", nome: NOME_DIV[plano.divisao] ?? plano.divisao, estilo: plano.divisao, semanas: `semanas 1–${plano.mesociclo.total_semanas}`, porque: [why1].filter(Boolean), descanso: dp, microciclo: microcicloTexto(micro) }];
  }

  const recuperacao = [
    `Mesociclo de ${plano.mesociclo.total_semanas} semanas (foco ${plano.mesociclo.foco}); deload quando check-in/sono/RIR indicam fadiga (regras do coach) ou ao fim do bloco.`,
    `RIR alvo ${sess1[0]?.prescricoes[0]?.rir_alvo ?? "—"}: perto da falha sem ir à falha em compostos.`,
    ...(fasesR[0]?.descanso ?? []).slice(0, 3),
  ];

  const p0 = sess1.flatMap((s) => s.prescricoes);
  const comp = p0.find((p) => exById.get(p.exercicio_id)?.composto);
  const iso = p0.find((p) => !exById.get(p.exercicio_id)?.composto);

  return {
    versao: "1",
    fonte: args.fonte ?? "derivado",
    split: { divisao: plano.divisao, nome: fasesEst?.[0]?.nome ?? NOME_DIV[plano.divisao] ?? plano.divisao, porque },
    entradas: {
      dias_por_semana: dias,
      experiencia: perfil?.experiencia,
      objetivo,
      minutos_por_sessao: plano.minutos_por_sessao,
      cardio_min_semana: perfil?.cardio_min_semana,
      restricoes: perfil?.restricoes ?? [],
    },
    alternativas: alternativas(plano.divisao, dias, plano.minutos_por_sessao, perfil?.experiencia),
    frequencia_por_musculo,
    volume_semanal,
    parametros: {
      ...(comp ? { faixa_reps_compostos: comp.faixa_reps } : {}),
      ...(iso ? { faixa_reps_isolados: iso.faixa_reps } : {}),
      ...(p0[0] ? { rir_alvo: p0[0].rir_alvo } : {}),
    },
    recuperacao,
    fases: fasesR,
    acordos: perfil?.acordos_plano ?? [],
    gerado_em: new Date().toISOString(),
  };
}

/** Racional salvo, ou derivado on-the-fly (planos antigos). */
export function racionalDoPlano(args: { plano: Plano; sessoes: Sessao[]; perfil?: Perfil | null; catalog: Exercicio[] }): PlanoRacional {
  return args.plano.racional ?? derivarRacional({ ...args, fonte: "derivado" });
}

export { MUSCULOS_POR_TIPO };
