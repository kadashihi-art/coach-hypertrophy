import { get, put } from "@vercel/blob";

/** True when Blob credentials exist (token or OIDC). */
export function hasBlobCredentials(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN),
  );
}

function assertBlob() {
  if (!hasBlobCredentials()) {
    throw new Error(
      "Blob não configurado: defina BLOB_READ_WRITE_TOKEN (ou BLOB_STORE_ID + OIDC).",
    );
  }
}

export async function blobGetJson<T>(pathname: string): Promise<T | null> {
  assertBlob();
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text) as T;
}

export async function blobPutJson(
  pathname: string,
  data: unknown,
): Promise<void> {
  assertBlob();
  await put(pathname, JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function blobDelete(pathname: string): Promise<void> {
  assertBlob();
  const { del } = await import("@vercel/blob");
  await del(pathname);
}
