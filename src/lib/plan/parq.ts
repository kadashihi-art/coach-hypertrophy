/**
 * PAR-Q+ gate (produto): qualquer SIM bloqueia prescrição / sessão.
 * Perguntas clássicas simplificadas em PT-BR (educativo — não substitui ePARmed-X+).
 */

export const PARQ_PERGUNTAS: string[] = [
  "Seu médico já disse que você tem um problema cardíaco e que só deve fazer atividade física recomendada por ele?",
  "Você sente dor no peito quando faz atividade física?",
  "No último mês, você teve dor no peito quando não estava fazendo atividade física?",
  "Você perde o equilíbrio por tontura ou já perdeu a consciência?",
  "Você tem um problema ósseo ou articular que poderia piorar com mudança de atividade física?",
  "Seu médico está prescrito medicamentos para pressão arterial ou para o coração?",
  "Você conhece alguma outra razão pela qual não deveria fazer atividade física?",
];

export type ParqResult = {
  respostas: boolean[];
  liberado: boolean;
  algumSim: boolean;
};

/** true = SIM (risco). All-false → liberado. */
export function avaliarParq(respostas: boolean[]): ParqResult {
  const r = PARQ_PERGUNTAS.map((_, i) => !!respostas[i]);
  while (r.length < PARQ_PERGUNTAS.length) r.push(false);
  const algumSim = r.some(Boolean);
  return { respostas: r.slice(0, PARQ_PERGUNTAS.length), liberado: !algumSim, algumSim };
}

/**
 * Existing users without field: treat as need to answer once.
 * Missing parq_respondido_em / undefined parq_liberado → not answered.
 */
export function precisaResponderParq(perfil: {
  parq_liberado?: boolean;
  parq_respondido_em?: string | null;
  parq_respostas?: boolean[];
} | null | undefined): boolean {
  if (!perfil) return true;
  if (perfil.parq_respondido_em == null || perfil.parq_respondido_em === "") {
    return true;
  }
  return false;
}

export function parqBloqueiaPrescricao(perfil: {
  parq_liberado?: boolean;
  parq_respondido_em?: string | null;
} | null | undefined): boolean {
  if (!perfil) return true;
  if (precisaResponderParq(perfil)) return true;
  return perfil.parq_liberado !== true;
}

export const PARQ_BLOQUEIO_MSG =
  "PAR-Q+: há resposta SIM ou triagem pendente. Não geramos plano nem iniciamos sessão. Procure avaliação profissional (ePARmed-X+ / profissional de saúde).";
