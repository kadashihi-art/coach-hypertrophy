# Coach Hypertrophy — MVP local

App pessoal de treinamento de força com coach de IA.  
**Fonte de produto:** [`brief-produto-v1.txt`](./brief-produto-v1.txt)  
Look & feel (WD): `/workspace/hypertrophy-prototype/` (`TOKENS-GAMER.md` + `index.html`)

**Uso local / sem deploy.** Sem GitHub remote até ok do Iury.

## Como abrir

```bash
cd /workspace/coach-hypertrophy
npm install   # se necessário
npm run dev   # http://localhost:3000
```

Smoke do motor (R1 / R4 / R7):

```bash
npm run smoke:engine
```

Build:

```bash
npm run build   # deve sair exit 0
```

> Persistência: `localStorage` chave **`coach-hypertrophy:v4`** (mesociclo 4 dias).  
> Se veio de v3, limpe a chave antiga ou use janela anônima para pegar o seed novo.

## Fluxo F2 (navegável)

| URL | Tela | O que faz |
|-----|------|-----------|
| `/` | redirect | Sem onboarding → `/onboarding`; senão → `/hoje` |
| `/onboarding` | T1 | Peso/altura, tempo, equipamentos/limitações, objetivo → grava `Perfil` |
| `/checkin` | T2 | ≤4 toques; R9 se prontidão≤2 ou sono&lt;6 |
| `/hoje` | T3 | Sessão sugerida + **picker** Upper A/Lower A/Upper B/Lower B · CTA |
| `/treino` | T4 Logger | Pré-fill `EstadoExercicio`, ±2,5/5 kg, RIR 0–4, colapso, timer, CTA |
| `/treino/feedback` | T6 | Motor R1–R12 → `DecisaoProgressao`, volume vs planejado |
| `/progresso` | T7 | e1RM, PRs, volume 10–20 efetivas, consistência |
| `/plano` | T8 | Split 4 dias + iniciar qualquer sessão |

Tabbar (área logada): **Hoje | Treino | Progresso | Plano** (oculta no logger ativo, check-in, onboarding e pós-treino).

### Próximo treino (rotação)

Ordem do ciclo: **Upper A → Lower A → Upper B → Lower B → (repete)**.

1. Se há sessão `em_andamento`, ela é a ativa.
2. Senão, pega a última com `finalizada_em` e avança **+1** no ciclo.
3. Senão, a primeira `planejada` do plano.

No **Hoje** e no **Plano** dá para escolher **qualquer** dia do mesociclo e iniciar/continuar/refazer.

### Teste manual rápido

1. Limpe `localStorage` (`coach-hypertrophy:v4`) ou use janela anônima.
2. Abra `/` → onboarding (4 steps) → **Gerar plano** → `/hoje`.
3. (Opcional) Check-in; teste R9 com sono &lt; 6 ou prontidão ≤ 2.
4. Confirme o picker (4 chips). **Iniciar treino** no Upper A (ou outro dia).
5. Logger: conclua as séries; **Finalizar sessão** → pós-treino com R#.
6. Volte ao Hoje → a sugestão deve ser o **próximo** do ciclo (ex. Lower A).

## Mesociclo seed (Upper/Lower)

| Dia | Sessão | Foco de padrões |
|-----|--------|-----------------|
| 1 | Upper A | Empurrar H + puxar H/V + lateral + tríceps/rosca |
| 2 | Lower A | Agachamento + RDL + joelho (ext/flex) + panturrilha |
| 3 | Upper B | Empurrar inclinado + puxar V/H + press máquina + braços |
| 4 | Lower B | Hip thrust + leg press + RDL + afundo + panturrilha |

Volume semanal efetivo (diretas + 0,5×indiretas) projetado ~**10–20**/grupo (panturrilha ~8, no piso).  
Press vertical = **máquina** (restrição de ombro do perfil). Cada exercício prescrito tem `EstadoExercicio`.

## Tokens (gamer)

| Token | Valor |
|-------|-------|
| bg / ink-950 | `#050505` |
| surface | `#0a0a0a` |
| surface-2 | `#121212` |
| border | `#1f1f1f` |
| text | `#f5f5f0` |
| muted | `#9a9a90` |
| **accent** | `#B8FF3C` |
| go | `#3DFF8A` |
| warn | `#FFB020` |
| danger | `#FF3B4E` |

Números ≥44px JetBrains Mono (`.big-num`). Sem XP / streak punitivo.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4
- Zod (domínio + contrato LLM)
- Persistência: `localStorage` chave `coach-hypertrophy:v4`
- Motor: `src/lib/engine/progression.ts` (R1–R12) + `volume.ts`
- Rotação: `src/lib/plan/proxima-sessao.ts`

## Árvore

```
src/
  app/          onboarding · checkin · hoje · treino · feedback · progresso · plano
  components/   UI · AppProvider · BottomNav
  lib/
    domain/     Camada A
    engine/     R1–R12 · e1RM · volume · fixtures
    plan/       proxima-sessao (rotação do ciclo)
    llm/        Camada B contrato 2.0.0
    seed.ts     Upper A/B + Lower A/B
    storage.ts
```
