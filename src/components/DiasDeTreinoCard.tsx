"use client";

import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Button, Card } from "@/components/ui";
import { diasDoMicrociclo, diasEscolhidos, treinosNaSemana } from "@/lib/plan/agenda-semanal";

/** Seg → Dom (0 = domingo). */
const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Dias da semana em que você treina. O calendário, o Hoje e a faixa de dias põem os treinos nesses
 * dias (na ordem do plano). Só muda as datas, nunca o treino; grava só com "Salvar dias".
 */
export function DiasDeTreinoCard({ hoje }: { hoje: string }) {
  const { state, updatePerfil } = useApp();
  const salvos = diasEscolhidos(state.perfil);
  const sugeridos = diasDoMicrociclo(state.plano, hoje);
  const [sel, setSel] = useState<number[] | null>(null);
  const [aberto, setAberto] = useState(!salvos);
  const [ok, setOk] = useState(false);
  const atual = sel ?? salvos ?? sugeridos;
  const n = treinosNaSemana(state.plano, hoje);
  if (!state.plano?.mesociclo?.data_inicio || n === 0) return null;

  const nomes = (d: number[]) => ORDEM.filter((x) => d.includes(x)).map((x) => CURTO[x]).join(", ");
  const certo = atual.length === n;
  const mudou = !salvos || nomes(atual) !== nomes(salvos);

  if (!aberto) {
    return (
      <section data-testid="dias-treino" aria-label="Seus dias de treino">
      <Card className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase text-muted">Seus dias de treino</p>
            <p className="text-sm font-semibold">{nomes(salvos ?? [])}</p>
            {ok ? <p className="text-xs text-accent">Salvo. O calendário já segue esses dias.</p> : null}
          </div>
          <button type="button" className="text-xs font-semibold text-accent" onClick={() => { setAberto(true); setOk(false); }}>
            Mudar
          </button>
        </div>
      </Card>
      </section>
    );
  }

  return (
    <section data-testid="dias-treino" aria-label="Seus dias de treino">
    <Card className="mb-4">
      <p className="text-sm font-semibold">Em quais dias você treina?</p>
      <p className="mt-1 text-xs text-muted">
        Seu plano tem {n} treinos por semana. Os treinos caem só nesses dias, na ordem do plano, e folga fica folga.
        {!salvos ? " Marquei os dias que o calendário usa hoje: confira." : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Dias de treino">
        {ORDEM.map((d) => {
          const on = atual.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              data-testid={`dia-semana-${d}`}
              className={`chip-motion text-xs ${on ? "on" : ""}`}
              onClick={() => setSel(on ? atual.filter((x) => x !== d) : [...atual, d])}
            >
              {CURTO[d]}
            </button>
          );
        })}
      </div>
      <p className={`mt-2 text-xs ${certo ? "text-muted" : "text-warn"}`}>
        {certo ? `${atual.length} dias: ${nomes(atual)}.` : `Marque ${n} dias (agora: ${atual.length}).`}
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          className="min-h-11 flex-1 text-sm"
          data-testid="salvar-dias-treino"
          disabled={!certo || !mudou}
          onClick={() => {
            updatePerfil({ dias_treino_semana: [...atual].sort((a, b) => a - b) });
            setSel(null);
            setAberto(false);
            setOk(true);
          }}
        >
          Salvar dias
        </Button>
        {salvos ? (
          <Button variant="ghost" className="min-h-11 flex-1 text-sm" onClick={() => { setSel(null); setAberto(false); }}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </Card>
    </section>
  );
}
