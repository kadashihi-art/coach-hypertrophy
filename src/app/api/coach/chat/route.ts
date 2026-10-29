import { MIN_MSG_CHARS } from "@/lib/chat-input";
/**
 * POST /api/coach/chat — T9 Coach conversacional read-only.
 * Prefere `contexto` do cliente (AppState local). Nunca writeUserState/saveState.
 */
import { NextResponse } from "next/server";
import { visaoHabilitada } from "@/lib/flags";
import { z } from "zod";
import { auth } from "@/auth";
import { AppStateSchema, GrupoMuscularSchema } from "@/lib/domain";
import { hasBlobCredentials } from "@/lib/blob";
import { readUserState } from "@/lib/user-state";
import { buildCoachContext, type CoachContext } from "@/lib/llm/coach-context";
import { validarContratoLlm } from "@/lib/llm/contract";
import { COACH_FALLBACK_MSG, getCoachProvider } from "@/lib/llm/coach";
import { limparSaidaCoach } from "@/lib/llm/tom";
import { AJUSTAR_PLANO_HREF } from "@/lib/nav";

const HistoricoSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export const maxDuration = 120;

const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MidiaSchema = z.object({
  tipo: z.enum(["imagem", "video"]),
  frames: z
    .array(z.object({ data_url: z.string().max(1_600_000).regex(DATA_URL_RE), t_seg: z.number().min(0).max(120).optional() }))
    .min(1)
    .max(8),
  duracao_seg: z.number().min(0).max(61).optional(),
});

const BodySchema = z.object({
  midia: MidiaSchema.optional(),
  mensagem: z.string().max(4000).refine((t) => t.trim().length >= MIN_MSG_CHARS, "mensagem muito curta"),
  grupo: GrupoMuscularSchema.optional(),
  exercicio_id: z.string().optional(),
  historico: z.array(HistoricoSchema).max(20).optional().default([]),
  /** Prefer client-built context from local AppState */
  contexto: z.unknown().optional(),
});

function isCoachContext(raw: unknown): raw is CoachContext {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    Array.isArray(o.estados) &&
    Array.isArray(o.volumes_semanais) &&
    Array.isArray(o.decisoes_progressao) &&
    "checkin_hoje" in o
  );
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsed.data;
  let contexto: CoachContext | null = isCoachContext(body.contexto)
    ? (body.contexto as CoachContext)
    : null;

  // Fallback read-only: session + Blob (still never write)
  if (!contexto) {
    try {
      const session = await auth();
      const uid = session?.user?.id;
      if (uid && hasBlobCredentials()) {
        const stored = await readUserState(uid);
        if (stored?.state) {
          const st = AppStateSchema.safeParse(stored.state);
          if (st.success) {
            contexto = buildCoachContext(st.data, {
              grupo: body.grupo,
              exercicio_id: body.exercicio_id,
              mensagem: body.mensagem,
            });
          }
        }
      }
    } catch {
      // ignore — prefer empty over failing hard
    }
  }

  if (!contexto) {
    // Minimal empty context so stub still answers without inventing loads
    contexto = {
      gerado_em: new Date().toISOString(),
      filtro: {
        ...(body.grupo ? { grupo: body.grupo } : {}),
        ...(body.exercicio_id ? { exercicio_id: body.exercicio_id } : {}),
      },
      checkin_hoje: null,
      plano: null,
      estados: [],
      volumes_semanais: [],
      decisoes_progressao: [],
      proxima_sessao: null,
    };
  }

  if (body.midia && !visaoHabilitada()) {
    return NextResponse.json(
      { erro: "visao_desligada", mensagem_usuario: "Por enquanto eu ainda não consigo olhar foto ou vídeo por aqui. Me descreve com palavras como foi a execução (onde sentiu, o que travou, como ficou a amplitude) que eu te ajudo." },
      { status: 400 },
    );
  }
  const coach = getCoachProvider();
  try {
    const envelope = await coach.conversar({
      mensagem: body.mensagem,
      contexto,
      historico: body.historico,
      midia: body.midia,
    });
    const v = validarContratoLlm(envelope);
    if (!v.ok) {
      return NextResponse.json(
        { error: "Contract validation failed", errors: v.errors },
        { status: 400 },
      );
    }
    const lv = (coach as { lastVision?: unknown }).lastVision ?? null;
    const lc = (coach as { lastChat?: { ok: boolean } | null }).lastChat ?? null;
    const semLlm = (coach as { semLlm?: boolean }).semLlm === true;
    if (!body.midia && (semLlm || (lc && !lc.ok))) {
      if (semLlm) console.warn("[coach/chat] llm_nao_configurada");
      return NextResponse.json({
        contrato_versao: v.data.contrato_versao,
        tipo_resposta: "resposta_conversacional",
        mensagem_usuario: COACH_FALLBACK_MSG,
        cta: null,
        falha_llm: true,
      });
    }
    const limpo = limparSaidaCoach(v.data.mensagem_usuario ?? "");
    const cta = limpo.sugestao ? { label: limpo.sugestao, href: AJUSTAR_PLANO_HREF } : null;
    return NextResponse.json({ ...v.data, mensagem_usuario: limpo.texto, cta, ...(body.midia ? { meta_visao: lv ?? { modelo: "stub", ok: false } } : {}) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "coach_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
