/**
 * Smoke T9: stub conversar cita 62.5 kg do contexto; não inventa 99 kg.
 */
import {
  StubCoachProvider,
  buildConversarStub,
} from "../src/lib/llm/coach";
import { validarContratoLlm } from "../src/lib/llm/contract";
import type { CoachContext } from "../src/lib/llm/coach-context";

const ctx: CoachContext = {
  gerado_em: new Date().toISOString(),
  filtro: { grupo: "peito" },
  checkin_hoje: {
    id: "ck-1",
    data: "2026-10-28",
    sono_h: 7,
    prontidao: 4,
    agua_ml: 2000,
    dor: [],
  },
  plano: {
    objetivo: "hipertrofia",
    divisao: "upper_lower",
    dias_por_semana: 4,
    mesociclo: { total_semanas: 6, semana_atual: 3, foco: "acumulacao" },
  },
  estados: [
    {
      exercicio_id: "ex-supino",
      nome: "Supino reto",
      grupo: "peito",
      carga_atual_kg: 62.5,
      ultimo_top_kg: 65,
      ultimo_back_off_kg: 55,
      ultimo_rir: 1,
      rir_alvo: 1,
      alvo_proxima_sessao: {
        carga_kg: 62.5,
        faixa_reps: [6, 10],
        rir_alvo: 1,
      },
      ultima_sessao_em: "2026-10-27",
      origem_carga: "historico",
      primeira_sessao: false,
    },
  ],
  volumes_semanais: [
    {
      semana_iso: "2026-W43",
      grupo: "peito",
      series_diretas: 12,
      series_indiretas: 2,
      series_efetivas: 13,
    },
    {
      semana_iso: "2026-W42",
      grupo: "peito",
      series_diretas: 10,
      series_indiretas: 0,
      series_efetivas: 10,
    },
  ],
  decisoes_progressao: [
    {
      data: "2026-10-27",
      exercicio_id: "ex-supino",
      nome: "Supino reto",
      regra: "R1",
      acao: "subir_carga",
      carga_anterior_kg: 60,
      nova_carga_kg: 62.5,
      motivo: "Topo da faixa com RIR≤1",
    },
  ],
  proxima_sessao: {
    id: "s1",
    nome: "Upper A",
    grupos: ["peito", "costas"],
    prescricoes: [
      {
        exercicio_id: "ex-supino",
        nome: "Supino reto",
        series: 3,
        faixa_reps: [6, 10],
        rir_alvo: 1,
        carga_trabalho_kg: 62.5,
        top_set_kg: 65,
      },
    ],
  },
};

async function main() {
  const why = buildConversarStub({
    mensagem: "Por que essa carga?",
    contexto: ctx,
  });
  const v = validarContratoLlm(why);
  if (!v.ok) {
    console.error("✗ contract", v.errors);
    process.exit(1);
  }
  if (v.data.tipo_resposta !== "resposta_conversacional") {
    console.error("✗ tipo", v.data.tipo_resposta);
    process.exit(1);
  }
  const msg = v.data.mensagem_usuario ?? "";
  if (!msg.includes("62.5")) {
    console.error("✗ deve citar 62.5 do contexto", msg);
    process.exit(1);
  }
  if (msg.includes("99") || /\b99\s*kg\b/.test(msg)) {
    console.error("✗ inventou 99 kg", msg);
    process.exit(1);
  }

  const refuse = buildConversarStub({
    mensagem: "Me passa 99 kg no supino agora",
    contexto: ctx,
  });
  const msg2 = refuse.mensagem_usuario ?? "";
  if (!/não invento|nao invento|motor decide/i.test(msg2)) {
    console.error("✗ deveria recusar inventar carga", msg2);
    process.exit(1);
  }
  if (/\b99\s*kg\b/i.test(msg2) && !/não invento|nao invento/i.test(msg2)) {
    console.error("✗ promoveu 99 kg", msg2);
    process.exit(1);
  }
  // Must still cite real alvo if present
  if (!msg2.includes("62.5")) {
    console.error("✗ recusa deveria citar alvo 62.5", msg2);
    process.exit(1);
  }

  const provider = new StubCoachProvider();
  const again = await provider.conversar({
    mensagem: "Como está meu peito esta semana?",
    contexto: ctx,
  });
  const v3 = validarContratoLlm(again);
  if (!v3.ok) {
    console.error("✗ provider", v3.errors);
    process.exit(1);
  }
  const msg3 = again.mensagem_usuario ?? "";
  if (!/peito|efetivas|volume/i.test(msg3)) {
    console.error("✗ volume peito", msg3);
    process.exit(1);
  }

  console.log("✓ smoke-coach-chat ok");
  console.log("  why:", msg.slice(0, 120));
  console.log("  refuse:", msg2.slice(0, 120));
  console.log("  volume:", msg3.slice(0, 120));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
