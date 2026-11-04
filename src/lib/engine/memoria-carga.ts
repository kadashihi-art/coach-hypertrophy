/**
 * Memória de carga — lê o que o usuário realmente fez (`registros`) e transforma
 * em um resumo por exercício/padrão. Serve para pré-preencher a próxima sessão,
 * trocar exercício, editar treino e remontar o plano sem "esquecer" o histórico.
 *
 * Só lê dados. Quem decide progressão continua sendo o motor (R1–R12).
 */
import type {
  Equipamento,
  EstadoExercicio,
  Exercicio,
  Padrao,
  RegistroSerie,
} from "@/lib/domain";
import { ehSeriePreparatoria, incrementoCargaKg } from "@/lib/domain";
import { roundToStep } from "./ancorar-carga";
import { e1rmEpley } from "./e1rm";

const JANELA_TENDENCIA = 6;

export type MemoriaExercicio = {
  exercicio_id: string;
  /** Sessões com pelo menos 1 série de trabalho. */
  sessoes: number;
  ultima_em: string | null;
  ultimo_top_kg: number | null;
  ultimo_back_off_kg: number | null;
  ultima_carga_kg: number | null;
  ultimas_reps: number | null;
  ultimo_rir: number | null;
  e1rm_recente_kg: number;
  melhor_e1rm_kg: number;
  rir_medio: number | null;
  reps_media: number | null;
  /** Variação % do e1RM médio da metade recente vs. metade anterior (null com <3 sessões). */
  tendencia_pct: number | null;
  carga_sugerida_kg: number | null;
};

export type CargaSugerida = {
  carga_kg: number;
  origem: "estado" | "historico" | "mesmo_padrao" | "estimativa";
  confianca: "alta" | "media" | "baixa";
  exercicio_origem_id?: string;
};

type SessaoResumo = { sessao_id: string; em: string; series: RegistroSerie[] };

function ehTrabalho(r: RegistroSerie): boolean {
  return !ehSeriePreparatoria(r.tipo_serie);
}

function arredondarCarga(kg: number, step: number): number {
  if (!(kg > 0)) return 0;
  return Math.round(roundToStep(kg, step) * 100) / 100;
}

function media(valores: number[]): number {
  if (valores.length === 0) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function sessoesDoExercicio(
  registros: RegistroSerie[],
  exercicioId: string,
  excluirSessaoId?: string,
): SessaoResumo[] {
  const porSessao = new Map<string, RegistroSerie[]>();
  for (const r of registros) {
    if (r.exercicio_id !== exercicioId) continue;
    if (excluirSessaoId && r.sessao_id === excluirSessaoId) continue;
    if (!ehTrabalho(r)) continue;
    const atual = porSessao.get(r.sessao_id);
    if (atual) atual.push(r);
    else porSessao.set(r.sessao_id, [r]);
  }
  return [...porSessao.entries()]
    .map(([sessao_id, series]) => ({
      sessao_id,
      em: series.reduce(
        (max, r) => (r.executado_em > max ? r.executado_em : max),
        series[0]!.executado_em,
      ),
      series,
    }))
    .sort((a, b) => a.em.localeCompare(b.em));
}

/** Âncora da sessão: top set; senão a série de trabalho mais pesada. */
function ancoraDaSessao(series: RegistroSerie[]): RegistroSerie | null {
  const comReps = series.filter((s) => s.reps > 0);
  if (comReps.length === 0) return null;
  const tops = comReps.filter((s) => s.tipo_serie === "top_set");
  const trabalhos = comReps.filter((s) => s.tipo_serie === "trabalho");
  const pool = tops.length > 0 ? tops : trabalhos.length > 0 ? trabalhos : comReps;
  return pool.reduce((a, b) => (b.carga_kg >= a.carga_kg ? b : a));
}

function melhorE1rmDaSessao(series: RegistroSerie[]): number {
  let melhor = 0;
  for (const s of series) {
    if (s.reps <= 0 || s.carga_kg <= 0) continue;
    const e = e1rmEpley(s.carga_kg, s.reps);
    if (e > melhor) melhor = e;
  }
  return melhor;
}

function tendenciaDasSessoes(sessoes: SessaoResumo[]): number | null {
  if (sessoes.length < 3) return null;
  const janela = sessoes.slice(-JANELA_TENDENCIA);
  const valores = janela.map((s) => melhorE1rmDaSessao(s.series));
  if (valores.some((v) => v <= 0)) return null;
  const meio = Math.floor(valores.length / 2);
  const antes = media(valores.slice(0, meio));
  const depois = media(valores.slice(meio));
  if (antes <= 0) return null;
  return Math.round(((depois - antes) / antes) * 1000) / 10;
}

/**
 * Resumo do exercício a partir dos registros reais.
 * `excluirSessaoId` permite ignorar a sessão em andamento (para mostrar "última vez").
 */
export function resumirExercicio(
  registros: RegistroSerie[],
  exercicioId: string,
  opts: { stepKg?: number; excluirSessaoId?: string } = {},
): MemoriaExercicio | null {
  const step = opts.stepKg && opts.stepKg > 0 ? opts.stepKg : 2.5;
  const sessoes = sessoesDoExercicio(registros, exercicioId, opts.excluirSessaoId);
  if (sessoes.length === 0) return null;

  const ultima = sessoes[sessoes.length - 1]!;
  const anchor = ancoraDaSessao(ultima.series);
  // Back-off da sessão mais recente que teve essa fase (nem todo treino usa).
  const sessaoComBackOff = [...sessoes]
    .reverse()
    .find((s) => s.series.some((x) => x.tipo_serie === "back_off"));
  const backOff = sessaoComBackOff?.series
    .filter((s) => s.tipo_serie === "back_off" && s.carga_kg > 0)
    .reduce<RegistroSerie | null>(
      (a, b) => (!a || b.carga_kg >= a.carga_kg ? b : a),
      null,
    );

  const ultimas = sessoes.slice(-3).flatMap((s) => s.series);
  const ultimaCarga =
    anchor?.carga_kg ??
    ultima.series.reduce((max, s) => Math.max(max, s.carga_kg), 0);

  const e1rms = sessoes
    .map((s) => melhorE1rmDaSessao(s.series))
    .filter((v) => v > 0);

  return {
    exercicio_id: exercicioId,
    sessoes: sessoes.length,
    ultima_em: ultima.em,
    ultimo_top_kg: anchor?.carga_kg ?? null,
    ultimo_back_off_kg: backOff?.carga_kg ?? null,
    ultima_carga_kg: ultimaCarga > 0 ? ultimaCarga : null,
    ultimas_reps: anchor?.reps ?? null,
    ultimo_rir: anchor?.rir_percebido ?? null,
    e1rm_recente_kg: e1rms.length > 0 ? e1rms[e1rms.length - 1]! : 0,
    melhor_e1rm_kg: e1rms.length > 0 ? Math.max(...e1rms) : 0,
    rir_medio:
      ultimas.length > 0
        ? Math.round(media(ultimas.map((s) => s.rir_percebido)) * 10) / 10
        : null,
    reps_media:
      ultimas.length > 0
        ? Math.round(media(ultimas.map((s) => s.reps)) * 10) / 10
        : null,
    tendencia_pct: tendenciaDasSessoes(sessoes),
    carga_sugerida_kg: ultimaCarga > 0 ? arredondarCarga(ultimaCarga, step) : null,
  };
}

/** Resumo de todos os exercícios do catálogo (uma passada nos registros). */
export function resumirExercicios(
  registros: RegistroSerie[],
  exercicios: Exercicio[],
): Map<string, MemoriaExercicio> {
  const out = new Map<string, MemoriaExercicio>();
  for (const ex of exercicios) {
    const m = resumirExercicio(registros, ex.id, {
      stepKg: incrementoCargaKg(ex.grupo_primario),
    });
    if (m) out.set(ex.id, m);
  }
  return out;
}

/** "40 kg × 10 reps @ RIR 2" (null quando nunca houve série válida). */
export function textoUltimaVez(m: MemoriaExercicio | null | undefined): string | null {
  if (!m || m.ultima_carga_kg == null || m.ultimas_reps == null) return null;
  const kg = String(m.ultima_carga_kg).replace(".", ",");
  const rir = m.ultimo_rir == null ? "" : ` @ RIR ${m.ultimo_rir}`;
  return `${kg} kg × ${m.ultimas_reps} reps${rir}`;
}

/** Texto curto da tendência (ex.: "+2,5% no e1RM"). */
export function textoTendencia(m: MemoriaExercicio | null | undefined): string | null {
  if (!m || m.tendencia_pct == null || Math.abs(m.tendencia_pct) < 0.5) return null;
  const sinal = m.tendencia_pct > 0 ? "+" : "";
  return `${sinal}${String(m.tendencia_pct).replace(".", ",")}% no e1RM`;
}

/**
 * Fator de conversão de carga entre equipamentos para o MESMO padrão.
 * Valores conservadores: halter é por halter e máquina de agachamento carrega mais.
 */
export function fatorEquipamento(padrao: Padrao, equipamento: Equipamento): number {
  if (equipamento === "peso_corporal") return 0;
  if (padrao === "agachamento" && equipamento === "maquina") return 1.6;
  if (padrao === "agachamento" && equipamento === "halteres") return 0.4;
  const porEquipamento: Record<Equipamento, number> = {
    barra: 1,
    halteres: 0.45,
    maquina: 1.1,
    cabo: 0.9,
    kettlebell: 0.5,
    peso_corporal: 0,
    banco: 1,
    rack: 1,
    elastico: 0.35,
    outros: 0.8,
  };
  return porEquipamento[equipamento];
}

export type CargaMesmoPadrao = {
  carga_kg: number;
  exercicio_origem_id: string;
  equipamento_origem: Equipamento;
  mesmo_equipamento: boolean;
  memoria: MemoriaExercicio;
};

/**
 * Sugere carga para um exercício novo usando o histórico de um exercício
 * equivalente (mesmo padrão, mesmo músculo primário e mesma natureza composto/isolado).
 * Quando o equipamento muda, converte pelo fator e limita o desvio à estimativa.
 */
export function cargaDeMesmoPadrao(args: {
  registros: RegistroSerie[];
  exercicios: Exercicio[];
  alvo: Pick<Exercicio, "id" | "padrao" | "grupo_primario" | "composto" | "equipamento">;
  /** Estimativa determinística usada como limite quando o equipamento muda. */
  fallbackKg?: number;
  excluirSessaoId?: string;
}): CargaMesmoPadrao | null {
  const { registros, exercicios, alvo } = args;
  const fatorAlvo = fatorEquipamento(alvo.padrao, alvo.equipamento);
  if (fatorAlvo <= 0) return null;

  const candidatos = exercicios
    .filter(
      (ex) =>
        ex.id !== alvo.id &&
        ex.padrao === alvo.padrao &&
        ex.grupo_primario === alvo.grupo_primario &&
        ex.composto === alvo.composto,
    )
    .map((ex) => ({
      ex,
      memoria: resumirExercicio(registros, ex.id, {
        stepKg: incrementoCargaKg(ex.grupo_primario),
        excluirSessaoId: args.excluirSessaoId,
      }),
    }))
    .filter(
      (c): c is { ex: Exercicio; memoria: MemoriaExercicio } =>
        c.memoria?.ultimo_top_kg != null && c.memoria.ultimo_top_kg > 0,
    );

  if (candidatos.length === 0) return null;

  candidatos.sort((a, b) => {
    const mesmoA = a.ex.equipamento === alvo.equipamento ? 1 : 0;
    const mesmoB = b.ex.equipamento === alvo.equipamento ? 1 : 0;
    if (mesmoA !== mesmoB) return mesmoB - mesmoA;
    return (b.memoria.ultima_em ?? "").localeCompare(a.memoria.ultima_em ?? "");
  });

  const melhor = candidatos[0]!;
  const fatorOrigem = fatorEquipamento(melhor.ex.padrao, melhor.ex.equipamento);
  if (fatorOrigem <= 0) return null;

  const step = incrementoCargaKg(alvo.grupo_primario);
  const mesmoEquipamento = melhor.ex.equipamento === alvo.equipamento;
  let bruto = melhor.memoria.ultimo_top_kg! * (fatorAlvo / fatorOrigem);

  // Equipamento diferente: não deixa o histórico de outro aparelho inventar um salto grande.
  const fallback = args.fallbackKg ?? 0;
  if (!mesmoEquipamento && fallback > 0) {
    bruto = Math.min(fallback * 1.25, Math.max(fallback * 0.75, bruto));
  }

  const carga = arredondarCarga(bruto, step);
  if (carga <= 0) return null;

  return {
    carga_kg: carga,
    exercicio_origem_id: melhor.ex.id,
    equipamento_origem: melhor.ex.equipamento,
    mesmo_equipamento: mesmoEquipamento,
    memoria: melhor.memoria,
  };
}

type BaseParaCarga = {
  estados: EstadoExercicio[];
  registros: RegistroSerie[];
  exercicios: Exercicio[];
};

/**
 * Carga para um exercício, na ordem de confiança:
 * 1) estado do motor já calibrado (alvo da próxima sessão);
 * 2) histórico exato do exercício;
 * 3) histórico de exercício equivalente (mesmo padrão/músculo);
 * 4) estimativa do gerador (primeira sessão).
 */
export function cargaSugeridaParaExercicio(
  base: BaseParaCarga,
  exercicioId: string,
  fallbackKg: number,
  opts: { excluirSessaoId?: string } = {},
): CargaSugerida {
  const ex = base.exercicios.find((e) => e.id === exercicioId);
  const step = ex ? incrementoCargaKg(ex.grupo_primario) : 2.5;
  const estado = base.estados.find((e) => e.exercicio_id === exercicioId);

  const estadoCalibrado =
    estado != null &&
    (estado.origem_carga === "usuario" ||
      (!estado.primeira_sessao &&
        estado.origem_carga !== "estimativa_conservadora"));
  if (estadoCalibrado) {
    const kg = estado.alvo_proxima_sessao?.carga_kg ?? estado.carga_atual_kg;
    return {
      carga_kg: arredondarCarga(kg, step),
      origem: "estado",
      confianca: "alta",
    };
  }

  const memoria = resumirExercicio(base.registros, exercicioId, {
    stepKg: step,
    excluirSessaoId: opts.excluirSessaoId,
  });
  if (memoria?.carga_sugerida_kg != null) {
    return {
      carga_kg: memoria.carga_sugerida_kg,
      origem: "historico",
      confianca: "alta",
    };
  }

  if (ex) {
    const equivalente = cargaDeMesmoPadrao({
      registros: base.registros,
      exercicios: base.exercicios,
      alvo: ex,
      fallbackKg,
      excluirSessaoId: opts.excluirSessaoId,
    });
    if (equivalente) {
      return {
        carga_kg: equivalente.carga_kg,
        origem: "mesmo_padrao",
        confianca: equivalente.mesmo_equipamento ? "alta" : "media",
        exercicio_origem_id: equivalente.exercicio_origem_id,
      };
    }
  }

  if (estado) {
    return {
      carga_kg: arredondarCarga(
        estado.alvo_proxima_sessao?.carga_kg ?? estado.carga_atual_kg,
        step,
      ),
      origem: "estimativa",
      confianca: "baixa",
    };
  }

  return {
    carga_kg: arredondarCarga(fallbackKg, step),
    origem: "estimativa",
    confianca: "baixa",
  };
}
