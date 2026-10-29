import {
  StubCoachProvider,
  buildAnalisePosTreinoStub,
} from "../src/lib/llm/coach";
import { validarContratoLlm } from "../src/lib/llm/contract";

async function main() {
  const sample = {
    sessao_nome: "Upper A",
    decisoes: [
      {
        exercicio_id: "ex-supino",
        nome: "Supino reto",
        regra: "R1" as const,
        acao: "subir_carga" as const,
        carga_anterior_kg: 60,
        nova_carga_kg: 62.5,
        faixa_reps_reiniciada: true,
        motivo: "Topo da faixa com RIR≤1 — sobe carga e reinicia reps.",
        evidencia: "forte" as const,
      },
    ],
    volume: [{ grupo: "peito" as const, planejado: 12, realizado: 12 }],
  };

  const stub = buildAnalisePosTreinoStub(sample);
  const v = validarContratoLlm(stub);
  if (!v.ok) {
    console.error("✗ contract", v.errors);
    process.exit(1);
  }
  if (v.data.tipo_resposta !== "analise_pos_treino") {
    console.error("✗ tipo");
    process.exit(1);
  }
  if (!v.data.mensagem_usuario?.includes("62.5")) {
    console.error("✗ mensagem sem carga do motor", v.data.mensagem_usuario);
    process.exit(1);
  }
  if (v.data.decisoes_progressao?.[0]?.nova_carga_kg !== 62.5) {
    console.error("✗ mirror carga");
    process.exit(1);
  }

  const provider = new StubCoachProvider();
  const again = await provider.explicarPosTreino(sample);
  const v2 = validarContratoLlm(again);
  if (!v2.ok) {
    console.error("✗ provider", v2.errors);
    process.exit(1);
  }

  console.log("✓ StubCoachProvider R1 → envelope válido");
  console.log("✓", again.mensagem_usuario?.slice(0, 120));
  console.log("smoke:coach OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
