# Proximidade da falha (lote 9)

Código: `src/lib/engine/proximidade-falha.ts`. Smoke: `npm run smoke:falha`.
Tudo aqui é determinístico e só leitura. Não grava nada, não muda kg nem séries. A LLM não decide RIR.

## Por que isso importa
Pra hipertrofia, o que mais pesa em cada série é chegar perto da falha com boa técnica, porque é aí que a tensão mecânica nas fibras fica alta. Técnicas avançadas vêm depois disso.

## Literatura
- **Refalo et al. 2023** (Sports Med, meta-análise): a hipertrofia é parecida entre ir à falha e parar perto dela. A força não depende de ir à falha. Treinar longe da falha (RIR alto) rende menos.
- **Refalo et al. 2024** (J Sports Sci, intraindivíduo, 0 vs 1–2 RIR): crescimento semelhante. Ir à falha só aumenta a fadiga e o desconforto.
- **Robinson et al. 2024** (Sports Med, meta-regressão dose-resposta): a hipertrofia cai conforme o RIR sobe, de forma gradual. Séries com 0 a ~3 reps sobrando ficam perto do máximo. A força é pouco sensível ao RIR.
- **Helms et al. 2016** e **Zourdos et al. 2016** (escala RIR/RPE): o RIR relatado é mais preciso perto da falha, em séries mais pesadas e em quem tem mais experiência. Iniciantes tendem a subestimar quanto sobrava.
- **Halperin et al. 2022** e **Remmert et al. 2023**: a acurácia do RIR melhora com prática e feedback. É por isso que o app compara o relatado com a performance.

## Regras
### RIR alvo do dia (`rirAlvoDoDia`)
- Base: composto livre (barra, halteres) 2, composto em máquina ou cabo 2, isolador 1.
- Piso: composto livre nunca abaixo de 1. Máquina, cabo e isolador podem chegar a 0.
- Fase do bloco (semanas de trabalho, sem a última): no primeiro quarto soma +1, do meio pro fim (≥ 67%) tira −1.
- Iniciante: +1 nos compostos.
- Recuperação ruim (sono < 6 h ou disposição 1–2, a mesma régua do check-in): +1.
- Deload: RIR 3 em tudo.
- Limite: 0 a 4.

### Calibração do RIR relatado (`calibrarSerie`)
- **e1RM de referência**: o melhor de séries antigas com RIR ≤ 1 e até 12 reps, calculado por Epley com reps + RIR. As reps máximas previstas na carga menos as reps feitas dão o RIR estimado.
- **Queda entre séries com a mesma carga**: quem marca RIR ≥ 3 e cai 3+ reps na seguinte estava perto. Quem marca RIR ≤ 1 e repete as reps (ainda marcando ≤ 1) tinha sobra, e o estimado fica no relatado + 2.
- O app só reinterpreta com diferença de 2+ reps e usa a média entre o relatado e o estimado. Avisa em tom humano, por exemplo: "Você marcou RIR 3, mas a queda de reps na série seguinte mostra que estava mais perto da falha, com só 1 rep sobrando. Vou considerar 2."

### Feedback após cada série (`feedbackSerie`)
- Longe (RIR interpretado > 3 ou ≥ alvo + 2): "Dava mais 1–2 reps. Na próxima, vai até sentir que só sobraria 1."
- Efetiva: "Na zona efetiva, no ponto certo. Na próxima, repete essa intensidade."
- Falha num composto livre: "Foi até a falha num composto pesado. Na próxima, pare com 1–2 reps sobrando…"
- Passou do alvo do dia: "Passou do ponto de hoje (o alvo era deixar 2 reps)…"
- No aquecimento, o app não cobra proximidade da falha. Com dor marcada, ele pede pra segurar a margem.

### Técnicas avançadas (`liberacaoTecnicas`)
O app só recomenda técnica quando os quatro pontos abaixo valem:
- Há 6+ séries de trabalho nos últimos 14 dias.
- 70%+ delas terminaram com RIR interpretado ≤ 2.
- A recuperação de hoje está ok.
- Não é semana de deload.

Fora disso, o seletor mostra "Ainda não recomendo" e explica o motivo. A escolha continua opcional e precisa de confirmação.

### Séries efetivas da semana (`seriesEfetivasSemana`)
Séries diretas de trabalho da semana ISO com RIR interpretado ≤ 3, contadas por músculo principal, aparecem no Progresso como "X de Y séries perto da falha".

### Sono no Hoje
O cartão do check-in usa a mesma régua do resumo semanal (lote 8). Ele só marca "Horário de dormir irregular" quando o desvio do horário de dormir passa de 60 min em 3+ noites. Duração variando não conta como irregular.
