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
- Treino aberto sem nenhuma série (tocou em Começar e voltou) também pode ser trocado: ele é fechado e volta pra fila (`src/lib/plan/trocar-hoje.ts`). Com série registrada, a troca não acontece.

## Mudança local que não chegou ao servidor
Toda mudança fica marcada como pendente até o servidor confirmar (`marcarPendente`/`limparPendente` em `src/lib/storage.ts`).
Ao abrir o app, se há pendência e o servidor tem a mesma versão, a cópia local ganha. Antes, um envio que falhava fazia a mudança voltar atrás.
O servidor só ganha quando tem uma versão mais nova, vinda de outro aparelho.

### Casos da troca (relatos do uso)
- Escolhido já feito hoje: com séries, a execução fica guardada e ele repete hoje; sem série, a marcação de feito sai e ele vira o de hoje.
- Outros treinos marcados como feitos hoje sem nenhuma série (ex.: "Finalizar" num treino vazio) voltam pra fila na troca, com aviso.
- Treino feito de verdade hoje (com séries) continua feito. O calendário mostra ele, o Hoje mostra o escolhido, e o aviso explica.
- A lista mostra só os treinos da fase atual. A troca funciona com ou sem data de início do plano.
- `corrigirDataDoTreinoNoturno` também usa o horário das séries. Isso inclui a execução guardada ao repetir (`…#feito-…`): séries de 21h–24h de um dia salvas com a data do dia seguinte voltam para o dia certo.

## Agenda única do calendário (`src/lib/plan/agenda-semanal.ts`)
Relato do uso: dias de treino e dias do calendário não batiam. Havia treino em dia de folga, treino feito aparecia em outro dia e semanas mostravam menos treinos.

Antes:
- A semana atual vinha de um cálculo ("agenda efetiva": o pendente ia pra hoje, e os dias extras copiavam o ritmo do histórico).
- As semanas seguintes vinham de outro (projeção pelo microciclo).
- Treino feito numa semana anterior só aparecia nesta como previsão. Se o dia passava, ele sumia.

Agora, para planos com fases:
- Cada semana do plano tem os treinos do microciclo e cai só em dia de treino. Folga continua folga.
- Feito, parcial, em andamento, pulado e marcado à mão tiram o treino da fila.
- O que passou sem ser feito (desta semana ou da anterior) vira pendente no próximo dia de treino. Os seguintes andam pra frente.
- O dia perdido aparece como "Pendente" com o treino que andou. Dá pra "Registrar como feito" nele.
- Hoje, faixa, calendário e `proximaSessao` usam a mesma agenda. O Hoje decide "descanso" pela agenda completa.
- Parcial aparece como feito.

Planos antigos sem fases continuam com a agenda legada. Smoke: `smoke:agenda-semanal`.

### Dias da semana escolhidos (`perfil.dias_treino_semana`)
Relato do uso: mesmo com a agenda única, o calendário ainda não batia com a rotina. Causa: as folgas do microciclo são posições contadas da data de início do plano ("dia 1, dia 4"). Com início numa quarta, a folga do "dia 1" caía na quarta, e o domingo virava dia de treino.

Agora:
- No calendário, o card "Em quais dias você treina?" marca os dias da semana (ex.: seg, ter, qui, sex, sáb). Ele já vem com os dias que o calendário usa, e só grava com "Salvar dias". O número de dias tem que ser igual ao de treinos da semana.
- Com os dias salvos, o k-ésimo treino de cada semana do plano cai no k-ésimo dia escolhido, na ordem do microciclo. Folga e pendente seguem as mesmas regras de antes.
- Só muda as datas. O treino, as séries e o plano salvo não mudam.
- Sem os dias salvos, vale o microciclo como antes. O Hoje mostra um aviso com o link "Escolher dias".

### Depois de concluir o treino do dia
O cartão do Hoje passa para o próximo treino, com o dia dele ("Próximo treino · sexta-feira") e a linha "✓ Hoje: Lower A feito". Embaixo ficam "Ver semana" e "Adiantar pra hoje".

### Falha ao salvar no servidor
- O erro 500 agora vem com o motivo, curto, no aviso laranja.
- O app não reenvia um estado igual ao que o servidor já tem, e o servidor não grava de novo o que não mudou (cada gravação gasta a cota do armazenamento).
- Depois de um erro do servidor, o app tenta de novo sozinho em 1 minuto.
- Leitura que falha ao abrir o app (ex.: 403 do Blob bloqueado) também aparece no aviso: o aparelho mostra só o que tem guardado, e outro aparelho pode estar diferente.
- O envio espera 4 s sem mudança (antes 0,5 s) e sai na hora quando o app vai pro fundo. Menos gravações por treino.

### Cópia dos dados (`src/lib/backup.ts`, Perfil → Conta)
Motivo: com o armazenamento da Vercel bloqueado pelo limite do plano gratuito, os treinos só existem no aparelho, e trocar de endereço do app (outra conta) começaria do zero.
- **Exportar meus dados:** gera `coach-hypertrophy-AAAA-MM-DD.json` com todo o estado deste aparelho. No celular abre a folha de compartilhar (salvar em Arquivos, Drive ou e-mail); no PC baixa o arquivo.
- **Importar** (também na primeira tela do cadastro, "Já usava o app?", pra um endereço novo do app que abre vazio): lê o arquivo, confere se é uma cópia válida do app e mostra o resumo da cópia e do aparelho (treinos feitos, séries, último treino). Só troca com "Substituir". Treino aberto não vem junto.
- Funciona sem o servidor. Depois de importar, o envio ao servidor sai como qualquer mudança.
Smoke: `smoke:backup`.

## Reformulação 2.0: fase 1 (base + Hoje)
Proposta completa: artifact "Coach Hypertrophy 2.0" (diagnóstico, mapa de abas, mockups, fases).
- Abas: Hoje · Semana · Evolução · Coach · Você (rotas iguais: /hoje, /plano, /progresso, /coach, /perfil). Dentro de Semana: Treinos · Calendário · Ajustar.
- `MensagensCoach`: todo aviso do Hoje num formato só (bloqueio, atenção, informação), em ordem de prioridade: PAR-Q+ > servidor > alerta de volume > treino pendente > ajuste do dia (rampa/deload) > dias de treino > sono/água/proteína. Mostra até 2; o resto fica em "Mais N avisos". PAR-Q+ nunca fecha.
- `StatusConexao`: o selo "Offline" só aparece sem internet.
- Hoje: cartão do treino com as séries do dia já ajustadas ("4×6–12 (+1)"), um botão "Começar" e, lado a lado, "Menos tempo" e "Trocar treino". "Corrigir registro" não aparece antes de começar. A meta de cada exercício abre ao tocar (abre sozinha se algum exercício incomodou a articulação). Check-in e cardio viram uma linha cada; a faixa de dias é uma só.
- Altura do Hoje no celular (390 px, dados de teste): 2.260 → 1.470 px.

## Reformulação 2.0: fase 2 (treino + fim do treino)
- Treino: "exercício X de Y" no topo; uma linha de meta, com o porquê do RIR num toque; "Ocupado? Fazer <alternativa>" num botão só (antes eram sugestão + botão); séries feitas com rótulo em cima e valores embaixo; tipos de série numa linha; cronômetro compacto (`RestTimerPill compacto`) cobrindo menos da carga; "Finalizar treino" discreto enquanto há série a fazer.
- Fim do treino (`/treino/feedback`): resumo (duração, séries de trabalho, descanso médio), recordes de hoje (`recordesDaSessao`), feedback por músculo, próximo treino com o dia, "O que muda na próxima vez" (sobe/mantém/desce, sem código de regra) e séries por músculo recolhidas. Smoke: `smoke:fim-treino`.

## Reformulação 2.0: fases 4, 5 e 6
- Semana (`/plano`): treinos fechados que abrem ao tocar (o próximo vem aberto); "Por que esse plano" em 3 linhas com "Ver mais"; equipamento e cuidados em texto (não parecem botões); "Bloco de 6 semanas" no lugar de "Mesociclo". Altura: 4.404 → 1.868 px.
- Ajustar: só estilo, músculos prioritários, refazer com o coach e data de início. Peso, nível, dias, tempo, cardio, objetivo, equipamento e cuidados ficam só em Você (atalho "Editar em Você").
- Você (`/perfil`): seção "Seu plano" (dias de treino, estilo e prioridades, refazer meu plano com o coach).
- Evolução (`/progresso`): abas Semana · Força · Corpo (links `#cardio`, `#sono-agua`, `#forca` abrem a aba certa). Força em lista compacta; exercícios sem dado viram uma linha.
- Textos: "Subindo volume"/"Carga mais alta"/"Pico de força" (antes Acúmulo…); "1 pesada + 2 mais leves" (antes "top → 2× back-off"); séries "Pesada"/"Mais leve" (antes Top/Back); meta "N séries de X–Y, parando com R reps sobrando"; "Semana 3 de 6".
- Acessibilidade: cinza fraco com contraste ≥ 4,5:1; contorno de foco visível no teclado.
