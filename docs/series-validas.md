# Séries válidas, ordem das séries e volume do plano

Código:
- `src/lib/treino/estrutura-series.ts` (ordem e preparação)
- `src/lib/plan/equilibrar-volume.ts` (volume do plano)
- `src/lib/plan/prioridades.ts` (prioridade muscular)
- `src/lib/conceitos.ts` (explicações práticas)

Smokes: `smoke:estrutura-series`, `smoke:volume-plano`, `smoke:prioridades`, `smoke:conceitos`.

## Literatura
- **Schoenfeld, Ogborn e Krieger 2016** (J Sports Sci): dose-resposta. Fazer 10 ou mais séries semanais por músculo cresce mais que fazer menos de 5 (9,8% contra 5,4%).
- **Pelland et al. 2025/26** (Sports Med, 67 estudos): mais volume semanal dá mais hipertrofia, com retorno decrescente. A série indireta conta 0,5 (fracionado). Com o volume igualado, a frequência quase não muda a hipertrofia.
- **Robinson 2024; Refalo 2023/2024**: a hipertrofia cai à medida que o RIR sobe. De 0 a ~3 reps sobrando, a série fica perto do máximo. Ir à falha não acrescenta.
- **Angleri 2017**: com o volume igualado, pirâmide crescente, drop-set e séries tradicionais dão o mesmo resultado. A ordem pesa menos que o volume e o esforço.
- **Ribeiro 2014 e revisão de 2021**: o aquecimento específico melhora a velocidade e a força da 1ª série. O efeito sobre o total de reps é misto. Serve para preparar, não para gerar volume.

## Série válida
Uma série vale quando termina com 0–3 reps sobrando, boa técnica e amplitude completa, com cargas de ~30–85% do 1RM.
Aquecimento e aproximação nunca contam.

## Ordem das séries (antes → agora)
- **Antes:** N−2 séries de "trabalho" a 80% do top → top → 1 back-off a 90%, todas com a mesma sugestão de reps.
  Com top de 8 reps no RIR 2 (~10RM), a série de 80% (~60% do 1RM) aguenta ~20 reps. Feita com 8, sobravam ~12: não era válida, mas contava volume e ainda cansava antes do top.
- **Agora:** aproximação → **top** (carga do motor, RIR alvo) → **N−1 back-offs** a ~90% do top, no **mesmo RIR**.
  A sugestão de reps do back-off é "reps do top + 2", limitada à faixa. Toda série que conta volume termina perto da falha.
- Se o step do equipamento for grosso e 90% cair abaixo de 80% do top, o back-off repete a carga do top (vira série reta) e as reps caem sozinhas.
- N = 1, drop-set e rest-pause continuam como antes. A progressão continua decidida pelo top.

## Preparação
| Situação | Preparação |
|---|---|
| 1º exercício do treino, ou músculo ainda não aquecido | aquecimento (~60%, 8 reps) + aproximação (~85% do top, 3 reps) |
| Músculo já aquecido, composto livre (barra, halteres, kettlebell) de **padrão novo** (ex.: stiff depois do agachamento) | só 1 aproximação |
| Músculo já aquecido, mesmo padrão ou máquina, cabo ou isolador | direto pro top |

Aquecidos = primário + secundários de compostos anteriores. Supino reto e inclinado são a mesma família.

## Volume do plano (`equilibrarVolume`)
O volume é contado por fase, e cada sessão vale 1× por semana. Séries efetivas = diretas + 0,5 × indiretas.
1. **Teto por sessão:** no máximo 10 séries diretas do mesmo músculo.
2. **Teto semanal:** 20 por grupo (abdômen e antebraço: 12).
3. **Piso semanal** dos grupos principais (peito, costas, ombros, quadríceps, posterior, glúteo, bíceps, tríceps, panturrilha):
   - hipertrofia ou recomposição: iniciante 10, intermediário 12, avançado 14;
   - força ou saúde: 10;
   - músculo prioritário: +4 (até 20).

   Para chegar no piso, o equilíbrio sobe 1 série num exercício existente. Se não der, acrescenta um exercício de 2–3 séries num dia compatível.
   Só faz isso se a sessão continuar cabendo no tempo do perfil (+10%).
4. **Prioritário sem tempo:** tira 1 série de um grupo não prioritário que continua no piso e tenta de novo. Se não couber, desfaz.
5. Quando não dá pra chegar no piso, a justificativa avisa a causa em vez de inventar volume:
   - falta de tempo: "Com 45 min por treino, peito ficou abaixo do ideal…";
   - músculo que só treina 1×/semana na divisão: "…treina só 1×/semana…".

Exercícios: 2 a 4 séries (até 5 no avançado). Os opcionais (abdômen, antebraço, abdutores, adutores) não contam no tempo do equilíbrio.

**5 dias no automático:** continua Push/Pull/Legs (Push A, Pull A, Legs A, Push B, Pull B), com o mesmo calendário de antes.
Como as pernas treinam 1×/semana nessa divisão, o equilíbrio sobe o que cabe no treino de pernas (quadríceps de ~7 para ~10, com o teto de 10 por treino). Com uma segunda opção de exercício (extensora → leg press/hack), a justificativa explica que o que falta vem da frequência, não do tempo.
Upper/Lower em 5 dias ou PPL em 6 resolvem, por escolha do usuário.

## Prioridade muscular
- `Perfil.prioridades_musculares` (até 3) e `prioridade_motivo`. Ausente = plano igual ao de antes.
- **Efeito no plano:** +4 no piso (até 20). O composto do músculo prioritário vai para o início do treino e o isolador dele vem antes dos outros isoladores.
- **Tela:** Plano → Ajustar → "Músculos prioritários".
  - A sugestão sai do histórico: semanas abaixo do piso e exercícios parados há 2+ treinos.
  - A prévia mostra as séries/semana antes → depois (motor, em memória).
  - Nada muda até "Confirmar e remontar".
- **Onboarding:** a estratégia da coleta (`prioridades_musculares`) passa para o perfil.

## Conceitos na prática
`/conceitos` e os botões "?" no treino (RIR, fase da série) e no Progresso (volume, série válida, e1RM) explicam:
- RIR, RM/e1RM, série válida e falha;
- aquecimento, aproximação, top/back-off;
- volume, progressão e deload.

Quando há histórico, o exemplo usa os números do usuário (ex.: "Seu 1RM estimado no supino é ~107 kg, então seu 10RM fica perto de 80 kg").
