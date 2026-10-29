"use client";

import { VolumeBar, hapticUmaVez } from "@/components/VolumeBar";
import { acentuar, labelGrupo } from "@/lib/labels";
import { createPortal } from "react-dom";
import { useEffect, useRef, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useApp } from "@/components/AppProvider";
import { Badge, Button, Card, EvidenciaBadge, NumStepper, SectionTitle } from "@/components/ui";
import type { Equipamento, Experiencia, Objetivo, Perfil, PlanoRacional } from "@/lib/domain";
import { CATALOG_EXERCICIOS } from "@/lib/catalog/exercicios";
import { gerarProposta } from "@/lib/plan/negociacao";
import { racionalDoPlano } from "@/lib/plan/racional";
import { humanizarSplits } from "@/lib/plan/split-label";
import { REFAZER_HREF } from "@/lib/plan/refazer";
import { PARQ_BLOQUEIO_MSG, parqBloqueiaPrescricao, precisaResponderParq } from "@/lib/plan/parq";

/** Campos editáveis. `plano: true` → passa por "Ver ajuste" → "Confirmar e salvar". */
type Campo =
  | "peso"
  | "altura"
  | "dias"
  | "minutos"
  | "experiencia"
  | "cardio"
  | "equipamentos"
  | "restricoes"
  | "objetivo";

const MUDA_PLANO: Record<Campo, boolean> = {
  peso: false,
  altura: false,
  cardio: false,
  dias: true,
  minutos: true,
  experiencia: true,
  equipamentos: true,
  restricoes: true,
  objetivo: true,
};

const TITULO: Record<Campo, string> = {
  peso: "Peso",
  altura: "Altura",
  dias: "Dias por semana",
  minutos: "Minutos por sessão",
  experiencia: "Nível de experiência",
  cardio: "Cardio por semana",
  equipamentos: "Equipamentos",
  restricoes: "Lesões / limitações",
  objetivo: "Objetivo",
};

const EQUIPS: Equipamento[] = ["barra", "halteres", "maquina", "cabo", "peso_corporal", "banco", "rack"];
const RESTRICOES = ["ombro", "lombar", "joelho", "punho"] as const;
const EXP_LABEL: Record<Experiencia, string> = {
  iniciante: "Iniciante",
  intermediario: "Intermediário",
  avancado: "Avançado",
};
const OBJ_LABEL: Record<Objetivo, { t: string; d: string }> = {
  hipertrofia: { t: "Hipertrofia", d: "Ganhar massa muscular" },
  forca: { t: "Força", d: "Subir carga nos básicos" },
  recomposicao: { t: "Recomposição", d: "Perder gordura mantendo músculo" },
  saude: { t: "Saúde", d: "Treinar bem, sem extremos" },
};
const equipLabel = (e: string) => e.replace("_", " ");

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`chip-motion ${selected ? "on" : ""}`}>
      {children}
    </button>
  );
}

function Linha({ label, valor, onClick, flash }: { label: string; valor: string; onClick?: () => void; flash?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`motion-press flex min-h-12 w-full items-center justify-between gap-3 border-b border-border px-1 py-3 text-left last:border-b-0 ${flash ? "pr-pop" : ""}`}
    >
      <span className="text-sm text-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold text-bone-50">{valor}</span>
        <span className="text-faint" aria-hidden>
          ›
        </span>
      </span>
    </button>
  );
}

type Rascunho = Pick<
  Perfil,
  | "peso_kg"
  | "altura_cm"
  | "dias_por_semana"
  | "minutos_por_sessao"
  | "experiencia"
  | "cardio_min_semana"
  | "equipamentos"
  | "restricoes"
  | "objetivo"
>;

function patchDoCampo(c: Campo, r: Rascunho): Partial<Perfil> {
  switch (c) {
    case "peso":
      return { peso_kg: r.peso_kg };
    case "altura":
      return { altura_cm: r.altura_cm };
    case "dias":
      return { dias_por_semana: r.dias_por_semana };
    case "minutos":
      return { minutos_por_sessao: r.minutos_por_sessao };
    case "experiencia":
      return { experiencia: r.experiencia };
    case "cardio":
      return { cardio_min_semana: r.cardio_min_semana };
    case "equipamentos":
      return { equipamentos: r.equipamentos };
    case "restricoes":
      return { restricoes: r.restricoes };
    case "objetivo":
      return { objetivo: r.objetivo };
  }
}

type Ajuste =
  | { tipo: "erro"; msg: string }
  | {
      tipo: "proposta";
      antes: PlanoRacional | null;
      depois: PlanoRacional;
      evidencia: Parameters<typeof EvidenciaBadge>[0]["evidencia"];
      sessoesAntes: string[];
      sessoesDepois: string[];
    };

/** /perfil — editar campo a campo sem refazer o onboarding (docs/ia-nav-audit.md §6b). */
export default function PerfilPage() {
  const { state, ready, updatePerfil, updatePerfilAndRemount } = useApp();
  const { data: session } = useSession();
  const router = useRouter();
  const p = state.perfil;

  const [campo, setCampo] = useState<Campo | null>(null);
  const [draft, setDraft] = useState<Rascunho | null>(null);
  const [ajuste, setAjuste] = useState<Ajuste | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [flash, setFlash] = useState<Campo | null>(null);

  useEffect(() => {
    if (ready && !p?.onboarding_concluido) router.replace("/onboarding");
  }, [ready, p?.onboarding_concluido, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Sheet aberto: esconde a tab bar (o main da página cria stacking context; z-index sozinho não basta)
  useEffect(() => {
    const aberto = !!(campo && draft);
    document.body.classList.toggle("sheet-open", aberto);
    return () => document.body.classList.remove("sheet-open");
  }, [campo, draft]);

  // Haptic curto uma vez por abertura do Ver ajuste (só se algo muda; nunca em loop)
  const aberturaAjuste = useRef(0);
  useEffect(() => {
    if (!ajuste || !("depois" in ajuste) || !ajuste.depois) return;
    aberturaAjuste.current += 1;
    hapticUmaVez(`ver-ajuste-${aberturaAjuste.current}`);
  }, [ajuste]);

  const catalog = state.exercicios.length ? state.exercicios : CATALOG_EXERCICIOS;
  const racionalAtual = useMemo(() => {
    if (!ready || !state.plano) return null; // sem new Date() no prerender
    if (state.plano.racional) return state.plano.racional;
    try {
      return racionalDoPlano({ plano: state.plano, sessoes: state.sessoes, perfil: p, catalog: state.exercicios });
    } catch {
      return null;
    }
  }, [ready, state.plano, state.sessoes, state.exercicios, p]);

  if (!ready || !p) {
    return (
      <main className="p-5 pt-10">
        <p className="text-muted">Carregando…</p>
      </main>
    );
  }
  const perfil = p;

  const parqBloqueado = parqBloqueiaPrescricao(perfil);
  const parqPendente = precisaResponderParq(perfil);

  function abrir(c: Campo) {
    setDraft({
      peso_kg: perfil.peso_kg,
      altura_cm: perfil.altura_cm,
      dias_por_semana: perfil.dias_por_semana,
      minutos_por_sessao: perfil.minutos_por_sessao,
      experiencia: perfil.experiencia,
      cardio_min_semana: perfil.cardio_min_semana ?? 0,
      equipamentos: [...perfil.equipamentos],
      restricoes: [...perfil.restricoes],
      objetivo: perfil.objetivo,
    });
    setAjuste(null);
    setCampo(c);
  }

  function fechar() {
    // Cancelar: volta ao valor anterior, nada salvo
    setCampo(null);
    setDraft(null);
    setAjuste(null);
  }

  function marcar(c: Campo, msg: string) {
    setFlash(c);
    setTimeout(() => setFlash(null), 700);
    setToast(msg);
  }

  function salvarDireto() {
    if (!campo || !draft) return;
    updatePerfil(patchDoCampo(campo, draft));
    const c = campo;
    fechar();
    marcar(c, "Salvo");
  }

  function verAjuste() {
    if (!campo || !draft) return;
    const patch = patchDoCampo(campo, draft);
    const novo: Perfil = { ...perfil, ...patch };
    const prop = gerarProposta(novo, catalog);
    if (!prop.ok) {
      setAjuste({ tipo: "erro", msg: prop.erro });
      return;
    }
    const sessoesAntes = state.sessoes
      .filter((s) => state.plano?.sessoes.includes(s.id))
      .map((s) => `${s.nome}:${s.prescricoes.map((x) => `${x.exercicio_id}x${x.series}`).join(",")}`);
    const sessoesDepois = prop.gerado.sessoes.map(
      (s) => `${s.nome}:${s.prescricoes.map((x) => `${x.exercicio_id}x${x.series}`).join(",")}`,
    );
    const semMudanca =
      !!racionalAtual &&
      racionalAtual.split.divisao === prop.racional.split.divisao &&
      sessoesAntes.join("|") === sessoesDepois.join("|");
    if (semMudanca) {
      // Motor não precisa mudar nada → salva só o campo
      updatePerfil(patch);
      const c = campo;
      fechar();
      marcar(c, "Sem mudança no plano · salvo");
      return;
    }
    setAjuste({
      tipo: "proposta",
      antes: racionalAtual,
      depois: prop.racional,
      evidencia: prop.gerado.plano.justificativa.evidencia,
      sessoesAntes: (state.plano?.sessoes ?? [])
        .map((id) => state.sessoes.find((s) => s.id === id)?.nome)
        .filter((x): x is string => !!x),
      sessoesDepois: prop.gerado.sessoes.map((s) => s.nome),
    });
  }

  async function confirmarESalvar() {
    if (!campo || !draft) return;
    setBusy(true);
    try {
      // skipLlm: salva exatamente a proposta mostrada (números do motor)
      const res = await updatePerfilAndRemount(patchDoCampo(campo, draft), { skipLlm: true });
      if (!res.ok) {
        setAjuste({ tipo: "erro", msg: res.error ?? "Não deu pra atualizar o plano agora." });
        return;
      }
      const c = campo;
      fechar();
      marcar(c, "Plano atualizado");
    } finally {
      setBusy(false);
    }
  }

  const dirty =
    !!campo && !!draft && JSON.stringify(patchDoCampo(campo, draft)) !== JSON.stringify(patchDoCampo(campo, perfil as Rascunho));

  function controle(c: Campo, d: Rascunho) {
    const set = (x: Partial<Rascunho>) => setDraft({ ...d, ...x });
    switch (c) {
      case "peso":
        return <NumStepper value={d.peso_kg} step={0.5} unit="kg" onChange={(n) => set({ peso_kg: Math.min(200, Math.max(40, n)) })} />;
      case "altura":
        return <NumStepper value={d.altura_cm} step={1} unit="cm" onChange={(n) => set({ altura_cm: Math.min(220, Math.max(140, n)) })} />;
      case "dias":
        return (
          <div className="flex flex-wrap gap-2">
            {[2, 3, 4, 5, 6].map((n) => (
              <Chip key={n} selected={d.dias_por_semana === n} onClick={() => set({ dias_por_semana: n })}>
                {n}×
              </Chip>
            ))}
          </div>
        );
      case "minutos":
        return <NumStepper value={d.minutos_por_sessao} step={5} unit="min" onChange={(n) => set({ minutos_por_sessao: Math.min(180, Math.max(20, n)) })} />;
      case "cardio":
        return <NumStepper value={d.cardio_min_semana ?? 0} step={10} unit="min/sem" onChange={(n) => set({ cardio_min_semana: Math.min(400, Math.max(0, n)) })} />;
      case "experiencia":
        return (
          <div className="flex flex-wrap gap-2">
            {(Object.keys(EXP_LABEL) as Experiencia[]).map((e) => (
              <Chip key={e} selected={d.experiencia === e} onClick={() => set({ experiencia: e })}>
                {EXP_LABEL[e]}
              </Chip>
            ))}
          </div>
        );
      case "equipamentos":
        return (
          <div className="flex flex-wrap gap-2">
            {EQUIPS.map((e) => (
              <Chip
                key={e}
                selected={d.equipamentos.includes(e)}
                onClick={() =>
                  set({ equipamentos: d.equipamentos.includes(e) ? d.equipamentos.filter((x) => x !== e) : [...d.equipamentos, e] })
                }
              >
                {equipLabel(e)}
              </Chip>
            ))}
          </div>
        );
      case "restricoes":
        return (
          <div className="flex flex-wrap gap-2">
            {RESTRICOES.map((r) => {
              const on = d.restricoes.some((x) => x.toLowerCase().includes(r));
              return (
                <Chip
                  key={r}
                  selected={on}
                  onClick={() =>
                    set({ restricoes: on ? d.restricoes.filter((x) => !x.toLowerCase().includes(r)) : [...d.restricoes, r] })
                  }
                >
                  {r}
                </Chip>
              );
            })}
          </div>
        );
      case "objetivo":
        return (
          <div className="grid gap-2">
            {(Object.keys(OBJ_LABEL) as Objetivo[]).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => set({ objetivo: o })}
                className={`motion-press rounded-2xl border px-4 py-3 text-left ${
                  d.objetivo === o ? "border-accent bg-[rgba(184,255,60,.10)]" : "border-border bg-surface"
                }`}
              >
                <p className={`text-sm font-semibold ${d.objetivo === o ? "text-accent" : ""}`}>{OBJ_LABEL[o].t}</p>
                <p className="text-xs text-muted">{OBJ_LABEL[o].d}</p>
              </button>
            ))}
          </div>
        );
    }
  }

  const volAntes = new Map((ajuste?.tipo === "proposta" ? ajuste.antes?.volume_semanal ?? [] : []).map((v) => [v.grupo, v.series_diretas]));

  return (
    <main className="motion-fade-up motion-stagger px-5 pb-28 pt-8">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">Perfil</p>
      <h1 className="mb-1 text-2xl font-bold">Seus dados</h1>
      <p className="mb-5 text-sm text-muted">
        Toque num campo pra editar. Se mudar o plano, eu te mostro o ajuste antes — nada muda sem você confirmar.
      </p>

      <SectionTitle title="Corpo" />
      <Card className="mb-4 !py-1">
        <Linha label="Peso" valor={`${perfil.peso_kg} kg`} onClick={() => abrir("peso")} flash={flash === "peso"} />
        <Linha label="Altura" valor={`${perfil.altura_cm} cm`} onClick={() => abrir("altura")} flash={flash === "altura"} />
      </Card>

      <SectionTitle title="Treino" />
      <Card className="mb-4 !py-1">
        <Linha label="Dias / semana" valor={`${perfil.dias_por_semana}×`} onClick={() => abrir("dias")} flash={flash === "dias"} />
        <Linha label="Minutos / sessão" valor={`${perfil.minutos_por_sessao} min`} onClick={() => abrir("minutos")} flash={flash === "minutos"} />
        <Linha label="Nível" valor={EXP_LABEL[perfil.experiencia]} onClick={() => abrir("experiencia")} flash={flash === "experiencia"} />
        <Linha label="Cardio / semana" valor={`${perfil.cardio_min_semana ?? 0} min`} onClick={() => abrir("cardio")} flash={flash === "cardio"} />
      </Card>
      <Link
        href={REFAZER_HREF}
        className="motion-press -mt-2 mb-4 flex min-h-11 items-center justify-between rounded-2xl border border-border px-4 text-sm"
      >
        <span>
          <span className="font-semibold text-accent">Refazer onboarding</span>
          <span className="block text-[11px] text-muted">Conversa nova com o coach · só muda se você confirmar</span>
        </span>
        <span className="text-accent">→</span>
      </Link>

      <SectionTitle title="Contexto" />
      <Card className="mb-4 !py-1">
        <Linha
          label="Equipamentos"
          valor={perfil.equipamentos.length ? perfil.equipamentos.map(equipLabel).join(", ") : "nenhum"}
          onClick={() => abrir("equipamentos")}
          flash={flash === "equipamentos"}
        />
        <Linha
          label="Lesões / limitações"
          valor={perfil.restricoes.length ? perfil.restricoes.join(", ") : "nenhuma"}
          onClick={() => abrir("restricoes")}
          flash={flash === "restricoes"}
        />
      </Card>

      <SectionTitle title="Objetivo" />
      <Card className="mb-4 !py-1">
        <Linha label="Objetivo" valor={OBJ_LABEL[perfil.objetivo].t} onClick={() => abrir("objetivo")} flash={flash === "objetivo"} />
      </Card>

      <SectionTitle title="Segurança" />
      <Card className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">PAR-Q+</span>
          <Badge tone={parqPendente ? "warn" : parqBloqueado ? "danger" : "go"}>
            {parqPendente ? "pendente" : parqBloqueado ? "bloqueado (SIM)" : "liberado"}
          </Badge>
        </div>
        {parqBloqueado ? <p className="mt-2 text-xs text-muted">{PARQ_BLOQUEIO_MSG}</p> : null}
        {parqPendente ? (
          <Link href="/onboarding" className="mt-2 inline-block text-xs font-semibold text-accent">
            Responder triagem PAR-Q+ →
          </Link>
        ) : null}
      </Card>

      <SectionTitle title="Conta" />
      <Card className="mb-4 !py-1">
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-1 py-3">
          <span className="text-sm text-muted">E-mail</span>
          <span className="truncate text-sm font-semibold">{session?.user?.email ?? "—"}</span>
        </div>
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/" })}
          className="motion-press flex min-h-12 w-full items-center px-1 py-3 text-left text-sm font-semibold text-danger"
        >
          Sair
        </button>
      </Card>

      {toast ? (
        <div role="status" className="pr-pop fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full border border-accent/40 bg-ink-900 px-4 py-2 text-sm font-semibold text-accent">
          {toast}
        </div>
      ) : null}

      {campo && draft && typeof document !== "undefined" ? createPortal(
        <div className="sheet-overlay fixed inset-0 flex items-end justify-center bg-black/60" onClick={fechar}>
          <div
            role="dialog"
            aria-label={TITULO[campo]}
            onClick={(e) => e.stopPropagation()}
            className="sheet-enter max-h-[85dvh] w-full max-w-[480px] overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-ink-950 px-5 pt-3"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-800" />
            {!ajuste ? (
              <>
                <p className="mb-1 text-xs uppercase tracking-wide text-muted">
                  {MUDA_PLANO[campo] ? "Muda o plano" : "Só registro"}
                </p>
                <h2 className="mb-4 text-xl font-bold">{TITULO[campo]}</h2>
                <div className="mb-5">{controle(campo, draft)}</div>
                <div className="sheet-actions">
                {MUDA_PLANO[campo] ? (
                  <Button className="motion-cta-glow min-h-12" disabled={!dirty || parqBloqueado} onClick={verAjuste}>
                    Ver ajuste
                  </Button>
                ) : (
                  <Button className="min-h-12" disabled={!dirty} onClick={salvarDireto}>
                    Salvar
                  </Button>
                )}
                <button type="button" onClick={fechar} className="mt-2 min-h-11 w-full text-sm text-muted">
                  Cancelar
                </button>
                </div>
              </>
            ) : ajuste.tipo === "erro" ? (
              <>
                <h2 className="mb-2 text-xl font-bold">Não deu pra ajustar</h2>
                <p className="mb-4 text-sm text-muted">{ajuste.msg}</p>
                <div className="sheet-actions">
                <Button variant="ghost" onClick={fechar}>
                  Voltar
                </Button>
                </div>
              </>
            ) : (
              <div className="motion-stagger">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-accent">Proposta do coach</p>
                  <EvidenciaBadge evidencia={ajuste.evidencia} />
                </div>
                <h2 className="mb-2 text-xl font-bold">
                  {ajuste.antes && ajuste.antes.split.nome !== ajuste.depois.split.nome
                    ? `${ajuste.antes.split.nome} vira ${ajuste.depois.split.nome}`
                    : `${ajuste.depois.split.nome}, ajustado`}
                </h2>
                <p className="mb-3 text-sm text-muted">
                  {ajuste.sessoesAntes.length}→{ajuste.sessoesDepois.length} treinos/semana · {ajuste.sessoesDepois.join(" · ")}
                </p>
                <ul className="mb-3 space-y-1 text-sm text-bone-300">
                  {ajuste.depois.split.porque.slice(0, 3).map((x) => (
                    <li key={x}>• {acentuar(humanizarSplits(x))}</li>
                  ))}
                </ul>
                <p className="mb-2 text-xs uppercase text-muted">Séries por semana · antes → depois</p>
                <div className="mb-4 space-y-2">
                  {(() => {
                    const linhas = ajuste.depois.volume_semanal.slice(0, 8);
                    const max = Math.max(22, ...linhas.map((v) => Math.max(v.series_diretas, volAntes.get(v.grupo) ?? 0)));
                    return linhas.map((v, i) => (
                      <VolumeBar
                        key={v.grupo}
                        label={labelGrupo(v.grupo)}
                        antes={volAntes.get(v.grupo) ?? 0}
                        valor={v.series_diretas}
                        max={max}
                        faixa={[10, 20]}
                        index={i}
                      />
                    ));
                  })()}
                </div>
                <div className="sheet-actions">
                <Button className="motion-cta-glow min-h-12" disabled={busy} onClick={() => void confirmarESalvar()}>
                  {busy ? "Salvando…" : "Confirmar e salvar"}
                </Button>
                <button type="button" disabled={busy} onClick={fechar} className="mt-2 min-h-11 w-full text-sm text-muted">
                  Cancelar
                </button>
                </div>
              </div>
            )}
          </div>
        </div>
      , document.body) : null}
    </main>
  );
}
