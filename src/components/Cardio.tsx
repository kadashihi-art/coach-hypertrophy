"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Casca } from "@/components/EditarTreinoSheet";
import { Badge, Button, Card, NumStepper, ProgressBar, SectionTitle } from "@/components/ui";
import { useClientValue } from "@/lib/use-client-value";
import { hojeIsoSaoPaulo } from "@/lib/plan/proxima-sessao";
import {
  INTENSIDADES_CARDIO,
  TIPOS_CARDIO,
  detalheCardio,
  emojiTipoCardio,
  formatarKcal,
  formatarKm,
  formatarMinutos,
  historicoCardio,
  resumoCardioSemana,
  rotuloTipoCardio,
  semanaLabel,
  type ResumoCardioSemana,
  type ResumoDiaCardio,
} from "@/lib/cardio";
import type { Cardio, IntensidadeCardio, TipoCardio } from "@/lib/domain";

const QUICK_MIN = [10, 15, 20, 30, 45, 60];
const QUICK_KM = [3, 5, 10];
const QUICK_KCAL = [200, 300, 500];

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
  disabled,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`motion-press min-h-9 rounded-full border px-3 text-xs font-semibold disabled:opacity-40 ${
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
  dataInicial,
  onClose,
}: {
  hoje: string;
  registros: Cardio[];
  dataInicial: string;
  onClose: () => void;
}) {
  const { addCardio, removeCardio } = useApp();
  const [tipo, setTipo] = useState<TipoCardio>("caminhada");
  const [minutos, setMinutos] = useState(30);
  const [km, setKm] = useState(0);
  const [kcal, setKcal] = useState(0);
  const [intensidade, setIntensidade] = useState<IntensidadeCardio | null>(null);
  const [data, setData] = useState(dataInicial);
  const [removendo, setRemovendo] = useState<string | null>(null);

  function salvar() {
    addCardio({
      minutos,
      tipo,
      data,
      distancia_km: km > 0 ? km : null,
      calorias_kcal: kcal > 0 ? kcal : null,
      intensidade,
    });
    onClose();
  }

  return (
    <Casca label="Registrar cardio" onClose={onClose}>
      <h2 className="text-lg font-bold">Registrar cardio</h2>
      <p className="mt-1 text-xs text-muted">
        Os minutos contam no ideal da semana. O resto é opcional.
      </p>

      <p className="mt-4 text-xs uppercase tracking-wide text-muted">Tipo</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Tipo de cardio">
        {TIPOS_CARDIO.map((t) => (
          <Chip key={t.tipo} selected={tipo === t.tipo} onClick={() => setTipo(t.tipo)}>
            {t.emoji} {t.label}
          </Chip>
        ))}
      </div>

      <p className="mt-4 text-xs uppercase tracking-wide text-muted">Tempo</p>
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

      <p className="mt-4 text-xs uppercase tracking-wide text-muted">Distância (opcional)</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK_KM.map((n) => (
          <Chip key={n} selected={km === n} onClick={() => setKm(km === n ? 0 : n)}>
            {n} km
          </Chip>
        ))}
      </div>
      <div className="mt-2">
        <NumStepper
          value={km}
          onChange={setKm}
          step={0.5}
          min={0}
          max={500}
          unit="km"
          label="Distância"
          hint="0 = não informar"
        />
      </div>

      <p className="mt-4 text-xs uppercase tracking-wide text-muted">Calorias (opcional)</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK_KCAL.map((n) => (
          <Chip key={n} selected={kcal === n} onClick={() => setKcal(kcal === n ? 0 : n)}>
            {n} kcal
          </Chip>
        ))}
      </div>
      <div className="mt-2">
        <NumStepper
          value={kcal}
          onChange={setKcal}
          step={10}
          min={0}
          max={5000}
          inteiro
          unit="kcal"
          label="Calorias"
          hint="0 = não informar"
        />
      </div>

      <p className="mt-4 text-xs uppercase tracking-wide text-muted">Intensidade (opcional)</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Intensidade">
        {INTENSIDADES_CARDIO.map((i) => (
          <Chip
            key={i.valor}
            selected={intensidade === i.valor}
            onClick={() => setIntensidade(intensidade === i.valor ? null : i.valor)}
          >
            {i.label}
          </Chip>
        ))}
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
        <Button data-testid="cardio-salvar" onClick={salvar}>
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
                <span className="min-w-0">
                  <span className="block truncate">
                    {emojiTipoCardio(c.tipo)} {rotuloTipoCardio(c.tipo)}
                  </span>
                  <span className="block text-xs text-muted">
                    {detalheCardio(c)} · {ddmm(c.data)}
                  </span>
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

/** Totais além dos minutos: aparecem só quando a pessoa informa. */
function Extras({ dia }: { dia: { distancia_km: number; calorias_kcal: number } }) {
  const partes = [formatarKm(dia.distancia_km), formatarKcal(dia.calorias_kcal)].filter(
    (p): p is string => Boolean(p),
  );
  if (partes.length === 0) return null;
  return <>{partes.join(" · ")}</>;
}

/** Os 7 dias da semana; toque num dia pra registrar nele. */
function SemanaStrip({
  porDia,
  onAbrir,
}: {
  porDia: ResumoDiaCardio[];
  onAbrir: (data: string) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-7 gap-1" data-testid="cardio-semana">
      {porDia.map((d) => (
        <button
          key={d.data}
          type="button"
          disabled={d.futuro}
          onClick={() => onAbrir(d.data)}
          aria-label={`${d.rotulo} ${ddmm(d.data)}: ${formatarMinutos(d.minutos)}${
            d.meta_min > 0 ? ` de ${formatarMinutos(d.meta_min)}` : ""
          }${d.hoje ? " (hoje)" : ""}`}
          className={`flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center disabled:opacity-40 ${
            d.hoje ? "bg-white/8" : ""
          }`}
        >
          <span className="text-[10px] font-semibold uppercase text-muted">{d.rotulo}</span>
          <span
            className={`num text-xs font-bold ${
              d.batido ? "text-go" : d.minutos > 0 ? "text-sky-300" : "text-muted"
            }`}
          >
            {d.minutos > 0 ? d.minutos : "–"}
          </span>
          <span className="h-1 w-full overflow-hidden rounded-full bg-ink-700">
            <span
              className={`block h-full rounded-full ${d.batido ? "bg-go" : "bg-accent"}`}
              style={{ width: `${d.pct}%` }}
            />
          </span>
        </button>
      ))}
    </div>
  );
}

/** Card compacto no Hoje. */
export function CardioResumo() {
  const { hoje, meta, semana } = useCardio();
  const [sheet, setSheet] = useState<string | null>(null);

  if (!semana || !hoje) return null;
  // Sem meta e sem registro: não ocupa espaço no Hoje.
  if (meta <= 0 && semana.registros.length === 0) return null;

  const extras = [formatarKm(semana.distancia_km), formatarKcal(semana.calorias_kcal)].filter(
    (p): p is string => Boolean(p),
  );

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
        {extras.length > 0 ? (
          <p className="mt-1 text-xs text-muted">{extras.join(" · ")}</p>
        ) : null}

        <SemanaStrip porDia={semana.por_dia} onAbrir={setSheet} />

        <p className="mt-2 text-xs text-muted">
          {meta > 0 ? (
            <>Meta dividida nos 7 dias — toque num dia pra registrar. </>
          ) : null}
          <TextoResumo semana={semana} />
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            variant="ghost"
            className="min-h-11 flex-1 text-sm"
            data-testid="cardio-registrar"
            onClick={() => setSheet(hoje)}
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
      {sheet ? (
        <CardioSheet
          hoje={hoje}
          registros={semana.registros}
          dataInicial={sheet}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}

/** Seção do Progresso: semana atual dia a dia + histórico. */
export function CardioSection() {
  const { hoje, meta, semana, historico } = useCardio();
  const [sheet, setSheet] = useState<string | null>(null);

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
          <Button variant="ghost" className="min-h-11 text-sm" data-testid="cardio-registrar-progresso" onClick={() => setSheet(hoje)}>
            + Registrar cardio
          </Button>
        </div>
      </Card>

      <Card className="mb-3" data-testid="cardio-divisao">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">Divisão da semana</p>
          <span className="text-[11px] text-muted">{semana.dias_ativos}/7 dias com cardio</span>
        </div>
        {meta > 0 ? (
          <p className="mt-1 text-xs text-muted">
            {formatarMinutos(meta)} divididos nos 7 dias. Toque no + pra registrar no dia.
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted">
            Sem meta definida. Você pode registrar mesmo assim e ver o total da semana.
          </p>
        )}

        <ul className="mt-2 divide-y divide-white/5">
          {semana.por_dia.map((d) => (
            <li
              key={d.data}
              className={`flex items-center gap-2 py-2 text-sm ${d.futuro ? "opacity-50" : ""} ${
                d.hoje ? "font-semibold" : ""
              }`}
            >
              <span className="w-8 shrink-0 text-xs uppercase text-muted">{d.rotulo}</span>
              <span className="w-11 shrink-0 text-xs text-muted">{ddmm(d.data)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={d.minutos > 0 ? "text-bone-50" : "text-muted"}>
                    {d.minutos > 0 ? formatarMinutos(d.minutos) : "—"}
                  </span>
                  <span className="text-[11px] text-muted">
                    {d.meta_min > 0 ? `ideal ${formatarMinutos(d.meta_min)}` : "sem meta"}
                  </span>
                </div>
                {d.meta_min > 0 ? (
                  <div className="mt-1">
                    <ProgressBar value={d.pct} tone={d.batido ? "go" : "accent"} />
                  </div>
                ) : null}
                {d.distancia_km > 0 || d.calorias_kcal > 0 ? (
                  <p className="mt-0.5 text-[11px] text-muted">
                    <Extras dia={d} />
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={d.futuro}
                onClick={() => setSheet(d.data)}
                aria-label={`Registrar cardio em ${d.rotulo} ${ddmm(d.data)}`}
                className="motion-press flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-sm text-accent disabled:opacity-40"
              >
                +
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-2 border-t border-border pt-2 text-xs text-muted">
          Total: {formatarMinutos(semana.minutos)}
          {formatarKm(semana.distancia_km) ? ` · ${formatarKm(semana.distancia_km)}` : ""}
          {formatarKcal(semana.calorias_kcal) ? ` · ${formatarKcal(semana.calorias_kcal)}` : ""}
        </p>
      </Card>

      {semana.registros.length > 0 ? (
        <Card className="mb-3">
          <p className="text-sm font-semibold">Registros desta semana</p>
          <ul className="mt-2 space-y-2">
            {semana.registros.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {emojiTipoCardio(c.tipo)} {rotuloTipoCardio(c.tipo)}
                </span>
                <span className="shrink-0 text-right text-xs text-muted">
                  {ddmm(c.data)} · {detalheCardio(c)}
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
              {historico.map((h) => {
                const extras = [formatarKm(h.distancia_km), formatarKcal(h.calorias_kcal)].filter(
                  (p): p is string => Boolean(p),
                );
                return (
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
                    <p className="mt-1 text-[11px] text-muted">
                      {h.dias_ativos}/7 dias
                      {extras.length > 0 ? ` · ${extras.join(" · ")}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {sheet ? (
        <CardioSheet
          hoje={hoje}
          registros={semana.registros}
          dataInicial={sheet}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </section>
  );
}
