# Reavaliação de nível (lote 7)

Depois de alguns treinos, o Coach confere se o nível declarado (iniciante, intermediário ou avançado) ainda combina com o treino real. Quem decide é só o código determinístico em `src/lib/nivel/reavaliacao.ts`. A LLM não participa. Nada é salvo sem confirmação: o cartão em `/hoje` mostra o resumo da mudança e só remonta o plano (pelo mesmo fluxo de editar perfil, `updatePerfilAndRemount`) quando a pessoa toca em **Confirmar e remontar**. As regras de carga e progressão (R1–R12) não mudam. As cargas atuais são mantidas no remonte.

## Quando o Coach opina
- Pelo menos **6 sessões concluídas** e **21 dias** entre a primeira e hoje.
- Depois de uma mudança de nível pelo cartão, espera **4 semanas** e só conta sessões feitas depois da mudança.
- **Agora não** silencia o cartão por **4 semanas** (`perfil.nivel_silenciado_ate`).
- Precisa de pelo menos 3 fatores com dados, sendo um deles força relativa ou ritmo de progressão.

## Fatores (cada um vira um nível de 0 = iniciante a 2 = avançado)
| Fator | Peso | Como mede |
|---|---|---|
| Força relativa | 30% | Melhor e1RM (Epley, séries de até 12 reps) dos últimos 28 dias ÷ peso do corpo, só em básicos de barra (supino reto, agachamento livre, stiff/RDL). Leg press e máquinas ficam fora. |
| Ritmo de progressão | 30% | Inclinação semanal do melhor e1RM por sessão nos compostos (até 8 semanas, ignora a 1ª sessão de calibração). Mediana entre exercícios. ≥2%/semana → iniciante; ~1% → intermediário; ≤0,25% → avançado. Progressão lenta só aponta para avançado se a força também for alta (senão é estagnação). |
| Consistência | 15% | Sessões feitas nos últimos 28 dias ÷ sessões esperadas pelo plano. ≥85% → 2; 60% → 1. |
| Precisão do RIR | 15% | % de séries de trabalho com RIR a ±1 do alvo e coerente com as reps (RIR ≥3 com reps acima da faixa conta como erro). Se a pessoa sempre marca o mesmo número, vale metade. |
| Tempo de treino declarado | 10% | `perfil.tempo_treino_meses`, se existir: <12 meses → iniciante; 12–36 → intermediário; >36 → avançado. Sem o dado, o fator sai e os pesos são redistribuídos. |

Referências de força (e1RM ÷ peso, homens; mulheres usam 0,7×):

| Levantamento | Intermediário a partir de | Avançado a partir de |
|---|---|---|
| Supino | 1,0× | 1,5× |
| Agachamento | 1,25× | 2,0× |
| Stiff/RDL (0,8× do terra) | 1,2× | 1,8× |

## Decisão (com histerese)
- Estimativa `E` = média ponderada dos fatores disponíveis. `D` = nível declarado (0, 1, 2).
- **Subir** um nível só se: `E − D ≥ 0,75`, consistência ≥ 75%, pelo menos 2 fatores acima de `D + 0,5`, e não só a força.
- **Descer** um nível só se: `D − E ≥ 0,75`, pelo menos 2 fatores abaixo de `D − 0,5`, e não só a força.
- Muda no máximo um nível por vez. Dentro da margem, o Coach fica quieto.
- O cartão mostra até 3 motivos (os fatores que mais pesaram na direção da mudança), em português simples e sem códigos.

## Fontes
- Rippetoe M., Kilgore L. *Practical Programming for Strength Training* (classificação iniciante/intermediário/avançado pela velocidade de adaptação: sessão a sessão, semana a semana, mês a mês) e tabelas de padrões de força.
- ExRx.net, *Strength Standards*; Symmetric Strength (padrões de força relativos ao peso do corpo).
- ACSM (2009, atualizado 2026), *Progression Models in Resistance Training for Healthy Adults* (níveis de treinamento e progressão; ver `research-acsm-2026-params-v1.txt`).
- Kraemer W.J., Ratamess N.A. (2004), *Fundamentals of resistance training: progression and exercise prescription* (ganhos mais rápidos em iniciantes).
- Helms E.R. et al. (2016), *Application of the repetitions in reserve-based RPE scale* (acurácia do RIR melhora com a experiência).
- Epley B. (1985) para o e1RM; precisão cai acima de ~12 reps.

## Testes
`npm run smoke:reavaliacao-nivel`: iniciante forte → sobe; avançado fraco ou inconsistente → desce; carga alta com pouca consistência → nada; só a carga alta → nada; poucas sessões → nada; nível certo → nada; "Agora não" silencia; avaliar não grava.
