/**
 * T5 fallback: GuiaExecucao curto por padrão quando guia_id ausente.
 * Síntese de research bridge / brief — não falas do Jayme.
 */
import type { GuiaExecucao, Padrao } from "@/lib/domain";

type GuiaTemplate = Omit<GuiaExecucao, "id" | "exercicio_id">;

const TEMPLATES: Partial<Record<Padrao, GuiaTemplate>> = {
  empurrar_horizontal: {
    setup: [
      "Escápulas retraídas e deprimidas",
      "Pés firmes no chão",
      "Pegada estável, um pouco além dos ombros",
    ],
    execucao: [
      "Desça controlado até amplitude confortável",
      "Cotovelos ~45° do tronco",
      "Empurre sem quicar a barra/halter",
    ],
    erros_comuns: [
      "Abrir demais os cotovelos",
      "Perder contato dos pés",
      "Arquear lombar em excesso",
    ],
    cues: ["Peito alto", "Quebre a barra", "Dirija os cotovelos"],
    amplitude: "Toque controlado no peito ou alongamento sem dor",
    respiracao: "Inspira na descida, expira na subida",
    contraindicacoes: ["Dor aguda no ombro anterior"],
  },
  empurrar_inclinado: {
    setup: ["Banco 30–45°", "Escápulas retraídas"],
    execucao: [
      "Desça até alongar o peito superior",
      "Empurre sem perder contato das escápulas",
    ],
    erros_comuns: ["Inclinação excessiva (vira ombro)", "Usar impulso de pernas"],
    cues: ["Peito para o teto"],
    amplitude: "Alongamento do peito superior sem dor no ombro",
    respiracao: "Inspira na descida, expira na subida",
    contraindicacoes: ["Dor no ombro anterior"],
  },
  empurrar_vertical: {
    setup: ["Costelas baixas", "Base/assento estável", "Manoplas na linha dos ombros"],
    execucao: [
      "Empurre até quase extensão sem travar",
      "Desça controlado",
    ],
    erros_comuns: ["Arquear lombar", "Encolher ombros"],
    cues: ["Costelas baixas", "Empurre o chão com os pés"],
    amplitude: "Amplitude que mantém ombro confortável",
    respiracao: "Brace leve; expire na subida",
    contraindicacoes: ["Dor aguda no ombro — preferir máquina/ângulo seguro"],
  },
  puxar_horizontal: {
    setup: ["Tronco estável", "Coluna neutra", "Joelho leve flexão se em pé"],
    execucao: [
      "Puxe cotovelos em direção ao tronco",
      "Retraia escápulas no topo",
      "Desça/solte com controle",
    ],
    erros_comuns: ["Impulso de quadril", "Arredondar lombar"],
    cues: ["Cotovelos para trás", "Peito aberto"],
    amplitude: "Contração completa sem perder neutro lombar",
    respiracao: "Expire na puxada",
    contraindicacoes: ["Dor lombar aguda com flexão"],
  },
  puxar_vertical: {
    setup: ["Pegada estável", "Tronco levemente inclinado"],
    execucao: ["Puxe à clavícula", "Controle a subida/negativa"],
    erros_comuns: ["Puxar atrás da nuca", "Balanço de tronco"],
    cues: ["Cotovelos para baixo", "Peito alto"],
    amplitude: "Barra/pulley à clavícula",
    respiracao: "Expire na puxada",
    contraindicacoes: ["Dor no ombro com elevação"],
  },
  agachamento: {
    setup: [
      "Base ~largura dos ombros",
      "Brace no core",
      "Barra estável nas trapézios (se livre)",
    ],
    execucao: [
      "Quebre quadril e joelho juntos",
      "Profundidade conforme mobilidade e sintomas",
      "Suba empurrando o chão",
    ],
    erros_comuns: [
      "Joelhos caindo para dentro",
      "Calcanhares subindo",
      "Perder brace",
    ],
    cues: ["Peito alto", "Joelhos para fora", "Empurre o chão"],
    amplitude: "Profundidade controlável sem dor; profundidade ≠ lesão automática",
    respiracao: "Brace antes da descida; expire na subida",
    contraindicacoes: ["Dor aguda no joelho ou lombar"],
  },
  dobradica_quadril: {
    setup: ["Soft knees", "Barra próxima às pernas ou pad no quadril"],
    execucao: [
      "Empurre o quadril para trás (RDL) ou estenda com controle (thrust)",
      "Mantenha lombar neutra",
      "Volte contraindo glúteos",
    ],
    erros_comuns: [
      "Arredondar lombar",
      "Hiperextensão no topo do thrust",
      "Dobrar demais os joelhos no RDL",
    ],
    cues: ["Quadril pra trás", "Costelas baixas", "Aperte o glúteo"],
    amplitude: "Alongamento de posteriores sem perder neutro",
    respiracao: "Brace; expire na extensão",
    contraindicacoes: ["Dor lombar aguda"],
  },
  extensao_joelho: {
    setup: ["Assento ajustado; eixo no joelho"],
    execucao: ["Estenda com controle", "Evite travar com impulso"],
    erros_comuns: ["Usar momentum", "Dor anterior no joelho"],
    cues: ["Controle a negativa"],
    contraindicacoes: ["Dor aguda patelar"],
  },
  flexao_joelho: {
    setup: ["Apoio estável; tornozelos fixos"],
    execucao: ["Flexione com controle", "Evite arquear lombar"],
    erros_comuns: ["Impulso de quadril", "Amplitude forçada"],
    cues: ["Aperte o posterior"],
    contraindicacoes: ["Dor aguda no joelho"],
  },
  flexao_plantar: {
    setup: ["Apoio metatarsos; tornozelo alinhado"],
    execucao: ["Suba na ponta; desça alongando"],
    erros_comuns: ["Joelho travado com dor", "Balanço do tronco"],
    cues: ["Empurre o chão"],
    contraindicacoes: ["Dor aguda no tendão de Aquiles"],
  },
  abducao_ombro: {
    setup: ["Leve flexão de cotovelo", "Escápulas estáveis"],
    execucao: ["Eleve até ~paralelo ou amplitude sem dor", "Desça controlado"],
    erros_comuns: ["Subir o ombro à orelha", "Usar impulso"],
    cues: ["Cotovelo soft", "Não encolha"],
    contraindicacoes: ["Dor no ombro com abdução"],
  },
  flexao_cotovelo: {
    setup: ["Cotovelos estáveis ao lado do tronco"],
    execucao: ["Flexione sem balanço", "Negativa controlada"],
    erros_comuns: ["Balanço de tronco", "Abrir cotovelos"],
    cues: ["Cotovelos quietos"],
    contraindicacoes: [],
  },
  extensao_cotovelo: {
    setup: ["Ombros estáveis; cotovelo fixo no padrão escolhido"],
    execucao: ["Estenda sem travar com impulso", "Controle a negativa"],
    erros_comuns: ["Abrir cotovelos", "Dor no cotovelo"],
    cues: ["Cotovelo quieto"],
    contraindicacoes: ["Dor aguda no cotovelo"],
  },
  flexao_ombro: {
    setup: ["Costelas baixas", "Pegada neutra se possível"],
    execucao: ["Eleve com controle", "Evite arquear lombar"],
    erros_comuns: ["Hiperextensão lombar"],
    cues: ["Costelas baixas"],
    contraindicacoes: ["Dor no ombro anterior"],
  },
  rotacao_externa: {
    setup: ["Cotovelo a 90° junto ao corpo"],
    execucao: ["Rotacione sem compensar com tronco"],
    erros_comuns: ["Carga excessiva", "Abrir o cotovelo"],
    cues: ["Cotovelo colado"],
    contraindicacoes: ["Dor aguda no manguito"],
  },
  core_antiextensao: {
    setup: ["Costelas baixas", "Pelve neutra"],
    execucao: ["Resista à extensão; respire sem perder brace"],
    erros_comuns: ["Hiperextender lombar"],
    cues: ["Costelas baixas"],
    contraindicacoes: ["Dor lombar aguda"],
  },
  antebraco_pegada: {
    setup: ["Antebraço apoiado ou braços ao lado do corpo", "Pegada firme, sem dor no punho"],
    execucao: ["Movimento curto e controlado só no punho (ou caminhe com o tronco firme)"],
    erros_comuns: ["Balançar o corpo", "Carga que tira a amplitude"],
    cues: ["Punho trabalha, ombro quieto"],
    contraindicacoes: ["Dor aguda no punho ou cotovelo"],
  },
  abducao_quadril: {
    setup: ["Tronco firme e quadril parado", "Comece com carga leve"],
    execucao: ["Abra a perna (ou as pernas) para o lado de forma controlada", "Volte devagar, sem deixar a carga bater"],
    erros_comuns: ["Balançar o tronco", "Girar o quadril pra roubar amplitude"],
    cues: ["Empurre com a lateral do quadril"],
    contraindicacoes: ["Dor aguda no quadril ou na virilha"],
  },
  aducao_quadril: {
    setup: ["Tronco firme e quadril parado", "Abra só até onde alonga sem dor"],
    execucao: ["Feche as pernas de forma controlada", "Volte devagar até o alongamento"],
    erros_comuns: ["Abrir demais na volta", "Soltar a carga no final"],
    cues: ["Aperte por dentro da coxa"],
    contraindicacoes: ["Dor aguda na virilha (pubalgia)"],
  },
  core_antirotacao: {
    setup: ["Base estável", "Pelve neutra"],
    execucao: ["Resista à rotação sem torcer a lombar"],
    erros_comuns: ["Girar o quadril", "Prender a respiração demais"],
    cues: ["Quadril quieto"],
    contraindicacoes: ["Dor lombar aguda"],
  },
};

/** Guias próprios por exercício (abdutores e adutores). Têm prioridade sobre o guia do padrão. */
const GUIAS_EXERCICIO: Record<string, GuiaTemplate> = {
  cadeira_abdutora: {
    setup: ["Sente com as costas apoiadas e as pernas fechadas nas almofadas", "Segure as alças e ajuste a abertura inicial"],
    execucao: ["Abra as pernas até o máximo confortável", "Segure 1 segundo e volte devagar, sem bater o peso"],
    erros_comuns: ["Jogar o tronco pra frente e pra trás", "Soltar o peso na volta"],
    cues: ["Joelhos empurram pra fora", "Quadril colado no banco"],
    respiracao: "Expira ao abrir, inspira ao fechar",
    contraindicacoes: ["Dor aguda na lateral do quadril (bursite)"],
  },
  cadeira_adutora: {
    setup: ["Sente com as costas apoiadas e as almofadas por dentro dos joelhos", "Comece com abertura menor e aumente nas semanas seguintes"],
    execucao: ["Feche as pernas até as almofadas se encostarem", "Volte devagar até sentir alongar a parte de dentro da coxa"],
    erros_comuns: ["Abrir demais logo no começo", "Usar impulso pra fechar"],
    cues: ["Aperte por dentro da coxa", "Controle a volta"],
    respiracao: "Expira ao fechar, inspira ao abrir",
    contraindicacoes: ["Dor aguda na virilha (pubalgia)"],
  },
  abducao_quadril_polia: {
    setup: ["Tornozeleira na perna de fora, polia baixa", "Fique de lado pra polia, segurando no aparelho"],
    execucao: ["Leve a perna para o lado, longe da polia, com o joelho estendido", "Volte devagar sem deixar o peso bater"],
    erros_comuns: ["Inclinar o tronco pro lado", "Girar o pé pra fora"],
    cues: ["Ponta do pé pra frente", "Tronco reto"],
    contraindicacoes: ["Dor aguda no quadril"],
  },
  aducao_quadril_polia: {
    setup: ["Tornozeleira na perna mais perto da polia, polia baixa", "Base afastada e mão apoiada no aparelho"],
    execucao: ["Puxe a perna pra frente da outra, cruzando um pouco", "Volte devagar até sentir alongar"],
    erros_comuns: ["Girar o quadril", "Usar impulso"],
    cues: ["Coxa puxa por dentro", "Tronco parado"],
    contraindicacoes: ["Dor aguda na virilha (pubalgia)"],
  },
  abducao_deitado_lado: {
    setup: ["Deite de lado, perna de baixo um pouco flexionada", "Quadril empilhado, sem rolar pra trás"],
    execucao: ["Suba a perna de cima reta até uns 30–45°", "Desça devagar, sem encostar na outra"],
    erros_comuns: ["Rolar o quadril pra trás", "Subir alto demais e usar a lombar"],
    cues: ["Calcanhar levemente pra trás", "Ponta do pé pra frente"],
    contraindicacoes: ["Dor aguda na lateral do quadril (bursite)"],
  },
  aducao_deitado_lado: {
    setup: ["Deite de lado e apoie o pé de cima no chão à frente", "Perna de baixo reta"],
    execucao: ["Suba a perna de baixo alguns centímetros", "Segure 1 segundo e desça devagar"],
    erros_comuns: ["Rolar o tronco", "Pressa na descida"],
    cues: ["Aperte por dentro da coxa de baixo"],
    contraindicacoes: ["Dor aguda na virilha (pubalgia)"],
  },
  monster_walk: {
    setup: ["Miniband acima dos joelhos ou nos tornozelos", "Meio agachamento, tronco levemente à frente"],
    execucao: ["Dê passos curtos para o lado (ou na diagonal) sem juntar os pés", "Mantenha a tensão no elástico o tempo todo"],
    erros_comuns: ["Joelhos caindo pra dentro", "Subir e descer o corpo a cada passo"],
    cues: ["Joelhos pra fora", "Altura do quadril constante"],
    contraindicacoes: ["Dor aguda no joelho ou no quadril"],
  },
  fire_hydrant: {
    setup: ["Quatro apoios, mãos embaixo dos ombros e joelhos embaixo do quadril", "Miniband acima dos joelhos"],
    execucao: ["Abra uma perna para o lado com o joelho dobrado", "Volte devagar e repita do outro lado"],
    erros_comuns: ["Girar o tronco junto", "Arquear a lombar"],
    cues: ["Tronco parado, só o quadril abre"],
    contraindicacoes: ["Dor aguda no quadril ou no punho"],
  },
  abducao_sentado_miniband: {
    setup: ["Sente na ponta do banco com a miniband acima dos joelhos", "Pés no chão, um pouco afastados"],
    execucao: ["Abra os joelhos contra o elástico", "Segure 1 segundo e feche devagar"],
    erros_comuns: ["Fechar rápido demais", "Tirar os pés do chão"],
    cues: ["Joelhos pra fora"],
    contraindicacoes: ["Dor aguda na lateral do quadril"],
  },
  copenhagen_plank: {
    setup: ["Prancha lateral com a perna de cima apoiada no banco (joelho ou pé)", "Comece com o joelho apoiado, que é mais leve"],
    execucao: ["Suba o quadril até o corpo ficar reto", "Segure o tempo combinado ou suba e desça devagar"],
    erros_comuns: ["Deixar o quadril cair", "Começar já com o pé apoiado"],
    cues: ["Perna de cima aperta o banco", "Quadril alto"],
    respiracao: "Respire curto, sem prender o ar",
    contraindicacoes: ["Dor aguda na virilha ou no joelho", "Dor no ombro de apoio"],
  },
  agachamento_sumo_adutores: {
    setup: ["Pés bem afastados e pontas viradas pra fora", "Halter seguro na frente do corpo, com as duas mãos"],
    execucao: ["Desça com os joelhos seguindo a direção dos pés", "Suba apertando por dentro das coxas"],
    erros_comuns: ["Joelhos caindo pra dentro", "Tronco despencando à frente"],
    cues: ["Joelhos pra fora", "Peito alto"],
    respiracao: "Inspira na descida, expira na subida",
    contraindicacoes: ["Dor aguda na virilha ou no joelho"],
  },
};

export function guiaPorPadrao(
  padrao: Padrao,
  exercicioId = "fallback",
): GuiaExecucao {
  const t = GUIAS_EXERCICIO[exercicioId] ?? TEMPLATES[padrao] ?? {
    setup: ["Posição estável", "Amplitude controlável"],
    execucao: ["Movimento controlado", "Pare se houver dor aguda"],
    erros_comuns: ["Usar impulso", "Perder alinhamento"],
    cues: ["Controle", "Brace"],
    contraindicacoes: ["Dor aguda"],
  };
  return {
    id: `guia_padrao_${padrao}`,
    exercicio_id: exercicioId,
    setup: t.setup ?? [],
    execucao: t.execucao ?? [],
    erros_comuns: t.erros_comuns ?? [],
    cues: t.cues ?? [],
    amplitude: t.amplitude,
    respiracao: t.respiracao,
    contraindicacoes: t.contraindicacoes ?? [],
  };
}
