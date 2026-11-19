"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

export type TomMensagem = "info" | "atencao" | "bloqueio";

export type MensagemCoach = {
  id: string;
  tom: TomMensagem;
  titulo: string;
  texto?: ReactNode;
  dica?: string;
  acao?: { rotulo: string; href?: string; onClick?: () => void };
  /** Bloqueio (PAR-Q+) nunca fecha. */
  fechavel?: boolean;
};

const ESTILO: Record<TomMensagem, { caixa: string; avatar: string; titulo: string }> = {
  info: { caixa: "border-accent/30 bg-accent/8", avatar: "bg-accent text-ink-950", titulo: "text-bone-50" },
  atencao: { caixa: "border-warn/35 bg-warn/8", avatar: "bg-warn text-ink-950", titulo: "text-warn" },
  bloqueio: { caixa: "border-danger/40 bg-danger/10", avatar: "bg-danger text-bone-50", titulo: "text-danger" },
};

function Mensagem({ m, onFechar }: { m: MensagemCoach; onFechar?: () => void }) {
  const e = ESTILO[m.tom];
  return (
    <div className={`relative flex gap-3 rounded-2xl border px-3 py-3 ${e.caixa} ${onFechar ? "pr-10" : ""}`} data-testid={`msg-${m.id}`} role="status">
      <span aria-hidden className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold ${e.avatar}`}>
        CH
      </span>
      <div className="min-w-0 text-sm">
        <p className={`font-semibold ${e.titulo}`}>{m.titulo}</p>
        {m.texto ? <div className="mt-0.5 text-bone-200">{m.texto}</div> : null}
        {m.dica ? <p className="mt-1 text-xs text-muted">{m.dica}</p> : null}
        {m.acao ? (
          m.acao.href ? (
            <Link href={m.acao.href} className="mt-2 inline-flex min-h-9 items-center rounded-xl border border-accent/40 px-3 text-xs font-semibold text-accent">
              {m.acao.rotulo}
            </Link>
          ) : (
            <button type="button" onClick={m.acao.onClick} className="motion-press mt-2 min-h-9 rounded-xl border border-accent/40 px-3 text-xs font-semibold text-accent">
              {m.acao.rotulo}
            </button>
          )
        ) : null}
      </div>
      {onFechar ? (
        <button
          type="button"
          aria-label="Fechar aviso"
          onClick={onFechar}
          className="motion-press absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full text-muted"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

/**
 * Avisos do coach num formato só: mostra os mais importantes (até 2) e guarda o resto em "Mais N avisos".
 * A ordem de entrada é a prioridade (bloqueio primeiro).
 */
export function MensagensCoach({ mensagens, maximo = 2 }: { mensagens: MensagemCoach[]; maximo?: number }) {
  const [fechadas, setFechadas] = useState<string[]>([]);
  const [todas, setTodas] = useState(false);
  const visiveis = mensagens.filter((m) => !fechadas.includes(m.id));
  if (!visiveis.length) return null;
  const mostrar = todas ? visiveis : visiveis.slice(0, maximo);
  const resto = visiveis.length - mostrar.length;
  return (
    <section aria-label="Avisos do coach" className="mb-4 flex flex-col gap-2" data-testid="mensagens-coach">
      {mostrar.map((m) => (
        <Mensagem key={m.id} m={m} onFechar={m.fechavel !== false && m.tom !== "bloqueio" ? () => setFechadas((f) => [...f, m.id]) : undefined} />
      ))}
      {resto > 0 ? (
        <button type="button" onClick={() => setTodas(true)} className="motion-press self-start px-1 text-xs font-semibold text-accent" data-testid="mais-avisos">
          Mais {resto} {resto === 1 ? "aviso" : "avisos"} do coach ›
        </button>
      ) : todas && visiveis.length > 1 ? (
        <button type="button" onClick={() => setTodas(false)} className="motion-press self-start px-1 text-xs font-semibold text-muted">
          Mostrar só o principal
        </button>
      ) : null}
    </section>
  );
}
