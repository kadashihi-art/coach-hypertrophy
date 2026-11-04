import type { Equipamento, Exercicio, RegistroSerie } from "@/lib/domain";
import { ehSeriePreparatoria } from "@/lib/domain";

/**
 * Lote 3: variações dos principais exercícios.
 * Cada variação herda padrão e músculos do exercício-base (`base_id`), então entra
 * no mesmo cálculo de volume e nas mesmas alternativas. Como tem id próprio, a
 * memória de carga (registros/estado) é própria — sem misturar o leg press 45° com o articulado.
 * O gerador de plano não escolhe variações sozinho: elas só entram quando o usuário troca ou adiciona.
 */
type Def = {
  id: string;
  base: string;
  nome: string;
  variacao: string;
  equipamento?: Equipamento;
  unilateral?: boolean;
};

const DEFS: Def[] = [
  // Quadríceps
  { id: "leg_press_45", base: "leg_press", nome: "Leg press 45°", variacao: "45°" },
  { id: "leg_press_horizontal", base: "leg_press", nome: "Leg press horizontal (90°)", variacao: "horizontal 90°" },
  { id: "leg_press_articulado", base: "leg_press", nome: "Leg press articulado", variacao: "articulado" },
  { id: "leg_press_unilateral", base: "leg_press", nome: "Leg press unilateral", variacao: "unilateral", unilateral: true },
  { id: "agachamento_smith", base: "agachamento_barra", nome: "Agachamento no Smith", variacao: "Smith", equipamento: "maquina" },
  { id: "agachamento_frontal", base: "agachamento_barra", nome: "Agachamento frontal", variacao: "frontal" },
  { id: "hack_squat_articulado", base: "hack_squat", nome: "Hack articulado", variacao: "articulado" },
  { id: "cadeira_extensora_unilateral", base: "cadeira_extensora", nome: "Cadeira extensora unilateral", variacao: "unilateral", unilateral: true },
  // Isquiotibiais / glúteos
  { id: "mesa_flexora_unilateral", base: "mesa_flexora", nome: "Mesa flexora unilateral", variacao: "unilateral", unilateral: true },
  { id: "stiff_smith", base: "stiff_rdl", nome: "Stiff no Smith", variacao: "Smith", equipamento: "maquina" },
  { id: "hip_thrust_smith", base: "hip_thrust", nome: "Hip thrust no Smith", variacao: "Smith", equipamento: "maquina" },
  // Peito
  { id: "supino_reto_smith", base: "supino_reto_convencional", nome: "Supino reto no Smith", variacao: "Smith", equipamento: "maquina" },
  { id: "supino_reto_articulado", base: "supino_reto_convencional", nome: "Supino reto articulado", variacao: "articulado", equipamento: "maquina" },
  { id: "supino_inclinado_smith", base: "supino_inclinado_barra", nome: "Supino inclinado no Smith", variacao: "Smith", equipamento: "maquina" },
  { id: "crossover_polia_alta", base: "crucifixo_cabo", nome: "Crossover polia alta", variacao: "polia alta" },
  { id: "crossover_polia_baixa", base: "crucifixo_cabo", nome: "Crossover polia baixa", variacao: "polia baixa" },
  // Costas
  { id: "remada_curvada_supinada", base: "remada_curvada", nome: "Remada curvada supinada", variacao: "pegada supinada" },
  { id: "remada_cavalinho", base: "remada_curvada", nome: "Remada cavalinho", variacao: "cavalinho" },
  { id: "remada_baixa_triangulo", base: "remada_cabo", nome: "Remada baixa com triângulo", variacao: "triângulo" },
  { id: "remada_baixa_aberta", base: "remada_cabo", nome: "Remada baixa pegada aberta", variacao: "pegada aberta" },
  { id: "puxada_supinada", base: "puxada_frontal", nome: "Puxada supinada", variacao: "pegada supinada" },
  { id: "puxada_unilateral_cabo", base: "puxada_frontal", nome: "Puxada unilateral no cabo", variacao: "unilateral", unilateral: true },
  // Ombros
  { id: "desenvolvimento_smith", base: "desenvolvimento_maquina", nome: "Desenvolvimento no Smith", variacao: "Smith" },
  { id: "elevacao_lateral_unilateral", base: "elevacao_lateral", nome: "Elevação lateral unilateral", variacao: "unilateral", unilateral: true },
  // Braços
  { id: "rosca_barra_w", base: "rosca_direta", nome: "Rosca na barra W", variacao: "barra W" },
  { id: "rosca_alternada", base: "rosca_direta", nome: "Rosca alternada com halteres", variacao: "alternada", equipamento: "halteres" },
  { id: "triceps_barra_v", base: "triceps_pulley", nome: "Tríceps na barra V", variacao: "barra V" },
  // Abdômen
  { id: "prancha_joelhos", base: "prancha", nome: "Prancha com joelhos apoiados", variacao: "joelhos apoiados" },
  { id: "abdominal_polia_ajoelhado", base: "abdominal_cabo", nome: "Abdominal na polia ajoelhado", variacao: "ajoelhado" },
  { id: "elevacao_pernas_barra", base: "elevacao_pernas", nome: "Elevação de pernas na barra fixa", variacao: "suspenso na barra" },
  { id: "elevacao_joelhos_paralela", base: "elevacao_pernas", nome: "Elevação de joelhos na paralela", variacao: "na paralela" },
  // Antebraço
  { id: "rosca_punho_barra", base: "rosca_punho", nome: "Rosca punho com barra", variacao: "barra", equipamento: "barra" },
  { id: "rosca_punho_cabo", base: "rosca_punho", nome: "Rosca punho no cabo", variacao: "cabo", equipamento: "cabo" },
  { id: "rosca_inversa_w", base: "rosca_inversa", nome: "Rosca inversa na barra W", variacao: "barra W" },
  { id: "rosca_inversa_cabo", base: "rosca_inversa", nome: "Rosca inversa no cabo", variacao: "cabo", equipamento: "cabo" },
  { id: "farmer_walk_kettlebell", base: "farmer_walk", nome: "Farmer walk com kettlebell", variacao: "kettlebell", equipamento: "kettlebell" },
  // Panturrilhas
  { id: "panturrilha_smith", base: "panturrilha_pe", nome: "Panturrilha em pé no Smith", variacao: "Smith", equipamento: "maquina" },
];

export function gerarVariacoes(bases: Exercicio[]): Exercicio[] {
  const porId = new Map(bases.map((e) => [e.id, e]));
  const out: Exercicio[] = [];
  for (const d of DEFS) {
    const b = porId.get(d.base);
    if (!b) continue;
    out.push({
      id: d.id,
      nome: d.nome,
      padrao: b.padrao,
      grupo_primario: b.grupo_primario,
      grupos_secundarios: [...b.grupos_secundarios],
      equipamento: d.equipamento ?? b.equipamento,
      composto: b.composto,
      unilateral: d.unilateral ?? b.unilateral,
      ...(b.guia_id ? { guia_id: b.guia_id } : {}),
      base_id: b.id,
      variacao: d.variacao,
    });
  }
  return out;
}

export const VARIACOES_DEFS = DEFS;

/** Exercícios ligados (base + variações irmãs), base primeiro. */
export function familiaDoExercicio(id: string, catalog: Exercicio[]): Exercicio[] {
  const ex = catalog.find((e) => e.id === id);
  if (!ex) return [];
  const baseId = ex.base_id ?? ex.id;
  return catalog.filter((e) => e.id === baseId || e.base_id === baseId);
}

export function ehVariacao(e: Pick<Exercicio, "base_id">): boolean {
  return Boolean(e.base_id);
}

/** Texto humano da variação + memória de carga própria (sem ids). Lê só séries de trabalho registradas. */
export function infoVariacao(
  ex: Exercicio,
  catalog: Exercicio[],
  registros: Pick<RegistroSerie, "exercicio_id" | "carga_kg" | "tipo_serie" | "executado_em">[] = [],
): string | null {
  const partes: string[] = [];
  if (ex.base_id) {
    const base = catalog.find((e) => e.id === ex.base_id);
    if (base) partes.push(`variação de ${base.nome.charAt(0).toLowerCase()}${base.nome.slice(1)}`);
  } else if (catalog.some((e) => e.base_id === ex.id)) {
    partes.push("tem variações");
  }
  const meus = registros
    .filter((r) => r.exercicio_id === ex.id && !ehSeriePreparatoria(r.tipo_serie) && r.carga_kg > 0)
    .sort((a, b) => b.executado_em.localeCompare(a.executado_em));
  if (meus.length) {
    const kg = meus[0]!.carga_kg;
    const t = Number.isInteger(kg) ? String(kg) : kg.toFixed(1).replace(".", ",");
    partes.push(`última vez aqui: ${t} kg`);
  }
  if (!partes.length) return null;
  const t = partes.join(" · ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
