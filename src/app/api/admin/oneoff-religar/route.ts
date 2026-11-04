/**
 * TEMPORÁRIO (uso único, aprovado pelo iury): religa a série top 45×8 RIR0 do Upper A
 * ao supino reto. Só a conta fixa abaixo. Removido logo depois de aplicado.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { AppState } from "@/lib/domain";
import { ehSeriePreparatoria } from "@/lib/domain/enums";
import { blobGetJson, blobPutJson, hasBlobCredentials } from "@/lib/blob";
import { readUserState, writeUserState } from "@/lib/user-state";
import { recalcularAPartirDe, validarCorrecoesNoEstado } from "@/lib/plan/corrigir-concluida";
import { aplicarRecordes, registrosValidos, seriesDaPrescricao } from "@/lib/engine/recordes";
import { cargaSugeridaParaExercicio } from "@/lib/engine/memoria-carga";


const CONTA = "c820eda4-ba79-4502-a2d5-fa6394209b05";
const STATE_PATH = `state/${CONTA}.json`;
const BACKUP_PATH = `backups/${CONTA}/state-2026-11-04-pre-religar.json`;
const SUPINO = "supino_reto_convencional";
const CRUCIFIXO = "crucifixo_cabo";

function notFound() {
  return new NextResponse("Not Found", { status: 404 });
}
function sha(s: string) {
  return createHash("sha256").update(s).digest();
}
function autorizado(req: Request): boolean {
  const esperado = process.env.ONEOFF_ADMIN_SECRET;
  const veio = req.headers.get("x-oneoff-secret");
  if (!esperado || esperado.length < 32 || !veio) return false;
  return timingSafeEqual(sha(esperado), sha(veio));
}

const RANK: Record<string, number> = { aquecimento: 0, feeder: 1, trabalho: 2, top_set: 3, back_off: 4, drop: 5 };

function resumo(state: AppState, ex: string) {
  const e = state.estados.find((x) => x.exercicio_id === ex);
  const regs = registrosValidos(state).filter((r) => r.exercicio_id === ex && !ehSeriePreparatoria(r.tipo_serie));
  const melhor = regs.reduce((m, r) => Math.max(m, r.carga_kg), 0);
  const sug = cargaSugeridaParaExercicio(state, ex, 0);
  return {
    carga_sugerida_kg: sug.carga_kg,
    origem_sugestao: sug.origem,
    carga_atual_kg: e?.carga_atual_kg ?? null,
    alvo_proxima_kg: e?.alvo_proxima_sessao.carga_kg ?? null,
    e1rm_kg: e?.e1rm_estimado_kg ?? null,
    recorde: e ? `${e.pr_carga_kg}×${e.pr_reps}` : null,
    melhor_serie_kg: melhor,
  };
}

function plano(state: AppState) {
  const cands: { sessao_id: string; registro_id: string; presc_cruc: string; presc_sup: string }[] = [];
  for (const s of state.sessoes) {
    if (s.status !== "concluida" || !/upper\s*a(?!\s*2)/i.test(s.nome)) continue;
    const pc = s.prescricoes.find((p) => p.exercicio_id === CRUCIFIXO);
    const ps = s.prescricoes.find((p) => p.exercicio_id === SUPINO);
    if (!pc || !ps) continue;
    const regs = state.registros.filter((r) => r.sessao_id === s.id);
    for (const r of seriesDaPrescricao(regs, s.prescricoes, pc)) {
      if (r.prescricao_id === pc.id && r.carga_kg === 45 && r.reps === 8 && r.rir_percebido === 0 && r.tipo_serie === "top_set") {
        cands.push({ sessao_id: s.id, registro_id: r.id, presc_cruc: pc.id, presc_sup: ps.id });
      }
    }
  }
  return cands;
}

function linhasSessao(state: AppState, sid: string) {
  const s = state.sessoes.find((x) => x.id === sid)!;
  return s.prescricoes
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((p) => ({
      exercicio: p.exercicio_id,
      series: state.registros
        .filter((r) => r.sessao_id === sid && r.prescricao_id === p.id)
        .sort((a, b) => a.numero - b.numero)
        .map((r) => `${r.numero}:${r.tipo_serie} ${r.carga_kg}×${r.reps} RIR${r.rir_percebido} [ex=${r.exercicio_id}]`),
    }));
}

async function calcular() {
  const raw = await blobGetJson<unknown>(STATE_PATH);
  if (!raw) throw new Error("state não encontrado");
  const rawText = JSON.stringify(raw);
  const hash = sha(rawText).toString("hex");
  const stored = await readUserState(CONTA);
  if (!stored) throw new Error("state inválido");
  const state = stored.state;
  const cands = plano(state);
  if (cands.length !== 1) {
    return { ok: false as const, hash, erro: `esperava 1 série candidata, achei ${cands.length}`, cands };
  }
  const c = cands[0]!;
  // Cirúrgico: só a série 45×8 muda de bloco (e a numeração do supino). Nenhuma outra série
  // (ex.: aquecimento/aproximação da remada) é tocada.
  const sess = state.sessoes.find((x) => x.id === c.sessao_id)!;
  const antigos = state.registros.filter((r) => r.sessao_id === sess.id);
  const movida = antigos.find((r) => r.id === c.registro_id)!;
  const sup = antigos
    .filter((r) => r.prescricao_id === c.presc_sup && r.id !== movida.id)
    .sort((a, b) => a.numero - b.numero);
  let k = sup.findIndex((x) => (RANK[x.tipo_serie] ?? 9) > RANK.top_set!);
  if (k < 0) k = sup.length;
  const ordemSup = [...sup.slice(0, k), movida, ...sup.slice(k)];
  const novoNum = new Map(ordemSup.map((r, i) => [r.id, i + 1]));
  const novosSid = antigos.map((r) => {
    if (r.id === movida.id) return { ...r, prescricao_id: c.presc_sup, exercicio_id: SUPINO, numero: novoNum.get(r.id)! };
    if (novoNum.has(r.id) && novoNum.get(r.id) !== r.numero) return { ...r, numero: novoNum.get(r.id)! };
    return r;
  });
  const porId = new Map(novosSid.map((r) => [r.id, r]));
  let next: AppState = { ...state, registros: state.registros.map((r) => porId.get(r.id) ?? r) };
  const avisos: string[] = [];
  if (sess.snapshot_conclusao) {
    const rec = recalcularAPartirDe(next, sess.id, antigos, sess.prescricoes);
    next = rec.state;
    if (rec.parouEm) avisos.push(`cascata parou em ${rec.parouEm.nome}`);
    if (rec.semBase.length) avisos.push(`sem base: ${rec.semBase.join(", ")}`);
  } else {
    avisos.push("sessão sem snapshot: só histórico/recordes");
  }
  next = { ...next, estados: aplicarRecordes(next.estados, registrosValidos(next), new Set([SUPINO, CRUCIFIXO])) };
  const mudadas = state.sessoes.filter((x) => next.sessoes.find((n) => n.id === x.id) !== x);
  next = {
    ...next,
    correcoes_concluidas: [
      ...(state.correcoes_concluidas ?? []).filter((x) => x.sessao_id !== sess.id),
      {
        sessao_id: sess.id,
        corrigido_em: new Date().toISOString(),
        com_recalculo: !!sess.snapshot_conclusao,
        anterior: { sessoes: mudadas, registros_sessao: antigos, estados: state.estados, volumes_semanais: state.volumes_semanais, decisoes: state.decisoes },
      },
    ],
  };
  const res = { avisos };
  const v = validarCorrecoesNoEstado(next);
  if (v) return { ok: false as const, hash, erro: v };
  const exs = [SUPINO, CRUCIFIXO];
  const antes = Object.fromEntries(exs.map((e) => [e, resumo(state, e)]));
  const depois = Object.fromEntries(exs.map((e) => [e, resumo(next, e)]));
  const fora: string[] = [];
  for (const e of exs) {
    const d = depois[e]!;
    if (d.melhor_serie_kg > 0 && d.carga_sugerida_kg > 0) {
      const pct = d.carga_sugerida_kg / d.melhor_serie_kg;
      if (pct < 0.7 || pct > 1.1) fora.push(`${e}: ${d.carga_sugerida_kg} kg vs melhor série ${d.melhor_serie_kg} kg`);
    }
  }
  const estadosMudados = next.estados
    .filter((e) => state.estados.find((x) => x.exercicio_id === e.exercicio_id) !== e)
    .map((e) => e.exercicio_id);
  const extras = estadosMudados.filter((e) => e !== SUPINO && e !== CRUCIFIXO);
  if (extras.length) fora.push(`estados fora do escopo mudariam: ${extras.join(", ")}`);
  const regsMudados = next.registros.filter((r) => !state.registros.includes(r)).map((r) => `${r.id}:${r.exercicio_id}#${r.numero}`);
  return {
    ok: fora.length === 0,
    hash,
    erro: fora.length ? `sugestão fora de 70–110%: ${fora.join("; ")}` : null,
    candidato: c,
    sessao_antes: linhasSessao(state, c.sessao_id),
    sessao_depois: linhasSessao(next, c.sessao_id),
    antes,
    depois,
    estados_mudados: estadosMudados,
    registros_mudados: regsMudados,
    registros: { antes: state.registros.length, depois: next.registros.length },
    avisos: res.avisos,
    next,
  };
}

export async function POST(req: Request) {
  if (!autorizado(req)) return notFound();
  if (!hasBlobCredentials()) return NextResponse.json({ error: "blob" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { mode?: string; expectHash?: string };
  const mode = body.mode === "apply" ? "apply" : "dry-run";
  try {
    const out = await calcular();
    const { next, ...view } = out as typeof out & { next?: AppState };
    if (mode === "dry-run" || !out.ok || !next) return NextResponse.json({ mode, ...view });
    if (!body.expectHash || body.expectHash !== out.hash) {
      return NextResponse.json({ mode, ok: false, erro: "estado mudou desde o dry-run (hash)", hash: out.hash }, { status: 409 });
    }
    // backup privado + conferência
    const raw = await blobGetJson<unknown>(STATE_PATH);
    const rawText = JSON.stringify(raw);
    if (sha(rawText).toString("hex") !== body.expectHash) {
      return NextResponse.json({ mode, ok: false, erro: "hash mudou antes do backup" }, { status: 409 });
    }
    await blobPutJson(BACKUP_PATH, raw);
    const back = await blobGetJson<unknown>(BACKUP_PATH);
    if (JSON.stringify(back) !== rawText) {
      return NextResponse.json({ mode, ok: false, erro: "backup não confere" }, { status: 500 });
    }
    const again = await blobGetJson<unknown>(STATE_PATH);
    if (sha(JSON.stringify(again)).toString("hex") !== body.expectHash) {
      return NextResponse.json({ mode, ok: false, erro: "hash mudou depois do backup" }, { status: 409 });
    }
    await writeUserState(CONTA, next);
    const relido = await readUserState(CONTA);
    const movida = relido?.state.registros.find((r) => r.id === out.candidato!.registro_id);
    return NextResponse.json({
      ...view,
      mode,
      ok: movida?.prescricao_id === out.candidato!.presc_sup && movida?.exercicio_id === SUPINO,
      backup: BACKUP_PATH,
      relido: relido ? { supino: resumo(relido.state, SUPINO), crucifixo: resumo(relido.state, CRUCIFIXO) } : null,
    });
  } catch (e) {
    return NextResponse.json({ mode, ok: false, erro: (e as Error).message }, { status: 500 });
  }
}

export function GET() {
  return notFound();
}
