"use client";

/** Onboarding conversacional: o coach (LLM) pergunta, extrai perfil estruturado e propõe estratégia. Nada grava. */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import type { Estrategia, PerfilColeta } from "@/lib/plan/coleta";

type Msg = { role: "user" | "assistant"; content: string };
export type ColetaResultado = { perfil: PerfilColeta; estrategia: Estrategia | null; correcoes: string[] };

export function ColetaCoach({ onPronto, onFallback, perfilInicial = {} }: {
  onPronto: (r: ColetaResultado) => void;
  onFallback: (motivo: string) => void;
  perfilInicial?: PerfilColeta;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [perfil, setPerfil] = useState<PerfilColeta>(perfilInicial);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [pronto, setPronto] = useState<ColetaResultado | null>(null);
  const iniciou = useRef(false);
  const fim = useRef<HTMLDivElement>(null);

  async function falar(mensagem: string) {
    setBusy(true);
    setChips([]);
    const hist = msgs;
    if (mensagem) setMsgs((m) => [...m, { role: "user", content: mensagem }]);
    try {
      const res = await fetch("/api/onboarding/coleta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem, perfil, historico: hist }),
      });
      const j = await res.json();
      if (!res.ok || j.fallback) { onFallback(j.motivo ?? String(res.status)); return; }
      setMsgs((m) => [...m, { role: "assistant", content: j.resposta }]);
      setChips(j.chips ?? []);
      setPerfil(j.perfil ?? perfil);
      if (j.pronto) setPronto({ perfil: j.perfil, estrategia: j.estrategia ?? null, correcoes: j.correcoes ?? [] });
    } catch {
      onFallback("rede");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    void falar("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  return (
    <div className="flex flex-1 flex-col">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-accent">Conversa com o coach</p>
      <div className="mb-3 flex-1 space-y-2 overflow-y-auto">
        {msgs.map((m, i) => (
          <div key={i} className={`motion-swap max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "ml-auto bg-accent/20 text-bone-50" : "mr-auto bg-card text-bone-50"}`}>
            {m.role === "user" ? <span className="whitespace-pre-wrap">{m.content}</span> : <Markdown text={m.content} />}
          </div>
        ))}
        {busy && <div className="mr-auto rounded-2xl bg-card px-3.5 py-2.5 text-sm text-muted">Digitando…</div>}
        <div ref={fim} />
      </div>
      {pronto ? (
        <div className="space-y-2">
          <Button onClick={() => onPronto(pronto)}>Seguir para a triagem de saúde</Button>
          <button className="w-full text-xs text-muted underline" onClick={() => setPronto(null)}>Quero falar mais uma coisa</button>
        </div>
      ) : (
        <>
          {chips.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {chips.map((c) => (
                <button key={c} disabled={busy} onClick={() => falar(c)} className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-bone-200 hover:bg-white/10">{c}</button>
              ))}
            </div>
          )}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = texto.trim(); if (!t || busy) return; setTexto(""); void falar(t); }}>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Responda do seu jeito…" className="flex-1 rounded-xl bg-white/5 px-3 py-2 text-sm text-bone-50 outline-none" />
            <Button className="w-auto px-4" disabled={busy || !texto.trim()}>Enviar</Button>
          </form>
          <button className="mt-3 w-full text-xs text-muted underline" onClick={() => onFallback("usuario")}>Prefiro preencher o formulário</button>
        </>
      )}
    </div>
  );
}
