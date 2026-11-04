# Sono e água

Seção "Sono e água" no Progresso (com visão de 7 e 14 dias) e um resumo curto no Hoje.
Tudo aqui só **lê** o check-in. Nenhuma regra de carga, série ou progressão foi criada ou alterada.
O LLM não participa dos números.

## Dados usados (já existiam no check-in)
- `sono_inicio` / `sono_fim` (HH:MM) e `sono_h` (duração calculada; virada da noite: fim ≤ início soma 24 h).
- `agua_ml` (chips do check-in: 1; 1,5; 2; 2,5; 3 L+ — os dois últimos foram adicionados para a meta ser alcançável).
- `peso_kg` do check-in mais recente; sem ele, o peso do perfil.
- Um check-in por dia (`data`); quando há mais de um no mesmo dia, vale o último.

## Cálculos (`src/lib/sono-agua/avaliacao.ts`)
- **Eixo da noite:** horários viram minutos a partir do meio-dia (23:30 → 690, 00:30 → 750), para dormir antes ou depois da meia-noite ficar na mesma escala.
- **Média de sono:** média de `sono_h` das noites registradas na janela.
- **Regularidade:** desvio padrão do horário de dormir no eixo da noite. Mais de 60 min = horário irregular.
- **Noites abaixo de 7 h** (mínimo recomendado) e **abaixo de 6 h** (limiar da regra que já existe: com sono < 6 h ou disposição ≤ 2, o treino do dia perde 1 série nos exercícios principais e mantém a carga). A avaliação só cita essa regra.
- **Meta de água:** 35 ml × kg, arredondada a 250 ml, entre 1,5 L e 4 L. Sem peso: 2,5 L. Ex.: 80 kg → 2,75 L.
- **Mínimo para avaliar:** 3 registros na semana, 5 na quinzena. Abaixo disso aparece o estado vazio ("Ainda sem registros" ou "Quase lá").

## Avaliação (mesmo padrão dos alertas, `AlertaCard`)
| Situação | Título | Urgência |
|---|---|---|
| Média < 7 h ou mais da metade das noites < 7 h | Sono abaixo do ideal | Atenção (amarelo) |
| Duração boa, horário de dormir variando > 60 min | Horário de dormir irregular | Atenção |
| Resto | Sono na faixa boa | Aviso (neutro) |
| Meta de água em ≥ 70% dos dias | Água em dia | Aviso |
| < 70% (< 40% vira atenção) | Água abaixo da meta | Aviso/Atenção |

Cada card tem uma frase com os números, uma dica prática e, quando cabe, o botão "Registrar check-in".
O feedback do check-in (`feedbackSono`) também perdeu o código de regra que aparecia na tela.

## Fontes
- Watson NF et al. *Recommended Amount of Sleep for a Healthy Adult: A Joint Consensus Statement of the AASM and SRS.* Sleep, 2015;38(6):843–844 — adultos: 7 h ou mais por noite.
- Hirshkowitz M et al. *National Sleep Foundation's sleep time duration recommendations.* Sleep Health, 2015;1(1):40–43 — 18–64 anos: 7 a 9 h.
- Phillips AJK et al. *Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing.* Sci Rep, 2017 — regularidade importa além da duração.
- Knowles OE et al. *Inadequate sleep and muscle strength: implications for resistance training.* J Sci Med Sport, 2018;21(9):959–968.
- EFSA Panel on Dietetic Products. *Scientific Opinion on Dietary Reference Values for water.* EFSA Journal, 2010;8(3):1459 — 2,0 L/dia (mulheres) e 2,5 L/dia (homens) de ingestão total.
- National Academies (IOM). *Dietary Reference Intakes for Water, Potassium, Sodium, Chloride, and Sulfate*, 2005.
- ACSM. *Exercise and Fluid Replacement* (Sawka MN et al., Med Sci Sports Exerc, 2007;39(2):377–390).
- A regra prática de 30–35 ml/kg/dia é usada em orientação clínica e nutricional como estimativa; aqui é só referência de meta, sem efeito no treino.
