/**
 * Label único de split/estilo: ids internos (full_body, upper_lower, ppl, ppl_upper_lower,
 * hibrido_ppl_ul, hibrido_fb_ul…) nunca aparecem em texto visível.
 */
export const SPLIT_LABEL: Record<string, string> = {
  auto: "Coach escolhe",
  full_body: "Full Body",
  upper_lower: "Upper/Lower",
  ppl: "Push/Pull/Legs",
  push_pull: "Push/Pull",
  bro_split: "Bro split",
  ppl_upper_lower: "Híbrido PPL + Upper/Lower",
  ppl_ul: "Híbrido PPL + Upper/Lower",
  hibrido_ppl_ul: "Híbrido PPL + Upper/Lower",
  hibrido_fb_ul: "Híbrido Full Body + Upper/Lower",
  hibrido: "Híbrido Full Body + Upper/Lower",
};

export function labelSplit(id: string | null | undefined): string {
  if (!id) return SPLIT_LABEL.auto;
  return SPLIT_LABEL[id] ?? id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const IDS_SNAKE = Object.keys(SPLIT_LABEL).filter((k) => k.includes("_")).sort((a, b) => b.length - a.length);
const RE_SNAKE = new RegExp(`\\b(${IDS_SNAKE.join("|")})\\b`, "g");
/** "ppl" sozinho em minúsculo também é id interno; "PPL" (sigla) fica. */
const RE_PPL = /(?<![\p{L}/])ppl(?![\p{L}_])/gu;

/** Troca ids internos por nomes humanos e remove apelidos internos tipo "(FB A/B/C)". */
export function humanizarSplits(texto: string): string {
  return texto
    .replace(RE_SNAKE, (m) => SPLIT_LABEL[m] ?? m)
    .replace(RE_PPL, "Push/Pull/Legs")
    .replace(/\s*\(FB(?:\s+[A-C](?:\/[A-C])*)\)/g, "")
    .replace(/Full Body Full Body/g, "Full Body");
}

/** Detecta id snake_case de split em texto (pra smoke). */
export function temIdSplit(texto: string): boolean {
  RE_SNAKE.lastIndex = 0;
  const r = RE_SNAKE.test(texto) || /(?<![\p{L}/])ppl(?![\p{L}_])/u.test(texto);
  RE_SNAKE.lastIndex = 0;
  return r;
}
