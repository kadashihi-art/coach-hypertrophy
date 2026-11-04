/** TEMPORÁRIO (uso único, 04/11): leitura (sem gravar nada) do início de uso de uma conta. 404 sem header. Removido logo depois. */
import { createHash, timingSafeEqual } from "node:crypto";
import { list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { readUserState } from "@/lib/user-state";
import { inicioDeUso, diaSP } from "@/lib/inicio";
import { alertaVolumeValido } from "@/lib/engine/alertas-volume";
import { apresentarAlerta } from "@/lib/alertas/apresentar";

const SECRET_SHA256 = "7de84a8ac8adbe9e56065105e5ec9af7de406b55b8c9394e0b0b9353d8cf519d";
const hex = (s: string) => createHash("sha256").update(s).digest("hex");

function autorizado(req: Request): boolean {
  const veio = req.headers.get("x-oneoff-secret");
  if (!veio) return false;
  return timingSafeEqual(Buffer.from(hex(veio), "hex"), Buffer.from(SECRET_SHA256, "hex"));
}

export async function POST(req: Request) {
  if (!autorizado(req)) return new NextResponse("Not Found", { status: 404 });
  const corte = "2026-11-01";
  const r = await list({ prefix: "state/c820eda4", limit: 10 });
  if (r.blobs.length !== 1) return NextResponse.json({ erro: "contas", n: r.blobs.length });
  const id = r.blobs[0]!.pathname.slice(6, -5);
  const st = await readUserState(id);
  if (!st) return NextResponse.json({ erro: "sem_estado" });
  const s = st.state;
  const inicio = inicioDeUso(s);
  const antes = {
    sessoes: s.sessoes
      .filter((x) => { const d = diaSP(x.data ?? x.iniciada_em ?? x.finalizada_em); return d != null && d < corte && x.status !== "planejada"; })
      .map((x) => ({ data: x.data, status: x.status, nome: (x as { nome?: string }).nome ?? null, prescricoes: x.prescricoes.length })),
    registros: Object.entries(
      s.registros.filter((x) => (diaSP(x.executado_em) ?? "9") < corte).reduce<Record<string, number>>((a, x) => { const d = diaSP(x.executado_em)!; a[d] = (a[d] ?? 0) + 1; return a; }, {}),
    ),
    checkins: s.checkins.filter((c) => c.data < corte).map((c) => ({ data: c.data, sono_h: c.sono_h, agua_ml: (c as { agua_ml?: number }).agua_ml ?? null })),
    volumes_semanais: s.volumes_semanais.filter((v) => v.semana_iso < "2026-W45").map((v) => ({ semana: v.semana_iso, grupo: v.grupo, series: v.series_efetivas })),
    alertas: s.alertas.filter((a) => a.data < corte).map((a) => ({ data: a.data, titulo: apresentarAlerta(a).titulo, resolvido: a.resolvido })),
    planejadas_antes: s.sessoes.filter((x) => x.status === "planejada" && (x.data ?? "9") < corte).length,
  };
  const volume = s.alertas
    .filter((a) => !a.resolvido && /\[R1[01]:/.test(a.motivo))
    .map((a) => { const ap = apresentarAlerta(a); return { data: a.data, titulo: ap.titulo, porque: ap.porque, aparece_agora: alertaVolumeValido(a.motivo, inicio) }; });
  return NextResponse.json({
    data_inicio_perfil: s.plano?.mesociclo?.data_inicio ?? null,
    inicio_de_uso: inicio,
    volume_semanas: s.volumes_semanais.filter((v) => v.grupo === "quadriceps").map((v) => [v.semana_iso, v.series_efetivas]),
    alertas_volume: volume,
    antes_de_01_11: antes,
  });
}
