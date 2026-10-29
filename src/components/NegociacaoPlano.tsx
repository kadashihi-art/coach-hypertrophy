"use client";

/**
 * Negociação do plano: proposta do motor (não salva) + mini-chat com o coach.
 * O coach só devolve AJUSTES de parâmetros (schema); o motor remonta. Nada é salvo até "Confirmar plano".
 */
import { Markdown } from "@/components/Markdown";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card } from "@/components/ui";
import { PorQueEssePlano } from "@/components/PorQueEssePlano";
import type { Exercicio, Perfil } from "@/lib/domain";
import { NOME_ESTILO, type EstiloSplit } from "@/lib/plan/gerar-plano";
import { aplicarAjustes, gerarProposta, interpretarFeedbackHeuristico, resumoProposta } from "@/lib/plan/negociacao";

type Msg = { role: "user" | "assistant"; content: string };

const CHIPS = ["Prefiro UL", "Só 4 dias", "Tenho lesão no ombro", "Pouco tempo (45 min)", "Por que esse split?"];

export function NegociacaoPlano({
  perfilInicial,
  catalog,
  onConfirmar,
  onVoltar,
  confirmarLabel = "Confirmar plano",
}: {
  perfilInicial: Perfil;
  catalog: Exercicio[];
  onConfirmar: (perfil: Perfil) => void;
  onVoltar?: () => void;
  confirmarLabel?: string;
}) {
  const [perfil, setPerfil] = useState<Perfil>(perfilInicial);
  const [versao, setVersao] = useState(0);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mudancas, setMudancas] = useState<string[]>([]);
  const proposta = useMemo(() => gerarProposta(perfil, catalog), [perfil, catalog]);
  const iniciou = useRef(false);

  async function falar(mensagem: string, perfilAtual: Perfil) {
    const p = gerarProposta(perfilAtual, catalog);
    if (!p.ok) return;
    setCarregando(true);
    const hist = msgs.slice(-10);
    if (mensagem) setMsgs((m) => [...m, { role: "user", content: mensagem }]);
    let r: { resposta: string; ajustes?: unknown; condicoes?: string[] };
    try {
      const res = await fetch("/api/plan/negociar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem, proposta: resumoProposta(p.racional, perfilAtual), historico: hist }),
      });
      if (!res.ok) throw new Error(String(res.status));
      r = await res.json();
    } catch {
      r = mensagem ? interpretarFeedbackHeuristico(mensagem) : { resposta: "Essa é a proposta que eu montei. Pode trocar o estilo ou os dias aqui embaixo, ou me dizer o que mudar." };
    }
    const temAjuste = r.ajustes && typeof r.ajustes === "object" && Object.keys(r.ajustes).length > 0;
    if (temAjuste || r.condicoes?.length) {
      const novo = aplicarAjustes(perfilAtual, r.ajustes, r.condicoes ?? []);
      const np = gerarProposta(novo, catalog);
      if (np.ok) {
        const antes = p.racional;
        const diff: string[] = [];
        if (antes.split.nome !== np.racional.split.nome) diff.push(`${antes.split.nome} → ${np.racional.split.nome}`);
        if (perfilAtual.dias_por_semana !== novo.dias_por_semana) diff.push(`${perfilAtual.dias_por_semana} → ${novo.dias_por_semana} dias`);
        if (perfilAtual.minutos_por_sessao !== novo.minutos_por_sessao) diff.push(`${perfilAtual.minutos_por_sessao} → ${novo.minutos_por_sessao} min`);
        if ((novo.restricoes ?? []).length !== (perfilAtual.restricoes ?? []).length) diff.push("restrições atualizadas");
        setMudancas(diff);
        setPerfil(novo);
        setVersao((v) => v + 1);
      }
    }
    setMsgs((m) => [...m, { role: "assistant", content: r.resposta }]);
    setCarregando(false);
  }

  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    void falar("", perfilInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function manual(patch: Partial<Perfil>, desc: string) {
    const novo = { ...perfil, ...patch, acordos_plano: [...new Set([...(perfil.acordos_plano ?? []), desc])].slice(-12) };
    if (novo.dias_descanso_fixos?.length) novo.dias_descanso_fixos = novo.dias_descanso_fixos.slice(0, 7 - novo.dias_por_semana);
    setMudancas([desc]);
    setPerfil(novo);
    setVersao((v) => v + 1);
  }

  if (!proposta.ok) {
    return <Card className="text-sm text-warn">{proposta.erro}</Card>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="motion-stagger">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Minha proposta · ainda não salva</p>
        <h1 className="mb-1 mt-1 text-2xl font-bold text-bone-50">Por que esse treino</h1>
        <p className="mb-3 text-sm text-muted">Comente, discorde ou traga condições (lesão, rotina, dias reais). O coach traduz em ajustes e o motor remonta.</p>
      </div>

      <div key={versao} className="motion-swap">
        {mudancas.length ? (
          <p className="mb-2 rounded-lg bg-accent/10 px-3 py-2 text-[12px] text-accent">Ajustado: {mudancas.join(" · ")}</p>
        ) : null}
        <PorQueEssePlano racional={proposta.racional} animado compacto />
      </div>

      <Card className="mb-3 space-y-2">
        <p className="text-[11px] text-muted">Estilo</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(NOME_ESTILO) as EstiloSplit[]).map((e) => (
            <button key={e} type="button" className={`chip-motion ${(perfil.estilo_split ?? "auto") === e ? "on" : ""}`} onClick={() => manual({ estilo_split: e }, `Estilo escolhido: ${NOME_ESTILO[e]}.`)}>
              {NOME_ESTILO[e]}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted">Dias por semana</p>
        <div className="flex flex-wrap gap-2">
          {[2, 3, 4, 5, 6].map((d) => (
            <button key={d} type="button" className={`chip-motion ${perfil.dias_por_semana === d ? "on" : ""}`} onClick={() => manual({ dias_por_semana: d }, `Disponibilidade: ${d} dias/semana.`)}>
              {d}
            </button>
          ))}
        </div>
      </Card>

      <div className="mb-2 max-h-72 space-y-2 overflow-y-auto">
        {msgs.map((m, i) => (
          <div key={i} className={`motion-swap rounded-xl px-3 py-2 text-[13px] leading-snug ${m.role === "user" ? "ml-8 bg-accent/15 text-bone-50" : "mr-4 bg-white/5 text-bone-200"}`}>
            {m.role === "user" ? <span className="whitespace-pre-wrap">{m.content}</span> : <Markdown text={m.content} />}
          </div>
        ))}
        {carregando ? <p className="text-[12px] text-muted">Coach pensando…</p> : null}
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button key={c} type="button" disabled={carregando} className="chip-motion" onClick={() => void falar(c, perfil)}>
            {c}
          </button>
        ))}
      </div>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = texto.trim();
          if (!t || carregando) return;
          setTexto("");
          void falar(t, perfil);
        }}
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder='Ex.: "prefiro UL, só 4 dias, trabalho em turnos"'
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-bone-50 outline-none"
          maxLength={2000}
        />
        <Button type="submit" className="w-auto px-4" disabled={carregando || !texto.trim()}>
          Enviar
        </Button>
      </form>

      <div className="mt-auto flex gap-3">
        {onVoltar ? (
          <Button variant="ghost" className="w-auto px-6" onClick={onVoltar} disabled={carregando}>
            Voltar
          </Button>
        ) : null}
        <Button className="motion-press motion-cta-glow" disabled={carregando} onClick={() => onConfirmar(perfil)}>
          {confirmarLabel}
        </Button>
      </div>
    </div>
  );
}
