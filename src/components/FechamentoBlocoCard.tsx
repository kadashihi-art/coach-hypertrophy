"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Button, Card } from "@/components/ui";
import { CATALOG_EXERCICIOS } from "@/lib/catalog/exercicios";
import { diagnosticarEstagnacao } from "@/lib/inteligencia/diagnostico";
import { fecharBloco, previaProximoBloco } from "@/lib/inteligencia/fechamento-bloco";
import { labelGrupo } from "@/lib/labels";
import { parqBloqueiaPrescricao } from "@/lib/plan/parq";

const COR: Record<string, string> = {
  respondeu: "text-go",
  pouco_progresso: "text-accent",
  excesso: "text-warn",
  faltou_volume: "text-warn",
  no_teto: "text-warn",
  sem_dados: "text-muted",
};

/**
 * Fim do bloco: como cada músculo respondeu e a proposta do próximo bloco (volume por músculo).
 * O plano só muda em "Confirmar e começar o novo bloco": o gerador remonta e o bloco recomeça hoje.
 */
export function FechamentoBlocoCard({ hojeIso }: { hojeIso: string }) {
  const { state, updatePerfilAndRemount, setDataInicio } = useApp();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const perfil = state.perfil;
  const fech = useMemo(() => fecharBloco(state, hojeIso), [state, hojeIso]);
  const catalog = state.exercicios.length ? state.exercicios : CATALOG_EXERCICIOS;
  const previa = useMemo(() => {
    if (!fech || !perfil) return null;
    try {
      return previaProximoBloco(state, perfil, fech.ajuste_volume_musculo, catalog, hojeIso);
    } catch {
      return null;
    }
  }, [fech, perfil, state, catalog, hojeIso]);
  const parados = useMemo(() => {
    if (!fech) return [];
    const ids = new Set(state.sessoes.flatMap((s) => s.prescricoes.map((p) => p.exercicio_id)));
    return [...ids]
      .map((id) => diagnosticarEstagnacao(state, id, hojeIso))
      .filter((d): d is NonNullable<typeof d> => !!d && d.sessoes_sem_progresso >= 3)
      .map((d) => state.exercicios.find((e) => e.id === d.exercicio_id)?.nome ?? d.exercicio_id);
  }, [fech, state, hojeIso]);
  if (!fech || !perfil) return null;
  const bloqueado = parqBloqueiaPrescricao(perfil);

  async function confirmar() {
    if (!fech) return;
    setBusy(true);
    setErro(null);
    try {
      // Sem a etapa de texto do coach: o plano que entra é exatamente o da prévia.
      const res = await updatePerfilAndRemount({ ajuste_volume_musculo: fech.ajuste_volume_musculo }, { skipLlm: true });
      if (!res.ok) {
        setErro(res.error ?? "Não deu pra montar o novo bloco. Seu plano continua igual.");
        return;
      }
      setDataInicio(hojeIso);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="fechamento-bloco" aria-label="Fechamento do bloco">
      <Card className="mb-4 space-y-3 border border-accent/40">
        <div>
          <p className="text-xs uppercase tracking-wide text-accent">
            {fech.fase === "ultima_semana" ? `Última semana do bloco (${fech.semana} de ${fech.total})` : "Seu bloco terminou"}
          </p>
          <p className="font-semibold">Como você respondeu e o que muda no próximo</p>
          <p className="mt-1 text-sm text-muted">{fech.resumo.charAt(0).toUpperCase() + fech.resumo.slice(1)}</p>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-accent">Ver músculo por músculo</summary>
          <ul className="mt-2 space-y-2">
            {fech.musculos.map((m) => (
              <li key={m.grupo}>
                <p className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{labelGrupo(m.grupo)}</span>
                  <span className={`text-xs font-semibold ${COR[m.veredito]}`}>
                    {m.delta > 0 ? `+${m.delta} séries/sem` : m.delta < 0 ? `−${Math.abs(m.delta)} séries/sem` : "mantém"}
                  </span>
                </p>
                <p className="text-xs text-muted">{m.texto}</p>
              </li>
            ))}
          </ul>
        </details>

        {previa && (previa.volume.length > 0 || previa.saem.length > 0 || previa.entram.length > 0) ? (
          <div className="rounded-xl border border-border p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Próximo bloco</p>
            {previa.volume.length > 0 ? (
              <ul className="space-y-0.5">
                {previa.volume.map((l) => (
                  <li key={l.grupo} className="flex justify-between gap-2">
                    <span className="text-muted">{labelGrupo(l.grupo)}</span>
                    <span className="tabular-nums">
                      {l.antes} → <span className="font-semibold">{l.depois}</span> séries/sem
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {previa.saem.length > 0 ? <p className="mt-2 text-xs text-muted">Sai: {previa.saem.join(", ")}.</p> : null}
            {previa.entram.length > 0 ? <p className="text-xs text-muted">Entra: {previa.entram.join(", ")}.</p> : null}
          </div>
        ) : (
          <p className="text-xs text-muted">O próximo bloco mantém os mesmos treinos e o mesmo volume. As cargas continuam de onde você parou.</p>
        )}

        {parados.length > 0 ? (
          <p className="text-xs text-warn">
            Parados há 3+ treinos: {parados.join(", ")}. Vale trocar por uma variação no novo bloco (botão Trocar, no Plano).
          </p>
        ) : null}

        {erro ? <p className="text-sm text-danger">{erro}</p> : null}
        {fech.fase === "terminou" ? (
          <>
            <Button disabled={busy || bloqueado} onClick={() => void confirmar()}>
              {busy ? "Montando…" : "Confirmar e começar o novo bloco"}
            </Button>
            <p className="text-center text-[11px] text-muted">
              O novo bloco de {fech.total} semanas começa hoje. Histórico e cargas continuam. Nada muda se você não confirmar.
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted">
            Termine a semana leve. Depois dela, o botão de começar o novo bloco aparece aqui.
          </p>
        )}
      </Card>
    </section>
  );
}
