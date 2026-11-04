/**
 * Reavaliação de nível (lote 7). Código determinístico, puro, sem LLM.
 * Lê o histórico e diz se o nível declarado (iniciante/intermediário/avançado)
 * ainda combina com o treino real. Nunca grava nada: a UI só muda o plano
 * depois que o usuário confirma. Critérios e fontes: docs/reavaliacao-nivel.md.
 */
import type { AppState, Experiencia, Exercicio, Perfil, Sessao } from "@/lib/domain";
import { desdeInicio, inicioDeUso } from "@/lib/inicio";
import { e1rmEpley } from "@/lib/engine/e1rm";
import { ehSeriePreparatoria } from "@/lib/domain/enums";

export const NIVEIS: Experiencia[] = ["iniciante", "intermediario", "avancado"];
const NOME: Record<Experiencia, string> = { iniciante: "iniciante", intermediario: "intermediário", avancado: "avançado" };

/** Mínimo de dados antes de opinar. */
export const MIN_SESSOES = 6;
export const MIN_DIAS = 21;
/** Janela de leitura (consistência, força, RIR). Progressão usa até 8 semanas. */
export const JANELA_DIAS = 28;
export const JANELA_PROGRESSAO_DIAS = 56;
/** Margem (histerese): a estimativa precisa passar o nível declarado por ≥ 0,75 nível. */
export const MARGEM = 0.75;
/** "Agora não" silencia por 4 semanas; depois de mudar, espera 4 semanas. */
export const SILENCIO_DIAS = 28;
export const ESPERA_APOS_MUDAR_DIAS = 28;
/** Subir de nível exige adesão mínima. */
export const ADESAO_MIN_SUBIR = 0.75;

const PESOS = { forca: 0.3, progressao: 0.3, adesao: 0.15, rir: 0.15, tempo: 0.1 } as const;
export type Fator = keyof typeof PESOS;

/**
 * Força relativa (e1RM ÷ peso do corpo) que marca o início de intermediário e de avançado.
 * Homens; mulheres usam 0,7×. Baseado em tabelas de padrões de força (Rippetoe & Kilgore;
 * ExRx; Symmetric Strength) — ver docs. Stiff/RDL usa 0,8× do levantamento terra.
 */
const PADROES_FORCA: Array<{ chave: "supino" | "agachamento" | "terra"; nome: string; padrao: string; inter: number; avanc: number }> = [
  { chave: "supino", nome: "supino", padrao: "empurrar_horizontal", inter: 1.0, avanc: 1.5 },
  { chave: "agachamento", nome: "agachamento", padrao: "agachamento", inter: 1.25, avanc: 2.0 },
  { chave: "terra", nome: "stiff", padrao: "dobradica_quadril", inter: 1.5 * 0.8, avanc: 2.25 * 0.8 },
];
/** Só barra livre conta (máquina e leg press não têm referência confiável). Hip thrust fora. */
function ehBasicoBarra(ex: Exercicio | undefined, padrao: string): boolean {
  if (!ex || ex.equipamento !== "barra" || ex.padrao !== padrao || ex.unilateral) return false;
  const id = ex.base_id ?? ex.id;
  if (/hip_thrust|ponte|good|bom_dia/.test(id)) return false;
  return true;
}

export type FatorAvaliado = {
  fator: Fator;
  /** Nível que esse fator sugere, em 0 (iniciante) … 2 (avançado). */
  nivel: number;
  peso: number;
  motivo: string;
};

export type Avaliacao = {
  pronto: boolean;
  /** Motivo de não opinar (texto interno p/ testes, não vai pra tela). */
  bloqueio?: "poucos_dados" | "silenciado" | "mudou_recente" | "sem_fatores" | "sem_perfil";
  declarado: Experiencia | null;
  estimativa: number | null;
  fatores: FatorAvaliado[];
  adesao: number | null;
  sessoes_janela: number;
  sugestao: Sugestao | null;
};

export type Sugestao = {
  direcao: "subir" | "descer";
  de: Experiencia;
  para: Experiencia;
  titulo: string;
  frase: string;
  motivos: string[];
};

const DIA = 86_400_000;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const pct = (x: number) => `${String(Math.round(x * 1000) / 10).replace(".", ",")}%`;
const vezes = (x: number) => `${String(Math.round(x * 10) / 10).replace(".", ",")}×`;

function dataSessao(s: Sessao): number | null {
  const iso = s.finalizada_em ?? s.data ?? s.iniciada_em;
  if (!iso) return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso);
  return Number.isFinite(t) ? t : null;
}

/** Interpolação contínua: abaixo de `inter` → 0..1; entre → 1..2; acima → até 2,5. */
function nivelPorRazao(r: number, inter: number, avanc: number): number {
  if (r < inter) return clamp(r / inter, 0, 1);
  if (r < avanc) return 1 + (r - inter) / (avanc - inter);
  return clamp(2 + (r - avanc) / avanc, 2, 2.5);
}

export function avaliarNivel(state: Pick<AppState, "perfil" | "sessoes" | "registros" | "exercicios" | "plano">, agoraMs = Date.now()): Avaliacao {
  const perfil: Perfil | null = state.perfil;
  const vazio = (bloqueio: Avaliacao["bloqueio"], extra: Partial<Avaliacao> = {}): Avaliacao => ({
    pronto: false, bloqueio, declarado: perfil?.experiencia ?? null, estimativa: null, fatores: [], adesao: null, sessoes_janela: 0, sugestao: null, ...extra,
  });
  if (!perfil || !perfil.onboarding_concluido) return vazio("sem_perfil");
  const declarado = perfil.experiencia;
  const D = NIVEIS.indexOf(declarado);

  // Conta só a partir do primeiro treino ou check-in registrado.
  const inicioUso = inicioDeUso(state);
  const concluidas = state.sessoes
    .filter((s) => s.status === "concluida" || s.status === "parcial")
    .map((s) => ({ s, t: dataSessao(s) }))
    .filter((x): x is { s: Sessao; t: number } => x.t != null && x.t <= agoraMs + DIA)
    .filter((x) => desdeInicio(x.s.data ?? x.s.iniciada_em ?? x.s.finalizada_em, inicioUso))
    .sort((a, b) => a.t - b.t);
  const desdeMudanca = perfil.nivel_mudado_em ? Date.parse(perfil.nivel_mudado_em) : null;
  if (desdeMudanca && agoraMs - desdeMudanca < ESPERA_APOS_MUDAR_DIAS * DIA) return vazio("mudou_recente");
  const base = desdeMudanca ? concluidas.filter((x) => x.t >= desdeMudanca) : concluidas;
  const span = base.length ? (agoraMs - base[0].t) / DIA : 0;
  if (base.length < MIN_SESSOES || span < MIN_DIAS) return vazio("poucos_dados", { sessoes_janela: base.length });
  if (perfil.nivel_silenciado_ate && Date.parse(perfil.nivel_silenciado_ate) > agoraMs) return vazio("silenciado");

  const iniJanela = agoraMs - JANELA_DIAS * DIA;
  const naJanela = base.filter((x) => x.t >= iniJanela);
  const sessIds = new Set(base.map((x) => x.s.id));
  const tSess = new Map(base.map((x) => [x.s.id, x.t]));
  const exPorId = new Map(state.exercicios.map((e) => [e.id, e]));
  const regs = state.registros.filter((r) => sessIds.has(r.sessao_id) && !ehSeriePreparatoria(r.tipo_serie) && r.reps > 0 && r.carga_kg >= 0);
  const fatores: FatorAvaliado[] = [];

  // 1) Força relativa nos básicos de barra (melhor e1RM da janela ÷ peso).
  const peso = perfil.peso_kg;
  const fatorSexo = perfil.sexo === "feminino" ? 0.7 : 1;
  const forcas: Array<{ nome: string; r: number; n: number }> = [];
  for (const p of PADROES_FORCA) {
    let best = 0;
    for (const r of regs) {
      if ((tSess.get(r.sessao_id) ?? 0) < iniJanela) continue;
      if (!ehBasicoBarra(exPorId.get(r.exercicio_id), p.padrao)) continue;
      if (r.reps > 12) continue; // Epley perde precisão acima de ~12 reps
      best = Math.max(best, e1rmEpley(r.carga_kg, r.reps));
    }
    if (best > 0 && peso > 0) {
      const r = best / peso;
      forcas.push({ nome: p.nome, r, n: nivelPorRazao(r, p.inter * fatorSexo, p.avanc * fatorSexo) });
    }
  }
  if (forcas.length) {
    const n = forcas.reduce((a, f) => a + f.n, 0) / forcas.length;
    const top = [...forcas].sort((a, b) => (n >= D ? b.n - a.n : a.n - b.n))[0];
    const faixa = top.n >= 2 ? "faixa típica de quem já treina há anos" : top.n >= 1 ? "faixa típica de intermediário" : "faixa típica de quem está começando";
    fatores.push({ fator: "forca", nivel: n, peso: PESOS.forca, motivo: `Seu ${top.nome} estimado está em ${vezes(top.r)} o seu peso do corpo, ${faixa}.` });
  }

  // 2) Ritmo de progressão: inclinação semanal do melhor e1RM por sessão nos compostos.
  const iniProg = agoraMs - JANELA_PROGRESSAO_DIAS * DIA;
  const porEx = new Map<string, Map<string, { t: number; e: number }>>();
  for (const r of regs) {
    const ex = exPorId.get(r.exercicio_id);
    const t = tSess.get(r.sessao_id) ?? 0;
    if (!ex?.composto || t < iniProg || r.tecnica) continue;
    const m = porEx.get(r.exercicio_id) ?? new Map();
    const e = e1rmEpley(r.carga_kg, r.reps);
    const cur = m.get(r.sessao_id);
    if (!cur || e > cur.e) m.set(r.sessao_id, { t, e });
    porEx.set(r.exercicio_id, m);
  }
  const taxas: number[] = [];
  for (const m of porEx.values()) {
    const pts = [...m.values()].sort((a, b) => a.t - b.t);
    if (pts.length < 3 || (pts[pts.length - 1].t - pts[0].t) / DIA < 14) continue;
    // Ignora a 1ª sessão (calibração de carga inicial).
    const xs = pts.slice(1);
    if (xs.length < 2) continue;
    const mx = xs.reduce((a, p) => a + p.t, 0) / xs.length;
    const my = xs.reduce((a, p) => a + p.e, 0) / xs.length;
    let num = 0, den = 0;
    for (const p of xs) { num += (p.t - mx) * (p.e - my); den += (p.t - mx) ** 2; }
    if (den <= 0 || my <= 0) continue;
    taxas.push(((num / den) * 7 * DIA) / my);
  }
  if (taxas.length >= 2) {
    const ord = [...taxas].sort((a, b) => a - b);
    const med = ord[Math.floor(ord.length / 2)];
    // ≥2%/sem → iniciante (0); ~1%/sem → intermediário (1); ≤0,25%/sem → avançado (2).
    // Progressão lenta só aponta para "avançado" se a força também for alta; senão é estagnação.
    let n = med >= 0.02 ? 0 : med >= 0.01 ? 1 - (med - 0.01) / 0.01 : med >= 0.0025 ? 1 + (0.01 - med) / 0.0075 : 2;
    const forcaN = fatores.find((f) => f.fator === "forca")?.nivel;
    if (n > 1 && (forcaN == null || forcaN < 1.5)) n = Math.min(n, Math.max(1, forcaN ?? 1));
    const txt = med >= 0.015
      ? `Suas cargas nos exercícios principais sobem cerca de ${pct(med)} por semana, ritmo de quem está no começo.`
      : med >= 0.005
        ? `Suas cargas nos exercícios principais sobem uns ${pct(med)} por semana, ritmo de intermediário.`
        : `Suas cargas nos exercícios principais quase não mudaram nas últimas semanas.`;
    fatores.push({ fator: "progressao", nivel: n, peso: PESOS.progressao, motivo: txt });
  }

  // 3) Consistência: sessões feitas na janela ÷ esperadas pelo plano.
  const diasSemana = state.plano?.dias_por_semana ?? perfil.dias_por_semana;
  const semanasJanela = Math.min(JANELA_DIAS, span) / 7;
  const esperadas = Math.max(1, Math.round(diasSemana * semanasJanela));
  const adesao = clamp(naJanela.length / esperadas, 0, 1);
  {
    const n = adesao >= 0.85 ? 2 : adesao >= 0.6 ? 1 + (adesao - 0.6) / 0.25 : clamp(adesao / 0.6, 0, 1);
    const txt = adesao >= 0.75
      ? `Você fez ${naJanela.length} de ${esperadas} treinos planejados nas últimas semanas.`
      : `Você fez ${naJanela.length} de ${esperadas} treinos planejados nas últimas semanas, e a regularidade pesa mais que a carga.`;
    fatores.push({ fator: "adesao", nivel: n, peso: PESOS.adesao, motivo: txt });
  }

  // 4) Precisão e uso do RIR: séries de trabalho com RIR perto do alvo e coerente com as reps.
  const prescPorId = new Map(state.sessoes.flatMap((s) => s.prescricoes).map((p) => [p.id, p]));
  const trabalho = regs.filter((r) => (tSess.get(r.sessao_id) ?? 0) >= iniJanela && (r.tipo_serie === "trabalho" || r.tipo_serie === "top_set" || r.tipo_serie === "back_off"));
  if (trabalho.length >= 12) {
    let ok = 0;
    const valores = new Set<number>();
    for (const r of trabalho) {
      valores.add(r.rir_percebido);
      const p = prescPorId.get(r.prescricao_id);
      if (!p) continue;
      const perto = Math.abs(r.rir_percebido - p.rir_alvo) <= 1;
      // Coerência: RIR alto com reps acima da faixa = marcou longe da realidade.
      const coerente = !(r.rir_percebido >= 3 && r.reps > p.faixa_reps[1]) && !(r.rir_percebido <= 0 && r.reps > p.faixa_reps[1] + 2);
      if (perto && coerente) ok++;
    }
    const prec = ok / trabalho.length;
    const uso = valores.size >= 2 ? 1 : 0.5; // sempre o mesmo número = provavelmente não está avaliando
    const s = prec * uso;
    const n = clamp((s - 0.3) / 0.35, 0, 2);
    const txt = s >= 0.6
      ? "As reps que você deixa na reserva batem com o que o plano pede, sinal de que você já se conhece no treino."
      : "As reps na reserva que você marca ficam longe do combinado em boa parte das séries.";
    fatores.push({ fator: "rir", nivel: n, peso: PESOS.rir, motivo: txt });
  }

  // 5) Tempo de treino declarado (opcional).
  if (typeof perfil.tempo_treino_meses === "number") {
    const m = perfil.tempo_treino_meses;
    const n = m < 12 ? m / 12 : m < 36 ? 1 + (m - 12) / 24 : 2;
    const anos = m >= 12 ? `${String(Math.round((m / 12) * 10) / 10).replace(".", ",")} ${m >= 24 ? "anos" : "ano"}` : `${m} ${m === 1 ? "mês" : "meses"}`;
    fatores.push({ fator: "tempo", nivel: n, peso: PESOS.tempo, motivo: `Você contou que treina há ${anos}.` });
  }

  const temNucleo = fatores.some((f) => f.fator === "forca" || f.fator === "progressao");
  if (!temNucleo || fatores.length < 3) return { ...vazio("sem_fatores"), fatores, adesao, sessoes_janela: base.length };

  const somaP = fatores.reduce((a, f) => a + f.peso, 0);
  const E = fatores.reduce((a, f) => a + f.nivel * f.peso, 0) / somaP;

  let sugestao: Sugestao | null = null;
  const acima = fatores.filter((f) => f.nivel >= D + 0.5);
  const abaixo = fatores.filter((f) => f.nivel <= D - 0.5);
  const forcaSo = (lst: FatorAvaliado[]) => lst.every((f) => f.fator === "forca");
  if (D < 2 && E - D >= MARGEM && adesao >= ADESAO_MIN_SUBIR && acima.length >= 2 && !forcaSo(acima)) {
    const para = NIVEIS[D + 1];
    sugestao = {
      direcao: "subir", de: declarado, para,
      titulo: `Seu treino está com cara de ${NOME[para]}`,
      frase: `Você começou como ${NOME[declarado]}, mas os últimos treinos mostram mais que isso. Um plano de ${NOME[para]} pode te dar mais estímulo.`,
      motivos: [...acima].sort((a, b) => (b.nivel - D) * b.peso - (a.nivel - D) * a.peso).slice(0, 3).map((f) => f.motivo),
    };
  } else if (D > 0 && D - E >= MARGEM && abaixo.length >= 2 && !forcaSo(abaixo)) {
    const para = NIVEIS[D - 1];
    sugestao = {
      direcao: "descer", de: declarado, para,
      titulo: `Um plano de ${NOME[para]} pode encaixar melhor agora`,
      frase: `Pelos últimos treinos, um plano um pouco mais simples deve render mais pra você. Não é passo atrás: é ajustar o plano à sua fase.`,
      motivos: [...abaixo].sort((a, b) => (D - b.nivel) * b.peso - (D - a.nivel) * a.peso).slice(0, 3).map((f) => f.motivo),
    };
  }
  return { pronto: true, declarado, estimativa: Math.round(E * 100) / 100, fatores, adesao, sessoes_janela: base.length, sugestao };
}

/** Data de fim do silêncio ("Agora não"). */
export function silencioAte(agoraMs = Date.now()): string {
  return new Date(agoraMs + SILENCIO_DIAS * DIA).toISOString();
}

/** Resumo legível da mudança (antes → depois), a partir de dois planos gerados pelo Coach. */
export function resumoMudancaNivel(args: {
  de: Experiencia;
  para: Experiencia;
  antes: { sessoes: Sessao[]; rir?: number };
  depois: { sessoes: Sessao[]; rir?: number };
}): string[] {
  const series = (ss: Sessao[]) => ss.reduce((a, s) => a + s.prescricoes.reduce((b, p) => b + p.series, 0), 0);
  const exs = (ss: Sessao[]) => (ss.length ? Math.round(ss.reduce((a, s) => a + s.prescricoes.length, 0) / ss.length) : 0);
  const rirDe = (ss: Sessao[]) => {
    const r = ss.flatMap((s) => s.prescricoes.map((p) => p.rir_alvo));
    return r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : null;
  };
  const out = [`Nível: ${NOME[args.de]} → ${NOME[args.para]}.`];
  const sa = series(args.antes.sessoes), sd = series(args.depois.sessoes);
  if (sa !== sd) out.push(`Séries por semana: ${sa} → ${sd}.`);
  const ea = exs(args.antes.sessoes), ed = exs(args.depois.sessoes);
  if (ea !== ed) out.push(`Exercícios por treino: cerca de ${ea} → ${ed}.`);
  const ra = rirDe(args.antes.sessoes), rd = rirDe(args.depois.sessoes);
  if (ra != null && rd != null && ra !== rd) out.push(`Reps na reserva no fim das séries: ${ra} → ${rd}.`);
  out.push("Suas cargas continuam as que você já levanta.");
  return out;
}

