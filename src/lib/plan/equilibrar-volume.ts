/**
 * Equilíbrio de volume do plano gerado (determinístico, só no gerador).
 *
 * Regras (docs/series-validas.md):
 * - Conta séries que valem: diretas + 0,5 × indiretas (Pelland et al., fracionado), por semana.
 * - Teto semanal por grupo: faixaVolume(g).max (20 nos grupos principais).
 * - Teto por sessão: 10 séries diretas do mesmo músculo (acima disso o retorno cai muito).
 * - Piso semanal nos grupos principais, por nível: iniciante 10, intermediário 12, avançado 14.
 *   Músculo prioritário: +4 (até 20). Força/saúde: 10.
 * - Só sobe séries se a sessão continua cabendo no tempo do perfil (+10%).
 *   Para um músculo prioritário sem tempo sobrando, tira 1 série de um grupo não prioritário
 *   que continua acima do piso e dá pro prioritário.
 * - Nunca deixa um exercício com menos de 2 séries nem mais que o teto por nível (4, ou 5 no avançado).
 * Não decide kg, reps nem RIR: só a contagem de séries por exercício.
 */
import { GRUPO_LABEL } from "@/lib/labels";
import { faixaVolume, VOLUME_MAX, VOLUME_MIN, type Exercicio, type GrupoMuscular, type Perfil, type Prescricao, type TipoDia } from "@/lib/domain";

/** Grupos que o gerador garante na faixa (os opcionais e o trapézio ficam de fora). */
export const GRUPOS_PRINCIPAIS: GrupoMuscular[] = [
  "peito",
  "costas",
  "ombros",
  "quadriceps",
  "isquiotibiais",
  "gluteos",
  "biceps",
  "triceps",
  "panturrilhas",
];

/** Séries diretas do mesmo músculo numa sessão, no máximo. */
export const MAX_SERIES_SESSAO_GRUPO = 10;
/** Bônus de séries semanais para músculo prioritário. */
export const BONUS_PRIORIDADE = 4;

export function maxSeriesExercicio(experiencia: Perfil["experiencia"]): number {
  return experiencia === "avancado" ? 5 : 4;
}

/** Faixa semanal (séries efetivas) que o gerador busca para o grupo. */
export function alvoSemanalGrupo(
  grupo: GrupoMuscular,
  perfil: Pick<Perfil, "experiencia" | "objetivo"> & { prioridades_musculares?: GrupoMuscular[] },
): { min: number; max: number } {
  const faixa = faixaVolume(grupo);
  const max = Math.min(faixa.max, VOLUME_MAX);
  if (!GRUPOS_PRINCIPAIS.includes(grupo)) return { min: 0, max };
  const hiper = perfil.objetivo === "hipertrofia" || perfil.objetivo === "recomposicao";
  const base = !hiper
    ? VOLUME_MIN
    : perfil.experiencia === "avancado"
      ? 14
      : perfil.experiencia === "intermediario"
        ? 12
        : VOLUME_MIN;
  const prioritario = (perfil.prioridades_musculares ?? []).includes(grupo);
  return { min: Math.min(max, base + (prioritario ? BONUS_PRIORIDADE : 0)), max };
}

export type SessaoParaEquilibrar = {
  id: string;
  tipo: TipoDia;
  prescricoes: Prescricao[];
};

export type VolumeGrupo = { diretas: number; indiretas: number; efetivo: number };

export function volumeSemanalDasSessoes(
  sessoes: Pick<SessaoParaEquilibrar, "prescricoes">[],
  catalog: Pick<Exercicio, "id" | "grupo_primario" | "grupos_secundarios">[],
): Map<GrupoMuscular, VolumeGrupo> {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const out = new Map<GrupoMuscular, VolumeGrupo>();
  const get = (g: GrupoMuscular) => {
    let v = out.get(g);
    if (!v) out.set(g, (v = { diretas: 0, indiretas: 0, efetivo: 0 }));
    return v;
  };
  for (const s of sessoes) {
    for (const p of s.prescricoes) {
      const ex = byId.get(p.exercicio_id);
      if (!ex) continue;
      get(ex.grupo_primario).diretas += p.series;
      for (const g of ex.grupos_secundarios ?? []) get(g).indiretas += p.series;
    }
  }
  for (const v of out.values()) v.efetivo = v.diretas + 0.5 * v.indiretas;
  return out;
}

/** Grupos que cada tipo de dia pode receber num exercício novo. */
const GRUPOS_DO_DIA: Record<TipoDia, GrupoMuscular[]> = {
  full: GRUPOS_PRINCIPAIS,
  upper: ["peito", "costas", "ombros", "biceps", "triceps"],
  lower: ["quadriceps", "isquiotibiais", "gluteos", "panturrilhas"],
  push: ["peito", "ombros", "triceps"],
  pull: ["costas", "biceps"],
  legs: ["quadriceps", "isquiotibiais", "gluteos", "panturrilhas"],
  descanso: [],
};

export type EquilibrarCtx = {
  catalog: Exercicio[];
  perfil: Pick<Perfil, "experiencia" | "objetivo" | "minutos_por_sessao"> & { prioridades_musculares?: GrupoMuscular[] };
  /** Minutos estimados da sessão (mesma conta do gerador). */
  duracao: (prescricoes: Prescricao[]) => number;
  /** Cria uma prescrição nova para o grupo na sessão (null se não houver exercício compatível). */
  criarPrescricao?: (grupo: GrupoMuscular, sessao: SessaoParaEquilibrar, series: number) => Prescricao | null;
};

export type ResultadoEquilibrio = {
  /** Frases curtas pro racional (ex.: tempo não deu pra chegar no piso). */
  notas: string[];
  ajustes: number;
};

/**
 * Ajusta `prescricoes[].series` (e pode acrescentar exercícios) IN PLACE nas sessões de UMA fase
 * (cada sessão = 1 vez por semana). Retorna notas e quantos ajustes fez.
 */
export function equilibrarVolume(sessoes: SessaoParaEquilibrar[], ctx: EquilibrarCtx): ResultadoEquilibrio {
  const byId = new Map(ctx.catalog.map((e) => [e.id, e]));
  const prim = (p: Prescricao) => byId.get(p.exercicio_id)?.grupo_primario;
  const sec = (p: Prescricao) => byId.get(p.exercicio_id)?.grupos_secundarios ?? [];
  const isoladorPrimeiro = (a: Prescricao, b: Prescricao) =>
    Number(!!byId.get(a.exercicio_id)?.composto) - Number(!!byId.get(b.exercicio_id)?.composto);
  const maxEx = maxSeriesExercicio(ctx.perfil.experiencia);
  const limiteMin = Math.round(ctx.perfil.minutos_por_sessao * 1.1);
  const prioridades = ctx.perfil.prioridades_musculares ?? [];
  const alvo = (g: GrupoMuscular) => alvoSemanalGrupo(g, ctx.perfil);
  const vol = () => volumeSemanalDasSessoes(sessoes, ctx.catalog);
  const diretasNaSessao = (s: SessaoParaEquilibrar, g: GrupoMuscular) =>
    s.prescricoes.filter((p) => prim(p) === g).reduce((a, p) => a + p.series, 0);
  const notas: string[] = [];
  let ajustes = 0;

  // 1) Teto por sessão: no máximo 10 séries diretas do mesmo músculo.
  for (const s of sessoes) {
    for (const g of new Set(s.prescricoes.map(prim).filter(Boolean) as GrupoMuscular[])) {
      let guard = 50;
      while (diretasNaSessao(s, g) > MAX_SERIES_SESSAO_GRUPO && guard-- > 0) {
        const c = s.prescricoes
          .filter((p) => prim(p) === g && p.series > 2)
          .sort((a, b) => b.series - a.series || isoladorPrimeiro(a, b) || b.ordem - a.ordem)[0];
        if (!c) break;
        c.series -= 1;
        ajustes++;
      }
    }
  }

  // 2) Teto semanal: tira do exercício com mais séries daquele músculo (isolador e sessão mais cheia primeiro).
  {
    let guard = 200;
    for (;;) {
      if (guard-- <= 0) break;
      const v = vol();
      const acima = [...v.entries()].filter(([g, x]) => x.efetivo > alvo(g).max + 1e-9).sort((a, b) => b[1].efetivo - a[1].efetivo)[0];
      if (!acima) break;
      const [g] = acima;
      const cands = sessoes
        .flatMap((s) => s.prescricoes.filter((p) => prim(p) === g && p.series > 2).map((p) => ({ s, p })))
        .sort((a, b) => diretasNaSessao(b.s, g) - diretasNaSessao(a.s, g) || b.p.series - a.p.series || isoladorPrimeiro(a.p, b.p));
      // Sem direta pra cortar (excesso só de indiretas): corta um composto que o atinge como secundário.
      const alt = cands.length
        ? null
        : sessoes
            .flatMap((s) => s.prescricoes.filter((p) => sec(p).includes(g) && p.series > 2).map((p) => ({ s, p })))
            .sort((a, b) => b.p.series - a.p.series)[0];
      const c = cands[0] ?? alt;
      if (!c) break;
      c.p.series -= 1;
      ajustes++;
    }
  }

  // 3) Piso semanal: sobe séries onde cabe (tempo, teto por sessão, teto semanal dos músculos envolvidos).
  const cabeMaisUma = (s: SessaoParaEquilibrar, p: Prescricao, v: Map<GrupoMuscular, VolumeGrupo>): boolean => {
    const g = prim(p);
    if (!g || p.series >= maxEx) return false;
    if (diretasNaSessao(s, g) + 1 > MAX_SERIES_SESSAO_GRUPO) return false;
    if ((v.get(g)?.efetivo ?? 0) + 1 > alvo(g).max + 1e-9) return false;
    for (const x of sec(p)) if ((v.get(x)?.efetivo ?? 0) + 0.5 > alvo(x).max + 1e-9) return false;
    p.series += 1;
    const ok = ctx.duracao(s.prescricoes) <= limiteMin;
    p.series -= 1;
    return ok;
  };
  /** Libera tempo numa sessão tirando 1 série de um grupo NÃO prioritário que segue acima do piso. */
  const liberarTempo = (s: SessaoParaEquilibrar, protegido: GrupoMuscular): boolean => {
    const v = vol();
    const c = s.prescricoes
      .filter((p) => {
        const g = prim(p);
        if (!g || g === protegido || prioridades.includes(g) || p.series <= 2) return false;
        return (v.get(g)?.efetivo ?? 0) - 1 >= alvo(g).min - 1e-9;
      })
      .sort((a, b) => b.series - a.series || isoladorPrimeiro(a, b))[0];
    if (!c) return false;
    c.series -= 1;
    ajustes++;
    return true;
  };

  /** Tenta +1 série num exercício do grupo (a) ou um exercício novo de 2–3 séries (b). */
  const tentarSubir = (g: GrupoMuscular): boolean => {
    const v = vol();
    const atual = v.get(g)?.efetivo ?? 0;
    // a) +1 série num exercício que já treina o grupo (o que tem menos séries primeiro: espalha).
    const cand = sessoes
      .flatMap((s) => s.prescricoes.filter((p) => prim(p) === g).map((p) => ({ s, p })))
      .filter(({ s, p }) => cabeMaisUma(s, p, v))
      .sort((a, b) => a.p.series - b.p.series || diretasNaSessao(a.s, g) - diretasNaSessao(b.s, g))[0];
    if (cand) {
      cand.p.series += 1;
      ajustes++;
      return true;
    }
    // b) exercício novo num dia compatível que ainda tenha tempo (3 séries, senão 2).
    if (!ctx.criarPrescricao || atual + 2 > alvo(g).max + 1e-9) return false;
    const falta = Math.ceil(alvo(g).min - atual);
    const tamanhos = [...new Set([Math.max(2, Math.min(3, falta)), 2])];
    const dias = sessoes
      .filter((s) => GRUPOS_DO_DIA[s.tipo]?.includes(g))
      .sort((a, b) => diretasNaSessao(a, g) - diretasNaSessao(b, g) || ctx.duracao(a.prescricoes) - ctx.duracao(b.prescricoes));
    for (const series of tamanhos) {
      for (const s of dias) {
        if (diretasNaSessao(s, g) + series > MAX_SERIES_SESSAO_GRUPO) continue;
        const p = ctx.criarPrescricao(g, s, series);
        if (!p || prim(p) !== g || s.prescricoes.some((x) => x.exercicio_id === p.exercicio_id)) continue;
        if (sec(p).some((x) => (v.get(x)?.efetivo ?? 0) + 0.5 * series > alvo(x).max + 1e-9)) continue;
        if (ctx.duracao([...s.prescricoes, p]) > limiteMin) continue;
        p.ordem = s.prescricoes.length + 1;
        s.prescricoes.push(p);
        ajustes++;
        return true;
      }
    }
    return false;
  };

  const ordem = [...prioridades.filter((g) => GRUPOS_PRINCIPAIS.includes(g)), ...GRUPOS_PRINCIPAIS.filter((g) => !prioridades.includes(g))];
  const semTempo: GrupoMuscular[] = [];
  for (const g of ordem) {
    let guard = 40;
    while (guard-- > 0) {
      if ((vol().get(g)?.efetivo ?? 0) >= alvo(g).min - 1e-9) break;
      if (tentarSubir(g)) continue;
      // c) prioritário sem tempo: tira 1 série de um grupo não prioritário (que segue no piso) numa sessão
      //    compatível e tenta de novo. Se ainda não couber, desfaz.
      let trocou = false;
      if (prioridades.includes(g)) {
        for (const s of sessoes.filter((x) => GRUPOS_DO_DIA[x.tipo]?.includes(g))) {
          const antes = s.prescricoes.map((p) => p.series);
          const n = s.prescricoes.length;
          const aj = ajustes;
          if (liberarTempo(s, g) && tentarSubir(g)) {
            trocou = true;
            break;
          }
          s.prescricoes.splice(n);
          s.prescricoes.forEach((p, i) => (p.series = antes[i]));
          ajustes = aj;
        }
      }
      if (trocou) continue;
      semTempo.push(g);
      break;
    }
  }
  // A causa certa: músculo que só aparece em 1 treino da semana esbarra no teto por sessão, não no tempo.
  const lista = (gs: GrupoMuscular[]) => gs.map((g) => (GRUPO_LABEL[g] ?? g).toLowerCase()).join(", ");
  const verbo = (gs: GrupoMuscular[]) => (gs.length > 1 ? "ficaram" : "ficou");
  const umaVez = semTempo.filter((g) => sessoes.filter((s) => GRUPOS_DO_DIA[s.tipo]?.includes(g)).length <= 1);
  const tempo = semTempo.filter((g) => !umaVez.includes(g));
  if (umaVez.length) {
    notas.push(
      `Nessa divisão, ${lista(umaVez)} ${umaVez.length > 1 ? "treinam" : "treina"} só 1×/semana e ${verbo(umaVez)} abaixo do ideal (no máximo ${MAX_SERIES_SESSAO_GRUPO} séries por treino rendem). Mais um dia de treino resolve.`,
    );
  }
  if (tempo.length) {
    notas.push(
      `Com ${ctx.perfil.minutos_por_sessao} min por treino, ${lista(tempo)} ${verbo(tempo)} abaixo do ideal da semana. Mais tempo por sessão ou mais um dia resolve.`,
    );
  }
  return { notas, ajustes };
}

/**
 * Ordem com prioridade: compostos do músculo prioritário primeiro (mais fresco), depois os demais
 * compostos, depois isoladores do prioritário e o resto. Estável. Sem prioridades, não mexe.
 */
export function ordenarPorPrioridade(
  prescricoes: Prescricao[],
  catalog: Pick<Exercicio, "id" | "grupo_primario" | "composto">[],
  prioridades: GrupoMuscular[] | undefined,
): Prescricao[] {
  if (!prioridades?.length) return prescricoes;
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const chave = (p: Prescricao) => {
    const ex = byId.get(p.exercicio_id);
    const pri = !!ex && prioridades.includes(ex.grupo_primario);
    if (ex?.composto) return pri ? 0 : 1;
    return pri ? 2 : 3;
  };
  return prescricoes
    .map((p, i) => ({ p, i, k: chave(p) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map(({ p }, i) => ({ ...p, ordem: i + 1 }));
}
