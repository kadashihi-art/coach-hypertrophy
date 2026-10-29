"use client";

import { useEffect, useState, type FormEvent } from "react";
import { InstallPrompt } from "@/components/InstallPrompt";

export type LandingMode = "guest" | "sent" | "signed_in";
export type AuthTab = "password" | "magic";

export const LAST_EMAIL_KEY = "coach-hypertrophy:last-email";

/**
 * T0 · Landing — e-mail+senha + magic link + motion (docs/motion-spec.md).
 * Guest com last-email: CTA “Continuar onde parei” (aba senha → login; magic → envia).
 */
export default function Landing({
  mode = "guest",
  initialEmail = "",
  onContinueWithEmail,
  onPasswordLogin,
  onPasswordRegister,
  onContinueApp,
  onUseAnotherEmail,
  busy = false,
  error = null,
}: {
  mode?: LandingMode;
  initialEmail?: string;
  /** Magic link: envia e-mail */
  onContinueWithEmail?: (email: string) => void | Promise<void>;
  /** Credentials login */
  onPasswordLogin?: (email: string, password: string) => void | Promise<void>;
  /** Cadastro → depois caller faz signIn credentials */
  onPasswordRegister?: (
    email: string,
    password: string,
    passwordConfirm: string,
  ) => void | Promise<void>;
  onContinueApp?: () => void;
  onUseAnotherEmail?: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [remembered, setRemembered] = useState("");
  const [tab, setTab] = useState<AuthTab>("password");
  const [authForm, setAuthForm] = useState<"login" | "register">("login");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_EMAIL_KEY)?.trim().toLowerCase() ?? "";
      if (saved) {
        setRemembered(saved);
        if (!initialEmail) setEmail(saved);
      }
    } catch {
      /* SSR / private */
    }
  }, [initialEmail]);

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  async function submitMagic(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@") || busy) return;
    await onContinueWithEmail?.(trimmed);
  }

  async function continueWhereLeft() {
    const trimmed = (remembered || email).trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@") || busy) return;
    setEmail(trimmed);
    if (tab === "magic") {
      await onContinueWithEmail?.(trimmed);
      return;
    }
    // Senha: só preenche o e-mail; user digita a senha
    setAuthForm("login");
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@") || busy) return;
    if (authForm === "register") {
      if (password.length < 8) return;
      if (password !== passwordConfirm) return;
      await onPasswordRegister?.(trimmed, password, passwordConfirm);
      return;
    }
    if (!password) return;
    await onPasswordLogin?.(trimmed, password);
  }

  const showResume = mode === "guest" && Boolean(remembered);

  return (
    <main className="flex min-h-dvh flex-col bg-ink-950 px-6 pb-6 pt-3">
      <div className="motion-stagger flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <div
          className="motion-mark-in flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-accent text-[26px] font-bold text-ink-950"
          aria-hidden
        >
          CH
        </div>

        <div className="flex max-w-[320px] flex-col items-center gap-2.5">
          <p className="text-[11px] font-bold tracking-[0.18em] text-accent">
            COACH
          </p>
          <h1 className="text-[36px] font-bold leading-[1.1] tracking-tight text-bone-50">
            Hipertrofia
            <br />
            com ciência.
          </h1>
          <p className="text-[15px] leading-relaxed text-muted">
            Plano, progressão e sessão no bolso.
            <br />
            Sem hype — só o que funciona.
          </p>
        </div>

        <ul className="mt-2 grid w-full max-w-[340px] grid-cols-3 gap-2">
          {(["Progressão", "Logger", "Coach"] as const).map((label) => (
            <li
              key={label}
              className="card-motion flex flex-col items-center gap-1.5 rounded-[14px] border border-border bg-surface px-2 py-3"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              <span className="text-xs font-semibold text-bone-50">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div
        key={mode}
        className="motion-swap mx-auto flex w-full max-w-[400px] flex-col gap-3 pt-4"
      >
        {error ? (
          <p className="motion-fade-in text-center text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {mode === "signed_in" ? (
          <>
            <button
              type="button"
              onClick={onContinueApp}
              disabled={busy}
              className="motion-press motion-cta-glow inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-accent px-4 text-base font-bold text-ink-950 shadow-[0_0_24px_rgba(184,255,60,.22)] disabled:opacity-60"
            >
              {busy ? "Entrando…" : "Continuar"}
            </button>
            <p className="text-center text-[11px] text-faint">
              Sessão ativa · entrar no app
            </p>
          </>
        ) : null}

        {mode === "sent" ? (
          <div className="motion-scale-in rounded-2xl border border-border bg-surface px-4 py-5 text-center">
            <p className="text-[11px] font-bold tracking-[0.12em] text-accent drop-shadow-[0_0_8px_rgba(184,255,60,.35)]">
              LINK ENVIADO
            </p>
            <p className="mt-2 text-base font-semibold text-bone-50">
              Checa teu e-mail — link mágico enviado
            </p>
            {email || initialEmail ? (
              <p className="mt-1 text-sm text-muted">
                {(email || initialEmail).trim().toLowerCase()}
              </p>
            ) : null}
            <p className="mt-3 text-[12px] leading-relaxed text-faint">
              Abre o link no mesmo aparelho. Pode fechar esta tela.
            </p>
            <button
              type="button"
              onClick={onUseAnotherEmail}
              className="motion-press mt-4 text-sm font-semibold text-muted underline-offset-2 hover:text-bone-50 hover:underline"
            >
              Usar outro e-mail
            </button>
          </div>
        ) : null}

        {mode === "guest" ? (
          <div className="flex flex-col gap-3">
            {/* Tabs */}
            <div
              className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-surface p-1"
              role="tablist"
              aria-label="Método de entrada"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "password"}
                onClick={() => setTab("password")}
                disabled={busy}
                className={`motion-press min-h-11 rounded-xl text-sm font-bold transition-colors ${
                  tab === "password"
                    ? "bg-accent text-ink-950"
                    : "text-muted hover:text-bone-50"
                }`}
              >
                Senha
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "magic"}
                onClick={() => setTab("magic")}
                disabled={busy}
                className={`motion-press min-h-11 rounded-xl text-sm font-bold transition-colors ${
                  tab === "magic"
                    ? "bg-accent text-ink-950"
                    : "text-muted hover:text-bone-50"
                }`}
              >
                Link mágico
              </button>
            </div>

            {showResume ? (
              <button
                type="button"
                onClick={() => void continueWhereLeft()}
                disabled={busy}
                className="motion-press motion-cta-glow inline-flex min-h-14 w-full flex-col items-center justify-center rounded-2xl bg-accent px-4 text-ink-950 shadow-[0_0_24px_rgba(184,255,60,.22)] disabled:opacity-60"
              >
                <span className="text-base font-bold">
                  {busy
                    ? tab === "magic"
                      ? "Enviando…"
                      : "…"
                    : "Continuar onde parei"}
                </span>
                <span className="text-[11px] font-semibold opacity-80">
                  {remembered}
                </span>
              </button>
            ) : null}

            {tab === "password" ? (
              <form onSubmit={submitPassword} className="flex flex-col gap-3">
                <label className="sr-only" htmlFor="landing-email">
                  E-mail
                </label>
                <input
                  id="landing-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  className="motion-field min-h-14 w-full rounded-2xl border border-border bg-surface px-4 text-base text-bone-50 outline-none placeholder:text-faint focus:border-accent focus:shadow-[0_0_0_2px_rgba(184,255,60,.25)] disabled:opacity-60"
                />
                <label className="sr-only" htmlFor="landing-password">
                  Senha
                </label>
                <input
                  id="landing-password"
                  name="password"
                  type="password"
                  autoComplete={
                    authForm === "register" ? "new-password" : "current-password"
                  }
                  required
                  minLength={8}
                  placeholder="Senha (mín. 8)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  className="motion-field min-h-14 w-full rounded-2xl border border-border bg-surface px-4 text-base text-bone-50 outline-none placeholder:text-faint focus:border-accent focus:shadow-[0_0_0_2px_rgba(184,255,60,.25)] disabled:opacity-60"
                />
                {authForm === "register" ? (
                  <>
                    <label className="sr-only" htmlFor="landing-password-confirm">
                      Confirmar senha
                    </label>
                    <input
                      id="landing-password-confirm"
                      name="passwordConfirm"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      placeholder="Confirmar senha"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      disabled={busy}
                      className="motion-field min-h-14 w-full rounded-2xl border border-border bg-surface px-4 text-base text-bone-50 outline-none placeholder:text-faint focus:border-accent focus:shadow-[0_0_0_2px_rgba(184,255,60,.25)] disabled:opacity-60"
                    />
                  </>
                ) : null}
                <button
                  type="submit"
                  disabled={
                    busy ||
                    !email.trim().includes("@") ||
                    password.length < (authForm === "register" ? 8 : 1) ||
                    (authForm === "register" && password !== passwordConfirm)
                  }
                  className={`motion-press inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-4 text-base font-bold disabled:opacity-60 ${
                    showResume
                      ? "border border-border bg-surface text-bone-50"
                      : "motion-cta-glow bg-accent text-ink-950 shadow-[0_0_24px_rgba(184,255,60,.22)]"
                  }`}
                >
                  {busy
                    ? authForm === "register"
                      ? "Criando…"
                      : "Entrando…"
                    : authForm === "register"
                      ? "Criar conta"
                      : "Entrar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthForm((f) => (f === "login" ? "register" : "login"));
                    setPasswordConfirm("");
                  }}
                  disabled={busy}
                  className="motion-press text-center text-sm font-semibold text-muted underline-offset-2 hover:text-bone-50 hover:underline"
                >
                  {authForm === "login"
                    ? "Criar conta com e-mail e senha"
                    : "Já tenho conta — entrar"}
                </button>
                <p className="text-center text-[11px] text-faint">
                  E-mail + senha · sessão 30 dias
                </p>
              </form>
            ) : (
              <form onSubmit={submitMagic} className="flex flex-col gap-3">
                <label className="sr-only" htmlFor="landing-email-magic">
                  E-mail
                </label>
                <input
                  id="landing-email-magic"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  enterKeyHint="send"
                  required
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  className="motion-field min-h-14 w-full rounded-2xl border border-border bg-surface px-4 text-base text-bone-50 outline-none placeholder:text-faint focus:border-accent focus:shadow-[0_0_0_2px_rgba(184,255,60,.25)] disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={busy || !email.trim().includes("@")}
                  className={`motion-press inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-4 text-base font-bold disabled:opacity-60 ${
                    showResume
                      ? "border border-border bg-surface text-bone-50"
                      : "motion-cta-glow bg-accent text-ink-950 shadow-[0_0_24px_rgba(184,255,60,.22)]"
                  }`}
                >
                  {busy
                    ? "Enviando…"
                    : showResume
                      ? "Enviar link para este e-mail"
                      : "Continuar com e-mail"}
                </button>
                <p className="text-center text-[11px] text-faint">
                  Magic link · sem senha · sessão 30 dias
                </p>
              </form>
            )}
          </div>
        ) : null}
      </div>

      <div className="mx-auto mt-4 flex w-full max-w-[400px] justify-center">
        <InstallPrompt />
      </div>
    </main>
  );
}
