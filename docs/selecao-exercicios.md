# Escolha de exercícios por evidência de hipertrofia

Código:
- `src/lib/plan/evidencia-exercicio.ts`: estudos, nota por exercício (`MERITO`), regras de cobertura e o "por quê".
- `src/lib/plan/cobertura-exercicios.ts`: aplica a cobertura no plano gerado.
- `src/lib/plan/gerar-plano.ts`: soma a nota no ranking do slot e roda a cobertura antes do equilíbrio de volume.
- `src/lib/plan/trocar-exercicio.ts`: a troca também ranqueia pela nota e mostra a ciência.

Smoke: `smoke:selecao-exercicios`.

## Estudos (conferidos na fonte)
| Estudo | Achado usado no app |
|---|---|
| Maeo et al., 2023 (Eur J Sport Sci) | Tríceps com o braço acima da cabeça cresceu mais que com o braço ao lado do corpo, mesmo com menos carga (sobretudo a cabeça longa). |
| Maeo et al., 2021 (Med Sci Sports Exerc) | Flexora sentada: +14% no volume do posterior contra +9% na deitada, em 12 semanas. |
| Kassiano et al., 2023 (J Strength Cond Res) | Panturrilha treinada na parte alongada cresceu mais que na parte curta. |
| Pedrosa et al., 2022 (Eur J Sport Sci) | Extensora no trecho com o joelho mais dobrado deu mais hipertrofia perto do joelho. |
| Zabaleta-Korta et al., 2021 (J Sports Sci) | Agachamento e extensora fazem o quadríceps crescer em regiões diferentes; o reto femoral responde pouco só ao agachamento. |
| Chaves et al. (supino reto × inclinado) | O inclinado fez a parte de cima do peito crescer mais. |
| Int J Sports Med, 2025 (rosca inclinada × Scott) | Inclinada cresceu mais na parte de cima do braço; Scott, perto do cotovelo. |
| Plotkin et al., 2023 (Front Physiol) | Hip thrust e agachamento: glúteo parecido; o agachamento ainda fez crescer quadríceps e adutores. |
| Haugen et al., 2023 (BMC Sports Sci Med Rehabil) | Máquina e peso livre: hipertrofia parecida. |
| Kassiano et al., 2022 (J Strength Cond Res, revisão) | Variar ajuda quando cobre ângulos diferentes; trocar demais atrapalha. |

Sem fonte conferida, o app não cita estudo: o exercício recebe só a explicação geral do tipo (composto ou isolador).

## Nota por exercício
Bônus de 0 a 12 pontos somado ao ranking do slot (as listas de preferência continuam valendo).
Exemplos: tríceps overhead +12, flexora sentada +12, extensora +6, rosca inclinada +6, panturrilha em pé +4, supino inclinado +3.
Efeito direto: a flexora sentada passa na frente da deitada.

## Cobertura por músculo na semana
| Regra | Pede | Como resolve |
|---|---|---|
| Tríceps | 1 exercício com o braço acima da cabeça | troca um isolador de tríceps (não aplica com dor no ombro) |
| Quadríceps | extensora | troca um composto repetido; senão acrescenta (se couber no tempo) |
| Posterior | flexora (dobrar o joelho) | troca um composto repetido; senão acrescenta (se couber no tempo) |
| Peito | supino inclinado (com 2+ exercícios de peito) | troca um supino repetido |
| Bíceps | rosca inclinada (com 2+ exercícios de bíceps) | troca uma rosca; a martelo fica por último (pega o braquial) |

- O primeiro composto de cada treino nunca é trocado.
- A troca mantém as séries. Acrescentar usa 2 séries (iniciante) ou 3, só se o treino continuar no tempo do perfil (+10%).
- Entre as opções, sai primeiro o exercício que você menos usa (histórico).
- Equipamento e restrições mandam. Sem cabo, não força o tríceps no cabo.
- Cada mudança vira uma linha na justificativa do plano, com o achado e o estudo.
- Em 45 perfis (2 a 6 dias; 45, 60 e 75 min; 3 níveis), o tempo máximo por treino ficou igual ao de antes.

## "Por quê" no app
- **Plano:** abaixo de cada exercício com vantagem específica aparece "Por quê: … (estudo)".
- **Troca de exercício:** a lista ordena pela nota, mostra "Ciência: …" e recomenda a melhor opção quando a vantagem é clara e o histórico não decide.
- **Coach:** o contexto da próxima sessão leva `por_que` de cada exercício. A conversa explica com esses estudos e não inventa outros.

O plano salvo não muda sozinho. As escolhas novas valem ao montar ou refazer o plano, sempre com confirmação.
