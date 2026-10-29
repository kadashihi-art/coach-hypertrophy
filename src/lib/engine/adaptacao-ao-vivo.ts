/**
 * Adaptação ao vivo (intra-sessão) — brief R4 espírito + F5 dor.
 * Só sugere ajustes para o resto da sessão atual; NÃO grava EstadoExercicio
 * (isso fica em finishSession / progressão R1–R12).
 */
import type {
  EstadoExercicio,
  NivelAlerta,
  Prescricao,
  RegistroSerie,
} from "@/lib/domain";
import { roundToStep } from "@/lib/engine/ancorar-carga";

export type RegraAdaptacaoAoVivo =
  | "AO_VIVO_R4"
  | "AO_VIVO_DOR"
  | "AO_VIVO_RIR0"
  | "NENHUMA";

export type AdaptacaoAoVivo = {
  aplicada: boolean;
  carga_sugerida_kg?: number;
  series_alvo_ajustado?: number;
  cortar_serie_extra?: boolean;
  motivo: string;
  regra: RegraAdaptacaoAoVivo;
  alerta?: NivelAlerta;
  sugerir_alternativa?: string | null;
};

const TIPOS_TRABALHO = new Set(["trabalho", "top_set", "back_off"]);

function reduzirCarga(
  cargaKg: number,
  factor: number,
  stepKg: number,
): number {
  let nova = roundToStep(cargaKg * factor, stepKg);
  if (nova >= cargaKg && stepKg > 0) {
    nova = roundToStep(cargaKg - stepKg, stepKg);
  }
  return Math.max(0, nova);
}

function seriesAlvoAposCorte(
  prescSeries: number,
  loggedCount: number,
): number {
  // Corta 1 do planejado; não fica abaixo do já logado; mínimo 1 no total.
  // Se não sobrar série → exercício encerra cedo (alvo = loggedCount).
  const cortado = Math.max(1, prescSeries - 1);
  return Math.max(loggedCount, cortado);
}

/**
 * Avalia a série acabada de registrar e sugere ajuste só para o restante
 * desta prescrição na sessão atual.
 */
export function adaptarAposSerie(args: {
  registro: RegistroSerie;
  /** Séries já logadas desta presc nesta sessão (sem a atual). */
  seriesAnteriores: RegistroSerie[];
  presc: Prescricao;
  estado?: EstadoExercicio | null;
  stepKg: number;
}): AdaptacaoAoVivo {
  const { registro, seriesAnteriores, presc, stepKg } = args;
  const nenhuma: AdaptacaoAoVivo = {
    aplicada: false,
    motivo: "Sem adaptação ao vivo.",
    regra: "NENHUMA",
  };

  // 1) Aquecimento: âncora já cuida — ignora falha ao vivo
  if (registro.tipo_serie === "aquecimento") {
    return {
      ...nenhuma,
      motivo: "Aquecimento ignorado pela adaptação ao vivo (âncora).",
    };
  }

  if (!TIPOS_TRABALHO.has(registro.tipo_serie)) {
    return nenhuma;
  }

  const piso = presc.faixa_reps[0];
  const todas = [...seriesAnteriores, registro];
  const trabalho = todas.filter((s) => TIPOS_TRABALHO.has(s.tipo_serie));
  const abaixoPiso = trabalho.filter((s) => s.reps < piso);
  const comDor = todas.filter((s) => s.dor === true);
  const loggedCount = todas.length;
  const cargaBase =
    registro.carga_kg > 0
      ? registro.carga_kg
      : (presc.carga.trabalho_kg ?? 0);

  // 3) Dor mid-session (F5) — ≥2 séries com dor nesta presc
  if (registro.dor && comDor.length >= 2) {
    const alt = presc.alternativa_equipamento_ocupado;
    const abaixo = registro.reps < piso;
    const carga = abaixo
      ? reduzirCarga(cargaBase, 0.925, stepKg)
      : undefined;
    const motivo = alt
      ? `Dor em ${comDor.length} séries — considere parar ou trocar para ${alt}.`
      : `Dor em ${comDor.length} séries — considere parar ou pular o restante.`;
    return {
      aplicada: true,
      carga_sugerida_kg: carga,
      motivo,
      regra: "AO_VIVO_DOR",
      alerta: "N1",
      sugerir_alternativa: alt,
    };
  }

  // 2) Falha no piso (espírito R4 ao vivo)
  if (registro.reps < piso) {
    const fails = abaixoPiso.length;
    if (fails >= 2) {
      // Corte ~10%: arredonda para baixo no step (mais agressivo que −7,5%)
      let nova =
        stepKg > 0
          ? Math.floor((cargaBase * 0.9) / stepKg) * stepKg
          : Math.round(cargaBase * 0.9 * 10) / 10;
      const leve = reduzirCarga(cargaBase, 0.925, stepKg);
      if (nova >= leve && stepKg > 0) {
        nova = Math.max(0, leve - stepKg);
      }
      nova = Math.max(0, nova);
      const seriesAlvo = seriesAlvoAposCorte(presc.series, loggedCount);
      return {
        aplicada: true,
        carga_sugerida_kg: nova,
        series_alvo_ajustado: seriesAlvo,
        cortar_serie_extra: true,
        motivo: `Carga das próximas séries −10% e −1 série (${fails} falhas no piso ${piso}).`,
        regra: "AO_VIVO_R4",
      };
    }
    const nova = reduzirCarga(cargaBase, 0.925, stepKg);
    return {
      aplicada: true,
      carga_sugerida_kg: nova,
      motivo: `Carga das próximas séries −7,5% (falha no piso ${piso}).`,
      regra: "AO_VIVO_R4",
    };
  }

  // 4) RIR 0 com reps no/abaixo do piso → redução leve
  if (registro.rir_percebido === 0 && registro.reps <= piso) {
    const nova = reduzirCarga(cargaBase, 0.9625, stepKg); // ~−3,75% / um passo
    return {
      aplicada: true,
      carga_sugerida_kg: nova,
      motivo: `RIR 0 no piso — carga seguinte levemente reduzida (${nova} kg).`,
      regra: "AO_VIVO_RIR0",
    };
  }

  // Dor em 1 série só: sem adaptação dura (só toast implícito se UI quiser)
  if (registro.dor && comDor.length === 1) {
    return {
      aplicada: false,
      motivo: "Dor marcada nesta série — monitore; 2ª dor dispara alerta N1.",
      regra: "NENHUMA",
    };
  }

  return nenhuma;
}

/** Aplica sugestão na prescrição ativa (imuta; não toca séries já logadas). */
export function aplicarAdaptacaoNaPrescricao(
  presc: Prescricao,
  adapt: AdaptacaoAoVivo,
): Prescricao {
  if (!adapt.aplicada) return presc;
  let next: Prescricao = { ...presc, carga: { ...presc.carga } };
  if (typeof adapt.carga_sugerida_kg === "number") {
    next = {
      ...next,
      carga: {
        ...next.carga,
        trabalho_kg: adapt.carga_sugerida_kg,
        top_set_kg:
          next.carga.top_set_kg != null
            ? adapt.carga_sugerida_kg
            : next.carga.top_set_kg,
        origem: "usuario",
      },
    };
  }
  if (
    adapt.cortar_serie_extra &&
    typeof adapt.series_alvo_ajustado === "number"
  ) {
    next = {
      ...next,
      series: Math.max(1, adapt.series_alvo_ajustado),
    };
  }
  return next;
}
