/**
 * Labels de exibição com acento. NÃO altera enums/ids persistidos:
 * só traduz o valor salvo (ex.: "intermediario") para o texto mostrado.
 */
export const GRUPO_LABEL: Record<string, string> = {
  peito: "Peito", costas: "Costas", ombros: "Ombros", quadriceps: "Quadríceps",
  isquiotibiais: "Isquiotibiais", gluteos: "Glúteos", panturrilha: "Panturrilha",
  panturrilhas: "Panturrilhas", biceps: "Bíceps", triceps: "Tríceps", abdomen: "Abdômen",
  core: "Core", trapezio: "Trapézio", antebraco: "Antebraço", lombar: "Lombar",
};
export const EXP_LABEL_TXT: Record<string, string> = {
  iniciante: "iniciante", intermediario: "intermediário", avancado: "avançado",
};
export const OBJETIVO_LABEL: Record<string, string> = {
  hipertrofia: "hipertrofia", forca: "força", recomposicao: "recomposição", saude: "saúde",
};
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
  return t.replace(RE, (m) => {
    const r = TROCAS[m.toLowerCase()];
    if (!r) return m;
    if (m === m.toUpperCase() && m.length > 1) return r.toUpperCase();
    return m[0] === m[0].toUpperCase() ? r[0].toUpperCase() + r.slice(1) : r;
  });
}
