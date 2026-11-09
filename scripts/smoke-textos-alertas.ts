/** Smoke textos-alertas: nenhum texto visível de alerta/aviso com id, N1/N2, "(s)", "motor" ou músculo sem acento. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { apresentarAlerta, textoLimpo } from "../src/lib/alertas/apresentar";
import { avaliarAlertasVolume } from "../src/lib/engine/alertas-volume";
import { avaliarCheckinDeload, resumoAjusteDeload } from "../src/lib/engine/checkin-deload";
import { adaptarAposSerie } from "../src/lib/engine/adaptacao-ao-vivo";
import { PARQ_BLOQUEIO_MSG } from "../src/lib/plan/parq";
import { GRUPO_LABEL } from "../src/lib/labels";
import type { Exercicio, Prescricao, RegistroSerie } from "../src/lib/domain";

let falhas = 0;
function ok(c: boolean, m: string) {
  console.log(c ? "✓" : "✗", m);
  if (!c) { falhas++; process.exitCode = 1; }
}
const SEM_ACENTO = Object.entries(GRUPO_LABEL)
  .filter(([k, v]) => k !== v.toLowerCase())
  .map(([k]) => k);
const RE_SEM_ACENTO = new RegExp(String.raw`(?<![\p{L}_])(${SEM_ACENTO.join("|")})(?![\p{L}_])`, "iu");
export function problemas(t: string): string[] {
  const out: string[] = [];
  if (/\w+:\d{4}-W\d+/.test(t)) out.push("id de semana");
  if (/\bN[0-2]\b/.test(t)) out.push("N0/N1/N2");
  if (/\(s\)|\(es\)/.test(t)) out.push("plural (s)");
  if (/\bmotor\b/i.test(t)) out.push("motor");
  if (RE_SEM_ACENTO.test(t)) out.push("músculo sem acento");
  if (/\bR(?:1[0-2]|[1-9])\b/.test(t)) out.push("código de regra");
  if (/\b[a-z]+_[a-z_]+\b/.test(t)) out.push("id snake_case");
  return out;
}
function checar(rotulo: string, t: string | undefined | null) {
  if (!t) return;
  const p = problemas(t);
  ok(p.length === 0, `${rotulo}: "${t}"${p.length ? " → " + p.join(", ") : ""}`);
}
function checarAp(rotulo: string, a: { nivel: string; motivo: string; recomendacao: string }) {
  const ap = apresentarAlerta(a);
  checar(`${rotulo} título`, ap.titulo);
  checar(`${rotulo} porquê`, ap.porque);
  checar(`${rotulo} dica`, ap.dica);
  checar(`${rotulo} ação`, ap.acao?.rotulo);
  return ap;
}

// 1) Exemplo real (texto antigo salvo no estado do iury)
const legado = checarAp("legado R10", {
  nivel: "N1",
  motivo: "[R10:quadriceps:2026-W45] Volume efetivo de quadriceps abaixo de 10 por 2 semanas (7 → 5 séries).",
  recomendacao: "Adicionar 2 série(s) no grupo quadriceps nas próximas sessões.",
});
ok(legado.titulo === "Quadríceps com pouco volume", "título legado R10");
ok(legado.porque.includes("7 e depois 5 séries"), "porquê cita 7 → 5");
ok(legado.urgencia === "atencao", "urgência atenção");

// 2) Alertas de volume gerados agora, todos os músculos
const grupos = Object.keys(GRUPO_LABEL) as never[];
const vols = grupos.flatMap((g) => [
  { grupo: g, semana_iso: "2026-W45", series_efetivas: 7, series_diretas: 7, series_indiretas: 0 },
  { grupo: g, semana_iso: "2026-W46", series_efetivas: 1, series_diretas: 1, series_indiretas: 0 },
]);
const vAlto = grupos.map((g) => ({ grupo: g, semana_iso: "2026-W45", series_efetivas: 24, series_diretas: 24, series_indiretas: 0 }));
const r10 = avaliarAlertasVolume({ volumes_semanais: vols as never, semana_iso: "2026-W47", inicio: "2026-11-02" });
const r11 = avaliarAlertasVolume({ volumes_semanais: vAlto as never, semana_iso: "2026-W45", rir_medio_por_grupo: { peito: 1 } as never });
ok(r10.length > 0 && r11.length > 0, `gerou ${r10.length} baixo + ${r11.length} alto`);
for (const a of [...r10, ...r11]) {
  checar(`recomendação ${a.grupo}`, a.recomendacao);
  checarAp(`volume ${a.grupo}`, a);
}
const um = apresentarAlerta(r10.find((a) => a.grupo === ("biceps" as never))!);
ok(/1 série de bíceps/.test(um.porque), `singular: ${um.porque}`);

// 3) Check-in / água / deload / platô
const ex: Exercicio = { id: "supino", nome: "Supino", padrao: "empurrar_horizontal", grupo_primario: "peito", grupos_secundarios: [], equipamento: "barra", composto: true, unilateral: false } as Exercicio;
const presc = { id: "p1", sessao_id: "s1", exercicio_id: "supino", padrao: "empurrar_horizontal", ordem: 1, series: 4, faixa_reps: [6, 10], rir_alvo: 2, descanso_seg: 120, cadencia: "2-0-1-0", tecnica: "padrao", carga: { trabalho_kg: 60, top_set_kg: null, origem: "historico" }, alternativa_equipamento_ocupado: "supino_halteres", guia_id: null, evidencia: "forte" } as Prescricao;
const d = avaliarCheckinDeload({
  checkin: { id: "c", data: "2026-11-04", sono_h: 5.5, prontidao: 2, agua_ml: 1000, dor: [] } as never,
  mesociclo: { semana_atual: 5, total_semanas: 6, foco: "acumulo" } as never,
  estados: [{ exercicio_id: "supino", sessoes_sem_progresso: 4, ultimo_desempenho: { carga_kg: 60, reps_na_carga: [8, 8], e1rm_kg: 76 } } as never],
  prescricoes: [presc],
  exercicios: [ex],
  data: "2026-11-04",
});
ok(d.alertas.length === 4, `check-in gerou ${d.alertas.length} alertas`);
for (const a of d.alertas) { checar("rec check-in", a.recomendacao); checarAp(`check-in`, { ...a }); }
checar("resumo deload", resumoAjusteDeload(d));
checar("motivo deload", d.motivo);
checarAp("PAR-Q+", { nivel: "N2", motivo: PARQ_BLOQUEIO_MSG, recomendacao: "x" });
checarAp("fallback", { nivel: "N1", motivo: "[R10:gluteos:2026-W45] Algo estranho com gluteos (R10).", recomendacao: "Faça 1 série(s)." });
checar("textoLimpo", textoLimpo("N1 · quadriceps:2026-W45 série(s) de gluteos"));

// 4) Toasts da adaptação ao vivo (sem id de exercício após troca de nome na tela)
const reg = (n: number, reps: number, extra: Partial<RegistroSerie> = {}) => ({ id: `r${n}`, sessao_id: "s1", prescricao_id: "p1", exercicio_id: "supino", numero: n, tipo_serie: "trabalho", reps, carga_kg: 60, rir_percebido: 2, dor: false, executado_em: "", ...extra }) as RegistroSerie;
const casos: [string, RegistroSerie, RegistroSerie[]][] = [
  ["falha 1x", reg(1, 4), []],
  ["falha 2x", reg(2, 4), [reg(1, 4)]],
  ["rir0", reg(1, 6, { rir_percebido: 0 }), []],
  ["dor 1x", reg(1, 8, { dor: true }), []],
  ["dor 2x", reg(2, 8, { dor: true }), [reg(1, 8, { dor: true })]],
];
for (const [n, r, todos] of casos) {
  try {
    const a = adaptarAposSerie({ presc, registro: r, seriesAnteriores: todos, stepKg: 2.5 });
    const nome = a.sugerir_alternativa ? a.motivo.replace(a.sugerir_alternativa, "Supino com halteres") : a.motivo;
    checar(`toast ${n}`, nome);
  } catch (e) { console.log("· toast", n, "assinatura diferente:", (e as Error).message); }
}

// 5) Varredura dos textos JSX das telas
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(p) ? [p] : [];
  });
}
let jsx = 0;
for (const f of [...walk("src/app"), ...walk("src/components")]) {
  const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const m of src.matchAll(/>\s*([^<>{}\n]*[A-Za-zÀ-ú][^<>{}\n]*)\s*</g)) {
    const t = m[1]!.trim();
    if (!t || /[=;]|=>|&&/.test(t)) continue;
    jsx++;
    const p = problemas(t).filter((x) => x !== "id snake_case");
    if (p.length) ok(false, `${f}: "${t}" → ${p.join(", ")}`);
  }
  // strings e templates dentro do JSX/TS das telas
  for (const m of src.matchAll(/(["'`])((?:(?!\1)[^\n\\]){3,}?)\1/g)) {
    const t = m[2]!;
    if (!/\s/.test(t) || /^[a-z0-9_\-/.:@ ]+$/i.test(t) && !/ /.test(t)) continue;
    if (/className|^[\w-]+(\s[\w-:/\[\].]+)+$/.test(t) && !/[À-ú]/.test(t)) continue;
    const p = problemas(t).filter((x) => x === "plural (s)" || x === "N0/N1/N2" || x === "id de semana");
    if (p.length) ok(false, `${f}: "${t}" → ${p.join(", ")}`);
  }
}
ok(jsx > 50, `varreu ${jsx} textos de tela`);
console.log(falhas ? `\n${falhas} ${falhas === 1 ? "falha" : "falhas"}` : "\nsmoke:textos-alertas OK");
