/**
 * Apresentação dos alertas para o usuário: título claro, uma frase do porquê,
 * ação opcional e urgência (cor/ícone). Nenhum código interno chega na tela.
 * Lê tanto o formato novo quanto textos antigos já salvos no estado.
 */
import { GRUPO_LABEL, acentuar, labelGrupo } from "@/lib/labels";
import { semCodigoRegra } from "@/lib/llm/tom";

export type Urgencia = "info" | "atencao" | "bloqueio";

export type AcaoAlerta =
  | { tipo: "revisar_treino"; rotulo: string; grupo?: string }
  | { tipo: "link"; rotulo: string; href: string; externo?: boolean };

export type AlertaApresentado = {
  titulo: string;
  porque: string;
  dica?: string;
  urgencia: Urgencia;
  acao?: AcaoAlerta;
  /** Tipo de alerta (só para lógica de tela; nunca exibir). */
  tipo: "volume_baixo" | "volume_alto" | "recuperacao" | "agua" | "sono" | "deload" | "plato" | "parq" | "outro";
};

type AlertaLike = { nivel: string; motivo: string; recomendacao: string };

/** Plural PT-BR simples: plural(2, "série") → "2 séries". */
export function plural(n: number, um: string, varios?: string): string {
  const p = varios ?? (um.endsWith("ão") ? um.slice(0, -2) + "ões" : um + "s");
  return `${String(n).replace(".", ",")} ${n === 1 ? um : p}`;
}

/** "quadriceps" → "Quadríceps"; minúsculo quando no meio da frase. */
export function nomeMusculo(g: string, minusculo = false): string {
  const l = labelGrupo(g);
  return minusculo ? l.toLowerCase() : l;
}

const MARK = /\[(R1[01]):([a-z_]+):\d{4}-W\d{2}\]\s*/;

function urgenciaDe(nivel: string): Urgencia {
  return nivel === "N2" ? "bloqueio" : nivel === "N0" ? "info" : "atencao";
}

/** Limpa qualquer texto livre (fallback): sem marcadores, códigos, "(s)" e com acento. */
export function textoLimpo(t: string): string {
  return acentuar(
    semCodigoRegra(t.replace(/\[[^\]]*\d{4}-W\d+[^\]]*\]\s*/g, "").replace(/\b[a-z_]+:\d{4}-W\d+\b\s*/g, "")),
  )
    .replace(/\b(alerta|bloqueio)\s+N[0-2]\b/gi, "")
    .replace(/\bN[0-2]\s*·\s*/g, "")
    .replace(/(\p{L}+)\((s|es)\)/gu, "$1$2")
    .replace(/\(\s*\)/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

function num(s: string | undefined): number {
  return Number(String(s ?? "").replace(",", "."));
}

export function apresentarAlerta(a: AlertaLike): AlertaApresentado {
  const motivo = a.motivo ?? "";
  const rec = a.recomendacao ?? "";
  const mk = MARK.exec(motivo);

  if (mk && mk[1] === "R10") {
    const g = mk[2]!;
    const m = /abaixo de (\d+) por 2 semanas \((\d+)\s*→\s*(\d+)/.exec(motivo);
    const delta = num(/(\d+)\s*série/.exec(rec)?.[1]) || 1;
    const min = m ? num(m[1]) : 10;
    const ant = m ? num(m[2]) : null;
    const cur = m ? num(m[3]) : null;
    const nm = nomeMusculo(g, true);
    return {
      tipo: "volume_baixo",
      urgencia: "atencao",
      titulo: `${nomeMusculo(g)} com pouco volume`,
      porque:
        ant != null && cur != null
          ? `Nas últimas 2 semanas você fez ${ant} e depois ${plural(cur, "série")} de ${nm}, abaixo das ${min} que ajudam a crescer.`
          : `Faz 2 semanas que ${nm} fica abaixo de ${plural(min, "série")} por semana.`,
      dica: `Já deixei ${plural(delta, "série")} a mais de ${nm} nos próximos treinos. Confira e ajuste se quiser.`,
      acao: { tipo: "revisar_treino", rotulo: "Ver no próximo treino", grupo: g },
    };
  }
  if (mk && mk[1] === "R11") {
    const g = mk[2]!;
    const m = /(\d+)\s*>\s*(\d+)/.exec(motivo);
    const rir = /RIR médio ([\d.,]+)[^.]*?alvo (\d+)/.exec(motivo);
    const nm = nomeMusculo(g, true);
    const cur = m ? num(m[1]) : null;
    const max = m ? num(m[2]) : 20;
    const cansaco = rir && num(rir[1]) < num(rir[2]) ? " e as séries já estão chegando perto da falha" : "";
    return {
      tipo: "volume_alto",
      urgencia: "atencao",
      titulo: `${nomeMusculo(g)} com volume alto`,
      porque:
        cur != null
          ? `Esta semana você fez ${plural(cur, "série")} de ${nm}, acima das ${max} que o corpo costuma recuperar bem${cansaco}.`
          : `Esta semana ${nm} passou de ${plural(max, "série")}${cansaco}.`,
      dica: `Já tirei 2 séries de ${nm} dos próximos treinos pra você recuperar. Confira e ajuste se quiser.`,
      acao: { tipo: "revisar_treino", rotulo: "Ver no próximo treino", grupo: g },
    };
  }
  if (motivo.startsWith("Check-in:")) {
    const p = num(/prontidão (\d)/.exec(motivo)?.[1]);
    const s = num(/sono ([\d.,]+)\s*h/.exec(motivo)?.[1]);
    const partes: string[] = [];
    if (p && p <= 2) partes.push(`marcou disposição ${p} de 5`);
    if (s && s < 6) partes.push(`dormiu ${String(s).replace(".", ",")} h`);
    return {
      tipo: "recuperacao",
      urgencia: "atencao",
      titulo: "Treino de hoje mais leve",
      porque: `Você ${partes.length ? partes.join(" e ") : "não está 100% hoje"}, então tirei 1 série dos exercícios principais e mantive as cargas.`,
      dica: "Se estiver se sentindo bem no aquecimento, siga normal.",
    };
  }
  if (motivo.startsWith("Hidratação baixa")) {
    const ml = num(/(\d+)\s*ml/.exec(motivo)?.[1]);
    const litros = (x: number) => `${(x / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`;
    return {
      tipo: "agua",
      urgencia: "info",
      titulo: "Beba mais água hoje",
      porque: ml
        ? `Você registrou ${litros(ml)} de água, abaixo de 1,5 L. Isso não muda seu treino, mas pesa no rendimento.`
        : "Você bebeu pouca água hoje. Isso não muda seu treino, mas pesa no rendimento.",
      dica: "Tome um copo antes de começar e vá bebendo entre as séries.",
    };
  }
  if (/^Semana \d+\/\d+/.test(motivo)) {
    const m = /^Semana (\d+)\/(\d+)/.exec(motivo)!;
    return {
      tipo: "deload",
      urgencia: "info",
      titulo: "Semana de recuperação",
      porque: `Você está na semana ${m[1]} de ${m[2]} do ciclo. Hoje as cargas ficam 10% mais leves pra o corpo se recuperar e voltar mais forte.`,
    };
  }
  if (motivo.startsWith("Platô")) {
    return {
      tipo: "plato",
      urgencia: "info",
      titulo: "Carga travada em alguns exercícios",
      porque: "Faz 3 treinos ou mais que alguns exercícios de hoje não evoluem. Baixei 10% da carga deles pra você voltar a progredir.",
    };
  }
  if (motivo.startsWith("PAR-Q+")) {
    return {
      tipo: "parq",
      urgencia: "bloqueio",
      titulo: "Plano pausado por segurança",
      porque: "Uma resposta do questionário de saúde pede liberação profissional antes de treinar com progressão.",
      dica: "Procure um médico ou profissional de saúde. Depois é só refazer a triagem.",
    };
  }
  return {
    tipo: "outro",
    urgencia: urgenciaDe(a.nivel),
    titulo: urgenciaDe(a.nivel) === "bloqueio" ? "Plano pausado" : "Atenção",
    porque: textoLimpo(motivo),
    dica: rec ? textoLimpo(rec) : undefined,
  };
}

/** Lista de músculos acentuados (para testes). */
export const MUSCULOS_ROTULO = GRUPO_LABEL;
