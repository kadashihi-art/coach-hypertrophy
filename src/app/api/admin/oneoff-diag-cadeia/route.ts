/** TEMPORÁRIO (uso único, 04/11): força uma etapa da cadeia (modelo vem da env). 404 sem header. Removido logo depois. */
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { chamarCadeia, ultimaCadeia } from "@/lib/llm/cadeia";

const SECRET_SHA256 = "9b85d3e4bac251c1d35704efb8d1e205404f879e87007f5533697002504fd724";
const hex = (s: string) => createHash("sha256").update(s).digest("hex");

function autorizado(req: Request): boolean {
  const veio = req.headers.get("x-oneoff-secret");
  if (!veio) return false;
  return timingSafeEqual(Buffer.from(hex(veio), "hex"), Buffer.from(SECRET_SHA256, "hex"));
}

export async function POST(req: Request) {
  if (!autorizado(req)) return new NextResponse("Not Found", { status: 404 });
  const f = new URL(req.url).searchParams.get("forcar");
  const forcar = f === "groq" || f === "gemini" ? f : undefined;
  if (!forcar) return new NextResponse("Not Found", { status: 404 });
  const r = await chamarCadeia({ ponto: `diag:${forcar}`, forcarEtapa: forcar, max_tokens: 20, messages: [{ role: "user", content: "Responda só: ok" }] });
  return NextResponse.json({ respondeu: r?.etapa ?? "pronta", modelo: r?.modelo ?? null, tentativas: ultimaCadeia });
}
