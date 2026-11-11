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
  - `rampa-volume.ts`: +séries ao longo do bloco (ajuste só do dia, em `ajuste_series_dia`; a base do plano não muda).
  - `tecnicas.ts`: técnicas avançadas opcionais na última série (regras, carga do drop, volume conservador). Ver `docs/tecnicas-avancadas.md`.
- `src/lib/plan/`: geração do plano. `gerar-plano.ts` e `estrutura.ts` montam o split e o volume. `parq.ts` é o gate do PAR-Q+. `coleta.ts` faz o onboarding conversacional (schema, mais `validarEstrategia`). `negociacao.ts` traz os ajustes propostos pelo coach. Também ficam aqui `remount-plano.ts`, `racional.ts` e `calendario.ts`.
  - `sugestao-exercicio.ts`: sinais do histórico (já fez, tendência, travado, dor recente) para ranquear a troca e desempatar o gerador ao refazer o plano.
  - `mesociclo.ts`: semana real do bloco pela data (`mesocicloEfetivo`). O `semana_atual` salvo fica em 1; use sempre o efetivo. Deload programado (R6) só na última semana.
  - `equilibrar-volume.ts`: volume do plano gerado (teto 20/semana e 10/sessão por músculo, piso por nível, +4 nos prioritários, dentro do tempo). Ver `docs/series-validas.md`.
  - `prioridades.ts`: prioridade muscular (sugestão pelo histórico + prévia sem gravar). Card em /plano/ajustar; muda o plano só com "Confirmar e remontar".
- `src/lib/treino/estrutura-series.ts`: ordem das séries (aproximação → top → back-offs no mesmo RIR) e preparação por músculo/padrão.
- `src/lib/conceitos.ts`: RM, RIR, série válida etc. explicados na prática (página `/conceitos` e botões "?" via `src/components/Conceito.tsx`).
- `src/lib/inteligencia/`: coach que guia (determinístico). `volume-autorregulado.ts` faz o feedback por músculo (estímulo, articulação, recuperação) virar ±séries do dia por cima da rampa. `briefing.ts` mostra a meta de cada exercício no /hoje. `diagnostico.ts` explica por que um exercício travou e prevê a força pelo ritmo. `leitura-dia.ts` propõe ajustar o resto do treino em dia ruim ou forte (só com confirmação). `revisao-semanal.ts` resume a semana e o que vem. `fechamento-bloco.ts` analisa o bloco por músculo e propõe o próximo (`Perfil.ajuste_volume_musculo`, só com confirmação). `tempo-curto.ts` encurta o treino do dia (`pulado_hoje`). Ver `docs/coach-inteligente.md`.
- `src/lib/nivel/reavaliacao.ts`: reavaliação de nível (determinística, só leitura). Cartão em `/hoje` (`ReavaliacaoNivelCard`); muda o plano só com "Confirmar e remontar". Ver `docs/reavaliacao-nivel.md`.
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
- Páginas: `/onboarding`, `/hoje`, `/treino`, `/meu-treino`, `/coach`, `/checkin`, `/progresso`, `/calendario`, `/plano`, `/conceitos`.

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
npm run smoke:estrutura-series && npm run smoke:volume-plano && npm run smoke:prioridades && npm run smoke:conceitos
npm run smoke:inteligencia && npm run smoke:fechamento-bloco && npm run smoke:tempo-curto
```

## Fluxo
- Branch, depois PR para `main`. O preview é automático. O merge na `main` faz deploy de produção.
- Não altere `src/lib/engine/*`, as regras R1–R12, o PAR-Q nem os limites de volume sem pedido explícito.
- Não mexa no projeto Agency-OS. Não commite segredos.
