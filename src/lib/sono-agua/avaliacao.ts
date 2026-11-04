/**
 * Sono e água: séries por dia, regularidade, meta de água e avaliação semanal/quinzenal.
 * Só leitura do check-in. Não muda carga, séries nem progressão — só cita a regra
 * já existente (sono < 6 h ou disposição baixa deixa o treino do dia mais leve).
 * Fontes em docs/sono-agua.md.
 */
import type { AlertaApresentado } from "@/lib/alertas/apresentar";
import { plural } from "@/lib/alertas/apresentar";
import { formatarDuracaoSono, minutosDesdeMeiaNoite } from "@/lib/domain/sono";

type CheckinLike = {
  data: string;
  sono_h: number;
  sono_inicio?: string | null;
  sono_fim?: string | null;
  agua_ml?: number | null;
  peso_kg?: number | null;
  prontidao?: number;
};

export const SONO_MIN_H = 7;
export const SONO_MAX_H = 9;
/** Limiar da regra que já existe (treino do dia mais leve). */
export const SONO_TREINO_LEVE_H = 6;
export const AGUA_ML_POR_KG = 35;
export const AGUA_META_MIN = 1500;
export const AGUA_META_MAX = 4000;
export const AGUA_META_PADRAO = 2500;

export type DiaSonoAgua = {
  data: string;
  sono_h: number | null;
  /** Minutos a partir das 12:00 do dia anterior (faz a virada da noite ficar contínua). */
  dormir_min: number | null;
  acordar_min: number | null;
  inicio: string | null;
  fim: string | null;
  agua_ml: number | null;
};

/** "2026-11-04" − n dias (UTC, sem fuso). */
export function diaMenos(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Hora → minutos num eixo que começa ao meio-dia: 23:30 → 690, 00:30 → 750, 07:00 → 1140.
 * Assim dormir antes ou depois da meia-noite fica na mesma escala.
 */
export function minutosEixoNoite(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = minutosDesdeMeiaNoite(hhmm);
  if (m == null) return null;
  return m >= 12 * 60 ? m - 12 * 60 : m + 12 * 60;
}

/** Eixo da noite → "HH:MM". */
export function horaDoEixo(min: number): string {
  const t = (((Math.round(min) + 12 * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Últimos `dias` dias terminando em `hojeIso` (o mais antigo primeiro). Um check-in por dia (o último salvo). */
export function serieDias(checkins: CheckinLike[], hojeIso: string, dias: number): DiaSonoAgua[] {
  const porDia = new Map<string, CheckinLike>();
  for (const c of checkins) porDia.set(c.data, c);
  const out: DiaSonoAgua[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const data = diaMenos(hojeIso, i);
    const c = porDia.get(data);
    const temSono = c && Number.isFinite(c.sono_h) && c.sono_h > 0;
    out.push({
      data,
      sono_h: temSono ? c!.sono_h : null,
      dormir_min: temSono ? minutosEixoNoite(c!.sono_inicio) : null,
      acordar_min: temSono ? minutosEixoNoite(c!.sono_fim) : null,
      inicio: temSono ? (c!.sono_inicio ?? null) : null,
      fim: temSono ? (c!.sono_fim ?? null) : null,
      agua_ml: c && typeof c.agua_ml === "number" ? c.agua_ml : null,
    });
  }
  return out;
}

export function media(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Desvio padrão (minutos). Precisa de pelo menos 2 valores. */
export function desvio(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = media(xs)!;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

/**
 * Meta diária de água: 35 ml por kg, arredondada a 250 ml, entre 1,5 L e 4 L.
 * Sem peso registrado: 2,5 L.
 */
export function metaAguaMl(pesoKg: number | null | undefined): number {
  if (!pesoKg || !Number.isFinite(pesoKg) || pesoKg <= 0) return AGUA_META_PADRAO;
  const bruto = Math.round((pesoKg * AGUA_ML_POR_KG) / 250) * 250;
  return Math.min(AGUA_META_MAX, Math.max(AGUA_META_MIN, bruto));
}

/** Peso mais recente do check-in; senão o do perfil. */
export function pesoAtual(checkins: CheckinLike[], perfilPeso?: number | null): number | null {
  const c = [...checkins].filter((x) => typeof x.peso_kg === "number" && x.peso_kg > 0).sort((a, b) => a.data.localeCompare(b.data)).pop();
  return c?.peso_kg ?? perfilPeso ?? null;
}

export function litros(ml: number): string {
  return `${(ml / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L`;
}

/** 70 → "1h10"; 40 → "40 min". */
export function fmtMinutos(min: number): string {
  const m = Math.round(min / 5) * 5;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}

export type ResumoSono = {
  noites: number;
  media_h: number | null;
  abaixo7: number;
  abaixo6: number;
  dormir_medio: string | null;
  acordar_medio: string | null;
  /** Desvio padrão do horário de dormir, em minutos. */
  variacao_dormir_min: number | null;
};

export type ResumoAgua = { dias: number; meta_ml: number; batidos: number; media_ml: number | null };

export function resumirSono(dias: DiaSonoAgua[]): ResumoSono {
  const com = dias.filter((d) => d.sono_h != null);
  const dur = com.map((d) => d.sono_h!);
  const dormir = com.map((d) => d.dormir_min).filter((x): x is number => x != null);
  const acordar = com.map((d) => d.acordar_min).filter((x): x is number => x != null);
  const md = media(dormir);
  const ma = media(acordar);
  return {
    noites: com.length,
    media_h: media(dur),
    abaixo7: dur.filter((h) => h < SONO_MIN_H).length,
    abaixo6: dur.filter((h) => h < SONO_TREINO_LEVE_H).length,
    dormir_medio: md != null ? horaDoEixo(md) : null,
    acordar_medio: ma != null ? horaDoEixo(ma) : null,
    variacao_dormir_min: desvio(dormir),
  };
}

export function resumirAgua(dias: DiaSonoAgua[], metaMl: number): ResumoAgua {
  const com = dias.filter((d) => d.agua_ml != null).map((d) => d.agua_ml!);
  return { dias: com.length, meta_ml: metaMl, batidos: com.filter((x) => x >= metaMl).length, media_ml: media(com) };
}

/** Mínimo de noites/dias registrados pra avaliar a janela. */
export function minimoRegistros(janela: 7 | 14): number {
  return janela === 7 ? 3 : 5;
}

const ACAO_CHECKIN = { tipo: "link" as const, rotulo: "Registrar check-in", href: "/checkin" };

function periodo(janela: 7 | 14): string {
  return janela === 7 ? "Nesta semana" : "Nas últimas 2 semanas";
}

export function avaliarSono(dias: DiaSonoAgua[], janela: 7 | 14): AlertaApresentado | null {
  const r = resumirSono(dias);
  if (r.noites < minimoRegistros(janela) || r.media_h == null) return null;
  const per = periodo(janela);
  const med = formatarDuracaoSono(r.media_h);
  const varTxt =
    r.variacao_dormir_min != null && r.dormir_medio
      ? r.variacao_dormir_min < 15
        ? ` Você tem dormido quase sempre perto das ${r.dormir_medio}, ótimo.`
        : ` Você costuma dormir perto das ${r.dormir_medio}, com variação de ${fmtMinutos(r.variacao_dormir_min)}.`
      : "";
  const irregular = (r.variacao_dormir_min ?? 0) > 60;
  const treino =
    r.abaixo6 > 0
      ? ` ${r.abaixo6 === 1 ? "Uma delas ficou" : `Dessas, ${r.abaixo6} ficaram`} abaixo de 6 h, e nesses dias o treino fica mais leve, com 1 série a menos nos exercícios principais.`
      : "";
  const base = `${per} você dormiu em média ${med} em ${plural(r.noites, "noite")} registrada${r.noites === 1 ? "" : "s"}`;

  if (r.media_h < SONO_MIN_H || r.abaixo7 > r.noites / 2) {
    return {
      tipo: "sono",
      urgencia: "atencao",
      titulo: "Sono abaixo do ideal",
      porque: `${base}, e ${plural(r.abaixo7, "noite")} ${r.abaixo7 === 1 ? "ficou" : "ficaram"} abaixo de 7 h.${treino}`,
      dica: `O ideal pra recuperar e crescer é de 7 a 9 h. Tente deitar 30 min mais cedo nos próximos dias.${varTxt}`,
      acao: ACAO_CHECKIN,
    };
  }
  if (irregular) {
    return {
      tipo: "sono",
      urgencia: "atencao",
      titulo: "Horário de dormir irregular",
      porque: `${base}, boa duração, mas o horário de dormir variou ${fmtMinutos(r.variacao_dormir_min!)} entre as noites.${treino}`,
      dica: `Escolha um horário fixo pra deitar, perto das ${r.dormir_medio}, mesmo no fim de semana. Isso ajuda a acordar mais disposto.`,
      acao: ACAO_CHECKIN,
    };
  }
  return {
    tipo: "sono",
    urgencia: "info",
    titulo: "Sono na faixa boa",
    porque: `${base}${r.abaixo7 ? `, e só ${plural(r.abaixo7, "noite")} ficou abaixo de 7 h` : ", todas com 7 h ou mais"}.${treino}`,
    dica: `Continue assim: de 7 a 9 h por noite é o que mais ajuda a recuperar entre os treinos.${varTxt}`,
  };
}

export function avaliarAgua(dias: DiaSonoAgua[], metaMl: number, janela: 7 | 14): AlertaApresentado | null {
  const r = resumirAgua(dias, metaMl);
  if (r.dias < minimoRegistros(janela) || r.media_ml == null) return null;
  const per = periodo(janela);
  const meta = litros(metaMl);
  const base = `${per} você bateu a meta de ${meta} em ${r.batidos} de ${plural(r.dias, "dia")} registrado${r.dias === 1 ? "" : "s"}, com média de ${litros(r.media_ml)} por dia.`;
  const pct = r.batidos / r.dias;
  if (pct >= 0.7) {
    return { tipo: "agua", urgencia: "info", titulo: "Água em dia", porque: base, dica: "Boa. Manter a hidratação ajuda o rendimento nas séries." };
  }
  return {
    tipo: "agua",
    urgencia: pct < 0.4 ? "atencao" : "info",
    titulo: "Água abaixo da meta",
    porque: base,
    dica: `Deixe uma garrafa por perto e tome um copo a cada refeição e entre as séries. Faltam em média ${litros(Math.max(0, metaMl - r.media_ml))} por dia.`,
    acao: ACAO_CHECKIN,
  };
}

/** Texto curto do estado vazio. */
export function estadoVazio(dias: DiaSonoAgua[], janela: 7 | 14): { titulo: string; texto: string } | null {
  const noites = dias.filter((d) => d.sono_h != null).length;
  const min = minimoRegistros(janela);
  if (noites >= min) return null;
  if (noites === 0) {
    return {
      titulo: "Ainda sem registros de sono e água",
      texto: "Faça o check-in de manhã: hora que dormiu, hora que acordou e quanta água bebeu. Em poucos dias aparece o seu gráfico.",
    };
  }
  const faltam = min - noites;
  return {
    titulo: "Quase lá",
    texto: `Você já tem ${plural(noites, "noite")} registrada${noites === 1 ? "" : "s"}. Mais ${plural(faltam, "check-in")} e eu monto a avaliação ${janela === 7 ? "da semana" : "das 2 semanas"}.`,
  };
}
