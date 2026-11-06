/** Smoke cardio: semana seg–dom, meta dividida nos 7 dias, total vs meta, km/kcal, histórico, registro/remoção e compatibilidade do estado. */
import {
  adicionarCardio,
  criarCardio,
  detalheCardio,
  fimDaSemana,
  formatarKcal,
  formatarKm,
  formatarMinutos,
  historicoCardio,
  inicioDaSemana,
  metaPorDia,
  normalizarKcal,
  normalizarKm,
  removerCardio,
  resumoCardioSemana,
  rotuloIntensidade,
  rotuloTipoCardio,
  semanaIsoDaData,
  semanaLabel,
  somarDias,
  type EntradaCardio,
} from "../src/lib/cardio";
import {
  AVISO_BENEFICIOS,
  FAIXAS_BENEFICIO,
  FONTES_CARDIO,
  beneficioCurto,
  faixaCardio,
  rotuloFaixa,
} from "../src/lib/cardio/beneficios";
import { AppStateSchema } from "../src/lib/domain";
import { inicioDeUso } from "../src/lib/inicio";

let falhas = 0;
function ok(c: boolean, m: string) {
  console.log(c ? "✓" : "✗", m);
  if (!c) {
    falhas++;
    process.exitCode = 1;
  }
}

const HOJE = "2026-11-04"; // quarta-feira

// semana seg–dom
ok(inicioDaSemana("2026-11-04") === "2026-11-02", "quarta → segunda da mesma semana");
ok(inicioDaSemana("2026-11-02") === "2026-11-02", "segunda continua segunda");
ok(inicioDaSemana("2026-11-08") === "2026-11-02", "domingo → segunda que abriu a semana");
ok(fimDaSemana("2026-11-04") === "2026-11-08", "semana fecha no domingo");
ok(somarDias("2026-11-02", -7) === "2026-10-26", "semana anterior");
ok(semanaIsoDaData("2026-11-04") === "2026-W45", "semana ISO de 04/11 = 2026-W45");

// registros de exemplo
const card = (
  data: string,
  minutos: number,
  tipo: EntradaCardio["tipo"] = "bike",
  id = `${data}-${minutos}`,
  extras: Partial<EntradaCardio> = {},
) => criarCardio({ data, minutos, tipo, id, criado_em: `${data}T12:00:00.000Z`, ...extras });

const cardios = [
  card("2026-11-02", 30, "bike", "2026-11-02-30", {
    distancia_km: 12.5,
    calorias_kcal: 260,
    intensidade: "moderada",
  }),
  card("2026-11-04", 20, "caminhada"),
  card("2026-11-01", 60, "corrida"), // semana anterior
  card("2026-11-09", 40, "remo"), // semana seguinte
];

// resumo da semana atual
const r = resumoCardioSemana(cardios, 90, HOJE);
ok(r.inicio === "2026-11-02" && r.fim === "2026-11-08", "resumo usa a semana seg–dom");
ok(r.minutos === 50 && r.registros.length === 2, "só conta os registros da semana (50 min, 2 registros)");
ok(r.restante_min === 40 && !r.batido, "faltam 40 min pra meta de 90");
ok(r.pct === 56, "progresso arredondado (50/90 = 56%)");
ok(r.semana_iso === "2026-W45", "semana ISO do resumo");

// meta dividida nos 7 dias
const metas = metaPorDia(90);
ok(metas.length === 7 && metas.reduce((a, b) => a + b, 0) === 90, "meta de 90 dividida nos 7 dias sem perder minuto");
ok(metas[0] === 13 && metas[6] === 12, "os minutos que sobram ficam nos primeiros dias (13…12)");
ok(metaPorDia(0).every((m) => m === 0), "sem meta: 0 em todos os dias");
ok(metaPorDia(7).every((m) => m === 1), "meta de 7 = 1 min por dia");
ok(metaPorDia(100).reduce((a, b) => a + b, 0) === 100, "meta quebrada (100) também fecha a soma");

// divisão dia a dia
ok(r.por_dia.length === 7, "resumo traz os 7 dias");
ok(r.por_dia[0]!.rotulo === "Seg" && r.por_dia[6]!.rotulo === "Dom", "dias vão de segunda a domingo");
ok(r.por_dia[0]!.data === "2026-11-02" && r.por_dia[0]!.minutos === 30, "segunda com 30 min");
ok(r.por_dia[2]!.data === "2026-11-04" && r.por_dia[2]!.minutos === 20, "quarta com 20 min");
ok(r.por_dia[1]!.minutos === 0 && r.por_dia[1]!.registros.length === 0, "dia sem registro fica zerado");
ok(r.dias_ativos === 2, "2 dias com cardio na semana");
ok(r.por_dia[2]!.hoje && !r.por_dia[1]!.hoje, "só o dia de hoje é marcado como hoje");
ok(r.por_dia[3]!.futuro && !r.por_dia[2]!.futuro, "dias depois de hoje são futuro");

// km e kcal por dia e na semana
ok(r.distancia_km === 12.5 && r.calorias_kcal === 260, "soma km e kcal da semana");
ok(r.por_dia[0]!.distancia_km === 12.5 && r.por_dia[0]!.calorias_kcal === 260, "km e kcal ficam no dia certo");
ok(r.por_dia[1]!.distancia_km === 0 && r.por_dia[1]!.calorias_kcal === 0, "dia sem km/kcal não inventa número");
const cheio = resumoCardioSemana(cardios, 50, HOJE);
ok(cheio.batido && cheio.pct === 100 && cheio.restante_min === 0, "meta batida zera o que falta e trava em 100%");
const semMeta = resumoCardioSemana(cardios, 0, HOJE);
ok(!semMeta.batido && semMeta.pct === 0 && semMeta.restante_min === 0, "sem meta: sem barra e sem cobrança");
ok(semMeta.meta_dia_min.every((m) => m === 0), "sem meta: nenhum dia ganha meta inventada");
ok(semMeta.por_dia[0]!.pct === 0 && !semMeta.por_dia[0]!.batido, "sem meta: dia sem barra e sem 'batido'");

// histórico: atual + anterior, para na semana antes do 1º registro
const hist = historicoCardio(cardios, HOJE, 90, 8);
ok(hist.length === 2, "histórico tem só as 2 semanas com registro");
ok(hist[0]!.inicio === "2026-11-02" && hist[0]!.minutos === 50, "semana atual primeiro");
ok(hist[1]!.inicio === "2026-10-26" && hist[1]!.minutos === 60, "semana anterior com 60 min");
ok(historicoCardio([], HOJE, 90, 8).length === 1, "sem registros: só a semana atual");
ok(historicoCardio([], HOJE, 90, 8)[0]!.minutos === 0, "sem registros: 0 min");

// registro e remoção são imutáveis no estado
const base = AppStateSchema.parse({ perfil: null, plano: null });
ok(base.cardios === undefined, "estado antigo sem cardios continua válido");
const comUm = adicionarCardio(base, { minutos: 45, tipo: "corrida", data: HOJE, id: "c1", criado_em: "2026-11-04T12:00:00.000Z" });
ok(base.cardios === undefined, "adicionar não muta o estado original");
ok(comUm.cardios?.length === 1 && comUm.cardios[0]!.minutos === 45, "adiciona o registro novo");
ok(removerCardio(comUm, "c1").cardios?.length === 0, "remove pelo id");
ok(removerCardio(comUm, "nao-existe").cardios?.length === 1, "remover id inexistente não apaga nada");

// normalização
ok(criarCardio({ data: HOJE, minutos: 900, tipo: "outro" }).minutos === 600, "minutos limitados a 600");
ok(criarCardio({ data: HOJE, minutos: 0, tipo: "outro" }).minutos === 1, "minutos mínimos de 1");
ok(criarCardio({ data: HOJE, minutos: 30.6, tipo: "bike" }).minutos === 31, "minutos arredondados");

// km, kcal e intensidade são opcionais e normalizados
const completo = criarCardio({
  data: HOJE,
  minutos: 40,
  tipo: "corrida",
  distancia_km: 6.25,
  calorias_kcal: 380.4,
  intensidade: "forte",
});
ok(completo.distancia_km === 6.25, "km com 2 casas preservado");
ok(completo.calorias_kcal === 380, "kcal arredondada");
ok(completo.intensidade === "forte", "intensidade guardada");
ok(criarCardio({ data: HOJE, minutos: 30, tipo: "bike" }).distancia_km === undefined, "sem km informado → campo vazio");
ok(normalizarKm(0) === undefined && normalizarKm(-2) === undefined, "km 0/negativo vira não informado");
ok(normalizarKm(999) === 500, "km limitado a 500");
ok(normalizarKcal(0) === undefined && normalizarKcal(-10) === undefined, "kcal 0/negativa vira não informado");
ok(normalizarKcal(9000) === 5000, "kcal limitada a 5000");

// schema aceita o registro e rejeita tipo/minutos/km/kcal/intensidade inválidos
const valido = AppStateSchema.safeParse({ ...base, cardios: comUm.cardios });
ok(valido.success, "AppStateSchema aceita cardios");
const completoNoEstado = AppStateSchema.safeParse({
  ...base,
  cardios: [{ ...comUm.cardios![0]!, distancia_km: 5.2, calorias_kcal: 320, intensidade: "leve" }],
});
ok(completoNoEstado.success, "AppStateSchema aceita km, kcal e intensidade");
const tipoInvalido = AppStateSchema.safeParse({
  ...base,
  cardios: [{ ...comUm.cardios![0]!, tipo: "xyz" }],
});
ok(!tipoInvalido.success, "AppStateSchema rejeita tipo desconhecido");
const minutosInvalidos = AppStateSchema.safeParse({
  ...base,
  cardios: [{ ...comUm.cardios![0]!, minutos: 0 }],
});
ok(!minutosInvalidos.success, "AppStateSchema rejeita minutos fora da faixa");
const kmInvalido = AppStateSchema.safeParse({
  ...base,
  cardios: [{ ...comUm.cardios![0]!, distancia_km: 600 }],
});
ok(!kmInvalido.success, "AppStateSchema rejeita km fora da faixa");
const intensidadeInvalida = AppStateSchema.safeParse({
  ...base,
  cardios: [{ ...comUm.cardios![0]!, intensidade: "turbo" }],
});
ok(!intensidadeInvalida.success, "AppStateSchema rejeita intensidade desconhecida");
const antigo = AppStateSchema.safeParse({
  ...base,
  cardios: [{ id: "x", data: HOJE, minutos: 30, tipo: "bike", criado_em: "2026-11-04T12:00:00.000Z" }],
});
ok(antigo.success, "registro antigo (só minutos) continua válido");

// primeiro uso também considera cardio
ok(inicioDeUso({ cardios: [{ data: "2026-10-20" }] }) === "2026-10-20", "cardio conta como início de uso");
ok(
  inicioDeUso({ checkins: [{ data: "2026-10-18" }], cardios: [{ data: "2026-10-20" }] }) === "2026-10-18",
  "mantém o registro mais antigo",
);

// textos
ok(formatarMinutos(45) === "45 min", "45 → 45 min");
ok(formatarMinutos(90) === "1h30", "90 → 1h30");
ok(formatarMinutos(120) === "2h", "120 → 2h");
ok(semanaLabel("2026-11-02", "2026-11-08") === "02–08/11", "rótulo dentro do mês");
ok(semanaLabel("2026-10-26", "2026-11-01") === "26/10–01/11", "rótulo virando o mês");
ok(rotuloTipoCardio("bike") === "Bike", "rótulo do tipo bike");
ok(formatarKm(5.2) === "5,2 km", "5.2 → 5,2 km");
ok(formatarKm(10) === "10 km", "10 → 10 km");
ok(formatarKm(0) === null && formatarKm(undefined) === null, "km vazio não vira texto");
ok(formatarKcal(320) === "320 kcal", "320 → 320 kcal");
ok(formatarKcal(0) === null && formatarKcal(undefined) === null, "kcal vazio não vira texto");
ok(rotuloIntensidade("moderada") === "Moderada", "rótulo da intensidade");
ok(rotuloIntensidade(undefined) === null, "sem intensidade: sem rótulo");
ok(
  detalheCardio(completo) === "40 min · 6,3 km · 380 kcal · forte",
  "detalhe do registro junta tempo, km, kcal e intensidade",
);
ok(detalheCardio(criarCardio({ data: HOJE, minutos: 30, tipo: "bike" })) === "30 min", "detalhe só com o que existe");

// benefícios por faixa: limites, cobertura e honestidade do texto
ok(FAIXAS_BENEFICIO.length === 5, "5 faixas de benefício");
ok(faixaCardio(0).id === "zero", "0 min → semana zerada");
ok(faixaCardio(1).id === "inicio" && faixaCardio(149).id === "inicio", "1–149 min → abaixo da recomendação");
ok(faixaCardio(150).id === "recomendada" && faixaCardio(299).id === "recomendada", "150–299 min → faixa recomendada");
ok(faixaCardio(300).id === "acima" && faixaCardio(449).id === "acima", "300–449 min → acima da recomendação");
ok(faixaCardio(450).id === "alto" && faixaCardio(2000).id === "alto", "450+ min → volume alto");
ok(faixaCardio(-30).id === "zero", "minutos negativos caem na faixa zerada");
ok(faixaCardio(Number.NaN).id === "zero", "minutos inválidos caem na faixa zerada");

const faixasCobertas = FAIXAS_BENEFICIO.every(
  (f, i) => i === 0 || f.min === FAIXAS_BENEFICIO[i - 1]!.max! + 1,
);
ok(faixasCobertas, "as faixas são contínuas, sem buraco entre elas");
ok(FAIXAS_BENEFICIO.at(-1)!.max === null, "a última faixa é aberta (450+)");
ok(
  FAIXAS_BENEFICIO.every((f) => f.resumo.length > 40 && f.beneficios.length > 0 && f.curto.length > 20),
  "toda faixa tem resumo, benefícios e frase curta",
);
ok(
  FAIXAS_BENEFICIO.every((f) => f.evidencia === "forte" || f.evidencia === "moderado"),
  "evidência só forte/moderada (nada de prática disfarçada)",
);
ok(FAIXAS_BENEFICIO[2]!.resumo.includes("150–300"), "faixa recomendada cita 150–300 min");
ok(FAIXAS_BENEFICIO[2]!.resumo.includes("31%"), "faixa recomendada traz o número da meta-análise");
ok(FAIXAS_BENEFICIO[3]!.resumo.includes("estatisticamente igual"), "faixa acima diz que o ganho extra é pequeno");
ok(FAIXAS_BENEFICIO[4]!.resumo.includes("achata"), "volume alto admite que o ganho se achata");
ok(
  FAIXAS_BENEFICIO.every((f) => !/cura|garantia|comprovad/i.test(`${f.resumo} ${f.curto} ${f.beneficios.join(" ")}`)),
  "nenhuma faixa promete cura ou garantia",
);
ok(AVISO_BENEFICIOS.includes("associação"), "aviso deixa claro que é associação");
ok(AVISO_BENEFICIOS.includes("não substituem orientação médica"), "aviso não substitui orientação médica");
ok(FONTES_CARDIO.length >= 5, "fontes listadas");
ok(
  FONTES_CARDIO.every((f) => f.rotulo.length > 3 && f.detalhe.length > 20),
  "toda fonte tem rótulo e detalhe",
);
ok(FONTES_CARDIO.some((f) => f.rotulo.includes("OMS")), "OMS aparece nas fontes");
ok(FONTES_CARDIO.some((f) => f.rotulo.includes("Arem")), "Arem 2015 aparece nas fontes");
ok(beneficioCurto(0) === FAIXAS_BENEFICIO[0]!.curto, "frase curta do Hoje vem da faixa certa");
ok(beneficioCurto(180) === FAIXAS_BENEFICIO[2]!.curto, "180 min usa a frase da faixa recomendada");
ok(rotuloFaixa(FAIXAS_BENEFICIO[0]!) === "0 min", "rótulo da faixa zerada");
ok(rotuloFaixa(FAIXAS_BENEFICIO[2]!) === "150–299 min/semana", "rótulo da faixa recomendada");
ok(rotuloFaixa(FAIXAS_BENEFICIO[4]!) === "450+ min/semana", "rótulo da faixa aberta");

console.log(falhas ? `\n${falhas} falha(s)` : "\nsmoke:cardio OK");
