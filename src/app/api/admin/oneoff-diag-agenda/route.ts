/** TEMPORÁRIO (uso único, 04/11): leitura (sem gravar nada) da agenda de uma conta. 404 sem header. Removido logo depois. */
import { createHash, timingSafeEqual } from "node:crypto";
import { list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { readUserState } from "@/lib/user-state";
import { agendaEfetiva } from "@/lib/plan/pendente";
import { derivarCalendario } from "@/lib/plan/calendario";
import { sessoesDoPlano, proximaSessao } from "@/lib/plan/proxima-sessao";
import { faseAtiva } from "@/lib/plan/estrutura";

const SECRET_SHA256 = "a1bf5841da8f9eb44c5344096d4d604a7d1c7fe3a1ea04f1e6b77fd392a39e4e";
const hex = (s: string) => createHash("sha256").update(s).digest("hex");

function autorizado(req: Request): boolean {
  const veio = req.headers.get("x-oneoff-secret");
  if (!veio) return false;
  return timingSafeEqual(Buffer.from(hex(veio), "hex"), Buffer.from(SECRET_SHA256, "hex"));
}

export async function POST(req: Request) {
  if (!autorizado(req)) return new NextResponse("Not Found", { status: 404 });
  const r = await list({ prefix: "state/c820eda4", limit: 10 });
  if (r.blobs.length !== 1) return NextResponse.json({ erro: "contas", n: r.blobs.length });
  const st = await readUserState(r.blobs[0]!.pathname.slice(6, -5));
  if (!st) return NextResponse.json({ erro: "sem_estado" });
  const s = st.state;
  const hoje = "2026-11-04";
  const resumo = (x: (typeof s.sessoes)[number]) => ({ id: x.id, nome: x.nome, ordem: x.ordem, plano_id: x.plano_id, data: x.data, status: x.status, data_manual: x.data_manual ?? null, prescricoes: x.prescricoes.length });
  const ag = agendaEfetiva(s, hoje);
  const fase = faseAtiva(s.plano, hoje);
  return NextResponse.json({
    updated_at: st.updated_at ?? null,
    plano: s.plano ? { id: s.plano.id, sessoes: s.plano.sessoes, dias_por_semana: s.plano.dias_por_semana, mesociclo: s.plano.mesociclo, fases: (s.plano.estrutura?.fases ?? []).map((f) => ({ ...f })) } : null,
    fase_ativa: fase ?? null,
    active_sessao_id: s.active_sessao_id,
    dias_limpos: s.dias_limpos ?? null,
    sessoes: s.sessoes.map(resumo),
    do_plano: sessoesDoPlano(s, hoje).map((x) => x.id),
    proxima: proximaSessao(s, hoje)?.id ?? null,
    agenda: ag.sessoes.map((x) => [x.id, x.data, x.status]),
    pendentes: ag.pendentes,
    calendario_nov: derivarCalendario(ag.sessoes, 2026, 10, s.dias_limpos ?? []).filter((d) => d.status !== "vazio"),
  });
}
