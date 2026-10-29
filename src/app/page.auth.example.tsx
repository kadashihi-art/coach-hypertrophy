"use client";

/**
 * Referência — o gate real está em page.tsx (Auth.js Email + Resend).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import Landing, { type LandingMode } from "@/components/Landing";
import { useApp } from "@/components/AppProvider";

export default function HomeAuthExample() {
  const { state, ready } = useApp();
  const router = useRouter();
  const [mode, setMode] = useState<LandingMode>("guest");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading" || !ready) return;
    if (status === "authenticated") {
      if (!state.perfil?.onboarding_concluido) router.replace("/onboarding");
      else router.replace("/hoje");
    }
  }, [status, ready, state.perfil, router]);

  if (status === "loading") {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-sm text-muted">Carregando…</p>
      </main>
    );
  }

  if (status === "authenticated" && session) {
    return (
      <Landing
        mode="signed_in"
        busy
        onContinueApp={() => {
          if (!state.perfil?.onboarding_concluido) router.replace("/onboarding");
          else router.replace("/hoje");
        }}
      />
    );
  }

  return (
    <Landing
      mode={mode}
      busy={busy}
      error={error}
      onContinueWithEmail={async (email) => {
        setBusy(true);
        setError(null);
        try {
          const res = await signIn("resend", { email, redirect: false });
          if (res?.error) throw new Error(res.error);
          setMode("sent");
        } catch {
          setError("Não deu pra enviar o link. Tenta de novo.");
        } finally {
          setBusy(false);
        }
      }}
      onUseAnotherEmail={() => setMode("guest")}
    />
  );
}
