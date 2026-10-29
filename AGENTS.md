# AGENTS.md — coach-hypertrophy

App PWA de treino de hipertrofia: o coach conversa em PT, e um motor determinístico prescreve.

## Stack
- Next.js 16 (App Router), React 19, TypeScript e Zod 4.
- Auth.js v5 (`next-auth` beta) com e-mail via Resend. O adapter fica em Vercel Blob (`src/lib/auth/blob-adapter.ts`).
- Vercel Blob guarda o estado do usuário (`src/lib/blob.ts`, `src/lib/user-state.ts`, `/api/state`).
- PWA: `public/manifest.webmanifest`, `public/sw.js`, `src/components/ServiceWorkerRegister.tsx`.
- Deploy: Vercel. Cada push na `main` vira produção, e cada PR ganha um preview automático.

## Mapa
- `src/lib/engine/`: motor de progressão. `progression.ts` aplica as regras R1–R12 (brief-produto-v1 §6). Aqui também ficam volume, e1rm, deload/check-in, adaptação ao vivo e alertas de volume.
- `src/lib/plan/`: geração do plano. `gerar-plano.ts` e `estrutura.ts` montam o split e o volume. `parq.ts` é o gate do PAR-Q+. `coleta.ts` faz o onboarding conversacional (schema, mais `validarEstrategia`). `negociacao.ts` traz os ajustes propostos pelo coach. Também ficam aqui `remount-plano.ts`, `racional.ts` e `calendario.ts`.
- `src/lib/llm/`: coach (LLM).
  - `coach.ts` tem os prompts e o provider HTTP.
  - `tom.ts` tem as regras de tom e `limparSaidaCoach`.
  - `contract.ts` valida o envelope.
  - `coach-context.ts` monta o contexto JSON que o modelo recebe.
  - `research-arsenal*` guarda a base de evidências.
- `src/lib/domain/`: entidades e enums (Zod). `src/lib/catalog/` é o catálogo de exercícios.
- `src/lib/flags.ts` tem as feature flags. `src/lib/nav.ts` guarda as rotas e os rótulos dos CTAs.
- APIs:
  - `/api/coach/chat` e `/api/coach/explain`
  - `/api/onboarding/coleta`
  - `/api/plan/negociar` e `/api/plan/remount`
  - `/api/state`
  - `/api/auth/*`
- Páginas: `/onboarding`, `/hoje`, `/treino`, `/meu-treino`, `/coach`, `/checkin`, `/progresso`, `/calendario`, `/plano`.

## Regras críticas (não quebrar)
1. Só o motor determinístico define kg, reps, RIR e séries. A LLM nunca gera esses números.
2. A LLM é read-only: explica, negocia e propõe ajustes de parâmetros (schema). Quem remonta é o motor. Nada é gravado sem confirmação explícita do usuário: "Confirmar plano" no onboarding e "Confirmar e remontar" em /meu-treino.
3. O PAR-Q+ é um gate explícito: qualquer SIM bloqueia a prescrição (`parqBloqueiaPrescricao`) e mantém o alerta N2. A LLM não pode liberar. Lesões viram restrições.
4. Híbrido (PPL+UL, FB+UL) nunca é padrão nem sugestão automática. Ele só entra se o usuário pedir. PPL+UL é o modelo pessoal do iury, não default do app.
5. O plano salvo do usuário não muda sem confirmação. "Refazer com o coach" só troca o plano depois que o usuário confirma.
6. Tom: humano, em PT-BR, primeira pessoa, estilo WhatsApp. Sem headers, sem rotas técnicas e sem citar "o motor". O markdown é renderizado de forma segura (`src/components/Markdown.tsx`, sem innerHTML).
7. Visão (foto e vídeo) fica desligada via flags. Com a flag off, a API devolve 400 para mídia e o prompt não oferece análise. O código do AI Gateway existe, mas está inativo.
8. Não persista mídia. Não crie rota que leia o Blob por fora do fluxo do app.

## Envs (só nomes; os valores ficam na Vercel e `.env*` nunca é commitado, exceto `.env.example`)
- LLM (Tokia): `COACH_LLM_BASE_URL`, `COACH_LLM_API_KEY`, `COACH_LLM_MODEL`, `COACH_LLM_PLAN_MODEL`, `COACH_LLM_VISION_MODEL` (legado).
- Auth: `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`, `RESEND_API_KEY` / `AUTH_RESEND_KEY`, `EMAIL_FROM`.
- Blob: `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`.
- Visão (off por padrão): `COACH_VISION_ENABLED`, `NEXT_PUBLIC_COACH_VISION_ENABLED`, `COACH_VISION_GATEWAY_MODELS`. `VERCEL_OIDC_TOKEN` vem da própria Vercel.

## Tokia
- API compatível com OpenAI (`/chat/completions`), base `https://api.usetokia.com/v1`.
- Modelo de chat, plano e onboarding: `openrouter/anthropic/claude-opus-5`. Não troque sem pedido.
- Não aceita imagem (devolve `image_not_supported`).

## Antes de abrir PR
```
npm run lint
npm run build
npm run smoke:engine && npm run smoke:plano && npm run smoke:coach && npm run smoke:coach-chat
npm run smoke:t5-arsenal && npm run smoke:perfil-calendario && npm run smoke:racional-hibrido
npm run smoke:negociacao && npm run smoke:coleta && npm run smoke:tom
```

## Fluxo
- Branch, depois PR para `main`. O preview é automático. O merge na `main` faz deploy de produção.
- Não altere `src/lib/engine/*`, as regras R1–R12, o PAR-Q nem os limites de volume sem pedido explícito.
- Não mexa no projeto Agency-OS. Não commite segredos.
