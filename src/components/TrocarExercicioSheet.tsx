"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/components/AppProvider";
import { Button } from "@/components/ui";
import { labelGrupo } from "@/lib/labels";
import {
  exerciciosDoPlano,
  idsNasSessoesDe,
  listarAlternativasTroca,
  previaTroca,
} from "@/lib/plan/trocar-exercicio";

const EQUIP: Record<string, string> = {
  barra: "Barra", halteres: "Halteres", maquina: "Máquina", cabo: "Cabo", kettlebell: "Kettlebell",
  peso_corporal: "Peso do corpo", banco: "Banco", rack: "Rack", elastico: "Elástico", outros: "Outro",
};

/** Sheet "Trocar exercício": escolhe → prévia → Confirmar troca. Nada é salvo antes de confirmar. */
export function TrocarExercicioSheet({
  deId: deInicial,
  onClose,
  onTrocado,
}: {
  deId: string | null;
  onClose: () => void;
  onTrocado?: (msg: string) => void;
}) {
  const { state, trocarExercicio } = useApp();
  const [deId, setDeId] = useState<string | null>(deInicial);
  const [paraId, setParaId] = useState<string | null>(null);
  const [llm, setLlm] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("sheet-open");
    return () => document.body.classList.remove("sheet-open");
  }, []);

  const de = state.exercicios.find((e) => e.id === deId) ?? null;
  const alternativas = useMemo(
    () => (deId ? listarAlternativasTroca({ exercicioId: deId, catalog: state.exercicios, perfil: state.perfil, excluir: idsNasSessoesDe(state, deId) }) : []),
    [deId, state],
  );
  const previa = useMemo(() => (deId && paraId ? previaTroca(state, deId, paraId) : null), [deId, paraId, state]);

  // Explicação da IA (opcional, só texto). Se falhar, fica a explicação por regra.
  useEffect(() => {
    if (!de || alternativas.length === 0) return;
    let vivo = true;
    fetch("/api/plan/trocar-explicar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        de: de.nome,
        restricoes: state.perfil?.restricoes ?? [],
        itens: alternativas.slice(0, 8).map((a) => ({ id: a.exercicio.id, nome: a.exercicio.nome, equipamento: EQUIP[a.exercicio.equipamento] ?? "", texto_base: a.explicacao })),
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { explicacoes?: Record<string, string> } | null) => {
        if (vivo && j?.explicacoes) setLlm(j.explicacoes);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [de, alternativas, state.perfil?.restricoes]);

  function confirmar() {
    if (!deId || !paraId || !previa) return;
    const ok = trocarExercicio(deId, paraId);
    if (!ok) {
      setErro("Não deu pra trocar agora. Seu plano continua igual.");
      return;
    }
    onTrocado?.(`Feito: troquei ${previa.de.nome} por ${previa.para.nome} no seu plano.`);
    onClose();
  }

  const lista = exerciciosDoPlano(state);

  const corpo = (
    <div className="sheet-overlay fixed inset-0 z-[60] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Trocar exercício"
        onClick={(e) => e.stopPropagation()}
        className="sheet-enter max-h-[85dvh] w-full max-w-[480px] overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-ink-950 px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-800" />
        {!de ? (
          <>
            <p className="mb-1 text-xs uppercase tracking-wide text-accent">Trocar exercício</p>
            <h2 className="mb-3 text-xl font-bold">Qual você quer trocar?</h2>
            <div className="space-y-2">
              {lista.map((e) => (
                <button key={e.id} type="button" onClick={() => setDeId(e.id)} className="w-full rounded-2xl border border-border bg-ink-900 px-4 py-3 text-left text-sm">
                  <span className="font-semibold text-bone-50">{e.nome}</span>
                  <span className="block text-[11px] text-muted">{labelGrupo(e.grupo_primario)} · {EQUIP[e.equipamento]}</span>
                </button>
              ))}
            </div>
          </>
        ) : !previa ? (
          <>
            <p className="mb-1 text-xs uppercase tracking-wide text-accent">Trocar exercício</p>
            <h2 className="mb-1 text-xl font-bold">No lugar de {de.nome}</h2>
            <p className="mb-4 text-xs text-muted">
              Mesmo movimento e mesmo músculo ({labelGrupo(de.grupo_primario).toLowerCase()}), filtrado pelo que você tem e pelas suas restrições.
            </p>
            {alternativas.length === 0 ? (
              <p className="mb-4 rounded-2xl border border-border bg-ink-900 p-4 text-sm text-muted">
                Não achei outra opção segura com o mesmo movimento pro seu equipamento. Se quiser, me fala no coach o que tá pegando.
              </p>
            ) : (
              <div className="motion-stagger space-y-2">
                {alternativas.map((a) => (
                  <button
                    key={a.exercicio.id}
                    type="button"
                    data-testid="alt-troca"
                    onClick={() => setParaId(a.exercicio.id)}
                    className="w-full rounded-2xl border border-border bg-ink-900 px-4 py-3 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-bone-50">{a.exercicio.nome}</span>
                      <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">{EQUIP[a.exercicio.equipamento]}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{llm[a.exercicio.id] ?? a.explicacao}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="sheet-actions">
              {deInicial ? null : (
                <button type="button" onClick={() => setDeId(null)} className="mt-2 min-h-11 w-full text-sm text-muted">Escolher outro exercício</button>
              )}
              <button type="button" onClick={onClose} className="mt-1 min-h-11 w-full text-sm text-muted">Cancelar</button>
            </div>
          </>
        ) : (
          <div className="motion-stagger">
            <p className="mb-1 text-xs uppercase tracking-wide text-accent">Prévia da troca</p>
            <h2 className="mb-3 text-xl font-bold">
              {previa.de.nome} <span className="text-accent">→</span> {previa.para.nome}
            </h2>
            <div className="mb-3 rounded-2xl border border-border bg-ink-900 p-4 text-sm">
              <p className="font-semibold text-bone-50">
                {previa.series} séries · {previa.faixa_reps[0]}–{previa.faixa_reps[1]} reps · {previa.rir_alvo} {previa.rir_alvo === 1 ? "rep" : "reps"} na reserva
              </p>
              <p className="mt-1 text-xs text-muted">
                Carga inicial {previa.carga_kg} kg{" "}
                {previa.carga_origem === "historico" ? "(do que você já fez nesse exercício)" : "(começo conservador; ajusto pelas suas séries)"}
              </p>
              <p className="mt-2 text-xs text-muted">
                Vale pra: {previa.sessoes_afetadas.map((s) => s.nome).join(", ")}. O que você já treinou fica salvo como está.
              </p>
            </div>
            <p className="mb-4 text-xs text-muted">
              Volume de {labelGrupo(previa.para.grupo_primario).toLowerCase()} na semana continua igual:{" "}
              {previa.volume_antes[previa.de.grupo_primario]?.diretas ?? 0} séries diretas antes e{" "}
              {previa.volume_depois[previa.para.grupo_primario]?.diretas ?? 0} depois.
            </p>
            {erro ? <p className="mb-2 text-xs text-danger">{erro}</p> : null}
            <div className="sheet-actions">
              <Button className="motion-cta-glow min-h-12" onClick={confirmar}>Confirmar troca</Button>
              <button type="button" onClick={() => setParaId(null)} className="mt-2 min-h-11 w-full text-sm text-muted">Voltar às opções</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(corpo, document.body) : null;
}
