"use client";

import { VolumeBar } from "@/components/VolumeBar";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Button, Card, NumStepper } from "@/components/ui";
import type { Equipamento, Experiencia, Objetivo, Perfil } from "@/lib/domain";
import { PARQ_PERGUNTAS, avaliarParq } from "@/lib/plan/parq";
import { NegociacaoPlano } from "@/components/NegociacaoPlano";
import { ColetaCoach, type ColetaResultado } from "@/components/ColetaCoach";
import { paraPerfil, validarEstrategia } from "@/lib/plan/coleta";
import { seedState } from "@/lib/seed";
import { CATALOG_EXERCICIOS } from "@/lib/catalog/exercicios";
import { emModoRefazer, patchConfirmarRefazer } from "@/lib/plan/refazer";

/**
 * Motion: docs/motion-spec.md § Onboarding (rico)
 * Helpers copy-paste: docs/onboarding-motion-snippets.tsx
 * PAR-Q+ gate: qualquer SIM bloqueia plano (N2 produto).
 */

const EQUIPS: Equipamento[] = [
  "barra",
  "halteres",
  "maquina",
  "cabo",
  "peso_corporal",
  "banco",
  "rack",
];

const GROUPS = ["peito", "costas", "ombro", "bíceps", "tríceps", "pernas"] as const;
const OBJ_MULT: Record<string, number> = {
  hipertrofia: 1,
  forca: 0.75,
  recomposicao: 0.9,
  saude: 0.7,
};
const OBJ_SHARE: Record<string, number[]> = {
  hipertrofia: [1.05, 1.1, 0.95, 0.85, 0.9, 1.15],
  forca: [1.15, 1.1, 0.85, 0.7, 0.75, 1.2],
  recomposicao: [1, 1.05, 0.95, 0.9, 0.9, 1.1],
  saude: [0.95, 1, 1, 0.85, 0.85, 1.15],
};

function estimateWeeklyVolume(dias: number, mins: number, objetivo: string) {
  const base = (dias * mins) / 20;
  const mult = OBJ_MULT[objetivo] ?? 1;
  const shares = OBJ_SHARE[objetivo] ?? OBJ_SHARE.hipertrofia;
  return GROUPS.map((g, i) => ({
    grupo: g,
    sets: Math.round(Math.min(22, Math.max(4, base * mult * (shares[i] ?? 1)))),
  }));
}

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

function TimeBar({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (n: number) => void;
}) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <div className="mb-5">
      <label className="mb-2 block text-xs text-muted">
        {label}:{" "}
        <span className="load-num font-semibold text-bone-50">{value}</span>
        {unit ? ` ${unit}` : ""}
      </label>
      <div className="bar-track mb-2">
        <span className="bar-fill enter" style={{ width: `${pct}%` }} />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#B8FF3C]"
        aria-label={label}
      />
    </div>
  );
}

function VolumeWeekPreview({
  dias,
  mins,
  objetivo,
}: {
  dias: number;
  mins: number;
  objetivo: string;
}) {
  const rows = estimateWeeklyVolume(dias, mins, objetivo);
  const scaleMax = 24;
  return (
    <div className="vol-chart">
      <div className="vol-head">
        <span className="vol-title">Volume / semana</span>
        <span className="vol-hint">faixa 10–20</span>
      </div>
      {rows.map((r, ri) => {
        return (
          <div key={r.grupo} className="vol-row">
            <span className="vol-label">{r.grupo}</span>
            <div className="flex-1">
              <VolumeBar label={r.grupo} valor={r.sets} max={scaleMax} faixa={[10, 20]} index={ri} cabecalho={false} fina />
            </div>
            <span className="vol-num">{r.sets}</span>
          </div>
        );
      })}
    </div>
  );
}

const LAST_STEP = 4;

export default function OnboardingPage() {
  const { state, completeOnboarding, updatePerfil, updatePerfilAndRemount } = useApp();
  const router = useRouter();
  // Refazer (?refazer=1): nada grava até "Confirmar plano"; cancelar = estado intacto.
  const [refazerParam] = useState(() =>
    typeof window !== "undefined" ? window.location.search : "",
  );
  const refazer = emModoRefazer(refazerParam, state.perfil);
  const [salvando, setSalvando] = useState(false);
  const [erroRefazer, setErroRefazer] = useState<string | null>(null);
  const [parqPendenteRegistro, setParqPendenteRegistro] = useState<Partial<Perfil> | null>(null);
  function sairSemMudar() {
    router.push("/perfil");
  }
  async function confirmarRefazer(p: Perfil) {
    const r = patchConfirmarRefazer(p);
    if (!r.ok) {
      setErroRefazer("PAR-Q+ com SIM: não dá pra gerar plano novo.");
      return;
    }
    setSalvando(true);
    try {
      // mesmo remount do Ajustar: preserva EstadoExercicio e histórico de séries
      const res = await updatePerfilAndRemount(r.patch, { skipLlm: true });
      if (!res.ok) {
        setErroRefazer(res.error ?? "Não deu pra salvar agora. Seu plano atual continua igual.");
        return;
      }
      router.push("/plano");
    } finally {
      setSalvando(false);
    }
  }
  const barraRefazer = refazer ? (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-3 py-2">
      <p className="text-[11px] leading-snug text-bone-200">
        Refazendo com o coach · seu plano atual só muda quando você tocar em <b>Confirmar plano</b>.
      </p>
      <button
        type="button"
        onClick={sairSemMudar}
        className="motion-press min-h-10 shrink-0 rounded-full border border-border px-3 text-xs font-semibold text-bone-50"
      >
        Voltar sem mudar
      </button>
    </div>
  ) : null;
  // Proposta em negociação (não salva) — só "Confirmar plano" chama completeOnboarding.
  const [rascunho, setRascunho] = useState<Perfil | null>(null);
  const [step, setStep] = useState(0);
  // Coleta conversacional (LLM) → depois PAR-Q (gate explícito) → negociação. Falha → formulário.
  const [modo, setModo] = useState<"coach" | "form">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("modo") === "form" ? "form" : "coach",
  );
  const [coleta, setColeta] = useState<ColetaResultado | null>(null);
  const [avisoFallback, setAvisoFallback] = useState<string | null>(null);
  const p = state.perfil;

  const [peso, setPeso] = useState(p?.peso_kg ?? 82);
  const [altura, setAltura] = useState(p?.altura_cm ?? 178);
  const [exp, setExp] = useState<Experiencia>(p?.experiencia ?? "intermediario");
  const [dias, setDias] = useState(p?.dias_por_semana ?? 4);
  const [mins, setMins] = useState(p?.minutos_por_sessao ?? 60);
  const [cardio, setCardio] = useState(p?.cardio_min_semana ?? 90);
  const [equips, setEquips] = useState<Equipamento[]>(
    p?.equipamentos ?? ["barra", "halteres", "maquina"],
  );
  const [restricoes, setRestricoes] = useState<string[]>(p?.restricoes ?? []);
  const [objetivo, setObjetivo] = useState<Objetivo>(p?.objetivo ?? "hipertrofia");
  const [parq, setParq] = useState<Array<boolean | null>>(
    () => PARQ_PERGUNTAS.map(() => null),
  );
  const [parqBloqueado, setParqBloqueado] = useState(false);

  function toggleEquip(e: Equipamento) {
    setEquips((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e],
    );
  }

  function toggleRestricao(r: string) {
    if (r === "nenhuma") {
      setRestricoes([]);
      return;
    }
    setRestricoes((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev.filter((x) => x !== "nenhuma"), r],
    );
  }

  function setParqAnswer(idx: number, value: boolean) {
    setParq((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }

  function next() {
    if (step < LAST_STEP) {
      setStep(step + 1);
      return;
    }
    // PAR-Q step finish
    if (parq.some((v) => v === null)) return;
    const result = avaliarParq(parq.map((v) => !!v));
    const agora = new Date().toISOString();
    if (!result.liberado) {
      setParqBloqueado(true);
      const parqPatch: Partial<Perfil> = {
        peso_kg: peso,
        altura_cm: altura,
        experiencia: exp,
        dias_por_semana: dias,
        minutos_por_sessao: mins,
        cardio_min_semana: cardio,
        equipamentos: equips,
        restricoes,
        objetivo,
        parq_respostas: result.respostas,
        parq_liberado: false,
        parq_respondido_em: agora,
        onboarding_concluido: false,
      };
      // Refazer: não grava sozinho — a pessoa confirma o registro da triagem (gate PAR-Q continua valendo)
      if (refazer) setParqPendenteRegistro(parqPatch);
      else updatePerfil(parqPatch);
      return;
    }
    const base0 = state.perfil ?? seedState.perfil!;
    const base = coleta
      ? (() => {
          const c = { ...coleta.perfil, peso_kg: peso, altura_cm: altura, experiencia: exp, dias_por_semana: dias, minutos_por_sessao: mins, cardio_min_semana: cardio, equipamentos: equips, restricoes: restricoes.filter((r): r is "ombro" | "lombar" | "joelho" | "punho" => ["ombro", "lombar", "joelho", "punho"].includes(r)), objetivo };
          const v = validarEstrategia(c, coleta.estrategia ?? { estilo_split: "auto" });
          return paraPerfil(base0, c, v.estrategia, [...new Set([...coleta.correcoes, ...v.correcoes])]);
        })()
      : base0;
    setRascunho({
      ...base,
      onboarding_concluido: true,
      peso_kg: peso,
      altura_cm: altura,
      experiencia: exp,
      dias_por_semana: dias,
      minutos_por_sessao: mins,
      cardio_min_semana: cardio,
      equipamentos: equips,
      restricoes,
      objetivo,
      parq_respostas: result.respostas,
      parq_liberado: true,
      parq_respondido_em: agora,
    });
  }

  const parqCompleto = parq.every((v) => v !== null);

  if (!rascunho && modo === "coach" && !coleta) {
    return (
      <main className="flex min-h-dvh flex-col px-5 pb-8 pt-6">
        {barraRefazer}
        <ColetaCoach
          onFallback={(m) => { setAvisoFallback(m === "usuario" ? null : "O coach não respondeu agora — segue pelo formulário rápido."); setModo("form"); }}
          onPronto={(r) => {
            const c = r.perfil;
            if (c.peso_kg) setPeso(c.peso_kg);
            if (c.altura_cm) setAltura(c.altura_cm);
            if (c.experiencia) setExp(c.experiencia);
            if (c.dias_por_semana) setDias(c.dias_por_semana);
            if (c.minutos_por_sessao) setMins(c.minutos_por_sessao);
            if (c.cardio_min_semana !== undefined) setCardio(c.cardio_min_semana);
            if (c.equipamentos?.length) setEquips(c.equipamentos);
            if (c.restricoes) setRestricoes(c.restricoes);
            if (c.objetivo) setObjetivo(c.objetivo);
            setColeta(r);
            setModo("form");
            setStep(LAST_STEP);
          }}
        />
      </main>
    );
  }

  if (rascunho) {
    return (
      <main className="flex min-h-dvh flex-col px-5 pb-8 pt-6">
        {barraRefazer}
        {erroRefazer ? <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{erroRefazer}</p> : null}
        <div key="negociacao" className="motion-swap flex flex-1 flex-col">
          <NegociacaoPlano
            perfilInicial={rascunho}
            catalog={state.exercicios.length ? state.exercicios : CATALOG_EXERCICIOS}
            onVoltar={() => setRascunho(null)}
            confirmarLabel={salvando ? "Salvando…" : "Confirmar plano"}
            onConfirmar={(p) => {
              if (salvando) return;
              if (refazer) {
                void confirmarRefazer(p);
                return;
              }
              completeOnboarding(p);
              router.push("/plano");
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col px-5 pb-8 pt-6">
      <div className="mb-6 flex items-center justify-center gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-2 rounded-full transition-all duration-200 ${
              i === step
                ? "w-5 bg-accent shadow-[0_0_8px_rgba(184,255,60,.5)]"
                : "w-2 bg-ink-700"
            }`}
          />
        ))}
      </div>

      {barraRefazer}
      {avisoFallback && <p className="mb-3 rounded-xl bg-white/5 px-3 py-2 text-xs text-muted">{avisoFallback}</p>}
      {coleta && step === LAST_STEP && <p className="mb-3 rounded-xl bg-accent/10 px-3 py-2 text-xs text-bone-200">Já entendi seu perfil. Antes de te mostrar o plano, uma triagem rápida de saúde (PAR-Q+) — é obrigatória e eu não pulo.</p>}
      <div key={step} className="motion-swap flex flex-1 flex-col">
        {step === 0 && (
          <div className="motion-stagger flex flex-1 flex-col">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
                Perfil
              </p>
              <h1 className="mb-1 text-2xl font-bold">Seus dados</h1>
              <p className="mb-6 text-sm text-muted">
                Base para volume e progressão. Sem milagre — só biologia.
              </p>
            </div>
            <NumStepper value={peso} onChange={setPeso} step={0.5} unit="kg" label="Peso" />
            <div className="my-6" />
            <NumStepper value={altura} onChange={setAltura} step={1} unit="cm" label="Altura" />
            <div className="mt-6">
              <p className="mb-2 text-xs text-muted">Experiência</p>
              <div className="flex flex-wrap gap-2">
                {(["iniciante", "intermediario", "avancado"] as Experiencia[]).map((e) => (
                  <Chip key={e} selected={exp === e} onClick={() => setExp(e)}>
                    {e === "intermediario"
                      ? "Intermediário"
                      : e === "avancado"
                        ? "Avançado"
                        : "Iniciante"}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="motion-stagger flex flex-1 flex-col">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
                Tempo
              </p>
              <h1 className="mb-1 text-2xl font-bold">Quanto tempo você tem?</h1>
              <p className="mb-6 text-sm text-muted">
                Define frequência e duração. Cardio não substitui volume de força.
              </p>
            </div>
            <TimeBar
              label="Dias / semana"
              value={dias}
              min={2}
              max={6}
              onChange={setDias}
            />
            <TimeBar
              label="Minutos / sessão"
              value={mins}
              min={30}
              max={90}
              step={5}
              unit="min"
              onChange={setMins}
            />
            <TimeBar
              label="Cardio min / semana"
              value={cardio}
              min={0}
              max={180}
              step={15}
              unit="min"
              onChange={setCardio}
            />
            <VolumeWeekPreview dias={dias} mins={mins} objetivo={objetivo} />
          </div>
        )}

        {step === 2 && (
          <div className="motion-stagger flex flex-1 flex-col">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
                Contexto
              </p>
              <h1 className="mb-1 text-2xl font-bold">Equipamento e limitações</h1>
              <p className="mb-5 text-sm text-muted">
                O plano só usa o que você tem. Lesões mudam seleção, não o estímulo.
              </p>
            </div>
            <p className="mb-2 text-xs text-muted">Equipamentos</p>
            <div className="mb-5 flex flex-wrap gap-2">
              {EQUIPS.map((e) => (
                <Chip key={e} selected={equips.includes(e)} onClick={() => toggleEquip(e)}>
                  {e.replace("_", " ")}
                </Chip>
              ))}
            </div>
            <p className="mb-2 text-xs text-muted">Lesões / limitações</p>
            <div className="flex flex-wrap gap-2">
              {["nenhuma", "ombro", "lombar", "joelho", "punho"].map((r) => (
                <Chip
                  key={r}
                  selected={
                    (r === "nenhuma" && restricoes.length === 0) || restricoes.includes(r)
                  }
                  onClick={() => toggleRestricao(r)}
                >
                  {r}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="motion-stagger flex flex-1 flex-col">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
                Objetivo
              </p>
              <h1 className="mb-1 text-2xl font-bold">Para onde vamos?</h1>
              <p className="mb-5 text-sm text-muted">
                Qualquer split funciona. O coach monta e adapta.
              </p>
            </div>
            <div className="space-y-3">
              {(
                [
                  ["hipertrofia", "Hipertrofia", "Volume semanal progressivo na faixa 10–20."],
                  ["forca", "Força", "Faixas mais baixas, RIR mais baixo em compostos."],
                  ["recomposicao", "Recomposição", "Manter força enquanto ajusta composição."],
                  ["saude", "Saúde", "Consistência e amplitude de movimento."],
                ] as const
              ).map(([id, title, desc]) => (
                <Card
                  key={id}
                  className={`obj-card cursor-pointer ${objetivo === id ? "on" : ""}`}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setObjetivo(id)}
                  >
                    <div className="font-semibold">{title}</div>
                    <div className="text-xs text-muted">{desc}</div>
                  </button>
                </Card>
              ))}
            </div>
            <div className="mt-4">
              <VolumeWeekPreview dias={dias} mins={mins} objetivo={objetivo} />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="motion-stagger flex flex-1 flex-col">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">
                PAR-Q+
              </p>
              <h1 className="mb-1 text-2xl font-bold">Triagem de segurança</h1>
              <p className="mb-4 text-sm text-muted">
                Gate obrigatório antes de gerar o plano. Qualquer{" "}
                <span className="text-warn">SIM</span> bloqueia a prescrição e
                direciona para avaliação profissional (ePARmed-X+). Educativo —
                não substitui consulta.
              </p>
            </div>
            {parqBloqueado ? (
              <Card className="border-danger/40 bg-danger/10">
                <p className="mb-2 text-sm font-bold text-danger">Bloqueio N2 · PAR-Q+</p>
                <p className="mb-3 text-sm text-muted">
                  Há pelo menos uma resposta SIM. Não geramos plano nem liberamos
                  sessão. Procure avaliação profissional (ePARmed-X+ /
                  profissional de saúde) antes de treinar com progressão.
                </p>
                <a
                  href="https://eparmedx.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-accent underline"
                >
                  eparmedx.com
                </a>
                {refazer && parqPendenteRegistro ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs text-muted">
                      Nada foi salvo ainda. Se essas respostas estão certas, registre a triagem — o plano fica pausado até a liberação.
                    </p>
                    <Button
                      variant="ghost"
                      className="min-h-11 text-sm"
                      onClick={() => {
                        updatePerfil(parqPendenteRegistro);
                        router.push("/hoje");
                      }}
                    >
                      Registrar triagem e pausar o plano
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-11 text-sm"
                      onClick={() => {
                        setParqBloqueado(false);
                        setParqPendenteRegistro(null);
                      }}
                    >
                      Revisar respostas
                    </Button>
                  </div>
                ) : null}
              </Card>
            ) : (
              <div className="space-y-3">
                {PARQ_PERGUNTAS.map((q, i) => (
                  <Card key={i} className="text-sm">
                    <p className="mb-2 text-muted">{q}</p>
                    <div className="flex gap-2">
                      <Chip
                        selected={parq[i] === false}
                        onClick={() => setParqAnswer(i, false)}
                      >
                        Não
                      </Chip>
                      <Chip
                        selected={parq[i] === true}
                        onClick={() => setParqAnswer(i, true)}
                      >
                        Sim
                      </Chip>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          {step > 0 && !parqBloqueado && (
            <Button variant="ghost" className="w-auto px-6" onClick={() => setStep(step - 1)}>
              Voltar
            </Button>
          )}
          {!parqBloqueado && (
            <Button
              className="motion-press motion-cta-glow"
              onClick={next}
              disabled={step === LAST_STEP && !parqCompleto}
            >
              {step === LAST_STEP ? "Gerar plano" : "Continuar"}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
