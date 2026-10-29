# Auth + Landing — Coach Hypertrophy

**Auth:** magic link por e-mail (Auth.js Email + Resend) — **não** Google OAuth  
**Visual:** gamer clean · accent `#B8FF3C` · bg `#050505` · sem XP/streak  
**Figma:** [T0 · Landing](https://www.figma.com/design/vpHGbewU3KHk6ZgkGLq7EH)  
**UI:** `src/components/Landing.tsx` · preview `/entrar` · HTML `../hypertrophy-prototype/auth-landing/index.html`

## Fluxo (obrigatório)

```
/  (root)
│
├─ sem sessão  →  Landing mode=guest
│                  e-mail + CTA "Continuar com e-mail"
│                  → envia magic link → mode=sent
│
├─ link clicado / sessão ok
│     ├─ perfil.onboarding_concluido === false  →  /onboarding (T1)
│     └─ perfil.onboarding_concluido === true   →  /hoje (T3)
│
└─ já logado abre Landing  →  mode=signed_in · CTA "Continuar"
```

Nunca exigir senha. Sem modal bloqueante. CTA no terço inferior.

## Estados da Landing (`LandingMode`)

| mode | UI | Ação |
|------|-----|------|
| `guest` | input e-mail + **Continuar com e-mail** | `onContinueWithEmail(email)` → Auth.js `signIn("resend"\|"email", { email, redirect: false })` |
| `sent` | “Checa teu e-mail — link mágico enviado” + e-mail + “Usar outro e-mail” | espera clique no link; `onUseAnotherEmail` volta pra guest |
| `signed_in` | CTA **Continuar** | `onContinueApp` → onboarding ou /hoje |

## Copy (locked)

- Mark `CH` · eyebrow `COACH`
- Título: `Hipertrofia com ciência.`
- Sub: `Plano, progressão e sessão no bolso. Sem hype — só o que funciona.`
- Pills: Progressão · Logger · Coach
- Placeholder: `seu@email.com`
- CTA guest: **Continuar com e-mail** (busy: `Enviando…`)
- Sent: **Checa teu e-mail — link mágico enviado**
- Micro guest: `Magic link · sem senha · uso pessoal`
- Micro signed_in: `Sessão ativa · entrar no app`

## Contrato

```tsx
<Landing
  mode="guest" | "sent" | "signed_in"
  initialEmail?: string
  onContinueWithEmail?: (email: string) => void | Promise<void>
  onContinueApp?: () => void
  onUseAnotherEmail?: () => void
  busy?: boolean
  error?: string | null
/>
```

## Checklist Dev

- [ ] Auth.js Email provider + Resend
- [ ] Gate em `page.tsx` (ver `page.auth.example.tsx`)
- [ ] Callback magic link → criar perfil se novo (`onboarding_concluido: false`)
- [ ] Existente com onboarding → `/hoje`
- [ ] Sign-out → Landing guest
- [ ] Visual = Figma / HTML preview

## Fora de escopo WD

Secrets Resend/Vercel, cookies, envio de e-mail — Dev.
