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
  core_antirotacao: {
    setup: ["Base estável", "Pelve neutra"],
    execucao: ["Resista à rotação sem torcer a lombar"],
    erros_comuns: ["Girar o quadril", "Prender a respiração demais"],
    cues: ["Quadril quieto"],
    contraindicacoes: ["Dor lombar aguda"],
  },
};

export function guiaPorPadrao(
  padrao: Padrao,
  exercicioId = "fallback",
): GuiaExecucao {
  const t = TEMPLATES[padrao] ?? {
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
