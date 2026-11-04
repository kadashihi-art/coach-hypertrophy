# Duração do treino e descanso real (item 5 da auditoria)

Calculados só a partir dos horários das séries (`executado_em`); o usuário não digita nada.
Código: `src/lib/engine/duracao-treino.ts`. Não altera cargas, reps, RIR nem progressão.

- Séries ordenadas por horário; mínimo de 2 horários válidos.
- Intervalo > 30 min entre séries = pausa (ex.: treino aberto e retomado no dia seguinte). Fica fora da duração e do descanso.
- Duração = soma dos intervalos válidos + 4 min de margem (aquecimento/ajuste antes da 1ª série e execução da última). Teto de 240 min.
- Descanso médio real = média dos intervalos entre 15 s e 15 min (menos que 15 s é registro em lote; mais que 15 min não é descanso).
- Ao concluir a sessão, `duracao_real_min` é gravado. Sessões antigas: calculado só na exibição, nada é reescrito.
- Meta: `perfil.minutos_por_sessao`; ±5 min conta como dentro da meta.
