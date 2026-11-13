/**
 * Escolha de exercícios por evidência de hipertrofia (determinístico, só dados).
 *
 * 1) Nota por exercício: bônus pequeno no ranking do gerador e da troca, quando há estudo
 *    mostrando vantagem (principalmente treinar o músculo alongado).
 * 2) Cobertura por músculo na semana: regiões que um exercício só não pega bem
 *    (cabeça longa do tríceps, reto femoral, posterior na flexão do joelho, parte de cima do peito,
 *    bíceps alongado). Se falta, o gerador troca um exercício redundante ou acrescenta um curto.
 * 3) "Por que esse exercício": uma linha com a vantagem e o estudo, pro plano e pra troca.
 *
 * Estudos conferidos na fonte. Ver docs/selecao-exercicios.md.
 */
import type { Exercicio, GrupoMuscular, Padrao } from "@/lib/domain";
import type { RestricaoKey } from "./restricoes";

export type EstudoId =
  | "maeo_2023_triceps"
  | "maeo_2021_flexora"
  | "kassiano_2023_panturrilha"
  | "pedrosa_2022_extensora"
  | "zabaleta_2021_quadriceps"
  | "chaves_inclinado"
  | "rosca_inclinada_2025"
  | "plotkin_2023_gluteo"
  | "haugen_2023_maquina"
  | "kassiano_2022_variacao";

export type Estudo = { ref: string; achado: string };

export const ESTUDOS: Record<EstudoId, Estudo> = {
  maeo_2023_triceps: {
    ref: "Maeo et al., 2023 (Eur J Sport Sci)",
    achado: "Tríceps treinado com o braço acima da cabeça cresceu mais que com o braço ao lado do corpo, mesmo com menos carga, principalmente a cabeça longa.",
  },
  maeo_2021_flexora: {
    ref: "Maeo et al., 2021 (Med Sci Sports Exerc)",
    achado: "Flexora sentada: +14% no volume do posterior da coxa contra +9% na flexora deitada, em 12 semanas.",
  },
  kassiano_2023_panturrilha: {
    ref: "Kassiano et al., 2023 (J Strength Cond Res)",
    achado: "Panturrilha treinada na parte alongada (calcanhar bem embaixo) cresceu mais que na parte curta do movimento.",
  },
  pedrosa_2022_extensora: {
    ref: "Pedrosa et al., 2022 (Eur J Sport Sci)",
    achado: "Na extensora, o trecho com o joelho mais dobrado (quadríceps alongado) deu mais hipertrofia perto do joelho.",
  },
  zabaleta_2021_quadriceps: {
    ref: "Zabaleta-Korta et al., 2021 (J Sports Sci)",
    achado: "Agachamento e extensora fazem o quadríceps crescer em regiões diferentes; o reto femoral responde pouco só ao agachamento.",
  },
  chaves_inclinado: {
    ref: "Chaves et al. (supino reto × inclinado)",
    achado: "O supino inclinado fez a parte de cima do peito crescer mais que o supino reto.",
  },
  rosca_inclinada_2025: {
    ref: "Int J Sports Med, 2025 (rosca inclinada × Scott)",
    achado: "A rosca inclinada (bíceps alongado) cresceu mais na parte de cima do braço; a Scott, perto do cotovelo.",
  },
  plotkin_2023_gluteo: {
    ref: "Plotkin et al., 2023 (Front Physiol)",
    achado: "Hip thrust e agachamento deram hipertrofia de glúteo parecida; o agachamento ainda fez crescer quadríceps e adutores.",
  },
  haugen_2023_maquina: {
    ref: "Haugen et al., 2023 (BMC Sports Sci Med Rehabil)",
    achado: "Máquina e peso livre deram hipertrofia parecida. Vale o que você executa melhor e consegue levar perto da falha.",
  },
  kassiano_2022_variacao: {
    ref: "Kassiano et al., 2022 (J Strength Cond Res, revisão)",
    achado: "Variar exercício ajuda quando cobre ângulos diferentes; trocar demais ou repetir exercícios iguais atrapalha.",
  },
};

export type Merito = {
  /** Pontos somados ao ranking (0–12). */
  bonus: number;
  /** Vantagem prática, em uma frase curta. */
  vantagem: string;
  estudo?: EstudoId;
};

/** Exercícios com vantagem específica pra hipertrofia (os demais usam a explicação geral). */
export const MERITO: Partial<Record<string, Merito>> = {
  triceps_overhead_cabo: { bonus: 12, vantagem: "Braço acima da cabeça alonga a cabeça longa do tríceps, a maior parte do músculo.", estudo: "maeo_2023_triceps" },
  cadeira_flexora_sentada: { bonus: 12, vantagem: "Sentado, o quadril dobrado deixa o posterior alongado: cresce mais que na flexora deitada.", estudo: "maeo_2021_flexora" },
  mesa_flexora: { bonus: 0, vantagem: "Trabalha o posterior dobrando o joelho, o que o stiff não faz bem. Sentado rende mais, se tiver.", estudo: "maeo_2021_flexora" },
  cadeira_extensora: { bonus: 6, vantagem: "Pega o reto femoral, a parte do quadríceps que o agachamento quase não faz crescer. Capriche no trecho com o joelho dobrado.", estudo: "zabaleta_2021_quadriceps" },
  panturrilha_pe: { bonus: 4, vantagem: "Joelho esticado trabalha o gastrocnêmio. Desça o calcanhar até o fundo: a parte alongada é a que mais rende.", estudo: "kassiano_2023_panturrilha" },
  panturrilha_leg_press: { bonus: 2, vantagem: "Joelho esticado trabalha o gastrocnêmio. Desça o calcanhar até o fundo.", estudo: "kassiano_2023_panturrilha" },
  panturrilha_sentado: { bonus: 0, vantagem: "Joelho dobrado foca o sóleo, a parte de baixo da panturrilha." },
  rosca_inclinada: { bonus: 6, vantagem: "Braço atrás do corpo deixa o bíceps alongado: cresce mais na parte de cima do braço.", estudo: "rosca_inclinada_2025" },
  rosca_scott: { bonus: 0, vantagem: "Foca o bíceps perto do cotovelo. Combina com uma rosca alongada na semana.", estudo: "rosca_inclinada_2025" },
  supino_inclinado_halteres: { bonus: 3, vantagem: "Inclinado trabalha mais a parte de cima do peito.", estudo: "chaves_inclinado" },
  supino_inclinado_maquina: { bonus: 3, vantagem: "Inclinado trabalha mais a parte de cima do peito, com trajetória guiada.", estudo: "chaves_inclinado" },
  supino_inclinado_barra: { bonus: 3, vantagem: "Inclinado trabalha mais a parte de cima do peito.", estudo: "chaves_inclinado" },
  hip_thrust: { bonus: 0, vantagem: "Glúteo com carga alta e pouca exigência da lombar.", estudo: "plotkin_2023_gluteo" },
  hip_thrust_maquina: { bonus: 0, vantagem: "Glúteo com carga alta, trajetória guiada e pouca exigência da lombar.", estudo: "plotkin_2023_gluteo" },
  agachamento_barra: { bonus: 0, vantagem: "Quadríceps, glúteo e adutores no mesmo exercício, com carga alta.", estudo: "plotkin_2023_gluteo" },
  hack_squat: { bonus: 0, vantagem: "Quadríceps e glúteo com carga alta e sem exigir equilíbrio: fácil de ir perto da falha." },
  leg_press: { bonus: 0, vantagem: "Quadríceps e glúteo com carga alta e pouca exigência da lombar." },
  stiff_rdl: { bonus: 0, vantagem: "Posterior e glúteo alongados no quadril: complementa a flexora, que trabalha no joelho." },
  rdl_halteres: { bonus: 0, vantagem: "Posterior e glúteo alongados no quadril: complementa a flexora, que trabalha no joelho." },
  elevacao_lateral_cabo: { bonus: 0, vantagem: "O cabo mantém tensão no deltoide lateral também embaixo, onde o halter alivia." },
  crucifixo_cabo: { bonus: 0, vantagem: "Peito trabalhado aberto (alongado), com tensão do começo ao fim." },
  pec_deck: { bonus: 0, vantagem: "Peito isolado com trajetória guiada: fácil de ir perto da falha sem cansar o tríceps." },
};

export function bonusHipertrofia(id: string): number {
  return MERITO[id]?.bonus ?? 0;
}

export type Porque = { vantagem: string; estudo: Estudo | null };

/** Por que esse exercício: vantagem específica (com estudo) ou a explicação geral do tipo. */
export function porqueDoExercicio(ex: Pick<Exercicio, "id" | "composto" | "equipamento">): Porque {
  const m = MERITO[ex.id];
  if (m) return { vantagem: m.vantagem, estudo: m.estudo ? ESTUDOS[m.estudo] : null };
  if (ex.composto) return { vantagem: "Composto: muito músculo por série e fácil de progredir carga semana a semana.", estudo: null };
  if (ex.equipamento === "maquina" || ex.equipamento === "cabo") {
    return { vantagem: "Isolador guiado: volume direto no músculo, com pouca fadiga extra e fácil de ir perto da falha.", estudo: ESTUDOS.haugen_2023_maquina };
  }
  return { vantagem: "Isolador: volume direto no músculo, com pouca fadiga extra.", estudo: null };
}

/** Só a vantagem específica (com estudo, quando há). null pros exercícios sem nada especial. */
export function porqueEspecifico(id: string): string | null {
  const m = MERITO[id];
  if (!m) return null;
  return m.estudo ? `${m.vantagem} (${refCurta(ESTUDOS[m.estudo])})` : m.vantagem;
}

/** "Maeo et al., 2021" (curto, pra caber numa linha). */
export function refCurta(e: Estudo): string {
  return e.ref.replace(/\s*\(.*\)\s*$/, "");
}

export type RegraCobertura = {
  id: string;
  grupo: GrupoMuscular;
  /** O exercício cumpre a regra. */
  cumpre: (ex: Exercicio) => boolean;
  /** Candidatos que cumprem, em ordem de preferência. */
  preferir: string[];
  /** Padrão dos candidatos (pra respeitar restrições). */
  padrao: Padrao;
  /** Só vale com pelo menos N exercícios do músculo na semana (1 = sempre). */
  minExercicios: number;
  /** Exercícios trocados só em último caso (pegam outra função, ex.: rosca martelo → braquial). */
  poupar?: string[];
  /** Não aplica com essas restrições (ex.: braço acima da cabeça com dor no ombro). */
  naoCom?: RestricaoKey[];
  /** Pode trocar até o primeiro composto do músculo num treino (quando ele aparece em outro treino). */
  trocaComposto: boolean;
  /** Se nada der pra trocar, acrescenta um exercício curto (cabendo no tempo). */
  acrescentar: boolean;
  estudo: EstudoId;
  /** "tríceps acima da cabeça" */
  oQue: string;
};

export const REGRAS_COBERTURA: RegraCobertura[] = [
  {
    id: "triceps_overhead",
    grupo: "triceps",
    cumpre: (e) => e.id === "triceps_overhead_cabo",
    preferir: ["triceps_overhead_cabo"],
    padrao: "extensao_cotovelo",
    naoCom: ["ombro"],
    minExercicios: 1,
    trocaComposto: false,
    acrescentar: false,
    estudo: "maeo_2023_triceps",
    oQue: "tríceps com o braço acima da cabeça",
  },
  {
    id: "quadriceps_extensora",
    grupo: "quadriceps",
    cumpre: (e) => e.padrao === "extensao_joelho",
    preferir: ["cadeira_extensora"],
    padrao: "extensao_joelho",
    minExercicios: 1,
    trocaComposto: false,
    acrescentar: true,
    estudo: "zabaleta_2021_quadriceps",
    oQue: "extensora (reto femoral)",
  },
  {
    id: "posterior_flexao_joelho",
    grupo: "isquiotibiais",
    cumpre: (e) => e.padrao === "flexao_joelho",
    preferir: ["cadeira_flexora_sentada", "mesa_flexora"],
    padrao: "flexao_joelho",
    minExercicios: 1,
    trocaComposto: false,
    acrescentar: true,
    estudo: "maeo_2021_flexora",
    oQue: "flexora (posterior dobrando o joelho)",
  },
  {
    id: "peito_inclinado",
    grupo: "peito",
    cumpre: (e) => e.padrao === "empurrar_inclinado",
    preferir: ["supino_inclinado_halteres", "supino_inclinado_maquina", "supino_inclinado_barra"],
    padrao: "empurrar_inclinado",
    minExercicios: 2,
    trocaComposto: true,
    acrescentar: false,
    estudo: "chaves_inclinado",
    oQue: "supino inclinado (parte de cima do peito)",
  },
  {
    id: "biceps_alongado",
    grupo: "biceps",
    cumpre: (e) => e.id === "rosca_inclinada",
    preferir: ["rosca_inclinada"],
    padrao: "flexao_cotovelo",
    poupar: ["rosca_martelo"],
    minExercicios: 2,
    trocaComposto: false,
    acrescentar: false,
    estudo: "rosca_inclinada_2025",
    oQue: "rosca inclinada (bíceps alongado)",
  },
];
