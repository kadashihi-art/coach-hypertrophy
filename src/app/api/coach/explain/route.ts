/**
 * POST /api/coach/explain — coach read-only.
 * Cliente envia decisões do motor já calculadas. Nunca writeUserState/saveState.
 */
import { limparSaidaCoach } from "@/lib/llm/tom";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AcaoProgressaoSchema,
  EvidenciaSchema,
  GrupoMuscularSchema,
  OrigemCargaSchema,
  RegraProgressaoSchema,
  TecnicaSchema,
} from "@/lib/domain";
import { validarContratoLlm } from "@/lib/llm/contract";
import { getCoachProvider } from "@/lib/llm/coach";

const DecisaoInSchema = z.object({
  exercicio_id: z.string(),
  nome: z.string().optional(),
  regra: RegraProgressaoSchema,
  acao: AcaoProgressaoSchema,
  carga_anterior_kg: z.number(),
  nova_carga_kg: z.number(),
  faixa_reps_reiniciada: z.boolean().optional().default(false),
  motivo: z.string(),
  evidencia: EvidenciaSchema,
});

const VolumeInSchema = z.object({
  grupo: GrupoMuscularSchema,
  planejado: z.number(),
  realizado: z.number(),
});

const PrescInSchema = z.object({
  exercicio_id: z.string(),
  series: z.number().int().positive(),
  faixa_reps: z.tuple([z.number().int(), z.number().int()]),
  rir_alvo: z.number().int(),
  tecnica: TecnicaSchema.default("padrao"),
  carga: z.object({
    trabalho_kg: z.number(),
    top_set_kg: z.number().nullable().default(null),
    origem: OrigemCargaSchema,
  }),
});

const EstadoInSchema = z
  .object({
    carga_atual_kg: z.number(),
    rir_alvo: z.number().int(),
    ultimo_top_kg: z.number().nullable().optional().default(null),
    ultimo_back_off_kg: z.number().nullable().optional().default(null),
    ultimo_rir: z.number().nullable().optional().default(null),
    origem_carga: OrigemCargaSchema.optional().default("historico"),
    primeira_sessao: z.boolean().optional().default(false),
    alvo_proxima_sessao: z
      .object({
        carga_kg: z.number(),
        faixa_reps: z
          .tuple([z.number().int(), z.number().int()])
          .optional(),
        rir_alvo: z.number().int().optional(),
      })
      .optional(),
  })
  .optional()
  .nullable();

const BodySchema = z.object({
  tipo: z.enum(["pos_treino", "prescricao"]),
  sessao_id: z.string().optional(),
  sessao_nome: z.string().optional(),
  exercicio_id: z.string().optional(),
  exercicio_nome: z.string().optional(),
  decisoes: z.array(DecisaoInSchema).optional().default([]),
  volume: z.array(VolumeInSchema).optional().default([]),
  presc: PrescInSchema.optional(),
  estado: EstadoInSchema,
});

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
  const coach = getCoachProvider();

  try {
    if (body.tipo === "pos_treino") {
      const envelope = await coach.explicarPosTreino({
        sessao_nome: body.sessao_nome,
        decisoes: body.decisoes,
        volume: body.volume,
      });
      const v = validarContratoLlm(envelope);
      if (!v.ok) {
        return NextResponse.json(
          { error: "Contract validation failed", errors: v.errors },
          { status: 400 },
        );
      }
      return NextResponse.json({ ...v.data, mensagem_usuario: limparSaidaCoach(v.data.mensagem_usuario ?? "").texto });
    }

    if (!body.presc) {
      return NextResponse.json(
        { error: "presc obrigatório para tipo=prescricao" },
        { status: 400 },
      );
    }

    const envelope = await coach.explicarPrescricao({
      exercicio_nome: body.exercicio_nome,
      presc: body.presc,
      estado: body.estado
        ? {
            carga_atual_kg: body.estado.carga_atual_kg,
            rir_alvo: body.estado.rir_alvo,
            ultimo_top_kg: body.estado.ultimo_top_kg ?? null,
            ultimo_back_off_kg: body.estado.ultimo_back_off_kg ?? null,
            ultimo_rir: body.estado.ultimo_rir ?? null,
            origem_carga: body.estado.origem_carga ?? "historico",
            primeira_sessao: body.estado.primeira_sessao ?? false,
            alvo_proxima_sessao: {
              carga_kg:
                body.estado.alvo_proxima_sessao?.carga_kg ??
                body.presc.carga.trabalho_kg,
              faixa_reps: body.presc.faixa_reps,
              rir_alvo:
                body.estado.alvo_proxima_sessao?.rir_alvo ?? body.presc.rir_alvo,
            },
          }
        : null,
    });
    const v = validarContratoLlm(envelope);
    if (!v.ok) {
      return NextResponse.json(
        { error: "Contract validation failed", errors: v.errors },
        { status: 400 },
      );
    }
    return NextResponse.json({ ...v.data, mensagem_usuario: limparSaidaCoach(v.data.mensagem_usuario ?? "").texto });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "coach_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
