"use client";

/**
 * Gate: sem sessão → Landing guest; após magic link → sent;
 * autenticado → onboarding ou /hoje (auto) / signed_in CTA.
 * Surfacing de ?error= (Verification, Configuration, CredentialsSignin, …).
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import Landing, { LAST_EMAIL_KEY, type LandingMode } from "@/components/Landing";
import { useApp } from "@/components/AppProvider";

function authErrorMessage(code: string | null): string | null {
  if (!code) return null;
  const key = code.toLowerCase();
  if (key === "verification") {
    return "Link inválido ou já usado. Pede um novo.";
  }
  if (key === "configuration") {
    return "Erro de configuração do login. Tenta de novo em instantes.";
  }
  if (key === "accessdenied") {
    return "Acesso negado.";
  }
  if (key === "credentialssignin") {
    return "E-mail ou senha inválidos.";
  }
  return "Não deu pra entrar. Tenta de novo.";
}

function rememberEmail(email: string) {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch {
    /* ignore */
  }
}

function HomeInner() {
  const { state, ready } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [mode, setMode] = useState<LandingMode>("guest");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentEmail, setSentEmail] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_EMAIL_KEY)?.trim().toLowerCase() ?? "";
      if (saved) setSentEmail(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const fromUrl = authErrorMessage(searchParams.get("error"));
    if (fromUrl) setError(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (status === "loading" || !ready) return;
    if (status !== "authenticated") return;
    if (!state.perfil?.onboarding_concluido) {
      router.replace("/onboarding");
    } else {
      router.replace("/hoje");
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
        busy={!ready}
        onContinueApp={() => {
          if (!state.perfil?.onboarding_concluido) {
            router.replace("/onboarding");
          } else {
            router.replace("/hoje");
          }
        }}
      />
    );
  }

  return (
    <Landing
      mode={mode}
      initialEmail={sentEmail}
      busy={busy}
      error={error}
      onContinueWithEmail={async (email) => {
        setBusy(true);
        setError(null);
        setSentEmail(email);
        try {
          rememberEmail(email);
          const res = await signIn("resend", {
            email,
            redirect: false,
            callbackUrl: "/",
          });
          if (res?.error) {
            setError("Não deu pra enviar o link. Tenta de novo.");
            return;
          }
          setMode("sent");
        } catch {
          setError("Não deu pra enviar o link. Tenta de novo.");
        } finally {
          setBusy(false);
        }
      }}
      onPasswordLogin={async (email, password) => {
        setBusy(true);
        setError(null);
        setSentEmail(email);
        try {
          rememberEmail(email);
          const res = await signIn("credentials", {
            email,
            password,
            redirect: false,
            callbackUrl: "/",
          });
          if (res?.error) {
            setError("E-mail ou senha inválidos.");
            return;
          }
          // SessionProvider atualiza → effect redireciona
          router.refresh();
        } catch {
          setError("Não deu pra entrar. Tenta de novo.");
        } finally {
          setBusy(false);
        }
      }}
      onPasswordRegister={async (email, password, passwordConfirm) => {
        setBusy(true);
        setError(null);
        setSentEmail(email);
        try {
          if (password !== passwordConfirm) {
            setError("As senhas não batem.");
            return;
          }
          if (password.length < 8) {
            setError("Senha precisa ter pelo menos 8 caracteres.");
            return;
          }
          rememberEmail(email);
          const reg = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, passwordConfirm }),
          });
          const data = (await reg.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
          };
          if (!reg.ok || !data.ok) {
            setError(data.error || "Não deu pra criar a conta.");
            return;
          }
          const res = await signIn("credentials", {
            email,
            password,
            redirect: false,
            callbackUrl: "/",
          });
          if (res?.error) {
            setError("Conta criada, mas o login falhou. Entra com a senha.");
            return;
          }
          router.refresh();
        } catch {
          setError("Não deu pra criar a conta. Tenta de novo.");
        } finally {
          setBusy(false);
        }
      }}
      onUseAnotherEmail={() => {
        setMode("guest");
        setError(null);
        setSentEmail("");
      }}
    />
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center p-6">
          <p className="text-sm text-muted">Carregando…</p>
        </main>
      }
    >
      <HomeInner />
    </Suspense>
  );
}
