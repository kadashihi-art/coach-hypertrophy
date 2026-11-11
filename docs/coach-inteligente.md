# Coach inteligente: volume por feedback e briefing do treino

Código em `src/lib/inteligencia/`. Smoke: `npm run smoke:inteligencia`.
Tudo é determinístico. A LLM só explica: ela recebe `feedback_musculos` no contexto e não decide números.

## Volume autorregulado por músculo (`volume-autorregulado.ts`)
A faixa de 10–20 séries é a média da literatura. Cada pessoa recupera de um jeito, então o app aprende por músculo com 2 toques:

| Quando | Pergunta | Onde |
|---|---|---|
| Logo depois do treino | Estímulo no músculo: fraco / bom / muito forte, e se incomodou a articulação | `/treino/feedback` (`FeedbackPosTreino`) |
| Antes do treino seguinte daquele músculo | Como chegou: recuperado / um pouco / bem dolorido | Briefing no `/hoje` (`RecuperacaoPreTreino`) |

Cada ocorrência (pós-treino pareado com a recuperação relatada depois dele) vira um delta:
- incomodou a articulação → **−1**, e o briefing sugere trocar o exercício;
- chegou bem dolorido → **−1**, porque ainda está recuperando;
- chegou recuperado e o estímulo foi fraco → **+1**, porque sobra recuperação e falta estímulo;
- o resto → **0**, porque a rampa do bloco já cuida da subida gradual.

**Ajuste do músculo** = soma das últimas 4 ocorrências do bloco (desde `mesociclo.data_inicio`), limitada a −2…+2.

**Aplicação.** Entra por cima da rampa (`rampa-volume.ts`), no exercício principal do músculo no treino do dia, como ajuste do dia (`ajuste_series_dia`). A base do plano não muda.

**Travas:**
- 2 a 5 séries no exercício;
- teto semanal do grupo (descontando o que a rampa já somou);
- em deload ou com check-in ruim, só reduz.

Sem feedback, nada muda.

## Briefing do treino (`briefing.ts`, `BriefingTreino`)
Aparece no `/hoje` antes de começar e mostra:
1. **Cabeçalho:** semana do bloco e foco (acumulando, intensificando, deload).
2. **Recuperação:** como chegou cada músculo de hoje (só os que já têm feedback).
3. **Ajustes do dia:** o que mudou e por quê. Ex.: "+1 série em Supino reto: você chegou recuperado e o estímulo foi fraco".
4. **Por exercício:**
   - **séries:** com o ajuste do dia;
   - **meta:** ex.: "80 kg × 10 no RIR 2: 1 rep a mais que a última vez", "Carga nova…", "Um passo atrás…" ou "Primeira vez…";
   - **última vez:** quando foi feito;
   - **por quê:** a última decisão de progressão, sem código de regra;
   - **preparação:** aquece + aproximação, ou só aproximação.

A meta usa a carga que o motor já decidiu (`estados.alvo_proxima_sessao`) e o RIR do dia (`rirAlvoDoDia`). Não cria número novo.

## Diagnóstico de estagnação (`diagnostico.ts`)
Quando um exercício fica 2+ sessões sem progresso, o app não diz só "travou". Ele olha os dados e aponta até 3 causas prováveis, cada uma com evidência e ação:

| Causa | Sinal nos dados |
|---|---|
| Longe da falha | RIR médio das 3 últimas sessões ≥ alvo + 1,5 |
| Falha demais (composto) | RIR médio ≤ 0,3 |
| Sono curto | metade ou mais das noites < 6h30 nos últimos 14 dias (4+ check-ins) |
| Proteína baixa | média < mínimo da meta (3+ registros) |
| Volume baixo / alto | média < 8 ou > 20 séries efetivas nas 2 últimas semanas fechadas |
| Intervalo longo | > 9 dias entre as sessões do exercício |
| Dor | dor marcada no exercício nos últimos 21 dias |
| Chega dolorido | 2+ vezes "bem dolorido" no músculo em 21 dias |
| Adaptação | nenhum dos sinais acima: hora de variar o exercício ou a faixa de reps |

Onde aparece:
- **Progresso:** "Parado há N treinos. Por quê?", expansível;
- **briefing do /hoje:** só a causa principal e a ação;
- **contexto do coach:** `estagnacoes`.

## Previsão de força
Regressão linear do e1RM nas últimas até 8 sessões (90 dias). Mostra "No ritmo atual (+1 kg/semana no 1RM estimado), você passa de 115 kg em ~5 semanas" só quando:
- há 4+ sessões cobrindo 14+ dias;
- o ritmo é > 0,2 kg/semana;
- o marco (próximo múltiplo de 5 kg) chega em até 16 semanas.

Fora disso não mostra nada. Não promete o que os dados não sustentam.
