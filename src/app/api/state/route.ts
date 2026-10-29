import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AppStateSchema } from "@/lib/domain";
import { hasBlobCredentials } from "@/lib/blob";
import { readUserState, writeUserState } from "@/lib/user-state";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasBlobCredentials()) {
    return NextResponse.json(
      { error: "Blob not configured" },
      { status: 503 },
    );
  }
  const stored = await readUserState(session.user.id);
  if (!stored) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(stored);
}

export async function PUT(request: Request) {
  return upsert(request);
}

export async function PATCH(request: Request) {
  return upsert(request);
}

async function upsert(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasBlobCredentials()) {
    return NextResponse.json(
      { error: "Blob not configured" },
      { status: 503 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Accept either raw AppState or { state, updated_at }
  const candidate =
    body &&
    typeof body === "object" &&
    "state" in (body as Record<string, unknown>)
      ? (body as { state: unknown }).state
      : body;
  const parsed = AppStateSchema.safeParse(candidate);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid AppState", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const stored = await writeUserState(session.user.id, parsed.data);
  return NextResponse.json(stored);
}
