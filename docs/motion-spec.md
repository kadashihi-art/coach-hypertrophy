# Motion — Coach Hypertrophy

**App-wide gamified motion — todas as telas.** Clean / minimal / gamer. Accent glow `#B8FF3C`. **150–300ms**. Sem bounce exagerado, sem confetti, sem Lottie, sem XP fake.

**CSS first** (`globals.css` → classes `motion-*` + Logger hooks). Framer Motion opcional **só** se precisar de `AnimatePresence` no expand/collapse do set ativo no Logger. Onboarding e charts: **CSS only**.

## Tokens

| Token | Valor |
|-------|--------|
| `--motion-fast` | 150ms |
| `--motion-base` | 220ms |
| `--motion-slow` | 300ms |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| `--ease-spring` | `cubic-bezier(0.2, 0.9, 0.2, 1.35)` |

Sempre respeitar `prefers-reduced-motion` → estado final instantâneo.

## Classes (plugar)

| Classe | Uso |
|--------|-----|
| `motion-fade-up` | entrada de tela / bloco |
| `motion-stagger` | filhos em cascade (cards Home, pills Landing, decisões pós) |
| `motion-mark-in` | logo CH |
| `motion-swap` | guest→sent / troca de step Onboarding |
| `motion-press` + `motion-cta-glow` | CTAs lime |
| `motion-field` | input focus |
| `motion-expand` / `motion-collapse` | série Logger |
| `tab-motion` / `is-active` | BottomNav |
| `card-motion` | cards |
| `chip-motion` / `.on` | chips (onboarding + tipo série Logger) |
| `bar-track` / `bar-fill` / `.enter` | barras TEMPO + volume + progresso |
| `vol-chart` | preview volume/semana |
| `obj-card` / `.on` | cards OBJETIVO |
| `num-tick` | número do NumStepper ao mudar (key={value}) |
| `load-flash` | carga kg — glow lime + scale ≤200ms |
| `is-anchor` | indicador sutil na carga de trabalho |
| `set-anchor-pulse` | rows aquecimento quando âncora muda (300ms) |
| `chip-rir` / `.on` | RIR 0–4 com chipPop + go-tint |
| `hit-flash` | série no alvo (check / ev-forte pop ≤300ms) |
| `pr-pop` | badge PR |
| `meso-fill` / `.enter` | barra meso no Hoje |
| `sheet-enter` | sheet / check-in enter |

---

## Por tela

### Landing (T0) — já no `Landing.tsx`
- Mark: `motion-mark-in`
- Copy + pills: `motion-stagger`
- Form/CTA: `motion-fade-up` delay curto
- guest→sent: bloco `sent` com `motion-swap` (+ leve glow no “LINK ENVIADO”)
- CTA: `motion-press motion-cta-glow`

### Auth confirm / Entrar
- Form: `motion-fade-up`
- CTA: `motion-press motion-cta-glow`
- Erro/sucesso: `motion-swap` no bloco de status

### Onboarding
- Step change: `motion-swap` no painel
- Dots: scale + glow no `.on`
- CTA: `motion-press`

### Onboarding (rico)

Escopo: PERFIL → TEMPO → CONTEXTO → OBJETIVO. Leve (150–300ms), accent lime `#B8FF3C`. **CSS only**.

#### Entrada de step
- Painel com `key={step}` + `motion-swap`.
- Conteúdo interno: wrapper `motion-stagger` (cascade 40ms).
- Dots: step ativo `w-5` + shadow lime; opcional scale 1.05 em 150ms.

#### PERFIL
- NumSteppers: `num-tick` via `key={value}` (leve).
- Chips experiência: `chip-motion` + `.on` → `chipPop` / spring; unselect → soft fade (150ms).

#### TEMPO
- Ranges + `TimeBar`: `bar-track` / `bar-fill` com transition width 220–300ms; `.enter` na montagem.
- Preview **volume/semana** (`VolumeWeekPreview`): banda 10–20; fills crescem; heurística presentacional.

#### CONTEXTO
- Chips equipamento + lesões: `chip-motion` / `.on` (multi-select).

#### OBJETIVO
- Cards: `obj-card card-motion` + `.on` → ring lime + scale 1.01; leve `motion-pop`.

#### CTA
- Continuar / Gerar plano: `motion-press motion-cta-glow`. Voltar: ghost.

Snippets: `docs/onboarding-motion-snippets.tsx`  
Demo: `/workspace/hypertrophy-prototype/onboarding-motion/index.html`

### Home / Hoje
- Wrapper content: `motion-stagger` nos cards (coach, sessão, meso, alerta) — cascade 40ms.
- CTA Iniciar: `motion-press motion-cta-glow`.
- Meso progress: `meso-fill` (+ `.enter` na montagem) — width transition 300ms.
- PR badge (se houver): `pr-pop` no mount / quando aparece.
- Troca de sessão sugerida: `motion-fade-up` no card ativo.

### Check-in
- Sheet / página: `sheet-enter` ou `motion-fade-up`.
- Prontidão 1–5: chips `chip-motion` + `.on` (spring).
- Sleep / steppers: `num-tick` via `key={value}`.
- CTA salvar: `motion-press motion-cta-glow`.

### Progresso
- Cards / seções: `motion-stagger`.
- Barras de volume por grupo: `bar-fill` + `.enter` no mount; banda visual 10–20 se aplicável (reuso `vol-band`).
- e1RM: stub CSS only — linha/barra com width transition; sem chart lib.
- PR list: `pr-pop` no item mais recente.

### Plano
- Split cards: `motion-stagger`.
- Week chips: `chip-motion` / `.on`.
- Volume por grupo: `bar-fill` (mesma família do Progresso / onboarding).

### Pós-treino (`/treino/feedback`)
- Header: `motion-fade-up`.
- Volume vs planejado: barras `bar-fill` / ProgressBar com transition.
- Pontos fortes / fracos (se listados): `motion-stagger` fade-up.
- Cards de decisão (R#): `motion-stagger` cascade 40ms.
- Evidência badge: sem animação contínua; pop só se “forte” e acabou de aparecer (`hit-flash` opcional).

### BottomNav
- `tab-motion` + `is-active` com drop-shadow lime no ícone.
- `:active` scale 0.94.

---

### Logger (T4) — crítico

Escopo: `/treino` (sessão em andamento). Brief §9 + HTML prototype. **Interativo e gamificado leve** — feedback imediato em cada controle, sem confetti.

Demo HTML: `/workspace/hypertrophy-prototype/logger-motion/index.html`  
Snippets: `docs/logger-motion-snippets.tsx`

#### 1. Tipo série chips
Controles: `trabalho` / `top_set` / `back_off` / `aquecimento`.

| Estado | Classe / efeito |
|--------|-----------------|
| idle | `chip-motion` |
| selected | `chip-motion on` → `chipPop` + lime fill (mesmo spring do onboarding) |
| press | scale 0.96 (150ms) |

Unselect: só transition de bg/borda — sem pop reverso.

#### 2. Carga ± (NumStepper)
- Display: `big-num` + ao mudar valor → `load-flash` (≤200ms): lime glow + scale up.
- Direção opcional: UP = `load-flash`; DOWN = `load-flash down` (dim leve) **ou** mesmo lime tick nos dois sentidos + chevron implícito no botão ±. Preferência WD: **mesmo lime tick** (mais limpo); `down` é opcional.
- Wiring: `key={carga}` no `<span className="big-num load-flash">` **ou** toggle class + `animationend`. `NumStepper` já remonta com `key={value}`.
- Quando tipo é `trabalho` ou `top_set`, o bloco da carga leva `is-anchor` (label “âncora” sutil).

#### 3. Reps ±
- Mesmo `NumStepper` com `num-tick` (mais leve que `load-flash`).
- `key={reps}` no número.

#### 4. RIR chips 0–4
- Base: `chip-rir`; selected: `chip-rir on`.
- `.on`: `chipPop` + go-tint (`--go` fill) + box-shadow go ≤220ms.
- Press: scale 0.94.

#### 5. Âncora aquecimento
**UX (mesmo se a matemática de % vier depois no motor):**

- A **carga de trabalho** (`tipo === trabalho | top_set`) é a âncora → marcador `is-anchor` no stepper de carga.
- Quando o usuário muda a carga âncora, qualquer row de aquecimento visível (collapsed done, upcoming sugerido, ou preview “Aq. ~X kg”) recebe `set-anchor-pulse` (borda lime flash **300ms**).
- Placeholder no Next: ao `onChange` da carga (se tipo âncora), setar flag `anchorPulse` 300ms e aplicar a classe nas rows `tipo_serie === "aquecimento"` + row sugerida.
- Dev pluga o recalc real (`%` da carga) depois — a animação só comunica “estas séries dependem desta carga”.

#### 6. Concluir série
- CTA thumb-zone: `motion-press motion-cta-glow` (já).
- Card ativo → collapsed: `motion-collapse`.
- Próxima série / próximo card: `motion-expand` (já com `key={active-…}`).
- Opcional Framer: `AnimatePresence` só aqui se o Dev quiser layout animation mais suave.

#### 7. Timer sticky
- Display: manter `timerPulse` (opacity + text-shadow lime).
- Barra: `width` transition ~500ms (exceção leve à regra 300ms — progresso contínuo de timer).
- `prefers-reduced-motion`: sem pulse infinito; barra pode saltar.

#### 8. Gamificação leve (hit no alvo)
- Ao concluir série, se reps ∈ faixa **e** RIR ≤ alvo (ou na banda do alvo): brief `hit-flash` no card collapsed ou toast inline com `ev-forte` / check — **≤300ms**, sem confetti.
- Fora do alvo: sem punição animada (só estado quieto).

#### Mapa Dev → `treino/page.tsx`

| Elemento | Classe / hook |
|----------|----------------|
| tipo chips | `chip-motion` + `.on` |
| carga NumStepper | `load-flash` + `key={carga}`; wrapper `is-anchor` se trabalho/top_set |
| reps NumStepper | `num-tick` + `key={reps}` |
| RIR | `chip-rir` + `.on` |
| rows aquecimento | `set-anchor-pulse` quando carga âncora muda |
| set done / active | `motion-collapse` / `motion-expand` |
| CTA concluir | `motion-press motion-cta-glow` |
| hit no alvo | `hit-flash` + `ev-forte` |
| timer | `timerPulse` + bar width transition |

#### Tabela de interações (Logger)

| Controle | Trigger | Animação | Duração |
|----------|---------|----------|---------|
| Tipo série | select | chipPop + lime fill | 220ms |
| Carga ± | value change | load-flash (glow+scale) | ≤200ms |
| Reps ± | value change | num-tick | 220ms |
| RIR 0–4 | select | chipPop + go fill | 220ms |
| Carga âncora muda | onChange carga (trabalho/top_set) | set-anchor-pulse nas rows aq. | 300ms |
| Concluir série | tap CTA | press + collapse/expand | 150 + 220ms |
| Hit no alvo | pós-log | hit-flash / ev-forte | ≤300ms |
| Timer | running | timerPulse + bar width | contínuo / 500ms bar |

---

## O que o Dev pluga (checklist)

- [x] Tokens + utilities em `globals.css`
- [x] `Landing.tsx` com motion
- [x] Spec onboarding rico + classes `chip-motion` / `bar-fill` / `vol-chart` / `obj-card`
- [x] Protótipo HTML onboarding + snippets (`docs/onboarding-motion-snippets.tsx`)
- [x] Spec Logger rico + CSS `num-tick` / `load-flash` / `set-anchor-pulse` / `is-anchor` / `hit-flash`
- [x] Protótipo HTML Logger + snippets (`docs/logger-motion-snippets.tsx`)
- [x] Patch leve `ui.tsx` NumStepper (key + num-tick / load-flash)
- [x] Patch leve `treino/page.tsx` (chips, âncora pulse placeholder, hit-flash)
- [x] `hoje/page.tsx` — `motion-stagger` + CTA glow + `meso-fill` + `pr-pop`
- [ ] `onboarding/page.tsx` — confirmar TimeBar + VolumeWeekPreview (snippets)
- [x] `checkin/page.tsx` — chips spring prontidão + `num-tick` sleep + `sheet-enter`
- [x] `progresso/page.tsx` — `bar-fill.enter` + stagger
- [x] `plano/page.tsx` — split stagger + week chips + volume bars
- [x] `treino/feedback/page.tsx` — stagger decisões + barras volume
- [x] `BottomNav.tsx` — `tab-motion` / `is-active`
- [ ] Revisar Logger em prod: tipo chips, load-flash, RIR, âncora pulse, hit-flash
- [ ] Opcional: `framer-motion` só no AnimatePresence do set ativo (não no onboarding)

## HTML referência

`/workspace/hypertrophy-prototype/index.html` (screenIn, chipPop, timerPulse, sheetUp)  
`/workspace/hypertrophy-prototype/auth-landing/index.html`  
`/workspace/hypertrophy-prototype/onboarding-motion/index.html`  
`/workspace/hypertrophy-prototype/logger-motion/index.html` (**novo** — Logger interativo)

## Anti-padrões

- Nada > 400ms em UI de academia (timer bar width é a única exceção suave)
- Sem parallax / Lottie / confetti / XP fake
- Sem animar layout width de texto em loop
- Glow lime só em CTA primário, tab ativa, chip/card selecionado, load-flash, âncora pulse — não em todo card
- `prefers-reduced-motion: reduce` → estado final, sem enter grow / chipPop / pulse infinito
