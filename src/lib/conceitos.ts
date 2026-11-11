/**
 * Conceitos técnicos explicados na prática (RM, RIR, série válida, aquecimento, top/back-off…).
 * Texto fixo + exemplo montado com os números do próprio usuário quando existem.
 * Só leitura e determinístico: não muda carga, reps nem RIR.
 */

export type ConceitoId =
  | "rir"
  | "rm"
  | "serie_valida"
  | "aquecimento"
  | "aproximacao"
  | "top_backoff"
  | "volume"
  | "falha"
  | "progressao"
  | "deload";

export type Conceito = {
  id: ConceitoId;
  termo: string;
  /** Uma linha: o que é. */
  curto: string;
  /** Como funciona na prática (2–4 frases curtas). */
  pratica: string[];
  /** Como o app usa isso. */
  no_app: string;
};

export const CONCEITOS: Record<ConceitoId, Conceito> = {
  rir: {
    id: "rir",
    termo: "RIR (reps em reserva)",
    curto: "Quantas repetições ainda sairiam com boa técnica quando você parou a série.",
    pratica: [
      "RIR 0: não sairia mais nenhuma. RIR 2: você pararia sabendo que ainda fazia mais 2.",
      "Pra medir: no fim da série, pergunte \"se alguém me pagasse, quantas mais eu fazia sem roubar?\".",
      "Quem está começando costuma achar que estava mais longe da falha do que estava. Com o tempo isso fica preciso.",
    ],
    no_app: "Cada série tem um RIR alvo. Eu comparo o que você marcou com a queda de reps entre as séries e corrijo a leitura quando a diferença é grande.",
  },
  rm: {
    id: "rm",
    termo: "RM (repetição máxima)",
    curto: "O peso mais pesado que você consegue levantar um certo número de vezes, até a falha.",
    pratica: [
      "1RM é o peso que você levanta 1 vez só. 10RM é o peso que você levanta 10 vezes e não faz a 11ª.",
      "Ninguém precisa testar o 1RM: dá pra estimar pelas séries normais (e1RM). Ex.: 80 kg × 10 até a falha ≈ 107 kg de 1RM.",
      "Quanto mais perto do 1RM, menos reps: ~75% do 1RM dá umas 10 reps; ~85%, umas 5 ou 6.",
    ],
    no_app: "Eu calculo o seu e1RM em cada exercício a partir das séries (reps + RIR). É o que mostra se você ficou mais forte mesmo quando a carga não mudou.",
  },
  serie_valida: {
    id: "serie_valida",
    termo: "Série válida",
    curto: "Uma série que termina perto da falha (0 a 3 reps sobrando) com boa técnica. Só essas contam como volume.",
    pratica: [
      "Vale com carga leve ou pesada (de ~5 a ~30 reps), desde que chegue perto da falha.",
      "Uma série que para com 5+ reps sobrando rende bem menos pra crescer: é quase um aquecimento.",
      "Aquecimento e aproximação nunca contam.",
    ],
    no_app: "Seu plano só conta séries de trabalho (top e back-offs). No Progresso você vê quantas da semana ficaram perto da falha.",
  },
  aquecimento: {
    id: "aquecimento",
    termo: "Aquecimento",
    curto: "Séries leves (~60% da carga do dia) pra preparar articulação e músculo.",
    pratica: [
      "Faz 8 reps soltas, sem cansar. Não conta como volume.",
      "Só o primeiro exercício de cada músculo precisa. Se o músculo já trabalhou no exercício anterior, vai direto pras séries que valem.",
    ],
    no_app: "Eu marco \"aquece + aproximação\" só onde precisa e já deixo a carga pronta.",
  },
  aproximacao: {
    id: "aproximacao",
    termo: "Aproximação",
    curto: "1 série curta (~3 reps) com ~85% da carga do top, pra sentir o peso antes da série pesada.",
    pratica: [
      "Prepara o sistema nervoso e confirma se a carga de hoje está certa, sem gastar energia.",
      "Num composto livre de movimento novo (ex.: stiff depois do agachamento), faço só 1 aproximação, mesmo com o músculo já quente.",
    ],
    no_app: "A aproximação aparece antes do top quando faz sentido. Não conta como volume.",
  },
  top_backoff: {
    id: "top_backoff",
    termo: "Top set e back-off",
    curto: "Top: a série mais pesada do dia, no RIR alvo. Back-offs: ~10% mais leves, no MESMO RIR, saindo com mais reps.",
    pratica: [
      "Ex.: top 100 kg × 8 (RIR 2) → back-offs 90 kg × 10 (RIR 2).",
      "Todas valem: o back-off mais leve continua perto da falha, só com mais reps.",
      "A progressão de carga é decidida pelo top.",
    ],
    no_app: "Depois do top eu já sugiro a carga e as reps do back-off a partir do que você fez.",
  },
  volume: {
    id: "volume",
    termo: "Volume semanal",
    curto: "Quantas séries válidas cada músculo recebe na semana.",
    pratica: [
      "Pra natural, 10 a 20 séries por músculo por semana é a faixa que mais rende. Acima de 20, o ganho extra é pequeno e a recuperação pesa.",
      "Exercício que trabalha o músculo de forma secundária conta meia série (ex.: supino conta meia pra tríceps).",
      "Mais de ~10 séries do mesmo músculo num treino só rende pouco: melhor dividir na semana.",
    ],
    no_app: "O plano fica entre 10 e 20 por músculo e no máximo 10 por treino. Músculo prioritário ganha até +4.",
  },
  falha: {
    id: "falha",
    termo: "Falha",
    curto: "O ponto em que a próxima repetição não sai com boa técnica.",
    pratica: [
      "Ir à falha toda série não faz crescer mais do que parar a 1–2 reps dela, e cansa muito mais.",
      "Em isoladores e máquinas dá pra chegar perto com segurança. Em composto livre pesado, deixe 1–2 reps.",
    ],
    no_app: "O RIR alvo já leva o tipo de exercício em conta (livre, máquina ou isolador).",
  },
  progressao: {
    id: "progressao",
    termo: "Progressão",
    curto: "Fazer um pouco mais com o tempo: mais reps na mesma carga e, quando bater o topo da faixa, mais carga.",
    pratica: [
      "Ex.: faixa 8–12. Fez 12 no RIR certo? Sobe a carga e volta pra perto de 8.",
      "Não subiu? Repete a carga e busca 1 rep a mais. Travou várias vezes? Aí entra um ajuste.",
    ],
    no_app: "Quem decide a carga de cada treino são regras fixas a partir do que você registrou, não um palpite.",
  },
  deload: {
    id: "deload",
    termo: "Deload",
    curto: "Semana mais leve (menos esforço, RIR 3) pra recuperar e voltar mais forte.",
    pratica: [
      "Não é parar: é treinar com folga. A fadiga acumulada some e a força aparece.",
      "No app ela vem na última semana do bloco. Se o check-in do dia mostrar recuperação ruim, só o treino daquele dia fica mais leve.",
    ],
    no_app: "Na semana de deload o RIR alvo vira 3 em tudo.",
  },
};

export const ORDEM_CONCEITOS: ConceitoId[] = [
  "rir",
  "rm",
  "serie_valida",
  "falha",
  "aquecimento",
  "aproximacao",
  "top_backoff",
  "volume",
  "progressao",
  "deload",
];

/** Dados do usuário pra montar o exemplo (todos opcionais). */
export type ContextoExemplo = {
  exercicio?: string | null;
  carga_kg?: number | null;
  reps?: number | null;
  rir_alvo?: number | null;
  e1rm_kg?: number | null;
};

const kg = (n: number) => `${(Math.round(n * 2) / 2).toString().replace(".", ",")} kg`;

/** Reps máximas aproximadas numa carga, pelo 1RM (Epley invertido). */
export function repsMaxNaCarga(e1rm: number, carga: number): number {
  if (!(e1rm > 0) || !(carga > 0) || carga >= e1rm) return 1;
  return Math.max(1, Math.round(30 * (e1rm / carga - 1)));
}

/** Carga aproximada pra um nRM, a partir do 1RM (Epley). */
export function cargaParaRM(e1rm: number, reps: number): number {
  return e1rm / (1 + reps / 30);
}

/** Exemplo com os números do usuário (null quando falta dado). */
export function exemploPessoal(id: ConceitoId, c: ContextoExemplo): string | null {
  const ex = c.exercicio ?? "esse exercício";
  if (id === "rir" && c.carga_kg && c.reps && c.rir_alvo != null) {
    return `Hoje no ${ex}: ${kg(c.carga_kg)} × ${c.reps} com RIR ${c.rir_alvo} quer dizer parar na ${c.reps}ª sabendo que ainda sairiam mais ${c.rir_alvo}, ou seja, umas ${c.reps + c.rir_alvo} no total.`;
  }
  if (id === "rm" && c.e1rm_kg && c.e1rm_kg > 0) {
    const r10 = cargaParaRM(c.e1rm_kg, 10);
    const r6 = cargaParaRM(c.e1rm_kg, 6);
    return `Seu 1RM estimado no ${ex} é ~${kg(c.e1rm_kg)}. Então seu 10RM fica perto de ${kg(r10)} e o 6RM perto de ${kg(r6)}.`;
  }
  if (id === "top_backoff" && c.carga_kg && c.reps) {
    const back = c.carga_kg * 0.9;
    return `No ${ex}: top ${kg(c.carga_kg)} × ${c.reps}, depois back-offs perto de ${kg(back)} buscando ~${c.reps + 2} reps no mesmo RIR.`;
  }
  if (id === "serie_valida" && c.e1rm_kg && c.carga_kg && c.reps) {
    const max = repsMaxNaCarga(c.e1rm_kg, c.carga_kg);
    const sobra = Math.max(0, max - c.reps);
    return `No ${ex}, com ${kg(c.carga_kg)} você faz umas ${max} reps no máximo. Parando em ${c.reps}, sobram ~${sobra}: ${sobra <= 3 ? "série válida." : "longe demais da falha pra contar bem."}`;
  }
  if (id === "aquecimento" && c.carga_kg) {
    return `No ${ex}, o aquecimento fica perto de ${kg(c.carga_kg * 0.6)} por 8 reps.`;
  }
  if (id === "aproximacao" && c.carga_kg) {
    return `No ${ex}, a aproximação fica perto de ${kg(c.carga_kg * 0.85)} por 3 reps.`;
  }
  return null;
}

/** Contexto pessoal pra página de conceitos: o exercício mais recente com e1RM. */
export function contextoPessoal(state: {
  estados: { exercicio_id: string; e1rm_estimado_kg: number; ultima_sessao_em?: string | null; alvo_proxima_sessao: { carga_kg: number; faixa_reps: [number, number] | number[]; rir_alvo: number } }[];
  exercicios: { id: string; nome: string }[];
}): ContextoExemplo {
  const est = [...state.estados]
    .filter((e) => e.e1rm_estimado_kg > 0 && e.alvo_proxima_sessao.carga_kg > 0)
    .sort((a, b) => (b.ultima_sessao_em ?? "").localeCompare(a.ultima_sessao_em ?? ""))[0];
  if (!est) return {};
  return {
    exercicio: state.exercicios.find((e) => e.id === est.exercicio_id)?.nome ?? null,
    carga_kg: est.alvo_proxima_sessao.carga_kg,
    reps: est.alvo_proxima_sessao.faixa_reps[0],
    rir_alvo: est.alvo_proxima_sessao.rir_alvo,
    e1rm_kg: est.e1rm_estimado_kg,
  };
}
