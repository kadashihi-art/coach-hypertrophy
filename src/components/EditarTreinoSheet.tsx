"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/components/AppProvider";
import { Button } from "@/components/ui";
import { labelGrupo } from "@/lib/labels";
import { hojeIsoSaoPaulo } from "@/lib/plan/proxima-sessao";
import { preparatoriasDaSessao, rotuloOrdemSeries } from "@/lib/treino/estrutura-series";
import {
  LIMITES_EDICAO,
  adicionarItem,
  ajustarReps,
  ajustarSeries,
  alternativasParaItem,
  candidatosAdicionar,
  dataHumana,
  diasDisponiveis,
  moverItem,
  previaEdicao,
  rascunhoDaSessao,
  removerItem,
  trocarItem,
  type Rascunho,
} from "@/lib/plan/editar-treino";
import {
  RIR_MAX_REGISTRO,
  adicionarExercicioCorrecao,
  adicionarSerie,
  editarSerie,
  previaCorrecao,
  rascunhoCorrecaoDaSessao,
  removerExercicioCorrecao,
  removerSerie,
  temRegistroDetalhado,
  trocarExercicioCorrecao,
  AVISO_SEM_SNAPSHOT,
  type RascunhoCorrecao,
} from "@/lib/plan/corrigir-concluida";
import { alternativasParaItem as altsTroca } from "@/lib/plan/editar-treino";

const EQUIP: Record<string, string> = {
  barra: "Barra", halteres: "Halteres", maquina: "Máquina", cabo: "Cabo", kettlebell: "Kettlebell",
  peso_corporal: "Peso do corpo", banco: "Banco", rack: "Rack", elastico: "Elástico", outros: "Outro",
};

function Mini({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 min-w-9 items-center justify-center rounded-full border border-border bg-ink-900 px-2 text-sm font-bold text-bone-50 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Passo({ label, valor, onMenos, onMais, min, max }: { label: string; valor: number; onMenos: () => void; onMais: () => void; min: number; max: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <Mini label={`Menos ${label}`} onClick={onMenos} disabled={valor <= min}>−</Mini>
      <span className="min-w-6 text-center text-sm font-semibold tabular-nums" aria-label={label}>{valor}</span>
      <Mini label={`Mais ${label}`} onClick={onMais} disabled={valor >= max}>+</Mini>
    </div>
  );
}

/** Editor de um treino do plano: editar → revisar (resumo + avisos) → Confirmar. Nada é salvo antes. */
export function EditarTreinoSheet(props: { sessaoId: string; onClose: () => void; onSalvo?: (msg: string) => void }) {
  const { state } = useApp();
  const st = state.sessoes.find((s) => s.id === props.sessaoId)?.status;
  return st === "concluida" ? <CorrigirRegistro {...props} /> : <EditarPlanejado {...props} />;
}

function Casca({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add("sheet-open");
    return () => document.body.classList.remove("sheet-open");
  }, []);
  const el = (
    <div className="sheet-overlay fixed inset-0 z-[60] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="sheet-enter max-h-[90dvh] w-full max-w-[480px] overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-ink-950 px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-800" />
        {children}
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(el, document.body) : el;
}

function Num({ label, valor, onChange, step, min, max }: { label: string; valor: number; onChange: (v: number) => void; step: number; min: number; max: number }) {
  return (
    <label className="flex flex-col text-[10px] uppercase tracking-wide text-muted">
      {label}
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        value={valor}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        className="mt-1 min-h-10 w-16 rounded-xl border border-border bg-ink-900 px-2 text-sm text-bone-50"
      />
    </label>
  );
}

/** Corrigir registro de um treino concluído: corrigir → revisar (resumo) → Confirmar. */
function CorrigirRegistro({ sessaoId, onClose, onSalvo }: { sessaoId: string; onClose: () => void; onSalvo?: (msg: string) => void }) {
  const { state, corrigirSessaoConcluida } = useApp();
  const sessao = state.sessoes.find((s) => s.id === sessaoId) ?? null;
  const [r, setR] = useState<RascunhoCorrecao>(() => rascunhoCorrecaoDaSessao(state, sessaoId));
  const [modo, setModo] = useState<"corrigir" | "revisar" | "adicionar" | { trocar: number }>("corrigir");
  const [erro, setErro] = useState<string | null>(null);
  const previa = useMemo(() => previaCorrecao(state, r), [state, r]);
  if (!sessao) return null;
  const detalhado = temRegistroDetalhado(state, sessaoId);
  const nome = (id: string) => state.exercicios.find((e) => e.id === id);
  const usados = new Set(r.itens.map((i) => i.exercicio_id));

  function confirmar() {
    const res = corrigirSessaoConcluida(r);
    if (!res.ok) { setErro(res.erro ?? "Não deu pra salvar. O registro continua igual."); return; }
    onSalvo?.(`Registro do ${sessao!.nome} corrigido.`);
    onClose();
  }

  let corpo: React.ReactNode;
  if (modo === "adicionar") {
    const cands = state.exercicios.filter((e) => !usados.has(e.id));
    corpo = (
      <>
        <p className="mb-1 text-xs uppercase tracking-wide text-accent">Adicionar exercício feito</p>
        <h2 className="mb-3 text-xl font-bold">O que mais você fez?</h2>
        <div className="space-y-2">
          {cands.map((e) => (
            <button key={e.id} type="button" data-testid="corr-add-ex" onClick={() => { setR(adicionarExercicioCorrecao(r, e.id)); setModo("corrigir"); }} className="w-full rounded-2xl border border-border bg-ink-900 px-4 py-3 text-left text-sm">
              <span className="font-semibold text-bone-50">{e.nome}</span>
              <span className="block text-[11px] text-muted">{labelGrupo(e.grupo_primario)} · {EQUIP[e.equipamento] ?? ""}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setModo("corrigir")} className="mt-3 min-h-11 w-full text-sm text-muted">Voltar</button>
      </>
    );
  } else if (typeof modo === "object") {
    const idx = modo.trocar;
    const it = r.itens[idx];
    const alts = it ? altsTroca(state, { sessao_id: sessaoId, data: sessao.data, itens: r.itens.map((x) => ({ exercicio_id: x.exercicio_id, series: 3, faixa_reps: [8, 12] as [number, number] })) }, idx).filter((e) => !usados.has(e.id)) : [];
    corpo = (
      <>
        <p className="mb-1 text-xs uppercase tracking-wide text-accent">Trocar exercício</p>
        <h2 className="mb-3 text-xl font-bold">No lugar de {nome(it?.exercicio_id ?? "")?.nome}</h2>
        <div className="space-y-2">
          {alts.map((e) => (
            <button key={e.id} type="button" onClick={() => { setR(trocarExercicioCorrecao(r, idx, e.id)); setModo("corrigir"); }} className="w-full rounded-2xl border border-border bg-ink-900 px-4 py-3 text-left text-sm">
              <span className="font-semibold text-bone-50">{e.nome}</span>
            </button>
          ))}
          {alts.length === 0 ? <p className="text-sm text-muted">Não achei outra opção com o mesmo movimento.</p> : null}
        </div>
        <button type="button" onClick={() => setModo("corrigir")} className="mt-3 min-h-11 w-full text-sm text-muted">Voltar</button>
      </>
    );
  } else if (modo === "revisar") {
    corpo = (
      <div data-testid="corrigir-resumo">
        <p className="mb-1 text-xs uppercase tracking-wide text-accent">Revisar correção</p>
        <h2 className="mb-3 text-xl font-bold">{sessao.nome}</h2>
        {previa.mudou ? (
          <ul className="mb-3 space-y-1.5 rounded-2xl border border-border bg-ink-900 p-4 text-sm text-bone-50">
            {previa.linhas.map((l) => <li key={l}>• {l}</li>)}
          </ul>
        ) : (
          <p className="mb-3 rounded-2xl border border-border bg-ink-900 p-4 text-sm text-muted">Nada mudou ainda.</p>
        )}
        {previa.avisos.map((a) => (
          <p key={a} role="alert" className="mb-3 rounded-2xl border border-warn/50 bg-warn/10 p-3 text-xs text-bone-50">{a}</p>
        ))}
        {previa.erro || erro ? <p className="mb-2 text-sm text-danger">{erro ?? previa.erro}</p> : null}
        <Button className="min-h-11" onClick={confirmar} disabled={!previa.mudou || !!previa.erro}>Confirmar</Button>
        <button type="button" onClick={() => setModo("corrigir")} className="mt-2 min-h-11 w-full text-sm text-muted">Voltar a corrigir</button>
      </div>
    );
  } else {
    corpo = (
      <>
        <p className="mb-1 text-xs uppercase tracking-wide text-accent">Corrigir registro</p>
        <h2 className="mb-1 text-xl font-bold">{sessao.nome}</h2>
        <p className="mb-3 text-xs text-muted">
          {detalhado ? "Corrija o que você realmente fez. O Coach refaz a conta da próxima carga a partir disso." : AVISO_SEM_SNAPSHOT}
        </p>
        <ol className="space-y-2">
          {r.itens.map((it, i) => {
            const ex = nome(it.exercicio_id);
            return (
              <li key={`${it.prescricao_id ?? "novo"}-${it.exercicio_id}`} data-testid="item-corrigir" className="rounded-2xl border border-border bg-ink-900 p-3">
                <p className="text-sm font-semibold text-bone-50">{i + 1}. {ex?.nome}</p>
                <div className="mt-2 space-y-2">
                  {it.series.map((sr, j) => (
                    <div key={j} className="flex items-end gap-2">
                      <span className="mb-2 w-14 text-[11px] text-muted">Série {j + 1}</span>
                      <Num label="kg" valor={sr.carga_kg} step={0.5} min={0} max={1000} onChange={(v) => setR(editarSerie(r, i, j, { carga_kg: v }))} />
                      <Num label="reps" valor={sr.reps} step={1} min={0} max={100} onChange={(v) => setR(editarSerie(r, i, j, { reps: Math.round(v) }))} />
                      <Num label="RIR" valor={sr.rir_percebido} step={1} min={0} max={RIR_MAX_REGISTRO} onChange={(v) => setR(editarSerie(r, i, j, { rir_percebido: Math.round(v) }))} />
                      <Mini label={`Remover série ${j + 1}`} onClick={() => setR(removerSerie(r, i, j))}>×</Mini>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setR(adicionarSerie(r, i))} className="min-h-9 rounded-full border border-border px-3 text-[11px] font-semibold text-bone-50">+ Série</button>
                  <button type="button" onClick={() => setModo({ trocar: i })} className="min-h-9 rounded-full border border-border px-3 text-[11px] font-semibold text-accent">Trocar</button>
                  <button type="button" disabled={r.itens.length <= 1} onClick={() => setR(removerExercicioCorrecao(r, i))} className="min-h-9 rounded-full border border-danger/40 px-3 text-[11px] font-semibold text-danger disabled:opacity-30">Remover</button>
                </div>
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={() => setModo("adicionar")} className="mt-3 min-h-11 w-full rounded-2xl border border-dashed border-accent/50 text-sm font-semibold text-accent">+ Adicionar exercício</button>
        <div className="sheet-actions">
          <Button className="mt-3 min-h-11" onClick={() => setModo("revisar")} disabled={!previa.mudou}>Revisar correção</Button>
          <button type="button" onClick={onClose} className="mt-1 min-h-11 w-full text-sm text-muted">Cancelar</button>
        </div>
      </>
    );
  }
  return <Casca label="Corrigir registro" onClose={onClose}>{corpo}</Casca>;
}

function EditarPlanejado({ sessaoId, onClose, onSalvo }: { sessaoId: string; onClose: () => void; onSalvo?: (msg: string) => void }) {
  const { state, editarSessao } = useApp();
  const sessao = state.sessoes.find((s) => s.id === sessaoId) ?? null;
  const [r, setR] = useState<Rascunho | null>(sessao ? rascunhoDaSessao(sessao) : null);
  const [modo, setModo] = useState<"editar" | "adicionar" | "revisar" | { trocar: number }>("editar");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("sheet-open");
    return () => document.body.classList.remove("sheet-open");
  }, []);

  const previa = useMemo(() => (r ? previaEdicao(state, r) : null), [r, state]);
  const dias = useMemo(() => {
    if (!sessao) return [];
    const hoje = hojeIsoSaoPaulo();
    const lista = diasDisponiveis(state, sessao.id, hoje, 21);
    return sessao.data && !lista.includes(sessao.data) ? [sessao.data, ...lista] : lista;
  }, [state, sessao]);

  if (!sessao || !r || !previa) return null;
  const nome = (id: string) => state.exercicios.find((e) => e.id === id);
  const preps = preparatoriasDaSessao(r.itens, state.exercicios);

  function confirmar() {
    if (!r) return;
    const res = editarSessao(r);
    if (!res.ok) {
      setErro(res.erro ?? "Não deu pra salvar. Seu treino continua igual.");
      return;
    }
    onSalvo?.(`Treino ${sessao!.nome} atualizado.`);
    onClose();
  }

  let corpo: React.ReactNode;
  if (modo === "adicionar") {
    const cands = candidatosAdicionar(state, r);
    corpo = (
      <>
        <p className="mb-1 text-xs uppercase tracking-wide text-accent">Adicionar exercício</p>
        <h2 className="mb-1 text-xl font-bold">O que entra no {sessao.nome}?</h2>
        <p className="mb-3 text-xs text-muted">Só aparece o que combina com seu equipamento e suas restrições.</p>
        <div className="space-y-2">
          {cands.map((e) => (
            <button key={e.id} type="button" data-testid="add-ex" onClick={() => { setR(adicionarItem(state, r, e.id)); setModo("editar"); }} className="w-full rounded-2xl border border-border bg-ink-900 px-4 py-3 text-left text-sm">
              <span className="font-semibold text-bone-50">{e.nome}</span>
              <span className="block text-[11px] text-muted">{labelGrupo(e.grupo_primario)} · {EQUIP[e.equipamento] ?? ""}{e.composto ? " · multiarticular" : ""}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setModo("editar")} className="mt-3 min-h-11 w-full text-sm text-muted">Voltar</button>
      </>
    );
  } else if (typeof modo === "object") {
    const idx = modo.trocar;
    const de = nome(r.itens[idx]?.exercicio_id ?? "");
    const alts = alternativasParaItem(state, r, idx);
    corpo = (
      <>
        <p className="mb-1 text-xs uppercase tracking-wide text-accent">Trocar exercício</p>
        <h2 className="mb-1 text-xl font-bold">No lugar de {de?.nome}</h2>
        <p className="mb-3 text-xs text-muted">Mesmo movimento e mesmo músculo, filtrado pelo que você tem e pelas suas restrições. Séries e reps continuam as mesmas.</p>
        {alts.length === 0 ? (
          <p className="rounded-2xl border border-border bg-ink-900 p-4 text-sm text-muted">Não achei outra opção segura com o mesmo movimento pro seu equipamento.</p>
        ) : (
          <div className="space-y-2">
            {alts.map((e) => (
              <button key={e.id} type="button" onClick={() => { setR(trocarItem(state, r, idx, e.id)); setModo("editar"); }} className="w-full rounded-2xl border border-border bg-ink-900 px-4 py-3 text-left text-sm">
                <span className="font-semibold text-bone-50">{e.nome}</span>
                <span className="block text-[11px] text-muted">{EQUIP[e.equipamento] ?? ""}</span>
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setModo("editar")} className="mt-3 min-h-11 w-full text-sm text-muted">Voltar</button>
      </>
    );
  } else if (modo === "revisar") {
    corpo = (
      <div data-testid="editar-resumo">
        <p className="mb-1 text-xs uppercase tracking-wide text-accent">Revisar mudanças</p>
        <h2 className="mb-3 text-xl font-bold">{sessao.nome}</h2>
        {previa.resumo.mudou ? (
          <ul className="mb-3 space-y-1.5 rounded-2xl border border-border bg-ink-900 p-4 text-sm text-bone-50">
            {previa.resumo.linhas.map((l) => <li key={l}>• {l}</li>)}
          </ul>
        ) : (
          <p className="mb-3 rounded-2xl border border-border bg-ink-900 p-4 text-sm text-muted">Nada mudou ainda.</p>
        )}
        {previa.avisos.length > 0 ? (
          <div role="alert" data-testid="aviso-volume" className="mb-3 rounded-2xl border border-warn/50 bg-warn/10 p-4 text-sm text-bone-50">
            <p className="mb-1 font-bold text-warn">Atenção ao volume da semana</p>
            {previa.avisos.map((a) => <p key={a.grupo} className="text-xs leading-relaxed">{a.texto}</p>)}
            <p className="mt-2 text-[11px] text-muted">Dá pra salvar assim mesmo. A faixa que costuma funcionar é de 10 a 20 séries por músculo.</p>
          </div>
        ) : null}
        <p className="mb-3 text-xs text-muted">As cargas continuam vindo do Coach, e o aquecimento e a aproximação se ajustam à nova ordem. Seu histórico não muda.</p>
        {previa.erro || erro ? <p className="mb-2 text-sm text-danger">{erro ?? previa.erro}</p> : null}
        <Button className="min-h-11" onClick={confirmar} disabled={!previa.resumo.mudou || !!previa.erro}>Confirmar</Button>
        <button type="button" onClick={() => setModo("editar")} className="mt-2 min-h-11 w-full text-sm text-muted">Voltar a editar</button>
      </div>
    );
  } else {
    corpo = (
      <>
        <p className="mb-1 text-xs uppercase tracking-wide text-accent">Editar treino</p>
        <h2 className="mb-3 text-xl font-bold">{sessao.nome}</h2>
        <label className="mb-4 block text-xs text-muted">
          Dia
          <select
            aria-label="Dia do treino"
            value={r.data ?? ""}
            onChange={(e) => setR({ ...r, data: e.target.value || null })}
            className="mt-1 block min-h-11 w-full rounded-2xl border border-border bg-ink-900 px-3 text-sm text-bone-50"
          >
            {!r.data ? <option value="">Sem data</option> : null}
            {dias.map((d) => <option key={d} value={d}>{dataHumana(d)}</option>)}
          </select>
        </label>
        <ol className="space-y-2">
          {r.itens.map((it, i) => {
            const ex = nome(it.exercicio_id);
            const ordem = rotuloOrdemSeries({ series: it.series, tecnica: previa.depois.prescricoes[i]?.tecnica ?? "padrao" });
            return (
              <li key={it.exercicio_id} data-testid="item-edit" className="rounded-2xl border border-border bg-ink-900 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-bone-50">{i + 1}. {ex?.nome}</p>
                    <p className="text-[11px] text-muted">
                      {ex ? labelGrupo(ex.grupo_primario) : ""}
                      {ordem ? ` · ${ordem}` : ""}
                      {preps[i] ? <span className="text-accent"> · aquece + aproximação antes</span> : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Mini label={`Subir ${ex?.nome}`} onClick={() => setR(moverItem(r, i, -1))} disabled={i === 0}>↑</Mini>
                    <Mini label={`Descer ${ex?.nome}`} onClick={() => setR(moverItem(r, i, 1))} disabled={i === r.itens.length - 1}>↓</Mini>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">Séries</p>
                    <Passo label="séries" valor={it.series} min={LIMITES_EDICAO.series_min} max={LIMITES_EDICAO.series_max} onMenos={() => setR(ajustarSeries(r, i, it.series - 1))} onMais={() => setR(ajustarSeries(r, i, it.series + 1))} />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">Reps</p>
                    <div className="flex items-center gap-1">
                      <Passo label="reps mínimas" valor={it.faixa_reps[0]} min={LIMITES_EDICAO.reps_min} max={it.faixa_reps[1]} onMenos={() => setR(ajustarReps(r, i, it.faixa_reps[0] - 1, it.faixa_reps[1]))} onMais={() => setR(ajustarReps(r, i, it.faixa_reps[0] + 1, it.faixa_reps[1]))} />
                      <span className="text-muted">–</span>
                      <Passo label="reps máximas" valor={it.faixa_reps[1]} min={it.faixa_reps[0]} max={LIMITES_EDICAO.reps_max} onMenos={() => setR(ajustarReps(r, i, it.faixa_reps[0], it.faixa_reps[1] - 1))} onMais={() => setR(ajustarReps(r, i, it.faixa_reps[0], it.faixa_reps[1] + 1))} />
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setModo({ trocar: i })} className="min-h-9 rounded-full border border-border px-3 text-[11px] font-semibold text-accent">Trocar</button>
                  <button type="button" disabled={r.itens.length <= 1} onClick={() => setR(removerItem(r, i))} className="min-h-9 rounded-full border border-danger/40 px-3 text-[11px] font-semibold text-danger disabled:opacity-30">Remover</button>
                </div>
              </li>
            );
          })}
        </ol>
        <button type="button" disabled={r.itens.length >= LIMITES_EDICAO.exercicios_max} onClick={() => setModo("adicionar")} className="mt-3 min-h-11 w-full rounded-2xl border border-dashed border-accent/50 text-sm font-semibold text-accent">+ Adicionar exercício</button>
        <div className="sheet-actions">
          <Button className="mt-3 min-h-11" onClick={() => setModo("revisar")} disabled={!previa.resumo.mudou}>Revisar mudanças</Button>
          <button type="button" onClick={onClose} className="mt-1 min-h-11 w-full text-sm text-muted">Cancelar</button>
        </div>
      </>
    );
  }

  const el = (
    <div className="sheet-overlay fixed inset-0 z-[60] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Editar treino"
        onClick={(e) => e.stopPropagation()}
        className="sheet-enter max-h-[90dvh] w-full max-w-[480px] overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-ink-950 px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-800" />
        {corpo}
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(el, document.body) : el;
}
