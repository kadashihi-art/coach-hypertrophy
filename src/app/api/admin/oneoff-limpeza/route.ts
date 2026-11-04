/**
 * TEMPORÁRIO (uso único, aprovado pelo iury em 04/11): apaga as 74 contas de teste
 * (teste-*@example.com) e 2 links mágicos antigos (0ca85e9b…, 4d7886be…) do Blob, com backup antes.
 * Nunca toca a conta real. Removido logo depois de aplicado.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { del, get, list, put } from "@vercel/blob";

export const maxDuration = 300;

const CONTA_REAL = "c820eda4-ba79-4502-a2d5-fa6394209b05";
const BACKUP = "backups/cleanup-2026-11-04/";
const SECRET_SHA256 = "c95b5326ea73bf99d2cb2e6d7982cba924e76a67cdecf3bd9df6aa865add8b59";
const ORFAOS = ["0ca85e9b", "4d7886be"];
const TESTE = /^teste-[^@]*@example\.com$/i;

const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const mask = (e: string) => e.replace(/^(.{3}).*?@/, "$1***@");

function autorizado(req: Request): boolean {
  const veio = req.headers.get("x-oneoff-secret");
  if (!veio) return false;
  return timingSafeEqual(Buffer.from(hex(veio), "hex"), Buffer.from(SECRET_SHA256, "hex"));
}
const nf = () => new NextResponse("Not Found", { status: 404 });

async function lerTexto(p: string): Promise<string | null> {
  const r = await get(p, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return await new Response(r.stream).text();
}
async function lerJson(p: string): Promise<Record<string, unknown> | null> {
  const t = await lerTexto(p);
  try { return t ? JSON.parse(t) : null; } catch { return null; }
}

async function inventario() {
  const all: string[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ cursor, limit: 1000 });
    all.push(...r.blobs.map((b) => b.pathname));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  const vivos = all.filter((p) => !p.startsWith("backups/"));
  const users: { id: string; email: string }[] = [];
  for (const p of vivos.filter((p) => p.startsWith("auth/users/"))) {
    const u = await lerJson(p);
    users.push({ id: String(u?.id ?? p.slice(11, -5)), email: String(u?.email ?? "").toLowerCase() });
  }
  const ids = new Set(users.map((u) => u.id));
  const emails = new Set(users.map((u) => u.email));
  const teste = users.filter((u) => TESTE.test(u.email) && u.id !== CONTA_REAL);
  const dono = new Map<string, string>();
  const orfaos: { path: string; tipo: string; motivo: string }[] = [];
  for (const u of users) {
    dono.set(`auth/users/${u.id}.json`, u.id);
    dono.set(`auth/email/${hex(u.email)}.json`, u.id);
    dono.set(`state/${u.id}.json`, u.id);
  }
  for (const p of vivos) {
    if (dono.has(p)) continue;
    if (p.startsWith("auth/verification/")) {
      const j = await lerJson(p);
      const ident = String(j?.identifier ?? "").toLowerCase();
      const u = users.find((x) => x.email === ident);
      if (u) dono.set(p, u.id);
      else orfaos.push({ path: p, tipo: "token de verificação (link mágico)", motivo: ident ? `e-mail sem conta (${TESTE.test(ident) ? "teste" : "não-teste"}: ${mask(ident)}), expira ${String(j?.expires ?? "?")}` : "sem identifier" });
      continue;
    }
    if (p.startsWith("auth/accounts/") || p.startsWith("auth/email/")) {
      const j = await lerJson(p);
      const uid = String(j?.userId ?? j?.id ?? "");
      if (uid && ids.has(uid)) dono.set(p, uid);
      else orfaos.push({ path: p, tipo: p.split("/")[1], motivo: "sem conta dona" });
      continue;
    }
    const m = users.find((u) => p.includes(u.id));
    if (m) dono.set(p, m.id);
    else orfaos.push({ path: p, tipo: p.split("/")[0], motivo: "sem conta dona" });
  }
  const contas = teste.map((u) => ({ id: u.id, email: u.email, paths: vivos.filter((p) => dono.get(p) === u.id) }));
  const outras = users.filter((u) => !teste.includes(u)).map((u) => ({ id: u.id, email: mask(u.email), paths: vivos.filter((p) => dono.get(p) === u.id).length }));
  const real = vivos.filter((p) => dono.get(p) === CONTA_REAL || p.includes(CONTA_REAL));
  return { real, total: all.length, backupsExistentes: all.length - vivos.length, contas, orfaos, outras, naoTesteNaLista: contas.some((c) => c.id === CONTA_REAL || !TESTE.test(c.email)), emailsExistem: emails.size };
}

const pub = (inv: Awaited<ReturnType<typeof inventario>>) => ({
  ...inv,
  real: inv.real.map((p) => p.replace(/([0-9a-f]{8})[0-9a-f]{56}/, "$1…")),
  orfaos: inv.orfaos.map((o) => ({ ...o, path: o.path.replace(/([0-9a-f]{8})[0-9a-f]{56}/, "$1…") })),
});

export async function GET(req: Request) {
  if (!autorizado(req)) return nf();
  return NextResponse.json(pub(await inventario()));
}

export async function POST(req: Request) {
  if (!autorizado(req)) return nf();
  const body = (await req.json().catch(() => ({}))) as { ids?: string[]; orfaos?: string[] };
  const inv = await inventario();
  const ids = inv.contas.map((c) => c.id).sort();
  const pref = inv.orfaos.map((o) => o.path.match(/[0-9a-f]{8}/)?.[0] ?? o.path).sort();
  const okIds = JSON.stringify(ids) === JSON.stringify([...(body.ids ?? [])].sort());
  const okOrf = JSON.stringify(pref) === JSON.stringify([...(body.orfaos ?? [])].sort());
  if (!okIds || !okOrf || ids.length !== 74 || JSON.stringify(pref) !== JSON.stringify([...ORFAOS].sort()) || inv.real.length !== 5 || inv.naoTesteNaLista || ids.includes(CONTA_REAL)) {
    return NextResponse.json({ abortado: true, okIds, okOrf, contas: ids.length, orfaos: pref.length }, { status: 409 });
  }
  const alvos = [...inv.contas.flatMap((c) => c.paths), ...inv.orfaos.map((o) => o.path)];
  if (alvos.some((p) => p.includes(CONTA_REAL) || p.startsWith("backups/") || inv.real.includes(p))) return NextResponse.json({ abortado: true, motivo: "conta real" }, { status: 409 });
  const backup: Record<string, string> = {};
  for (const p of alvos) {
    const t = await lerTexto(p);
    if (t === null) return NextResponse.json({ abortado: true, motivo: "falha ao ler " + p.slice(0, 20) }, { status: 500 });
    await put(BACKUP + p, t, { access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
    backup[p] = t;
  }
  for (const p of alvos) if ((await lerTexto(BACKUP + p)) !== backup[p]) return NextResponse.json({ abortado: true, motivo: "backup não confere" }, { status: 500 });
  await del(alvos);
  const depois = await inventario();
  return NextResponse.json({
    apagados: alvos.length,
    contas: inv.contas.map((c) => ({ id: c.id, email: c.email, blobs: c.paths.length })),
    orfaos: pub(inv).orfaos,
    backup,
    realIntacta: JSON.stringify(inv.real) === JSON.stringify(depois.real) && depois.real.length === 5,
    realAntes: inv.real.length,
    realDepois: depois.real.length,
    restantes: pub(depois),
  });
}
