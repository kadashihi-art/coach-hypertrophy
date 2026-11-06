/**
 * Benefícios de cada faixa de cardio semanal — texto de referência, não prescrição.
 *
 * Regras desta base:
 * - só entra número que está em estudo publicado (ou na diretriz da OMS);
 * - nada de "cura", "garantia" ou promessa individual: os dados populacionais são associação;
 * - a faixa recomendada é 150–300 min/semana de moderado (ou 75–150 de intenso);
 * - acima disso o retorno cai, e o texto fala isso com todas as letras.
 *
 * Fontes em `FONTES_CARDIO` (no fim do arquivo).
 */
import type { Evidencia } from "@/lib/domain";

export type FaixaBeneficio = {
  id: "zero" | "inicio" | "recomendada" | "acima" | "alto";
  /** Faixa fechada em minutos por semana; `max: null` = sem teto. */
  min: number;
  max: number | null;
  titulo: string;
  /** Uma frase pra caber no cartão do Hoje. */
  curto: string;
  resumo: string;
  beneficios: string[];
  evidencia: Evidencia;
};

export const FAIXAS_BENEFICIO: FaixaBeneficio[] = [
  {
    id: "zero",
    min: 0,
    max: 0,
    titulo: "Semana zerada",
    curto:
      "Sair do zero é onde o ganho é maior: em quem era inativo, os primeiros ~75 min por semana já aparecem ligados a cerca de 19% menos mortalidade.",
    resumo:
      "Quem era inativo e passou a fazer de 1 a 74 min por semana de atividade de lazer já apareceu com cerca de 19% menos mortalidade por qualquer causa. O primeiro passo vale mais que o último.",
    beneficios: [
      "Caminhada rápida já conta — não precisa começar correndo.",
      "Duas ou três sessões curtas na semana já tiram você do grupo de menor atividade.",
    ],
    evidencia: "forte",
  },
  {
    id: "inicio",
    min: 1,
    max: 149,
    titulo: "Abaixo da recomendação",
    curto:
      "Você já saiu do zero: 1–149 min por semana se associam a ~19% menos mortalidade que ficar parado. A recomendação começa em 150.",
    resumo:
      "Entre 1 e 149 min por semana a associação com menor mortalidade já é clara (~19% vs. inativo), mas ainda abaixo da faixa de 150 min, onde o ganho é maior.",
    beneficios: [
      "Pressão arterial e glicemia já sentem a diferença.",
      "Humor e sono costumam melhorar mesmo em volume baixo.",
      "Faltam poucos minutos pra entrar na faixa recomendada.",
    ],
    evidencia: "forte",
  },
  {
    id: "recomendada",
    min: 150,
    max: 299,
    titulo: "Faixa recomendada",
    curto:
      "Você está na faixa que a OMS recomenda (150–300 min moderado). Aqui a associação com menor mortalidade chega a ~31% vs. inativo.",
    resumo:
      "É a faixa que as diretrizes pedem: 150–300 min por semana de intensidade moderada, ou 75–150 min de intensa, ou a mistura das duas. Nela, a associação com menor mortalidade por qualquer causa fica em torno de 31% comparada a quem é inativo.",
    beneficios: [
      "Coração e pulmão rendem mais: o condicionamento (VO₂máx) sobe de forma consistente.",
      "Pressão de repouso cai, em média, algo como 4–5 mmHg.",
      "Ajuda no humor, nos sintomas de depressão e no controle do açúcar no sangue; o sono costuma melhorar.",
      "Nesse volume, o cardio não atrapalha a hipertrofia quando o treino de força e a proteína estão em dia.",
    ],
    evidencia: "forte",
  },
  {
    id: "acima",
    min: 300,
    max: 449,
    titulo: "Acima da recomendação",
    curto:
      "De 300 a 449 min o ganho em mortalidade é praticamente o mesmo de 150–299. O proveito extra é em condicionamento, não em longevidade.",
    resumo:
      "Em mortalidade, o ganho extra é pequeno: na comparação com inativos, 300–449 min por semana ficou estatisticamente igual a 150–299. O retorno maior aqui é em condicionamento e em fatores de risco.",
    beneficios: [
      "Mais condicionamento e mais gasto calórico.",
      "Ajuda extra em pressão, triglicerídeos e glicemia.",
      "Vale a pena se for algo que você gosta — não é obrigatório pra ter saúde.",
    ],
    evidencia: "moderado",
  },
  {
    id: "alto",
    min: 450,
    max: null,
    titulo: "Volume alto",
    curto:
      "Volume alto: a associação com menor mortalidade segue favorável (~39% vs. inativo), mas o ganho se achata e a recuperação pode pesar.",
    resumo:
      "A associação com mortalidade continua favorável (~39% menos vs. inativo), mas o ganho se achata: em estudos populacionais o benefício tende a estabilizar em volumes altos. Acima disso, o retorno diminui e a recuperação do treino de força pode sofrer.",
    beneficios: [
      "Só sustenta bem quem dorme e come o suficiente.",
      "Corrida de alto volume é a que mais pode interferir no ganho de perna.",
      "Não é preciso chegar aqui pra colher o principal.",
    ],
    evidencia: "moderado",
  },
];

/** Faixa da semana. Sempre retorna uma faixa, mesmo sem registro (minutos = 0). */
export function faixaCardio(minutos: number): FaixaBeneficio {
  const min = Math.max(0, Math.round(Number.isFinite(minutos) ? minutos : 0));
  return (
    FAIXAS_BENEFICIO.find((f) => min >= f.min && (f.max == null || min <= f.max)) ??
    FAIXAS_BENEFICIO[FAIXAS_BENEFICIO.length - 1]!
  );
}

/** "150–299 min/semana" · "450+ min/semana" · "0 min". */
export function rotuloFaixa(f: FaixaBeneficio): string {
  if (f.max == null) return `${f.min}+ min/semana`;
  if (f.max === f.min) return `${f.min} min`;
  return `${f.min}–${f.max} min/semana`;
}

/** Frase curta da faixa atual, pro cartão do Hoje. */
export function beneficioCurto(minutos: number): string {
  return faixaCardio(minutos).curto;
}

export type FonteCardio = { rotulo: string; detalhe: string };

export const FONTES_CARDIO: FonteCardio[] = [
  {
    rotulo: "OMS 2020",
    detalhe:
      "150–300 min por semana de atividade moderada ou 75–150 de intensa (Bull et al., British Journal of Sports Medicine).",
  },
  {
    rotulo: "Arem et al. 2015",
    detalhe:
      "JAMA Internal Medicine, 661 mil adultos: mortalidade vs. inativo ~19% menor com 1–74 min/semana, ~31% com 150–299, ~31% com 300–449 e ~39% com 450+ (atividade de lazer total, não só cardio).",
  },
  {
    rotulo: "Lear et al. 2017",
    detalhe:
      "Lancet (estudo PURE): o ganho em mortalidade se achata em volumes altos de atividade.",
  },
  {
    rotulo: "Lee et al. 2014",
    detalhe:
      "Journal of the American College of Cardiology: correr de 5 a 10 min por dia já aparece associado a menor mortalidade.",
  },
  {
    rotulo: "Edwards et al. 2023",
    detalhe:
      "British Journal of Sports Medicine: exercício aeróbio reduz a pressão arterial de repouso, em média, alguns mmHg.",
  },
  {
    rotulo: "Noetel et al. 2024",
    detalhe:
      "BMJ: exercício — incluindo caminhada e corrida — reduz sintomas de depressão.",
  },
  {
    rotulo: "Petré et al. 2021 / Wilson et al. 2012",
    detalhe:
      "Cardio de volume baixo ou moderado não atrapalha a hipertrofia; volume alto de corrida pode reduzir o ganho de força e massa em perna.",
  },
];

/** Aviso fixo: associação não é garantia individual. */
export const AVISO_BENEFICIOS =
  "Esses números vêm de estudos populacionais com atividade física total: são associação, não garantia individual. O cardio daqui é a parte que você registra. As faixas são referência de saúde geral e não substituem orientação médica.";
