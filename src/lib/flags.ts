/** Visão (foto/vídeo no /coach). Desligada por padrão; só liga com COACH_VISION_ENABLED=true. */
export function visaoHabilitada(): boolean {
  return process.env.COACH_VISION_ENABLED?.trim().toLowerCase() === "true";
}
/** Espelho para a UI (build-time). */
export const VISAO_UI = process.env.NEXT_PUBLIC_COACH_VISION_ENABLED === "true";
