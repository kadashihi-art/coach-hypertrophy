/** Smoke técnicas avançadas (lote 4): elegibilidade, limite, carga do drop, volume/e1RM conservadores, progressão intacta, textos. */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { AppStateSchema, type AppState, type Perfil, type RegistroSerie, type TipoSerie } from "../src/lib/domain";
import { concluirSessao } from "../src/lib/engine/concluir-sessao";
import { recordeDasSeries } from "../src/lib/engine/recordes";
import { melhorE1rm } from "../src/lib/engine/e1rm";
import { acumularVolumeSemanal } from "../src/lib/engine/volume";
import {
  LIMITE_TECNICAS_SESSAO, TECNICAS, cargaDrop, exercicioAceitaTecnica, planoTecnica, validarTecnicasNoEstado,
  volumeExtraDoRegistro,
} from "../src/lib/engine/tecnicas";
import { aplicarEdicao, definirTecnicaItem, previaEdicao, rascunhoDaSessao } from "../src/lib/plan/editar-treino";
import { aplicarEdicaoAoVivo, definirTecnicaAoVivo, podeMudarTecnicaAoVivo, rascunhoAoVivo, validarAoVivo } from "../src/lib/treino/editar-durante-treino";
import { GRUPO_LABEL } from "../src/lib/labels";

// Mesmo critério do smoke:textos-alertas (sem ids, N1/N2, "(s)", "motor", músculo sem acento, snake_case).
const SEM_ACENTO = Object.entries(GRUPO_LABEL).filter(([k, v]) => k !== v.toLowerCase()).map(([k]) => k);
const RE_SEM_ACENTO = new RegExp(String.raw`(?<![\p{L}_])(${SEM_ACENTO.join("|")})(?![\p{L}_])`, "iu");
function problemas(t: string): string[] {
  const out: string[] = [];
  if (/\w+:\d{4}-W\d+/.test(t)) out.push("id de semana");
  if (/\bN[0-2]\b/.test(t)) out.push("N0/N1/N2");
  if (/\(s\)|\(es\)/.test(t)) out.push("plural (s)");
  if (/\bmotor\b/i.test(t)) out.push("motor");
  if (RE_SEM_ACENTO.test(t)) out.push("músculo sem acento");
  if (/\b[a-z]+_[a-z_]+\b/.test(t)) out.push("id snake_case");
  return out;
}

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const C = CATALOG_EXERCICIOS;
const perfil: Perfil = {
  id: "smoke-tec", peso_kg: 80, altura_cm: 178, experiencia: "intermediario",
  dias_por_semana: 4, minutos_por_sessao: 60, cardio_min_semana: 0,
  equipamentos: ["barra", "halteres", "maquina", "cabo"], restricoes: [], objetivo: "hipertrofia",
  onboarding_concluido: true, parq_liberado: true, parq_respondido_em: "2026-11-01T00:00:00Z",
  parq_respostas: [false, false, false, false, false, false, false], criado_em: "2026-11-01T00:00:00Z",
};
const g = gerarPlanoFromPerfil(perfil, C);
const sessoes = g.sessoes.map((s, i) => ({ ...s, data: `2026-11-0${2 + i}` }));
const base: AppState = AppStateSchema.parse({
  perfil, exercicios: C, guias: [], plano: g.plano, sessoes, registros: [], estados: g.estados,
  checkins: [], alertas: [], decisoes: [], volumes_semanais: g.volumes_semanais, active_sessao_id: null, logger_prescricao_id: null,
});
const ex = (id: string) => C.find((e) => e.id === id)!;

// ── catálogo / textos
ok(TECNICAS.length === 5, "5 técnicas enxutas");
for (const t of TECNICAS) {
  const txt = [t.nome, t.curto, t.quando, ...t.como].join(" ");
  ok(problemas(txt).length === 0 && !/\bmotor\b/i.test(txt), `texto limpo: ${t.nome}`);
}

// ── carga do drop: −20 a 25% no degrau
for (const [kg, step] of [[65, 5], [40, 2.5], [22.5, 2.5], [110, 5], [15, 2.5]] as const) {
  const d = cargaDrop(kg, step);
  const pct = 1 - d / kg;
  const noDegrau = Math.abs(d / step - Math.round(d / step)) < 1e-9;
  const semDegrauNaFaixa = Math.floor((kg * 0.8) / step + 1e-9) * step < kg * 0.75 - 1e-9;
  ok(d < kg && noDegrau && ((pct >= 0.199 && pct <= 0.251) || (semDegrauNaFaixa && pct >= 0.15 && pct <= 0.34)), `drop ${kg} kg → ${d} kg (−${Math.round(pct * 100)}%)`);
}

// ── elegibilidade
const iso = C.find((e) => !e.composto)!;
const compostoLivre = C.find((e) => e.composto && e.equipamento === "barra")!;
const maquinaComp = C.find((e) => e.composto && e.equipamento === "maquina");
ok(exercicioAceitaTecnica(iso), `isolador aceita (${iso.nome})`);
ok(!exercicioAceitaTecnica(compostoLivre), `composto com barra não aceita (${compostoLivre.nome})`);
if (maquinaComp) ok(exercicioAceitaTecnica(maquinaComp), `máquina aceita (${maquinaComp.nome})`);

// ── Editar treino (antes): sessão com ≥3 elegíveis
const sAlvo = base.sessoes.find((s) => s.prescricoes.filter((p) => p.tecnica !== "top_set_backoff" && exercicioAceitaTecnica(ex(p.exercicio_id))).length >= 3)!;
ok(!!sAlvo, "sessão com 3 exercícios elegíveis");
const ord = [...sAlvo.prescricoes].sort((a, b) => a.ordem - b.ordem);
const elegIdx = ord.map((p, i) => (p.tecnica !== "top_set_backoff" && exercicioAceitaTecnica(ex(p.exercicio_id)) ? i : -1)).filter((i) => i >= 0);
const naoIdx = ord.findIndex((p) => !(p.tecnica !== "top_set_backoff" && exercicioAceitaTecnica(ex(p.exercicio_id))));
let r = rascunhoDaSessao(sAlvo);
r = definirTecnicaItem(r, elegIdx[0]!, "drop_set");
const pv = previaEdicao(base, r)!;
ok(!pv.erro && pv.resumo.linhas.some((l) => l.includes("Drop-set na última série")), "resumo pra confirmar mostra a técnica");
ok(base.sessoes.find((s) => s.id === sAlvo.id)!.prescricoes.every((p) => !p.tecnica_final), "nada grava antes de Confirmar");
if (naoIdx >= 0) {
  const rBad = definirTecnicaItem(r, naoIdx, "myo_reps");
  ok(!!previaEdicao(base, rBad)!.erro, "técnica em composto livre é bloqueada");
}
const r3 = definirTecnicaItem(definirTecnicaItem(r, elegIdx[1]!, "rest_pause"), elegIdx[2]!, "parciais");
ok(LIMITE_TECNICAS_SESSAO === 2 && /no máximo 2/.test(previaEdicao(base, r3)!.erro ?? ""), "limite de 2 técnicas por treino");
const rUlt = definirTecnicaItem(rascunhoDaSessao(sAlvo), ord.length - 1, "bi_set");
ok(!!previaEdicao(base, rUlt)!.erro, "bi-set no último exercício é bloqueado");
const deload = { ...base, plano: { ...base.plano!, mesociclo: { ...base.plano!.mesociclo, foco: "deload" as const } } };
ok(/deload/.test(previaEdicao(deload, r)!.erro ?? ""), "deload desliga técnicas");
const ap = aplicarEdicao(base, r);
ok(ap.ok, "Confirmar aplica");
let st = ap.ok ? ap.state : base;
const pDrop = st.sessoes.find((s) => s.id === sAlvo.id)!.prescricoes.find((p) => p.exercicio_id === ord[elegIdx[0]!]!.exercicio_id)!;
ok(pDrop.tecnica_final === "drop_set", "prescrição guarda a técnica");
ok(pDrop.carga.trabalho_kg === ord[elegIdx[0]!]!.carga.trabalho_kg && pDrop.series === ord[elegIdx[0]!]!.series, "carga e séries do Coach não mudam");
ok(AppStateSchema.parse(st).sessoes.find((s) => s.id === sAlvo.id)!.prescricoes.some((p) => p.tecnica_final === "drop_set"), "schema preserva a técnica");
ok(validarTecnicasNoEstado(st) === null, "servidor aceita estado válido");
ok(validarTecnicasNoEstado({ ...st, sessoes: st.sessoes.map((s) => (s.id === sAlvo.id ? { ...s, prescricoes: s.prescricoes.map((p) => ({ ...p, tecnica_final: "myo_reps" as const })) } : s)) }) !== null, "servidor recusa estado fora da regra");

// ── Durante o treino
st = { ...st, active_sessao_id: sAlvo.id, logger_prescricao_id: ord[0]!.id, sessoes: st.sessoes.map((s) => (s.id === sAlvo.id ? { ...s, status: "em_andamento" as const } : s)) };
let n = 0;
const log = (s: AppState, prescId: string, tipo: TipoSerie, kg: number, reps: number, tecnica?: RegistroSerie["tecnica"]): AppState => {
  const p = s.sessoes.find((x) => x.id === sAlvo.id)!.prescricoes.find((x) => x.id === prescId)!;
  const reg: RegistroSerie = { id: `r${++n}`, sessao_id: sAlvo.id, prescricao_id: p.id, exercicio_id: p.exercicio_id, numero: n, tipo_serie: tipo, carga_kg: kg, reps, rir_percebido: 1, dor: false, ...(tecnica ? { tecnica } : {}), executado_em: `2026-11-02T10:${String(n).padStart(2, "0")}:00Z` };
  return { ...s, registros: [...s.registros, reg] };
};
let rv = rascunhoAoVivo(st)!;
const iB = elegIdx[1]!;
rv = definirTecnicaAoVivo(st, rv, iB, "myo_reps");
ok(validarAoVivo(st, rv) === null, "ao vivo: ligar myo-reps é válido");
const av = aplicarEdicaoAoVivo(st, rv);
ok(av.ok && av.montagem.linhas.some((l) => l.includes("Myo-reps na última série")), "ao vivo: resumo mostra a técnica");
if (av.ok) st = av.state;

// faz todas as séries do exercício com drop (bloco principal + extensão)
const kg = pDrop.carga.trabalho_kg || 20;
const planoD = planoTecnica("drop_set", kg, ex(pDrop.exercicio_id), pDrop.faixa_reps);
const stSem = (() => {
  let x = st;
  for (let i = 0; i < pDrop.series; i++) x = log(x, pDrop.id, "trabalho", kg, pDrop.faixa_reps[1]);
  return x;
})();
n = 0;
let stCom = st;
for (let i = 0; i < pDrop.series; i++) {
  const ult = i === pDrop.series - 1;
  stCom = log(stCom, pDrop.id, "trabalho", kg, pDrop.faixa_reps[1], ult ? { tipo: "drop_set", carga_extra_kg: planoD.carga_kg, reps_extra: [8] } : undefined);
}
const rvDepois = rascunhoAoVivo(stCom)!;
const iDrop = rvDepois.itens.findIndex((x) => x.prescricao_id === pDrop.id);
ok(!podeMudarTecnicaAoVivo(stCom, rvDepois, iDrop), "ao vivo: depois da última série a técnica trava");

const regsDrop = stCom.registros.filter((x) => x.prescricao_id === pDrop.id);
ok(recordeDasSeries(regsDrop).e1rm_estimado_kg === recordeDasSeries(stSem.registros.filter((x) => x.prescricao_id === pDrop.id)).e1rm_estimado_kg, "e1RM igual com e sem a extensão");
ok(melhorE1rm(regsDrop) === melhorE1rm(stSem.registros.filter((x) => x.prescricao_id === pDrop.id)), "melhorE1rm não infla");
ok(volumeExtraDoRegistro(regsDrop.at(-1)!) === 0.5, "drop soma +0,5 série direta");
ok(volumeExtraDoRegistro({ tipo_serie: "trabalho", tecnica: { tipo: "parciais", carga_extra_kg: null, reps_extra: [5] } }) === 0, "parciais somam 0");
ok(volumeExtraDoRegistro({ tipo_serie: "trabalho", tecnica: { tipo: "drop_set", carga_extra_kg: 10, reps_extra: [0] } }) === 0, "extensão não feita não soma");
const g0 = ex(pDrop.exercicio_id).grupo_primario;
const vSem = acumularVolumeSemanal([], stSem.registros, C, "2026-W45").find((v) => v.grupo === g0)!;
const vCom = acumularVolumeSemanal([], stCom.registros, C, "2026-W45").find((v) => v.grupo === g0)!;
ok(vCom.series_diretas - vSem.series_diretas === 0.5, `volume direto +0,5 (${vSem.series_diretas} → ${vCom.series_diretas})`);
const sec = ex(pDrop.exercicio_id).grupos_secundarios[0];
if (sec) ok(acumularVolumeSemanal([], stCom.registros, C, "2026-W45").find((v) => v.grupo === sec)!.series_indiretas === acumularVolumeSemanal([], stSem.registros, C, "2026-W45").find((v) => v.grupo === sec)!.series_indiretas, "secundários não ganham bônus");

// progressão: mesmas decisões de carga com e sem a técnica
const fimSem = concluirSessao(stSem, { gravarSnapshot: false, agora: "2026-11-02T12:00:00Z" });
const fimCom = concluirSessao(stCom, { gravarSnapshot: false, agora: "2026-11-02T12:00:00Z" });
const dS = fimSem.decisoes.find((d) => d.exercicio_id === pDrop.exercicio_id);
const dC = fimCom.decisoes.find((d) => d.exercicio_id === pDrop.exercicio_id);
const semId = (d: typeof dS) => (d ? { ...d, id: "" } : d);
ok(!!dS && JSON.stringify(semId(dS)) === JSON.stringify(semId(dC)), "progressão decide igual (técnica não mexe na carga real)");
const eS = fimSem.state.estados.find((e) => e.exercicio_id === pDrop.exercicio_id)!;
const eC = fimCom.state.estados.find((e) => e.exercicio_id === pDrop.exercicio_id)!;
ok(eS.carga_atual_kg === eC.carga_atual_kg && eS.pr_carga_kg === eC.pr_carga_kg && eS.e1rm_estimado_kg === eC.e1rm_estimado_kg, "estado (carga, PR, e1RM) igual");
ok(AppStateSchema.parse(fimCom.state).registros.some((x) => x.tecnica?.tipo === "drop_set" && x.tecnica.reps_extra[0] === 8), "registro guarda a técnica usada");

// textos do logger
for (const t of TECNICAS) {
  const p = planoTecnica(t.tipo, 40, iso, [10, 15], "Crucifixo na máquina");
  ok(problemas([p.texto, ...p.campos.map((c) => c.rotulo)].join(" ")).length === 0, `texto do logger limpo: ${t.nome}`);
}

console.log(fail ? `\n${fail} falha(s)` : "\nOK smoke:tecnicas");

process.exit(fail ? 1 : 0);
