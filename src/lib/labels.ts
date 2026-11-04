/**
 * Labels de exibição com acento. NÃO altera enums/ids persistidos:
 * só traduz o valor salvo (ex.: "intermediario") para o texto mostrado.
 */
export const GRUPO_LABEL: Record<string, string> = {
  peito: "Peito", costas: "Costas", ombros: "Ombros", quadriceps: "Quadríceps",
  isquiotibiais: "Isquiotibiais", gluteos: "Glúteos", panturrilha: "Panturrilha",
  panturrilhas: "Panturrilhas", biceps: "Bíceps", triceps: "Tríceps", abdomen: "Abdômen",
  core: "Core", trapezio: "Trapézio", antebraco: "Antebraço", antebracos: "Antebraço", lombar: "Lombar",
};
export const EXP_LABEL_TXT: Record<string, string> = {
  iniciante: "iniciante", intermediario: "intermediário", avancado: "avançado",
};
export const OBJETIVO_LABEL: Record<string, string> = {
  hipertrofia: "hipertrofia", forca: "força", recomposicao: "recomposição", saude: "saúde",
};
/** Decisão do Coach por exercício, em texto de gente (sem enum). */
export const ACAO_LABEL: Record<string, string> = {
  subir_carga: "Subiu a carga",
  manter_carga: "Manteve a carga",
  manter_e_checar: "Manteve e observa",
  reduzir_carga: "Baixou a carga",
  suspender: "Pausou o exercício",
  deload: "Semana leve",
};
export function labelAcao(a: string): string {
  return ACAO_LABEL[a] ?? a.replace(/_/g, " ");
}

export const EQUIP_LABEL: Record<string, string> = { maquina: "máquina" };

export function labelGrupo(g: string): string {
  return GRUPO_LABEL[g] ?? g.replace(/_/g, " ");
}
export function labelExp(e?: string | null): string {
  return e ? EXP_LABEL_TXT[e] ?? e : "";
}
export function labelObjetivo(o?: string | null): string {
  return o ? OBJETIVO_LABEL[o] ?? o : "";
}

const TROCAS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(GRUPO_LABEL).filter(([k, v]) => k !== v.toLowerCase()).map(([k, v]) => [k, v.toLowerCase()])),
  ...EXP_LABEL_TXT, ...EQUIP_LABEL,
  forca: "força", recomposicao: "recomposição", saude: "saúde",
  musculo: "músculo", musculos: "músculos", series: "séries", sessao: "sessão", sessoes: "sessões",
  exercicio: "exercício", exercicios: "exercícios", frequencia: "frequência", nivel: "nível",
  recuperacao: "recuperação", progressao: "progressão", tecnica: "técnica",
};
const RE = new RegExp(String.raw`(?<![\p{L}_])(${Object.keys(TROCAS).join("|")})(?![\p{L}_])`, "giu");

/** Acentua palavras-enum soltas em texto de exibição (racional salvo, saída do LLM). Ignora ids com "_". */
export function acentuar(t: string): string {
  return t.replace(/ e primeira_sessao=true para calibrar/g, ", e a primeira sessão serve para calibrar").replace(/(?<![\p{L}_])peso_corporal(?![\p{L}_])/gu, "peso do corpo").replace(RE, (m) => {
    const r = TROCAS[m.toLowerCase()];
    if (!r) return m;
    if (m === m.toUpperCase() && m.length > 1) return r.toUpperCase();
    return m[0] === m[0].toUpperCase() ? r[0].toUpperCase() + r.slice(1) : r;
  });
}

/** 32.5 → "32,5" (decimal com vírgula, pt-BR) */
export function fmtKg(n: number): string {
  return String(n).replace(".", ",");
}

/** Equipamento salvo → rótulo de tela. */
export const EQUIPAMENTO_LABEL: Record<string, string> = {
  barra: "barra", halteres: "halteres", maquina: "máquina", cabo: "cabo", peso_corporal: "peso do corpo",
  banco: "banco", rack: "rack", elastico: "elástico", kettlebell: "kettlebell", outros: "outros",
};
export function labelEquipamento(e: string): string {
  return EQUIPAMENTO_LABEL[e] ?? e.replace(/_/g, " ");
}
/** Foco do mesociclo → rótulo de tela. */
export const FOCO_LABEL: Record<string, string> = {
  acumulo: "Acúmulo", intensificacao: "Intensificação", realizacao: "Realização", deload: "Semana leve",
  manutencao: "Manutenção", adaptacao: "Adaptação", recuperacao: "Recuperação", hipertrofia: "Hipertrofia", forca: "Força",
};
export function labelFoco(f?: string | null): string {
  if (!f) return "";
  return FOCO_LABEL[f] ?? acentuar(f.replace(/_/g, " "));
}
