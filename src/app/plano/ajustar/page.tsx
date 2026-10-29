"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { PlanoTabs } from "@/components/PlanoTabs";
import { REFAZER_HREF } from "@/lib/plan/refazer";
import { Badge, Button, Card, NumStepper, SectionTitle } from "@/components/ui";
import type { Equipamento, Experiencia, Objetivo, Perfil } from "@/lib/domain";
import { racionalDoPlano } from "@/lib/plan/racional";
import { PorQueEssePlano } from "@/components/PorQueEssePlano";
import { NegociacaoPlano } from "@/components/NegociacaoPlano";
import { CATALOG_EXERCICIOS } from "@/lib/catalog/exercicios";
import { NOME_ESTILO, type EstiloSplit } from "@/lib/plan/gerar-plano";
import {
  PARQ_BLOQUEIO_MSG,
  parqBloqueiaPrescricao,
  precisaResponderParq,
} from "@/lib/plan/parq";

const EQUIPS: Equipamento[] = [
  "barra",
  "halteres",
  "maquina",
  "cabo",
  "peso_corporal",
  "banco",
  "rack",
];

const RESTRICOES = ["ombro", "lombar", "joelho", "punho"] as const;

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chip-motion ${selected ? "on" : ""}`}
    >
      {children}
    </button>
  );
}

/** Plano > Ajustar: estilo, negociação com o coach, remontar, data de início */
export default function MeuTreinoPage() {
  const { state, ready, updatePerfilAndRemount, setDataInicio } = useApp();
  const router = useRouter();
  const p = state.perfil;

  const [peso, setPeso] = useState(p?.peso_kg ?? 80);
  const [altura, setAltura] = useState(p?.altura_cm ?? 175);
  const [exp, setExp] = useState<Experiencia>(p?.experiencia ?? "intermediario");
  const [dias, setDias] = useState(p?.dias_por_semana ?? 4);
  const [mins, setMins] = useState(p?.minutos_por_sessao ?? 60);
  const [cardio, setCardio] = useState(p?.cardio_min_semana ?? 0);
  const [equips, setEquips] = useState<Equipamento[]>(
    p?.equipamentos ?? ["halteres", "maquina"],
  );
  const [restricoes, setRestricoes] = useState<string[]>(p?.restricoes ?? []);
  const [objetivo, setObjetivo] = useState<Objetivo>(
    p?.objetivo ?? "hipertrofia",
  );
  const [inicio, setInicio] = useState(
    state.plano?.mesociclo?.data_inicio ?? "",
  );
  const [negociando, setNegociando] = useState(false);
  const [estilo, setEstilo] = useState<EstiloSplit>(p?.estilo_split ?? "auto");
  const [fase2, setFase2] = useState<Exclude<EstiloSplit, "auto"> | "">(p?.fase2_estilo ?? "");
  const [fase1Sem, setFase1Sem] = useState(p?.fase1_semanas ?? 4);
  const [fase2Sem, setFase2Sem] = useState(p?.fase2_semanas ?? 4);
  const racional = useMemo(() => {
    if (!ready || !state.plano) return null;
    try {
      return racionalDoPlano({ plano: state.plano, sessoes: state.sessoes, perfil: state.perfil, catalog: state.exercicios });
    } catch {
      return null;
    }
  }, [ready, state.plano, state.sessoes, state.perfil, state.exercicios]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const parqBloqueado = parqBloqueiaPrescricao(p);
  const parqPendente = precisaResponderParq(p);

  const parqLabel = useMemo(() => {
    if (parqPendente) return { tone: "warn" as const, text: "PAR-Q+ pendente" };
    if (parqBloqueado)
      return { tone: "danger" as const, text: "PAR-Q+ bloqueado (SIM)" };
    return { tone: "go" as const, text: "PAR-Q+ liberado" };
  }, [parqBloqueado, parqPendente]);

  function toggleEquip(e: Equipamento) {
    setEquips((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e],
    );
  }
  function toggleRestricao(r: string) {
    setRestricoes((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
    );
  }

  function buildPatch(): Partial<Perfil> {
    return {
      peso_kg: peso,
      altura_cm: altura,
      experiencia: exp,
      dias_por_semana: dias,
      minutos_por_sessao: mins,
      cardio_min_semana: cardio,
      equipamentos: equips,
      restricoes,
      objetivo,
      estilo_split: estilo,
      fase2_estilo: fase2 || null,
      fase1_semanas: fase1Sem,
      fase2_semanas: fase2Sem,
    };
  }

  async function remountNegociado(p: Perfil) {
    setNegociando(false);
    setBusy(true);
    setMsg(null);
    try {
      const res = await updatePerfilAndRemount({
        dias_por_semana: p.dias_por_semana,
        minutos_por_sessao: p.minutos_por_sessao,
        equipamentos: p.equipamentos,
        restricoes: p.restricoes,
        estilo_split: p.estilo_split,
        fase2_estilo: p.fase2_estilo ?? null,
        fase1_semanas: p.fase1_semanas,
        fase2_semanas: p.fase2_semanas,
        dias_descanso_fixos: p.dias_descanso_fixos,
        acordos_plano: p.acordos_plano,
      });
      if (!res.ok) {
        setMsg(res.error ?? "Não foi possível remontar.");
        return;
      }
      router.push("/plano");
    } finally {
      setBusy(false);
    }
  }

  async function doRemount() {
    setConfirmOpen(false);
    setBusy(true);
    setMsg(null);
    try {
      const res = await updatePerfilAndRemount(buildPatch());
      if (!res.ok) {
        setMsg(res.error ?? "Não foi possível remontar.");
        return;
      }
      if (inicio && /^\d{4}-\d{2}-\d{2}$/.test(inicio)) {
        setDataInicio(inicio);
      }
      setMsg(
        res.fonte === "motor+llm"
          ? "Plano remontado pelo coach."
          : "Plano remontado.",
      );
      router.push("/plano");
    } finally {
      setBusy(false);
    }
  }

  function onSaveInicio() {
    if (!inicio || !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) {
      setMsg("Informe uma data válida (AAAA-MM-DD).");
      return;
    }
    setDataInicio(inicio);
    setMsg("Data de início salva — sessões agendadas no calendário.");
  }

  if (!ready) {
    return (
      <main className="p-5 pt-10">
        <p className="text-muted">Carregando…</p>
      </main>
    );
  }

  return (
    <main className="motion-fade-up px-5 pb-10 pt-8">
      <PlanoTabs />
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
        Plano · Ajustar
      </p>
      <h1 className="mb-2 text-2xl font-bold">Ajustar plano</h1>
      <p className="mb-4 text-sm text-muted">
        Escolha o estilo, negocie com o coach ou remonte. Nada muda sem você
        confirmar — e as cargas que você já tem são mantidas.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={parqLabel.tone}>{parqLabel.text}</Badge>
        <Link href="/perfil" className="text-xs font-semibold text-accent">
          Mudar dias/equipamento →
        </Link>
      </div>

      {parqBloqueado ? (
        <Card className="mb-4 border border-danger/40 bg-danger/10">
          <p className="text-sm font-semibold text-danger">Remount bloqueado</p>
          <p className="mt-1 text-xs text-muted">{PARQ_BLOQUEIO_MSG}</p>
          <Link
            href="/perfil"
            className="mt-2 inline-block text-xs font-semibold text-accent"
          >
            Ver PAR-Q+ no Perfil →
          </Link>
        </Card>
      ) : null}

      <SectionTitle title="Corpo" />
      <Card className="mb-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">Peso (kg)</span>
          <NumStepper value={peso} step={0.5} onChange={(n) => setPeso(Math.min(200, Math.max(40, n)))} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">Altura (cm)</span>
          <NumStepper value={altura} step={1} onChange={(n) => setAltura(Math.min(220, Math.max(140, n)))} />
        </div>
      </Card>

      <SectionTitle title="Experiência" />
      <div className="mb-4 flex flex-wrap gap-2">
        {(["iniciante", "intermediario", "avancado"] as Experiencia[]).map(
          (e) => (
            <Chip key={e} selected={exp === e} onClick={() => setExp(e)}>
              {e}
            </Chip>
          ),
        )}
      </div>

      <SectionTitle title="Rotina" />
      <Card className="mb-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">Dias / semana</span>
          <NumStepper value={dias} step={1} onChange={(n) => setDias(Math.min(6, Math.max(2, n)))} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">Min / sessão</span>
          <NumStepper value={mins} step={5} onChange={(n) => setMins(Math.min(180, Math.max(20, n)))} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">Cardio min / sem</span>
          <NumStepper value={cardio} step={10} onChange={(n) => setCardio(Math.min(400, Math.max(0, n)))} />
        </div>
      </Card>

      {racional ? (
        <>
          <SectionTitle title="Por que esse plano" />
          <PorQueEssePlano racional={racional} />
          {state.perfil ? (
            <Button variant="ghost" className="mb-4 min-h-11 text-sm" disabled={busy} onClick={() => setNegociando(true)}>
              Negociar o plano com o coach
            </Button>
          ) : null}
          {state.perfil ? (
            <>
            <Link href={REFAZER_HREF} className="motion-press mb-4 flex min-h-11 items-center justify-center rounded-[14px] border border-accent/40 text-sm font-semibold text-accent">
              Refazer onboarding com o coach →
            </Link>
            <p className="-mt-2 mb-4 text-center text-[11px] text-muted">Seu plano só muda se você tocar em Confirmar plano. Histórico e cargas ficam.</p>
            </>
          ) : null}
          {negociando && state.perfil ? (
            <div className="sheet-overlay fixed inset-0 flex flex-col overflow-y-auto overscroll-contain bg-ink-950 px-5 pb-[calc(32px+env(safe-area-inset-bottom,0px))] pt-6">
              <div className="motion-swap flex flex-1 flex-col">
                <NegociacaoPlano
                  perfilInicial={state.perfil}
                  catalog={state.exercicios.length ? state.exercicios : CATALOG_EXERCICIOS}
                  onVoltar={() => setNegociando(false)}
                  onConfirmar={(p) => void remountNegociado(p)}
                  confirmarLabel="Confirmar e remontar"
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <SectionTitle title="Estilo do treino" />
      <Card className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(NOME_ESTILO) as EstiloSplit[]).map((e) => (
            <Chip key={e} selected={estilo === e} onClick={() => setEstilo(e)}>
              {NOME_ESTILO[e]}
            </Chip>
          ))}
        </div>
        {estilo === "hibrido_ppl_ul" ? (
          <p className="text-[11px] text-muted">PPL + descanso + Upper/Lower (5 treinos; 6 dias adiciona um Full Body). O coach posiciona os descansos.</p>
        ) : null}
        <p className="text-[11px] text-muted">Fase 2 (opcional): trocar de estilo depois de algumas semanas.</p>
        <div className="flex flex-wrap gap-2">
          <Chip selected={fase2 === ""} onClick={() => setFase2("")}>Sem fase 2</Chip>
          {(Object.keys(NOME_ESTILO) as EstiloSplit[])
            .filter((e) => e !== "auto")
            .map((e) => (
              <Chip key={e} selected={fase2 === e} onClick={() => setFase2(e as Exclude<EstiloSplit, "auto">)}>
                {NOME_ESTILO[e]}
              </Chip>
            ))}
        </div>
        {fase2 ? (
          <div className="grid grid-cols-2 gap-3">
            <NumStepper label="Semanas fase 1" value={fase1Sem} onChange={(n) => setFase1Sem(Math.min(16, Math.max(1, n)))} min={1} step={1} />
            <NumStepper label="Semanas fase 2" value={fase2Sem} onChange={(n) => setFase2Sem(Math.min(16, Math.max(1, n)))} min={1} step={1} />
          </div>
        ) : null}
      </Card>

      <SectionTitle title="Objetivo" />
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          ["hipertrofia", "forca", "recomposicao", "saude"] as Objetivo[]
        ).map((o) => (
          <Chip key={o} selected={objetivo === o} onClick={() => setObjetivo(o)}>
            {o}
          </Chip>
        ))}
      </div>

      <SectionTitle title="Equipamentos" />
      <div className="mb-4 flex flex-wrap gap-2">
        {EQUIPS.map((e) => (
          <Chip
            key={e}
            selected={equips.includes(e)}
            onClick={() => toggleEquip(e)}
          >
            {e.replace("_", " ")}
          </Chip>
        ))}
      </div>

      <SectionTitle title="Restrições / lesões" />
      <div className="mb-4 flex flex-wrap gap-2">
        {RESTRICOES.map((r) => (
          <Chip
            key={r}
            selected={restricoes.some((x) => x.toLowerCase().includes(r))}
            onClick={() => toggleRestricao(r)}
          >
            {r}
          </Chip>
        ))}
      </div>

      <SectionTitle title="Começar em" />
      <Card className="mb-4">
        <label className="mb-2 block text-xs text-muted">
          Data de início do mesociclo
        </label>
        <input
          type="date"
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
          className="mb-3 w-full rounded-xl border border-border bg-ink-900 px-3 py-3 text-sm text-bone-50"
        />
        <Button variant="ghost" className="min-h-11 text-sm" onClick={onSaveInicio}>
          Salvar data e agendar
        </Button>
      </Card>

      {msg ? (
        <p className="mb-3 text-sm text-accent">{msg}</p>
      ) : null}

      <Button
        disabled={busy || parqBloqueado}
        onClick={() => setConfirmOpen(true)}
      >
        {busy ? "Remontando…" : "Salvar e remontar plano"}
      </Button>

      {confirmOpen ? (
        <div className="sheet-overlay fixed inset-0 flex items-end justify-center bg-black/70 p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] sm:items-center">
          <Card className="max-h-[85dvh] w-full max-w-md overflow-y-auto border border-accent/30">
            <p className="text-lg font-bold">Isso gera um novo plano. Continuar?</p>
            <p className="mt-2 text-sm text-muted">
              O coach remonta o split. Cargas de exercícios que permanecerem são
              preservadas; exercícios removidos saem do histórico ativo.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setConfirmOpen(false)}
              >
                Cancelar
              </Button>
              <Button className="flex-1" onClick={() => void doRemount()}>
                Continuar
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
