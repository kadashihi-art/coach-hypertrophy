/**
 * TEMPORÁRIO (uso único, 04/11): testa cada etapa da cadeia de LLM em prod.
 * Sem o header válido responde 404. Não toca dados nem env. Removido logo depois.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { chamarCadeia, ultimaCadeia, type EtapaLlm } from "@/lib/llm/cadeia";

const SECRET_SHA256 = "b8ddfe45514663261ce056f4e596760a8e1f1e453cb63d6897faa5c60e0ca677";
const hex = (s: string) => createHash("sha256").update(s).digest("hex");

function autorizado(req: Request): boolean {
  const veio = req.headers.get("x-oneoff-secret");
  if (!veio) return false;
  return timingSafeEqual(Buffer.from(hex(veio), "hex"), Buffer.from(SECRET_SHA256, "hex"));
}

export async function POST(req: Request) {
  if (!autorizado(req)) return new NextResponse("Not Found", { status: 404 });
  const f = new URL(req.url).searchParams.get("forcar");
  const forcar = (["tokia", "groq", "gemini", "nenhuma"] as const).find((x) => x === f) as EtapaLlm | "nenhuma" | undefined;
  const r = await chamarCadeia({
    ponto: `diag:${forcar ?? "normal"}`,
    forcarEtapa: forcar,
    max_tokens: 20,
    messages: [{ role: "user", content: "Responda só: ok" }],
  });
  return NextResponse.json({ respondeu: r?.etapa ?? "pronta", modelo: r?.modelo ?? null, tentativas: ultimaCadeia });
}
