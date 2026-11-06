"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Casca } from "@/components/EditarTreinoSheet";
import { Badge, Button, Card, NumStepper, ProgressBar, SectionTitle } from "@/components/ui";
import { useClientValue } from "@/lib/use-client-value";
import { hojeIsoSaoPaulo } from "@/lib/plan/proxima-sessao";
import {
  TIPOS_CARDIO,
  emojiTipoCardio,
  formatarMinutos,
  historicoCardio,
  resumoCardioSemana,
  rotuloTipoCardio,
  semanaLabel,
  type ResumoCardioSemana,
} from "@/lib/cardio";
import type { Cardio, TipoCardio } from "@/lib/domain";

const QUICK_MIN = [10, 15, 20, 30, 45, 60];

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function useCardio() {
  const { state } = useApp();
  const hoje = useClientValue(hojeIsoSaoPaulo, "");
  const meta = state.perfil?.cardio_min_semana ?? 0;
  return useMemo(() => {
    if (!hoje) {
      return {
        hoje,
        meta,
        semana: null,
        historico: [] as ResumoCardioSemana[],
      };
    }
    return {
      hoje,
      meta,
      semana: resumoCardioSemana(state.cardios, meta, hoje),
      historico: historicoCardio(state.cardios, hoje, meta, 8),
    };
  }, [state.cardios, meta, hoje]);
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`motion-press min-h-9 rounded-full border px-3 text-xs font-semibold ${
        selected ? "border-accent bg-accent/15 text-accent" : "border-border text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function CardioSheet({
  hoje,
  registros,
  onClose,
}: {
  hoje: string;
  registros: Cardio[];
  onClose: () => void;
}) {
  const { addCardio, removeCardio } = useApp();
  const [tipo, setTipo] = useState<TipoCardio>("caminhada");
  const [minutos, setMinutos] = useState(30);
  const [data, setData] = useState(hoje);
  const [removendo, setRemovendo] = useState<string | null>(null);

  return (
    <Casca label="Registrar cardio" onClose={onClose}>
      <h2 className="text-lg font-bold">Registrar cardio</h2>
      <p className="mt-1 text-xs text-muted">
        Conta só os minutos da semana — não mexe no volume da musculação.
      </p>

      <p className="mt-4 text-xs uppercase tracking-wide text-muted">Tipo</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Tipo de cardio">
        {TIPOS_CARDIO.map((t) => (
          <Chip key={t.tipo} selected={tipo === t.tipo} onClick={() => setTipo(t.tipo)}>
            {t.emoji} {t.label}
          </Chip>
        ))}
      </div>

      <p className="mt-4 text-xs uppercase tracking-wide text-muted">Duração</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK_MIN.map((n) => (
          <Chip key={n} selected={minutos === n} onClick={() => setMinutos(n)}>
            {formatarMinutos(n)}
          </Chip>
        ))}
      </div>
      <div className="mt-2">
        <NumStepper
          value={minutos}
          onChange={setMinutos}
          step={5}
          min={5}
          max={600}
          inteiro
          unit="min"
          label="Minutos"
        />
      </div>

      <label className="mt-4 flex flex-col text-xs uppercase tracking-wide text-muted">
        Quando
        <input
          type="date"
          value={data}
          max={hoje}
          onChange={(e) => setData(e.target.value || hoje)}
          className="mt-1 min-h-11 rounded-xl border border-border bg-ink-900 px-3 text-sm normal-case tracking-normal text-bone-50"
        />
      </label>

      <div className="mt-4">
        <Button data-testid="cardio-salvar" onClick={() => { addCardio({ minutos, tipo, data }); onClose(); }}>
          Registrar {rotuloTipoCardio(tipo)} · {formatarMinutos(minutos)}
        </Button>
      </div>

      <div className="mt-5 border-t border-border pt-3">
        <p className="text-sm font-semibold">Nesta semana</p>
        {registros.length === 0 ? (
          <p className="mt-1 text-xs text-muted">Nenhum cardio registrado ainda.</p>
        ) : (
          <ul className="mt-2 space-y-2" data-testid="cardio-lista-semana">
            {registros.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {emojiTipoCardio(c.tipo)} {rotuloTipoCardio(c.tipo)} · {formatarMinutos(c.minutos)}
                  <span className="text-muted"> · {ddmm(c.data)}</span>
                </span>
                {removendo === c.id ? (
                  <span className="flex shrink-0 items-center gap-2 text-xs">
                    <button
                      type="button"
                      className="font-semibold text-danger"
                      onClick={() => { removeCardio(c.id); setRemovendo(null); }}
                    >
                      Remover
                    </button>
                    <button type="button" className="text-muted" onClick={() => setRemovendo(null)}>
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={`Remover ${rotuloTipoCardio(c.tipo)} de ${formatarMinutos(c.minutos)}`}
                    className="shrink-0 px-1 text-muted"
                    onClick={() => setRemovendo(c.id)}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Casca>
  );
}

function TextoResumo({ semana }: { semana: ResumoCardioSemana }) {
  if (semana.meta_min <= 0) {
    return <>Nesta semana você fez {formatarMinutos(semana.minutos)} de cardio. Defina uma meta no perfil pra acompanhar o ideal.</>;
  }
  if (semana.batido) {
    return <>Meta da semana batida: {formatarMinutos(semana.minutos)} de {formatarMinutos(semana.meta_min)}. Bom trabalho.</>;
  }
  return <>Faltam {formatarMinutos(semana.restante_min)} pra fechar a semana ({formatarMinutos(semana.minutos)} de {formatarMinutos(semana.meta_min)}).</>;
}

/** Card compacto no Hoje. */
export function CardioResumo() {
  const { hoje, meta, semana } = useCardio();
  const [open, setOpen] = useState(false);

  if (!semana || !hoje) return null;
  // Sem meta e sem registro: não ocupa espaço no Hoje.
  if (meta <= 0 && semana.registros.length === 0) return null;

  return (
    <div data-testid="cardio-resumo">
      <Card className="mb-4 border border-sky-400/25">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Cardio da semana</p>
            <p className="mt-1 text-lg font-bold">
              <span className="num text-sky-300">{formatarMinutos(semana.minutos)}</span>
              {meta > 0 ? <span className="text-sm font-normal text-muted"> de {formatarMinutos(meta)}</span> : null}
            </p>
          </div>
          {meta > 0 ? (
            <Badge tone={semana.batido ? "go" : "muted"}>{semana.batido ? "meta batida" : `${semana.pct}%`}</Badge>
          ) : (
            <Badge tone="muted">sem meta</Badge>
          )}
        </div>
        {meta > 0 ? (
          <div className="mt-2">
            <ProgressBar value={semana.pct} tone={semana.batido ? "go" : "accent"} />
          </div>
        ) : null}
        <p className="mt-2 text-xs text-muted">
          <TextoResumo semana={semana} />
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            variant="ghost"
            className="min-h-11 flex-1 text-sm"
            data-testid="cardio-registrar"
            onClick={() => setOpen(true)}
          >
            + Registrar cardio
          </Button>
          <Link
            href="/progresso#cardio"
            className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-semibold text-accent"
          >
            Ver histórico
          </Link>
        </div>
      </Card>
      {open ? <CardioSheet hoje={hoje} registros={semana.registros} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

/** Seção do Progresso: semana atual + histórico. */
export function CardioSection() {
  const { hoje, meta, semana, historico } = useCardio();
  const [open, setOpen] = useState(false);

  if (!hoje || !semana) return null;

  return (
    <section id="cardio" className="mb-6 scroll-mt-6" data-testid="cardio-progresso">
      <SectionTitle
        title="Cardio"
        action={
          <Link href="/perfil" className="text-xs font-semibold text-accent">
            Meta: {meta > 0 ? formatarMinutos(meta) : "definir"} →
          </Link>
        }
      />

      <Card className="mb-3 border border-sky-400/25">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Esta semana · {semanaLabel(semana.inicio, semana.fim)}</p>
            <p className="mt-1 text-lg font-bold">
              <span className="num text-sky-300">{formatarMinutos(semana.minutos)}</span>
              {meta > 0 ? <span className="text-sm font-normal text-muted"> de {formatarMinutos(meta)}</span> : null}
            </p>
          </div>
          {meta > 0 ? (
            <Badge tone={semana.batido ? "go" : "muted"}>{semana.batido ? "meta batida" : `${semana.pct}%`}</Badge>
          ) : (
            <Badge tone="muted">sem meta</Badge>
          )}
        </div>
        {meta > 0 ? (
          <div className="mt-2">
            <ProgressBar value={semana.pct} tone={semana.batido ? "go" : "accent"} />
          </div>
        ) : null}
        <p className="mt-2 text-xs text-muted">
          <TextoResumo semana={semana} />
        </p>
        <div className="mt-3">
          <Button variant="ghost" className="min-h-11 text-sm" data-testid="cardio-registrar-progresso" onClick={() => setOpen(true)}>
            + Registrar cardio
          </Button>
        </div>
      </Card>

      {semana.registros.length > 0 ? (
        <Card className="mb-3">
          <p className="text-sm font-semibold">Registros desta semana</p>
          <ul className="mt-2 space-y-1.5">
            {semana.registros.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {emojiTipoCardio(c.tipo)} {rotuloTipoCardio(c.tipo)}
                </span>
                <span className="load-num shrink-0 text-muted">
                  {ddmm(c.data)} · {formatarMinutos(c.minutos)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div data-testid="cardio-historico">
        <Card>
          <p className="text-sm font-semibold">Histórico por semana</p>
          {historico.length === 0 ? (
            <p className="mt-1 text-xs text-muted">Sem semanas registradas ainda.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {historico.map((h) => (
                <div key={h.inicio}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className={h.inicio === semana.inicio ? "font-semibold text-accent" : "text-muted"}>
                      {h.inicio === semana.inicio ? "Esta semana" : `Semana ${semanaLabel(h.inicio, h.fim)}`}
                    </span>
                    <span className="load-num">
                      {formatarMinutos(h.minutos)}
                      {h.meta_min > 0 ? <span className="text-muted"> / {formatarMinutos(h.meta_min)}</span> : null}
                    </span>
                  </div>
                  <ProgressBar value={h.pct} tone={h.batido ? "go" : "accent"} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {open ? <CardioSheet hoje={hoje} registros={semana.registros} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}
