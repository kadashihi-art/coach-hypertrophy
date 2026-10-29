# Research brief — Coach de hipertrofia natural (uso pessoal)

**Data:** 28/10/2026 (America/Sao_Paulo)  
**Objetivo:** embasar o MVP do app pessoal (coach PhD natural, sessão guiada, progressão, água/suplementos, UI gamificada, offline).  
**Método:** WebSearch + WebFetch em meta-análises, position stands e padrões de apps de academia. Números só quando a fonte os traz; quando a evidência é mista, isso está explícito.

---

## 1) Evidência científica

### 1.1 Volume semanal por músculo

- Meta-análise de Schoenfeld, Ogborn & Krieger (2017): relação dose-resposta entre **sets semanais por grupo muscular** e hipertrofia. Com volume como variável contínua, cada set adicional associou-se a ~**0,37%** a mais de ganho percentual. Em faixas, os ganhos médios reportados foram **~5,4%** (&lt;5 sets/sem), **~6,6%** (5–9) e **~9,8%** (10+); a comparação categórica ficou em tendência (p = 0,074). Os dados **não** estabeleceram se volumes bem acima de 10 sets continuam a valer a pena.
  - https://doi.org/10.1080/02640414.2016.1210197  
  - PDF aberto: https://www.ageingmuscle.be/sites/bams/files/publications/Dose%20response%20relationship%20between%20weekly%20resistance%20training%20volume%20and%20increases.pdf
- Guideline NSCA/SCJ (Schoenfeld & Grgic, 2018): **10+ sets por músculo/semana** como bom ponto de partida para quem prioriza hipertrofia; volumes baixos ainda produzem ganhos relevantes se o tempo for curto.
  - https://journals.lww.com/nsca-scj/Fulltext/2018/08000/Evidence_Based_Guidelines_for_Resistance_Training.11.aspx
- Meta-regressão mais recente (Pelland et al., abstract ACSM / SportRxiv dataset): dose-resposta **positiva com retornos decrescentes** para volume semanal “fractional”; não há platô claro, mas **mais incerteza** em volumes altos.
  - https://doi.org/10.1249/01.mss.0001158628.17279.5f
- Reanálise Boutagy & McKean (SportRxiv, 2026): com volume semanal fixo, **dividir em mais sessões não mostrou benefício detectável** para hipertrofia (coeficiente de partição ~0). Ou seja: **volume semanal importa mais que “quantas vezes”** dentro das faixas típicas dos estudos.
  - https://sportrxiv.org/index.php/server/preprint/view/1100

**Implicação pro app:** rastrear **sets/semana por músculo** (direto + indireto, se possível) e ajustar o plano; não fixar um split “mágico”.

### 1.2 Frequência

- Schoenfeld, Grgic & Krieger (2019): com **volume equalizado**, frequência mais alta vs mais baixa **não** difere de forma significativa/meaningful para hipertrofia. Preferência pessoal e recuperação guiam a escolha.
  - https://doi.org/10.1080/02640414.2018.1555906
- Schoenfeld et al. (2016, meta anterior): sugeria vantagem de ~2×/semana vs 1×, mas a revisão de 2019 (mais estudos, volume equated) é a referência atual mais forte.
  - https://doi.org/10.1007/s40279-016-0543-8

**Implicação:** PPL, Upper/Lower, full body ou híbridos são **ferramentas** para entregar volume e caber no tempo — não dogma.

### 1.3 Proximidade da falha / RIR

- Refalo et al. (2023, *Sports Med*): vantagem **trivial** de treinar até “set failure” vs non-failure (ES **0,19**; 95% CI 0,00–0,37). **Sem** evidência de superioridade clara da falha momentânea vs non-failure; thresholds altos de velocity loss também não mostraram vantagem clara. Sugere relação **não linear**.
  - https://doi.org/10.1007/s40279-022-01784-y  
  - PubMed: https://pubmed.ncbi.nlm.nih.gov/36334240/
- Robinson, Pelland, Refalo, Zourdos et al. (2024, *Sports Med*): meta-regressões exploratórias com RIR estimado — hipertrofia tende a melhorar quando as séries terminam **mais perto da falha**; ganhos de força foram similares numa faixa ampla de RIR. Autores pedem **cautela** (RIR estimado, natureza exploratória).
  - https://doi.org/10.1007/s40279-024-02069-2

**Implicação:** coach pede RIR; prioriza esforço alto (tipicamente ~0–3 RIR nos working sets) **sem** exigir falha em todo set composto; falha mais útil em isolamento / máquina quando a técnica se mantém.

### 1.4 Progressão de carga

- Progressive overload via **carga** ou via **reps** (mesmo range) produziu hipertrofia comparável em estudos controlados (ex.: PeerJ “Progressive overload without progressing load?”, 2022).
  - https://doi.org/10.7717/peerj.14142  
  - PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC9528903/
- Na prática, **double progression** (subir reps no range → subir carga e resetar) é um método simples e alinhado a essa evidência.

### 1.5 Descanso entre séries

- Singer, Wolf, Schoenfeld et al. (2024, Bayesian meta): pequeno benefício hipertrófico para descanso **&gt;60 s**; pouco ganho adicional claro ao ultrapassar ~90 s, com muita heterogeneidade.
  - https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full

**Implicação:** timer padrão ~90–180 s em compostos; mais curto em isolamentos — ajustável na sessão.

### 1.6 Deload / periodização simples

- Coleman et al. (PeerJ, 2024): 1 semana de deload completo durante treino supervisionado → hipertrofia **similar** ao treino contínuo; força **pior** no braço deload no curto prazo. Ou seja: deload **não** é “mais hipertrofia”; é gestão de fadiga.
  - https://doi.org/10.7717/peerj.16777  
  - PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC10809978/
- Delphi internacional (Soft et al., 2023): consenso de coaches — deload = redução planejada de stress; reduzir volume (sets/reps/sessões); intensidade pode manter ou cair; individualizar por fadiga, idade, agenda.
  - https://doi.org/10.1186/s40798-023-00633-0  
  - PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC10511399/
- Periodização linear vs undulating para hipertrofia: meta Schoenfeld et al. (2017) — **sem** superioridade clara de um modelo sobre o outro quando o volume/esforço são adequados.
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC5571788/

**Implicação MVP:** deload **reativo** (queda sustentada de performance / sono / dor) + opção de ciclo a cada ~4–8 semanas; não periodização complexa no dia 1.

### 1.7 Sono e recuperação

- Craven et al. (2022, meta): perda aguda de sono → queda média de desempenho ~**−7,56%** (95% CI −11,9 a −3,13); pior com privação total / restrição “late”.
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC9584849/
- Knowles et al. (2018, revisão sistemática): restrição em noites consecutivas pode reduzir força em movimentos multiarticulares.
  - https://pubmed.ncbi.nlm.nih.gov/29422383/
- Lamon et al. (2021): uma noite de privação total → síntese proteica muscular **−18%**, cortisol **+21%**, testosterona **−24%** (estudo crossover, N=13).
  - https://doi.org/10.14814/phy2.14660

**Implicação:** check leve de sono; se noites ruins, reduzir volume/proximidade da falha na sessão — não “empurrar” o plano.

### 1.8 Proteína

- ISSN Position Stand (Jäger et al., 2017): para massa muscular em quem treina, **1,4–2,0 g/kg/dia** costuma bastar; em déficit, treinado, pode precisar de **2,3–3,1 g/kg/dia** para reter massa magra; doses ~**20–40 g** de proteína de qualidade, distribuídas.
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/  
  - https://doi.org/10.1186/s12970-017-0177-8

### 1.9 Suplementos com evidência vs hype

| Suplemento | Evidência (resumo fiel às fontes) | Uso no coach |
|---|---|---|
| **Creatina monohidratada** | ISSN (Kreider et al., 2017): mais eficaz para capacidade de alta intensidade e massa magra no treino; protocolo típico ~0,3 g/kg/dia × 5–7 dias ou 3–5 g/dia contínuos; segura em uso prolongado estudado. Meta com imagem direta (2023): efeito **pequeno** em hipertrofia regional. Meta LBM &lt;50 anos (Desai et al.): ~**+1,14 kg** LBM vs treino só. | Recomendar se o usuário quiser; sem milagre. |
| **Cafeína** | ISSN (2021): melhora aguda de força/potência/endurance em muitos estudos; doses típicas **3–6 mg/kg**. Não é “suplemento de hipertrofia” crônico. | Opcional pré-treino; cuidado com sono. |
| **Proteína em pó** | Prática para bater a meta diária ISSN; não superior a comida se a ingestão total for igual. | Lembrete de meta g/kg, não “shake mágico”. |
| **Hype a evitar** | BCAAs isolados com dieta já rica em proteína; “test boosters”; fat burners; formas exóticas de creatina sem evidência superior à monohidratada (ISSN). | Coach explica o porquê e não empurra. |

Fontes creatina/cafeína:
- https://doi.org/10.1186/s12970-017-0173-z  
- https://pmc.ncbi.nlm.nih.gov/articles/PMC10180745/  
- https://doi.org/10.1519/jsc.0000000000004862  
- https://pmc.ncbi.nlm.nih.gov/articles/PMC7777221/

### 1.10 Água / hidratação

- ACSM “Exercise and Fluid Replacement”: começar euhidratado; perda &gt;~**2%** da massa corporal pode prejudicar desempenho (sobretudo aeróbio/cognitivo); individualizar pela taxa de suor.
  - https://doi.org/10.1249/mss.0b013e31802ca597  
- NATA position: reposição de fluidos para fisicamente ativos.
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC5634236/

**Implicação:** lembretes leves (ex.: meta diária + check pré-treino), sem obsessão mililitro a mililitro.

---

## 2) Práticas de programação

### 2.1 Top set + back-off

- Método prático (não é “lei científica” isolada): 1 série pesada perto do alvo de reps/RIR, depois séries com carga reduzida (~10–20% menos, faixa mais alta de reps) para acumular volume com menos fadiga neuromuscular.
- Overview em *Strength & Conditioning Journal*: utilidade de back-off sets.
  - https://journals.lww.com/nsca-scj/fulltext/2021/10000/utility_of_back_off_sets__an_overview.6.aspx
- Encaixa bem com evidência de volume + proximidade da falha: o top set ancora a progressão de carga; o back-off entrega sets produtivos.

### 2.2 Quando PPL / Upper-Lower / Full body fazem sentido

| Split | Faz sentido quando… |
|---|---|
| **Full body** 3×/sem | Pouco tempo, iniciante, prioridade em frequência por músculo com volume moderado. |
| **Upper/Lower** 4× | Bom equilíbrio volume/recuperação; comum em intermediários. |
| **PPL** 6× (ou PPL 2× em 8–9 dias) | Mais dias disponíveis; volume alto por sessão menor. |
| **Bro split** 1×/músculo | Só se o volume semanal ainda for atingido e a recuperação permitir — evidência de frequência não exige 2×, mas 1× com volume alto numa sessão pode ser menos confortável. |

Critério do coach: **tempo disponível + equipamentos + lesões + volume alvo**, não fidelidade a um template.

### 2.3 Periodização simples (MVP)

1. Mesociclo 4–6 semanas: volume estável ou subindo levemente; double progression nos exercícios âncora.  
2. Deload 1 semana (volume ↓ ~40–60%, manter padrões principais) se fadiga acumular **ou** a cada ciclo.  
3. Técnicas avançadas (drop, rest-pause, lengthened partials etc.): **depois** da base (log estável + progressão), e só quando o RIR / técnica permitem.

---

## 3) Padrões de UX (Hevy, Strong, Boostcamp, Dr. Muscle etc.)

Fontes de produto/comparativos:
- Hevy rest timer: https://www.hevyapp.com/features/workout-rest-timer/  
- Boostcamp vs Strong/Hevy (atualizado out/2026): https://www.boostcamp.app/compare/workout-tracking  
- Hevy features 2025: https://help.hevyapp.com/hc/en-us/articles/33106320824727-Everything-You-Need-to-Know-About-the-Hevy-App-2025-Features-Guide

### O que funciona na academia

1. **Log em &lt;3 toques por série** — peso × reps, com última série autofill.  
2. **Rest timer automático** ao marcar a série (ajustável ±15 s; default por exercício).  
3. **Rotinas / repetir treino anterior** em 1 toque.  
4. **Histórico e PRs** por exercício (motivação real, sem depender de feed social).  
5. **RPE/RIR** opcional no set.  
6. **Volume por músculo** (ao vivo ou pós-treino) — Boostcamp/Hevy destacam isso; alinhado ao que a ciência prioriza.  
7. **Offline-first** na sala de musculação (sinal ruim é regra).  
8. Warm-up / drop / failure tags (Hevy) — útil sem poluir o fluxo.

### O que evitar (pro nosso caso de uso pessoal)

1. Fluxo **AI-first** que esconde o logger manual (crítica recente a Jefit no comparativo Boostcamp).  
2. Feed social obrigatório / ruído (Hevy tem; para app só seu, gamificação interna basta).  
3. Timer sem feedback claro (usuários reclamam de notificação fraca no Hevy).  
4. Telas densas de analytics **durante** o set — analytics depois; na série, só o essencial.  
5. Dependência de Apple Watch no MVP (nice-to-have; Strong/Hevy têm; Boostcamp usa Live Activity).  
6. Nutrição completa no app de treino — apps bons focam no log; macros ficam para depois ou app separado.

### Gamificação que ajuda (sem virar jogo bobinho)

- Streaks de treinos concluídos, níveis por consistência, badges de PR, gráfico de volume/carga.  
- Evitar: loot boxes, pressão social, punição agressiva por miss.

---

## 4) Recomendações concretas pro MVP

### Incluir **agora**

1. Onboarding: peso, altura, tempo treino+cardio, nível, equipamentos, lesões/limitações, objetivo.  
2. Montagem de plano flexível (templates PPL / UL / FB + ajuste pelo coach).  
3. Sessão: lista do dia → por exercício: dica curta de execução → log carga/reps/RIR → rest timer → top set / back-off marcados.  
4. Agregação de **volume semanal por músculo** + sugestão de progressão (double progression).  
5. Pós-treino: 2–3 frases (como foi / próximo passo / ponto forte-fraco).  
6. Lembretes leves: água, proteína (meta g/kg), creatina se opt-in, check de sono.  
7. Offline + dados locais (privacidade; uso próprio).  
8. Gamificação mínima: streak, PRs, nível de consistência.  
9. PT-BR.

### Deixar **depois**

- Técnicas avançadas elaboradas / vídeo 3D de execução.  
- Periodização sofisticada / undulating automático.  
- Wearables profundos, Apple Watch.  
- Nutrição completa / barcode.  
- Social / feed.  
- Cardio detalhado além do slot de tempo.  
- Deload totalmente automático sem confirmação do usuário.

### 8 regras que o coach deve seguir

1. **Volume semanal por músculo é o norte**; split é meio, não fim.  
2. Preferir **esforço alto (baixo RIR)** nos working sets, sem exigir falha em todo composto.  
3. Progressão padrão = **double progression**; mudar carga/reps com base no log, não no feeling solto.  
4. Sempre explicar **como / por quê / quando / onde** em linguagem clara.  
5. Respeitar **lesões, equipamentos e tempo**; nunca inventar volume que não cabe.  
6. Em sono ruim / fadiga acumulada: **reduzir**, não “motivar” a forçar.  
7. Suplementos: só o que tem evidência (creatina, proteína para meta, cafeína aguda); **zero hype**.  
8. Deload quando o histórico pedir (estagnação + fadiga) ou a cada ciclo; não como ritual vazio.  
9. Tom PhD: calmo, direto, natural — sem atalho químico e sem dogmatismo de split.  
10. Na academia, priorizar **velocidade de log**; a análise rica fica no fim da sessão / home.

---

## 5) Fontes (lista)

### Treino / hipertrofia
- https://doi.org/10.1080/02640414.2016.1210197  
- https://journals.lww.com/nsca-scj/Fulltext/2018/08000/Evidence_Based_Guidelines_for_Resistance_Training.11.aspx  
- https://doi.org/10.1080/02640414.2018.1555906  
- https://doi.org/10.1007/s40279-016-0543-8  
- https://doi.org/10.1007/s40279-022-01784-y  
- https://doi.org/10.1007/s40279-024-02069-2  
- https://doi.org/10.7717/peerj.14142  
- https://doi.org/10.7717/peerj.16777  
- https://doi.org/10.1186/s40798-023-00633-0  
- https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full  
- https://sportrxiv.org/index.php/server/preprint/view/1100  
- https://doi.org/10.1249/01.mss.0001158628.17279.5f  

### Sono / hidratação / nutrição
- https://pmc.ncbi.nlm.nih.gov/articles/PMC9584849/  
- https://pubmed.ncbi.nlm.nih.gov/29422383/  
- https://doi.org/10.14814/phy2.14660  
- https://doi.org/10.1249/mss.0b013e31802ca597  
- https://pmc.ncbi.nlm.nih.gov/articles/PMC5634236/  
- https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/  
- https://doi.org/10.1186/s12970-017-0173-z  
- https://pmc.ncbi.nlm.nih.gov/articles/PMC7777221/  
- https://pmc.ncbi.nlm.nih.gov/articles/PMC10180745/  
- https://doi.org/10.1519/jsc.0000000000004862  

### UX apps
- https://www.hevyapp.com/features/workout-rest-timer/  
- https://www.boostcamp.app/compare/workout-tracking  
- https://help.hevyapp.com/hc/en-us/articles/33106320824727-Everything-You-Need-to-Know-About-the-Hevy-App-2025-Features-Guide  

---

## Limitações deste brief

- Algumas páginas (PMC/PubMed/PeerJ) bloqueiam fetch automatizado; nesses casos usei abstract/síntese de indexadores + DOI.  
- Não inventei números fora das fontes citadas.  
- “Top set / back-off” e splits são **práticas** apoiadas por princípios (volume, esforço, progressão), não por uma única meta-análise com esse nome.  
- Evidência de deload planejado para hipertrofia ainda é **escassa**; o Delphi e o PeerJ 2024 são as âncoras honestas.

---

## 6) Complemento — referência Jayme de la Madrid (28/10/2026)

Auditoria completa: **`/workspace/coach-hypertrophy/research-jayme.md`**.

**Resumo para o coach do app**
- Usar Jayme como **referência de prática natural** (volume realista, RIR, dupla progressão, split como consequência, anti-pump-como-KPI), não como dogma de marketing.
- **Adotar:** volume ~8–14+ sets/músculo/sem ajustável; RIR 0–3; falha tática; top/back-off opcional; padrões de movimento; progressão estável; natural sem atalho químico.
- **Evitar no produto:** “triplicar resultados”, anti-cardio, “sempre 3–4 dias”, demonizar splits nomeados, claims acadêmicos não verificados.
- Ciência já coberta nas seções 1–2 deste brief **confirma** a maior parte do framework técnico dele; a parte fraca é sobretudo **copy comercial** e preferências de frequência apresentadas como superioridade.

**Perfil:** https://www.instagram.com/jaymedelamadrid/?hl=pt
