"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { VariacaoInfo } from "@/components/VariacaoInfo";
import { TecnicaPicker } from "@/components/TecnicaPicker";
import { prescricaoAceitaTecnica } from "@/lib/engine/tecnicas";
import { Button } from "@/components/ui";
import { Casca, EQUIP, Mini, Passo } from "@/components/EditarTreinoSheet";
import { labelGrupo } from "@/lib/labels";
import { incrementoCargaKg } from "@/lib/domain";
import { LIMITES_EDICAO } from "@/lib/plan/editar-treino";
import { preparatoriasDaSessao } from "@/lib/treino/estrutura-series";
import {
  acaoRemover,
  adicionarAoVivo,
  ajustarCargaAoVivo,
  ajustarRepsAoVivo,
  ajustarSeriesAoVivo,
  alternativasAoVivo,
  candidatosAoVivo,
  cargaReferencia,
  desfazerTrocaNoRascunho,
  feitosDoItem,
  montarAoVivo,
  moverAoVivo,
  podeMover,
  rascunhoAoVivo,
  reabrirAoVivo,
  removerAoVivo,
  trocarAoVivo,
  validarAoVivo,
  definirTecnicaAoVivo,
  podeMudarTecnicaAoVivo,
  type RascunhoAoVivo,
} from "@/lib/treino/editar-durante-treino";

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/**
 * Editar durante o treino: editar → revisar (resumo) → Confirmar. Nada é salvo antes.
 * Séries já registradas não mudam; kg de exercício novo/trocado vem do Coach.
 */
export function EditarDuranteTreinoSheet(props: {
  onClose: () => void;
  onSalvo: (res: { removidas: string[]; linhas: string[] }) => void;
}) {
  const { state, editarAoVivo } = useApp();
  const [r, setR] = useState<RascunhoAoVivo | null>(() => rascunhoAoVivo(state));
  const [modo, setModo] = useState<"editar" | "revisar" | { adicionar: "fim" | "depois_atual" } | { trocar: number } | { remover: number }>("editar");
  const [erro, setErro] = useState<string | null>(null);
  const sessao = state.sessoes.find((s) => s.id === r?.sessao_id) ?? null;
  const previa = useMemo(() => (r ? montarAoVivo(state, r, "previa") : null), [r, state]);
  if (!r || !sessao || !previa) return null;
  const ex = (id: string) => state.exercicios.find((e) => e.id === id);
  const efetivos = r.itens.map((i) => ({ exercicio_id: i.trocar_para ?? i.exercicio_id }));
  const preps = preparatoriasDaSessao(efetivos, state.exercicios);
  const invalido = validarAoVivo(state, r);
  const { onClose } = props;

  function confirmar() {
    if (!r) return;
    const res = editarAoVivo(r);
    if (!res.ok) {
      setErro(res.erro);
      return;
    }
    props.onSalvo({ removidas: res.removidas, linhas: res.linhas });
    onClose();
  }

  let corpo: React.ReactNode;
  if (typeof modo === "object" && "adicionar" in modo) {
    const cands = candidatosAoVivo(state, r);
    corpo = (
      <>
        <p className="mb-1 text-xs uppercase tracking-wide text-accent">Adicionar exercício</p>
        <h2 className="mb-1 text-xl font-bold">O que entra agora?</h2>
        <div className="mb-3 flex gap-2" role="radiogroup" aria-label="Onde entra">
          {(["depois_atual", "fim"] as const).map((o) => (
            <button key={o} type="button" role="radio" aria-checked={modo.adicionar === o} onClick={() => setModo({ adicionar: o })} className={`chip-motion text-xs ${modo.adicionar === o ? "on" : ""}`}>
              {o === "fim" ? "No fim do treino" : "Logo depois deste"}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-muted">Séries, reps e carga ficam com o Coach. Só aparece o que combina com seu equipamento e suas restrições.</p>
        <div className="space-y-2">
          {cands.map((e) => (
            <button key={e.id} type="button" data-testid="aovivo-add-ex" onClick={() => { setR(adicionarAoVivo(state, r, e.id, modo.adicionar)); setModo("editar"); }} className="w-full rounded-2xl border border-border bg-ink-900 px-4 py-3 text-left text-sm">
              <span className="font-semibold text-bone-50">{e.nome}</span>
              <VariacaoInfo ex={e} state={state} />
              <span className="block text-[11px] text-muted">{labelGrupo(e.grupo_primario)} · {EQUIP[e.equipamento] ?? ""}{e.composto ? " · multiarticular" : ""}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setModo("editar")} className="mt-3 min-h-11 w-full text-sm text-muted">Voltar</button>
      </>
    );
  } else if (typeof modo === "object" && "trocar" in modo) {
    const idx = modo.trocar;
    const it = r.itens[idx]!;
    const feitos = feitosDoItem(state, r.sessao_id, it).trabalho;
    const alts = alternativasAoVivo(state, r, idx);
    corpo = (
      <>
        <p className="mb-1 text-xs uppercase tracking-wide text-accent">Trocar exercício</p>
        <h2 className="mb-1 text-xl font-bold">No lugar de {ex(it.exercicio_id)?.nome}</h2>
        <p className="mb-3 text-xs text-muted">
          {feitos > 0
            ? `${feitos === 1 ? "A série que você já fez fica" : `As ${feitos} séries que você já fez ficam`} no histórico deste exercício. As que faltam vão pro novo, com a carga que o Coach sugerir.`
            : "Mesmo movimento e mesmo músculo, filtrado pelo que você tem e pelas suas restrições. A carga vem do Coach."}
        </p>
        {alts.length === 0 ? (
          <p className="rounded-2xl border border-border bg-ink-900 p-4 text-sm text-muted">Não achei outra opção segura com o mesmo movimento pro seu equipamento.</p>
        ) : (
          <div className="space-y-2">
            {alts.map((e) => (
              <button key={e.id} type="button" data-testid="aovivo-alt" onClick={() => { setR(trocarAoVivo(state, r, idx, e.id)); setModo("editar"); }} className="w-full rounded-2xl border border-border bg-ink-900 px-4 py-3 text-left text-sm">
                <span className="font-semibold text-bone-50">{e.nome}</span>
              <VariacaoInfo ex={e} state={state} />
                <span className="block text-[11px] text-muted">{EQUIP[e.equipamento] ?? ""}</span>
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setModo("editar")} className="mt-3 min-h-11 w-full text-sm text-muted">Voltar</button>
      </>
    );
  } else if (typeof modo === "object" && "remover" in modo) {
    const idx = modo.remover;
    const it = r.itens[idx]!;
    const acao = acaoRemover(state, r, idx);
    const feitos = feitosDoItem(state, r.sessao_id, it).trabalho;
    corpo = (
      <div data-testid="aovivo-confirma-remover">
        <p className="mb-1 text-xs uppercase tracking-wide text-accent">{acao === "encerrar" ? "Encerrar aqui" : "Remover exercício"}</p>
        <h2 className="mb-2 text-xl font-bold">{ex(it.exercicio_id)?.nome}</h2>
        <p className="mb-4 text-sm text-muted">
          {acao === "encerrar"
            ? feitos > 0
              ? `Você já fez ${feitos} ${feitos === 1 ? "série" : "séries"} aqui. Elas ficam no histórico e o exercício termina com elas.`
              : "Você só fez o aquecimento. Ele fica no histórico e o exercício sai do treino de hoje."
            : "Ainda não tem nenhuma série dele hoje, então ele sai do treino de hoje. O plano das próximas semanas não muda."}
        </p>
        <Button className="min-h-11" onClick={() => { setR(removerAoVivo(state, r, idx)); setModo("editar"); }}>
          {acao === "encerrar" ? "Encerrar aqui" : "Remover"}
        </Button>
        <button type="button" onClick={() => setModo("editar")} className="mt-1 min-h-11 w-full text-sm text-muted">Voltar</button>
      </div>
    );
  } else if (modo === "revisar") {
    corpo = (
      <div data-testid="aovivo-resumo">
        <p className="mb-1 text-xs uppercase tracking-wide text-accent">Revisar mudanças</p>
        <h2 className="mb-3 text-xl font-bold">{sessao.nome}, agora</h2>
        <ul className="mb-3 space-y-1.5 text-sm text-bone-50">
          {previa.linhas.map((l) => <li key={l} className="rounded-xl bg-ink-900 px-3 py-2">{l}</li>)}
        </ul>
        <p className="mb-3 text-xs text-muted">As séries que você já fez não mudam. Dá pra desfazer enquanto você não registrar outra série.</p>
        {erro || invalido ? <p className="mb-2 text-sm text-danger">{erro ?? invalido}</p> : null}
        <Button className="min-h-11" onClick={confirmar} disabled={!previa.mudou || !!invalido}>Confirmar</Button>
        <button type="button" onClick={() => setModo("editar")} className="mt-1 min-h-11 w-full text-sm text-muted">Voltar e mexer mais</button>
      </div>
    );
  } else {
    corpo = (
      <>
        <p className="mb-1 text-xs uppercase tracking-wide text-accent">Editar treino em andamento</p>
        <h2 className="mb-1 text-xl font-bold">{sessao.nome}</h2>
        <p className="mb-3 text-xs text-muted">O que você já fez fica como está. Mude só o que falta.</p>
        <ol className="space-y-2">
          {r.itens.map((it, i) => {
            const efetivo = ex(it.trocar_para ?? it.exercicio_id);
            const f = feitosDoItem(state, r.sessao_id, it);
            const presc = sessao.prescricoes.find((p) => p.id === it.prescricao_id);
            const atual = it.prescricao_id !== null && it.prescricao_id === r.atual_id;
            const step = efetivo ? incrementoCargaKg(efetivo.grupo_primario) : 2.5;
            const kg = it.carga_kg ?? (presc ? cargaReferencia(presc) : null);
            const minSeries = Math.max(LIMITES_EDICAO.series_min, f.trabalho + (it.trocar_para && f.trabalho > 0 ? 1 : 0));
            const remover = acaoRemover(state, r, i);
            return (
              <li key={`${it.prescricao_id ?? "novo"}-${it.exercicio_id}`} data-testid="aovivo-item" className={`rounded-2xl border bg-ink-900 p-3 ${atual ? "border-accent/60" : "border-border"} ${it.encerrar ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-bone-50">
                      {i + 1}. {it.trocar_para ? <><span className="text-muted line-through">{ex(it.exercicio_id)?.nome}</span> → </> : null}{efetivo?.nome}
                    </p>
                    <p className="text-[11px] text-muted">
                      {atual ? <span className="text-accent">Agora · </span> : null}
                      {!it.prescricao_id ? <span className="text-accent">Novo · </span> : null}
                      {f.trabalho > 0 ? `${f.trabalho} de ${presc?.series ?? it.series} feitas` : f.iniciado ? "aquecimento feito" : "não começou"}
                      {!f.iniciado && preps[i] && !it.encerrar ? <span className="text-accent"> · aquece + aproximação antes</span> : null}
                      {it.encerrar ? " · encerrado aqui" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Mini label={`Subir ${efetivo?.nome}`} onClick={() => setR(moverAoVivo(state, r, i, -1))} disabled={!podeMover(state, r, i, -1)}>↑</Mini>
                    <Mini label={`Descer ${efetivo?.nome}`} onClick={() => setR(moverAoVivo(state, r, i, 1))} disabled={!podeMover(state, r, i, 1)}>↓</Mini>
                  </div>
                </div>
                {!it.encerrar ? (
                  <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">Séries</p>
                      <Passo label="séries" valor={it.series} min={minSeries} max={LIMITES_EDICAO.series_max} onMenos={() => setR(ajustarSeriesAoVivo(state, r, i, it.series - 1))} onMais={() => setR(ajustarSeriesAoVivo(state, r, i, it.series + 1))} />
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">Reps</p>
                      <div className="flex items-center gap-1">
                        <Passo label="reps mínimas" valor={it.faixa_reps[0]} min={LIMITES_EDICAO.reps_min} max={it.faixa_reps[1]} onMenos={() => setR(ajustarRepsAoVivo(r, i, it.faixa_reps[0] - 1, it.faixa_reps[1]))} onMais={() => setR(ajustarRepsAoVivo(r, i, it.faixa_reps[0] + 1, it.faixa_reps[1]))} />
                        <span className="text-muted">–</span>
                        <Passo label="reps máximas" valor={it.faixa_reps[1]} min={it.faixa_reps[0]} max={LIMITES_EDICAO.reps_max} onMenos={() => setR(ajustarRepsAoVivo(r, i, it.faixa_reps[0], it.faixa_reps[1] - 1))} onMais={() => setR(ajustarRepsAoVivo(r, i, it.faixa_reps[0], it.faixa_reps[1] + 1))} />
                      </div>
                    </div>
                    {presc && !it.trocar_para && kg !== null ? (
                      <div>
                        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">Carga das próximas</p>
                        <div className="flex items-center gap-1.5">
                          <Mini label="Menos carga" onClick={() => setR(ajustarCargaAoVivo(r, i, kg - step))} disabled={kg <= 0}>−</Mini>
                          <span className="min-w-12 text-center text-sm font-semibold tabular-nums">{fmt(kg)} kg</span>
                          <Mini label="Mais carga" onClick={() => setR(ajustarCargaAoVivo(r, i, kg + step))}>+</Mini>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {!it.encerrar && efetivo && prescricaoAceitaTecnica({ tecnica: it.trocar_para ? "padrao" : presc?.tecnica ?? "padrao" }, efetivo) ? (
                  <TecnicaPicker
                    exNome={efetivo.nome}
                    valor={it.tecnica_final}
                    onChange={(t) => setR(definirTecnicaAoVivo(state, r, i, t))}
                    usadas={r.itens.filter((x) => x.tecnica_final && !x.encerrar).length}
                    temProximo={i < r.itens.length - 1}
                    bloqueio={podeMudarTecnicaAoVivo(state, r, i) ? null : "A última série desse exercício já foi feita."}
                  />
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {it.encerrar ? (
                    <button type="button" onClick={() => setR(reabrirAoVivo(r, i))} className="min-h-9 rounded-full border border-border px-3 text-[11px] font-semibold text-accent">Continuar este</button>
                  ) : it.trocar_para ? (
                    <button type="button" onClick={() => setR(desfazerTrocaNoRascunho(r, i))} className="min-h-9 rounded-full border border-border px-3 text-[11px] font-semibold text-accent">Desfazer troca</button>
                  ) : (
                    <button type="button" disabled={f.trabalho > 0 && it.series <= f.trabalho} onClick={() => setModo({ trocar: i })} className="min-h-9 rounded-full border border-border px-3 text-[11px] font-semibold text-accent disabled:opacity-30">Trocar</button>
                  )}
                  {!it.encerrar ? (
                    <button type="button" disabled={remover === "remover" && r.itens.length <= 1} onClick={() => setModo({ remover: i })} className="min-h-9 rounded-full border border-danger/40 px-3 text-[11px] font-semibold text-danger disabled:opacity-30">
                      {remover === "encerrar" ? "Encerrar aqui" : "Remover"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        <button type="button" data-testid="aovivo-adicionar" disabled={r.itens.length >= LIMITES_EDICAO.exercicios_max} onClick={() => setModo({ adicionar: "depois_atual" })} className="mt-3 min-h-11 w-full rounded-2xl border border-dashed border-accent/50 text-sm font-semibold text-accent disabled:opacity-30">+ Adicionar exercício</button>
        <div className="sheet-actions">
          <Button className="mt-3 min-h-11" onClick={() => { setErro(null); setModo("revisar"); }} disabled={!previa.mudou}>Revisar mudanças</Button>
          <button type="button" onClick={onClose} className="mt-1 min-h-11 w-full text-sm text-muted">Cancelar</button>
        </div>
      </>
    );
  }
  return <Casca label="Editar treino em andamento" onClose={onClose}>{corpo}</Casca>;
}
