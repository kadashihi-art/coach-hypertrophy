/** Smoke cardio: semana seg–dom, total vs meta, histórico, registro/remoção e compatibilidade do estado. */
import {
  adicionarCardio,
  criarCardio,
  fimDaSemana,
  formatarMinutos,
  historicoCardio,
  inicioDaSemana,
  removerCardio,
  resumoCardioSemana,
  rotuloTipoCardio,
  semanaIsoDaData,
  semanaLabel,
  somarDias,
  type EntradaCardio,
} from "../src/lib/cardio";
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
) => criarCardio({ data, minutos, tipo, id, criado_em: `${data}T12:00:00.000Z` });

const cardios = [
  card("2026-11-02", 30, "bike"),
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

const cheio = resumoCardioSemana(cardios, 50, HOJE);
ok(cheio.batido && cheio.pct === 100 && cheio.restante_min === 0, "meta batida zera o que falta e trava em 100%");
const semMeta = resumoCardioSemana(cardios, 0, HOJE);
ok(!semMeta.batido && semMeta.pct === 0 && semMeta.restante_min === 0, "sem meta: sem barra e sem cobrança");

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

// schema aceita o registro e rejeita tipo/minutos inválidos
const valido = AppStateSchema.safeParse({ ...base, cardios: comUm.cardios });
ok(valido.success, "AppStateSchema aceita cardios");
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

console.log(falhas ? `\n${falhas} falha(s)` : "\nsmoke:cardio OK");
