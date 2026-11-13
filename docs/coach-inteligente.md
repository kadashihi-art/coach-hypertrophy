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

## Leitura do dia (`leitura-dia.ts`, durante o treino)
Depois da primeira série pesada (top ou trabalho) de um exercício com histórico, o app compara o 1RM estimado de hoje (carga × reps + RIR) com o **normal recente**: a mediana das 3 últimas sessões, não o recorde.
- **≥ 8% abaixo (dia ruim):** propõe manter as cargas e tirar 1 série de cada exercício que falta, sem descer de 2 séries nem abaixo do que já foi feito. Em dia ruim, cortar volume preserva a qualidade.
- **≥ 4% acima (dia forte):** propõe +1 série no exercício atual (até 5).
- **Dentro do normal:** não aparece nada.

Só muda com "Ajustar o resto" ou "Fazer +1 série". A resposta fica em `sessao.leitura_dia`, o app não pergunta de novo no mesmo treino e a resposta é limpa no próximo início. O ajuste acompanha `ajuste_series_dia`, e a base do plano não muda.

A falha no top continua com a adaptação ao vivo que já existia (`adaptacao-ao-vivo.ts`, RIR 0 e reps abaixo do piso).

## Revisão semanal (`revisao-semanal.ts`)
No domingo revisa a semana que está fechando. Nos outros dias, a anterior. Mostra:
- **treinos e séries:** feitos × planejados, e séries que valeram (RIR ≤ 3, calibrado);
- **o que foi bem:** novos melhores 1RM estimados, 80%+ das séries perto da falha, todos os treinos feitos;
- **pede atenção:** treinos faltando, menos de 60% das séries valendo, músculo fora de 10–20, exercício parado (com a causa), sono médio < 7 h, proteína abaixo da meta;
- **semana que vem:** fase do bloco (deload, fim do bloco), ajustes por músculo que vêm do feedback e o foco principal.

Onde aparece:
- Progresso, completa (`#revisao`);
- `/hoje`, em uma linha, no domingo e na segunda;
- contexto do coach (`revisao_semana`).

É só leitura: ajustes do dia já entram sozinhos, e mudança de plano continua em Plano → Ajustar.

## Fechamento de bloco (`fechamento-bloco.ts`, `FechamentoBlocoCard`)
Aparece no `/hoje` na última semana do bloco e depois que ele termina. Cruza, por músculo:
- **volume feito:** média semanal de séries efetivas nas semanas de trabalho (sem a semana leve);
- **progresso:** variação do 1RM estimado dos exercícios do músculo, início × fim (3+ sessões por exercício);
- **recuperação:** vezes em que chegou bem dolorido ou incomodou a articulação.

| Situação | Próximo bloco |
|---|---|
| 2+ sinais de excesso (dolorido/articulação) | −2 séries/semana |
| Progrediu 2% ou mais | mantém |
| Pouco progresso, volume cumprido, recuperação ok | +2 séries/semana |
| Pouco progresso sem cumprir o volume (mais de 2 abaixo do piso) | mantém, e avisa |
| Pouco progresso já perto de 20 séries | mantém, e sugere variar o exercício |
| Sem dados | mantém |

O ajuste acumula em `Perfil.ajuste_volume_musculo` (−4…+4 por músculo). O gerador aplica por cima do volume já equilibrado (`alvosComAjustePessoal`), sem passar de 20 nem descer de 10.

A prévia mostra o volume antes → depois e os exercícios que saem e entram (mesmo cálculo do remontar, em memória).
"Confirmar e começar o novo bloco" só aparece depois que o bloco termina: remonta o plano (sem a etapa de texto da LLM, para o plano ser exatamente o da prévia) e põe o início do bloco em hoje. Histórico e cargas continuam.

Se o bloco terminou há mais de uma semana e o plano não foi refeito, a análise usa só as últimas semanas (dados de meses atrás não contam).

## Tempo curto (`tempo-curto.ts`)
No `/hoje`, antes de começar: "Quanto tempo você tem hoje?" (60, 45 ou 30 min, só as opções menores que o treino). Corta nesta ordem até caber:
1. séries, uma por vez, até 2 por exercício: isolador não prioritário → composto repetido do mesmo músculo → o resto;
2. exercícios inteiros: isolador de músculo que um composto do treino já trabalha → outros isoladores → composto repetido.

Nunca pula o primeiro composto de cada músculo e sempre sobram 2+ exercícios. Músculo prioritário é o último a perder.
Vale só no dia: séries via `ajuste_series_dia` e exercícios via `pulado_hoje`, ambos limpos no próximo início. Se nem o mínimo cabe, o app diz quanto tempo o mínimo leva.

Junto veio um ajuste: "Continuar" um treino em andamento hoje não recalcula mais as prescrições do dia (isso desfaria tempo curto, leitura do dia e ajustes ao vivo no meio do treino).

## Trocar o treino de hoje
No card do Hoje, "Trocar o treino de hoje" (ou "Treinar hoje mesmo assim" em dia de descanso) abre a lista dos treinos do plano.
Você marca um, vê a prévia ("Hoje passa a ser Lower B. Upper B volta pra fila…") e só muda em "Confirmar mudança".
- O escolhido fica fixo hoje no calendário (`marcarDia` com "trocar"), e o treino que estava hoje volta pra fila.
- `proximaSessao` passa a sugerir o treino que você fixou hoje antes da fila.
- Um treino já feito na semana vira "repetir": a execução anterior fica guardada no dia dela.
- Nenhuma série é apagada. Sem data de início do plano, a troca vale só pra tela (não mexe no calendário).
