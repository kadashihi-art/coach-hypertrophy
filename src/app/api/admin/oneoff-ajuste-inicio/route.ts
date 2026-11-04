/**
 * TEMPORÁRIO (uso único, 04/11, aprovado pelo iury só para a conta c820eda4):
 * 1) plano.mesociclo.data_inicio → 2026-11-01  2) apaga check-ins 29–31/10
 * 3) tira as séries extras dos alertas antigos de pouco volume (sessões ainda planejadas).
 * ?modo=simular só lê. ?modo=aplicar grava backup no Blob antes e exige o updated_at simulado. 404 sem header.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { blobGetJson, blobPutJson } from "@/lib/blob";
import { AppStateSchema } from "@/lib/domain";
import { mergeCatalogoExercicios } from "@/lib/catalog/merge";

const SECRET_SHA256 = "b364e89ca83503666cc7306582c39f555411ec8a4412ed828818dea26dd7aae9";
const NOVA_DATA = "2026-11-01";
const CHECKINS_APAGAR = ["2026-10-29", "2026-10-30", "2026-10-31"];
const BACKUP_DIR = "backups/ajuste-inicio-2026-11-04/";
const hex = (s: string) => createHash("sha256").update(s).digest("hex");

function autorizado(req: Request): boolean {
  const veio = req.headers.get("x-oneoff-secret");
  if (!veio) return false;
  return timingSafeEqual(Buffer.from(hex(veio), "hex"), Buffer.from(SECRET_SHA256, "hex"));
}

type Raw = { updated_at: string; state: Record<string, unknown> & {
  plano?: { mesociclo?: { data_inicio?: string | null } } | null;
  checkins: Array<{ data: string } & Record<string, unknown>>;
  sessoes: Array<{ id: string; status: string; data?: string | null; prescricoes: Array<{ id: string; exercicio_id: string; ordem: number; series: number }> } & Record<string, unknown>>;
  alertas: Array<{ id: string; data: string; motivo: string; recomendacao: string }>;
  registros: unknown[]; estados: unknown[];
} };

function impressoes(st: Raw["state"]) {
  const semSeriesPlanejadas = st.sessoes.map((s) =>
    s.status === "planejada" || s.status === "parcial"
      ? { ...s, prescricoes: s.prescricoes.map((p) => ({ ...p, series: 0 })) }
      : s,
  );
  return {
    registros: { n: st.registros.length, sha: hex(JSON.stringify(st.registros)) },
    estados: { n: st.estados.length, sha: hex(JSON.stringify(st.estados)) },
    sessoes_concluidas: { n: st.sessoes.filter((s) => s.status === "concluida").length, sha: hex(JSON.stringify(st.sessoes.filter((s) => s.status !== "planejada" && s.status !== "parcial"))) },
    sessoes_sem_series_planejadas: { n: st.sessoes.length, sha: hex(JSON.stringify(semSeriesPlanejadas)) },
    decisoes: hex(JSON.stringify(st.decisoes ?? [])),
    volumes_semanais: hex(JSON.stringify(st.volumes_semanais ?? [])),
  };
}

function planejar(raw: Raw) {
  const st = raw.state;
  const parsed = AppStateSchema.parse(st);
  const exs = mergeCatalogoExercicios(parsed.exercicios);
  const exPor = new Map(exs.map((e) => [e.id, e]));
  const alertas = st.alertas
    .filter((a) => /^\[R10:[a-z_]+:\d{4}-W\d{2}\]/.test(a.motivo))
    .sort((a, b) => a.data.localeCompare(b.data));
  const series = new Map<string, number>();
  const mudancas: Array<{ alerta: string; grupo: string; sessao_id: string; sessao_data: string | null; prescricao_id: string; exercicio: string; de: number; para: number }> = [];
  for (const a of alertas) {
    const grupo = /^\[R10:([a-z_]+):/.exec(a.motivo)![1]!;
    const delta = Number(/Adicionar (\d+) s[ée]rie/.exec(a.recomendacao)?.[1] ?? 0);
    if (!delta) continue;
    for (const s of st.sessoes) {
      if (s.status !== "planejada" && s.status !== "parcial") continue;
      if (s.data && s.data < a.data) continue;
      const doG = s.prescricoes
        .map((p) => ({ p, ex: exPor.get(p.exercicio_id) }))
        .filter((x) => x.ex?.grupo_primario === grupo)
        .sort((x, y) => (x.ex!.composto ? 0 : 1) - (y.ex!.composto ? 0 : 1) || x.p.ordem - y.p.ordem);
      const alvo = doG[0];
      if (!alvo) continue;
      const atual = series.get(alvo.p.id) ?? alvo.p.series;
      const novo = Math.max(1, atual - delta);
      if (novo === atual) continue;
      series.set(alvo.p.id, novo);
      mudancas.push({ alerta: a.id, grupo, sessao_id: s.id, sessao_data: s.data ?? null, prescricao_id: alvo.p.id, exercicio: alvo.ex?.nome ?? alvo.p.exercicio_id, de: atual, para: novo });
    }
  }
  return { series, mudancas };
}

export async function POST(req: Request) {
  if (!autorizado(req)) return new NextResponse("Not Found", { status: 404 });
  const url = new URL(req.url);
  const modo = url.searchParams.get("modo");
  const r = await list({ prefix: "state/c820eda4", limit: 10 });
  if (r.blobs.length !== 1) return NextResponse.json({ erro: "contas", n: r.blobs.length });
  const path = r.blobs[0]!.pathname;
  const raw = await blobGetJson<Raw>(path);
  if (!raw?.state) return NextResponse.json({ erro: "sem_estado" });
  const { series, mudancas } = planejar(raw);
  const antes = {
    data_inicio: raw.state.plano?.mesociclo?.data_inicio ?? null,
    checkins_apagar: raw.state.checkins.filter((c) => CHECKINS_APAGAR.includes(c.data)),
    n_checkins: raw.state.checkins.length,
  };
  const novo: Raw = JSON.parse(JSON.stringify(raw));
  if (novo.state.plano?.mesociclo) novo.state.plano.mesociclo.data_inicio = NOVA_DATA;
  novo.state.checkins = novo.state.checkins.filter((c) => !CHECKINS_APAGAR.includes(c.data));
  // Item 3: na simulação as séries planejadas já estavam no padrão do plano (compostos 3, isolados 2),
  // então não há extra para tirar. Só aplica com ?series=1 (não usado).
  if (url.searchParams.get("series") === "1") for (const s of novo.state.sessoes) for (const p of s.prescricoes) if (series.has(p.id)) p.series = series.get(p.id)!;
  novo.updated_at = new Date().toISOString();
  const valido = AppStateSchema.safeParse(novo.state).success;
  const base = { path, updated_at: raw.updated_at, antes, mudancas_series: mudancas, valido, impressoes_antes: impressoes(raw.state), impressoes_depois: impressoes(novo.state) };
  if (modo === "simular") return NextResponse.json({ ...base, backup_raw: raw });
  if (modo !== "aplicar" || !valido) return new NextResponse("Not Found", { status: 404 });
  if (url.searchParams.get("esperado") !== raw.updated_at) return NextResponse.json({ erro: "estado_mudou", updated_at: raw.updated_at }, { status: 409 });
  const bpath = BACKUP_DIR + path.replace("/", "_");
  await blobPutJson(bpath, raw);
  const conf = await blobGetJson<Raw>(bpath);
  if (!conf || hex(JSON.stringify(conf)) !== hex(JSON.stringify(raw))) return NextResponse.json({ erro: "backup_falhou" }, { status: 500 });
  await blobPutJson(path, novo);
  const lido = await blobGetJson<Raw>(path);
  return NextResponse.json({
    ...base,
    backup: bpath,
    depois: {
      data_inicio: lido?.state.plano?.mesociclo?.data_inicio ?? null,
      n_checkins: lido?.state.checkins.length ?? null,
      checkins_restantes_antes_0111: lido?.state.checkins.filter((c) => c.data < NOVA_DATA).length ?? null,
    },
    impressoes_relidas: lido ? impressoes(lido.state) : null,
  });
}
