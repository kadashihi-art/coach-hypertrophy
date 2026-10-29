"use client";

/**
 * Página intermediária do magic link.
 * Prefetch de Gmail/Outlook NÃO clica no botão — o token só é consumido no
 * GET /api/auth/callback/resend após o clique humano.
 */
import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function ConfirmInner() {
  const params = useSearchParams();
  const email = params.get("email");
  const token = params.get("token");
  const callbackUrl = params.get("callbackUrl") ?? "/";

  const callbackHref = useMemo(() => {
    if (!email || !token) return null;
    const q = new URLSearchParams({
      email,
      token,
      callbackUrl,
    });
    return `/api/auth/callback/resend?${q.toString()}`;
  }, [email, token, callbackUrl]);

  if (!callbackHref) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-ink-950 px-6 text-center">
        <div
          className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-accent text-[26px] font-bold text-ink-950"
          aria-hidden
        >
          CH
        </div>
        <div className="max-w-[320px]">
          <p className="text-[11px] font-bold tracking-[0.18em] text-accent">
            COACH
          </p>
          <h1 className="mt-2 text-[28px] font-bold leading-tight text-bone-50">
            Link incompleto
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Faltam parâmetros do magic link. Pede um novo na tela inicial.
          </p>
        </div>
        <Link
          href="/"
          className="motion-press inline-flex min-h-14 w-full max-w-[340px] items-center justify-center rounded-2xl bg-accent px-4 text-base font-bold text-ink-950 shadow-[0_0_24px_rgba(184,255,60,.22)]"
        >
          Voltar ao início
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-ink-950 px-6 text-center">
      <div
        className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-accent text-[26px] font-bold text-ink-950"
        aria-hidden
      >
        CH
      </div>
      <div className="max-w-[320px]">
        <p className="text-[11px] font-bold tracking-[0.18em] text-accent">
          COACH
        </p>
        <h1 className="mt-2 text-[28px] font-bold leading-tight text-bone-50">
          Pronto pra entrar
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Confirma o acesso com um clique. O link só vale uma vez.
        </p>
        {email ? (
          <p className="mt-2 text-sm text-faint">{email}</p>
        ) : null}
      </div>
      {/* Botão = navegação real; sem auto-redirect no mount (evita bots). */}
      <a
        href={callbackHref}
        className="motion-press motion-cta-glow inline-flex min-h-14 w-full max-w-[340px] items-center justify-center rounded-2xl bg-accent px-4 text-base font-bold text-ink-950 shadow-[0_0_24px_rgba(184,255,60,.22)]"
      >
        Entrar no Coach
      </a>
      <p className="text-[11px] text-faint">
        Se não for você, ignore este e-mail.
      </p>
    </main>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-ink-950 p-6">
          <p className="text-sm text-muted">Carregando…</p>
        </main>
      }
    >
      <ConfirmInner />
    </Suspense>
  );
}
