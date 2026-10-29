/**
 * POST /api/plan/remount — auth required.
 * Body: { perfil: Partial<Perfil> & required fields…, estados?: EstadoExercicio[] }
 * Always runs motor; optionally LLM (COACH_LLM_* / COACH_LLM_PLAN_MODEL).
 * Returns { plano, sessoes, estados, volumes_semanais, justificativa_llm?, fonte }.
 * Does NOT write Blob — client applies via updatePerfilAndRemount.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  EquipamentoSchema,
  ExperienciaSchema,
  ObjetivoSchema,
  EstadoExercicioSchema,
  PerfilSchema,
} from "@/lib/domain";
import { CATALOG_EXERCICIOS } from "@/lib/catalog/exercicios";
import { remountPlano } from "@/lib/plan/remount-plano";
import { PARQ_BLOQUEIO_MSG, parqBloqueiaPrescricao } from "@/lib/plan/parq";

const PerfilPatchSchema = z.object({
  id: z.string().optional(),
  peso_kg: z.number().positive().optional(),
  altura_cm: z.number().positive().optional(),
  experiencia: ExperienciaSchema.optional(),
  dias_por_semana: z.number().int().min(2).max(6).optional(),
  minutos_por_sessao: z.number().int().min(20).max(180).optional(),
  cardio_min_semana: z.number().int().min(0).optional(),
  equipamentos: z.array(EquipamentoSchema).optional(),
  restricoes: z.array(z.string()).optional(),
  objetivo: ObjetivoSchema.optional(),
  estilo_split: PerfilSchema.shape.estilo_split,
  fase2_estilo: PerfilSchema.shape.fase2_estilo,
  fase1_semanas: PerfilSchema.shape.fase1_semanas,
  fase2_semanas: PerfilSchema.shape.fase2_semanas,
  dias_descanso_fixos: PerfilSchema.shape.dias_descanso_fixos,
  acordos_plano: PerfilSchema.shape.acordos_plano,
  onboarding_concluido: z.boolean().optional(),
  parq_respostas: z.array(z.boolean()).optional(),
  parq_liberado: z.boolean().optional(),
  parq_respondido_em: z.string().nullable().optional(),
  criado_em: z.string().optional(),
});

const BodySchema = z.object({
  perfil: PerfilPatchSchema,
  /** Full perfil fallback for merge if patch is partial */
  perfil_base: PerfilSchema.optional(),
  estados: z.array(EstadoExercicioSchema).optional().default([]),
  skip_llm: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const { perfil: patch, perfil_base, estados, skip_llm } = parsed.data;
  const base = perfil_base ?? {
    id: patch.id ?? session.user.id,
    peso_kg: patch.peso_kg ?? 80,
    altura_cm: patch.altura_cm ?? 175,
    experiencia: patch.experiencia ?? "intermediario",
    dias_por_semana: patch.dias_por_semana ?? 4,
    minutos_por_sessao: patch.minutos_por_sessao ?? 60,
    cardio_min_semana: patch.cardio_min_semana ?? 0,
    equipamentos: patch.equipamentos ?? ["halteres", "maquina"],
    restricoes: patch.restricoes ?? [],
    objetivo: patch.objetivo ?? "hipertrofia",
    onboarding_concluido: true,
    parq_liberado: patch.parq_liberado ?? false,
    parq_respondido_em: patch.parq_respondido_em ?? null,
    parq_respostas: patch.parq_respostas,
    criado_em: patch.criado_em ?? new Date().toISOString(),
  };

  const perfil = { ...base, ...patch, onboarding_concluido: true };

  if (parqBloqueiaPrescricao(perfil)) {
    return NextResponse.json(
      { error: PARQ_BLOQUEIO_MSG, code: "PARQ_BLOCK" },
      { status: 403 },
    );
  }

  try {
    const result = await remountPlano({
      perfil,
      catalog: CATALOG_EXERCICIOS,
      estadosAnteriores: estados,
      skipLlm: skip_llm,
    });
    return NextResponse.json({
      plano: result.plano,
      sessoes: result.sessoes,
      estados: result.estados,
      volumes_semanais: result.volumes_semanais,
      justificativa_llm: result.justificativa_llm ?? null,
      fonte: result.fonte,
      perfil,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "remount_error";
    if (msg.startsWith("PAR-Q+")) {
      return NextResponse.json({ error: msg, code: "PARQ_BLOCK" }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
