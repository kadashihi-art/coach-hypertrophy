# Técnicas avançadas (lote 4)

Poucas técnicas, todas opcionais, só na **última série de trabalho** de isoladores ou de exercícios em máquina/cabo.
Código: `src/lib/engine/tecnicas.ts` (regras, textos, carga), `src/components/TecnicaPicker.tsx` (UI), smoke `npm run smoke:tecnicas`.

| Técnica | Carga (decidida pelo Coach) | O que o usuário registra |
|---|---|---|
| Drop-set | −20 a 25% da carga da série, no degrau do exercício (2,5 kg superiores / 5 kg inferiores, o mais perto de −22,5%; sem degrau na faixa, o mais perto dela) | reps no drop |
| Rest-pause | mesma carga, 2 pausas de 15–20 s | reps após cada pausa |
| Myo-reps | mesma carga; ativação + até 4 mini-séries de 3–5 reps com 3–5 respirações | reps de cada mini-série |
| Bi-set | mesma carga; vai direto pro próximo exercício, sem descanso | nada extra |
| Parciais no final | mesma carga; 4–6 reps parciais na parte alongada | reps parciais |

## Quando pode
- Ativada pelo usuário no **Editar treino** ou no **Editar durante o treino**, sempre com resumo e "Confirmar".
- Só isolador ou máquina/cabo, nunca em exercício com top set + back-off. Bi-set precisa de um isolador/máquina logo depois, sem outra técnica.
- **Limite: 2 por treino** (bi-set conta 1). Desligadas em semana de deload. Durante o treino, trava depois que a última série foi feita.
- O servidor (`/api/state`) recusa estado fora dessas regras.

## Registro, recorde e progressão
- `RegistroSerie.carga_kg/reps` = **só o bloco principal** da série. A extensão vai em `RegistroSerie.tecnica` (`tipo`, `carga_extra_kg`, `reps_extra`).
- **e1RM/PR**: lê só o bloco principal. Drop, mini-séries e parciais nunca entram (não inflam o recorde).
- **Progressão** (`progression.ts`) não mudou: lê as mesmas séries com a mesma carga real; a técnica não altera a decisão de carga.

## Volume (regra adotada, conservadora)
- A série principal conta 1, como sempre.
- **Drop-set, rest-pause e myo-reps**: a extensão soma **+0,5 série direta** no músculo principal, nada nos secundários, e só se o usuário registrou reps extras.
- **Parciais**: +0. **Bi-set**: cada exercício conta as próprias séries (nada extra).

Base: drop-sets e rest-pause geram hipertrofia parecida com séries tradicionais em menos tempo, mas não equivalem a uma série cheia a mais
(Sødal et al., 2023, revisão/meta-análise sobre drop-sets; Prestes et al., 2019, rest-pause; Schoenfeld & Grgic, 2018).
Myo-reps é um formato de rest-pause; contar a extensão inteira como séries cheias superestimaria o volume. Parciais alongadas têm evidência
inicial positiva (Wolf et al., 2023), mas ainda insuficiente para contar como volume. Por isso o meio-termo: +0,5 e nada nos secundários.
