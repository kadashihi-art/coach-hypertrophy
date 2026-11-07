"use client";

import { useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import { Button } from "@/components/ui";
import { EditarTreinoSheet } from "@/components/EditarTreinoSheet";
import {
  acoesDoDia,
  podeDesmarcarFeito,
  proximoDaFila,
  treinosParaEscolher,
  treinosParaRegistrar,
  type CalendarioDiaView,
} from "@/lib/plan/calendario";
import { agendaEfetiva } from "@/lib/plan/pendente";
import { hojeIsoSaoPaulo } from "@/lib/plan/proxima-sessao";
import { useClientValue } from "@/lib/use-client-value";

/**
 * Painel de ações de um dia (calendário e faixa de dias em Hoje usam este mesmo bloco).
 * De hoje em diante, todo dia não feito mostra sempre: Marcar como feito, Pular, Planejar ou
 * trocar treino, Folga (limpar dia) e Desfazer. Dia feito: só Corrigir registro.
 * Nada é gravado sem o toque do usuário.
 */
export function DiaAcoes({ dia: selected }: { dia: CalendarioDiaView }) {
  const { state, markCalendario, limparDiaCalendario, desfazerLimpezaDia, registrarFeitoDia, desmarcarFeitoDia } = useApp();
  const [confirmarLimpar, setConfirmarLimpar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [corrigir, setCorrigir] = useState<string | null>(null);
  const hojeCal = useClientValue<string | null>(hojeIsoSaoPaulo, null);
  const dataInicio = state.plano?.mesociclo?.data_inicio;
  const acoes = acoesDoDia(selected, hojeCal);
  const doDia = selected.sessao_id && !selected.sessao_id.includes("#") ? selected.sessao_id : null;
  // Dia que já passou: "qual treino você fez?" lista todos os treinos do plano, inclusive os já feitos.
  const passado = !!hojeCal && selected.data < hojeCal;
  const opcoes = passado ? treinosParaRegistrar(state) : treinosParaEscolher(state);
  const proximo = proximoDaFila(state, agendaEfetiva(state, hojeCal).sessoes);
  const padrao = doDia ?? proximo?.id ?? opcoes[0]?.id ?? "";
  const [escolha, setEscolha] = useState<string>(padrao);
  const alvo = opcoes.find((o) => o.id === escolha) ? escolha : padrao;
  const nomeAlvo = opcoes.find((o) => o.id === alvo)?.nome ?? state.sessoes.find((s) => s.id === alvo)?.nome;
  const alvoJaFeito = (() => {
    const st = state.sessoes.find((s) => s.id === alvo)?.status;
    return st === "concluida" || st === "parcial" || st === "em_andamento";
  })();
  const ddmm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
  const manual = doDia ? !!state.sessoes.find((x) => x.id === doDia)?.data_manual : false;
  const podeDesfazer = selected.status === "limpo" || manual;

  if (selected.status === "feito") {
    return (
      <div className="mt-3" data-testid="acoes-dia" data-acoes="corrigir">
        <p className="mb-2 text-xs text-muted">Treino feito. Para mudar o que foi feito, use Corrigir registro.</p>
        {doDia && state.sessoes.find((x) => x.id === doDia)?.status === "concluida" ? (
          <Button variant="ghost" className="min-h-11 w-full text-sm" data-acao="corrigir" onClick={() => setCorrigir(doDia)}>
            Corrigir registro
          </Button>
        ) : null}
        {podeDesmarcarFeito(state, selected.sessao_id) ? (
          <Button
            variant="ghost"
            className="mt-2 min-h-11 w-full text-sm"
            data-acao="desmarcar-feito"
            onClick={() => {
              desmarcarFeitoDia(selected.sessao_id!);
              setAviso("Marcação de feito removida.");
            }}
          >
            Desmarcar (não fiz este treino)
          </Button>
        ) : null}
        {aviso ? <p className="mt-2 text-xs text-muted" role="status">{aviso}</p> : null}
        {corrigir ? <EditarTreinoSheet sessaoId={corrigir} onClose={() => setCorrigir(null)} /> : null}
      </div>
    );
  }
  if (selected.status === "em_andamento") {
    return <p className="mt-3 text-xs text-muted" data-testid="acoes-dia" data-acoes="">Treino em andamento.</p>;
  }
  if (selected.projetado) {
    return (
      <div className="mt-3" data-testid="acoes-dia" data-acoes="">
        <p className="text-xs text-muted">
          Previsto para a semana {selected.semana ?? "—"} do plano. As ações abrem quando essa semana chegar.
        </p>
      </div>
    );
  }
  if (!dataInicio) {
    return (
      <p className="mt-3 text-xs text-muted">
        Defina o início do plano para marcar os dias.{" "}
        <Link href="/plano/ajustar" className="text-accent">Definir início →</Link>
      </p>
    );
  }

  const fazer = (acao: "feito" | "pular" | "trocar") => {
    if (acao === "feito" && passado) {
      if (!alvo) return;
      registrarFeitoDia(selected.data, selected.sessao_id, alvo);
      setAviso(`${nomeAlvo ?? "Treino"} registrado como feito neste dia.`);
      return;
    }
    const trocando = !doDia || alvo !== doDia;
    markCalendario(doDia, acao, selected.data, trocando ? alvo || null : null);
    const quem = nomeAlvo ?? "Treino";
    setAviso(acao === "feito" ? `${quem} marcado como feito.` : acao === "pular" ? `${quem} pulado neste dia.` : `${quem} planejado neste dia.`);
  };

  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="acoes-dia" data-acoes={acoes.join(",")}>
      {selected.status === "limpo" ? <p className="text-xs text-muted">Dia de folga: nenhum treino é colocado aqui.</p> : null}
      {opcoes.length > 0 ? (
        <label className="flex flex-col gap-1 text-xs text-muted">
          {passado ? "Qual treino você fez neste dia?" : `Treino ${doDia ? "deste dia" : "para este dia"}`}
          <select
            className="min-h-11 rounded-xl border border-ink-800 bg-ink-900 px-3 text-sm text-white"
            value={alvo}
            data-testid="escolher-treino"
            onChange={(e) => setEscolha(e.target.value)}
          >
            {opcoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
                {o.id === doDia
                  ? " (deste dia)"
                  : passado && o.status === "em_andamento"
                    ? " (em andamento hoje)"
                  : passado && (o.status === "concluida" || o.status === "parcial")
                    ? ` (já feito${o.data ? ` em ${ddmm(o.data)}` : ""})`
                    : o.id === proximo?.id
                      ? " (próximo da fila)"
                      : ""}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-xs text-muted">Todos os treinos do plano já foram feitos.</p>
      )}
      {acoes.includes("feito") ? (
        <Button variant="go" className="min-h-11 text-sm" data-acao="feito" disabled={!alvo} onClick={() => fazer("feito")}>
          {passado ? "Registrar como feito" : "Marcar como feito"}
        </Button>
      ) : null}
      {acoes.includes("pular") ? (
        <Button variant={selected.status === "pulado" ? "warn" : "ghost"} aria-pressed={selected.status === "pulado"} className="min-h-11 text-sm" data-acao="pular" disabled={!alvo} onClick={() => fazer("pular")}>
          {selected.status === "pulado" ? "✓ Pulado" : "Pular"}
        </Button>
      ) : null}
      {acoes.includes("trocar") ? (
        <Button variant="ghost" className="min-h-11 text-sm" data-acao="trocar" disabled={!alvo || alvoJaFeito || (alvo === doDia && selected.status === "planejado" && manual)} onClick={() => fazer("trocar")}>
          {doDia && alvo !== doDia ? `Trocar para ${nomeAlvo ?? "este treino"}` : `Planejar ${nomeAlvo ?? "treino"} aqui`}
        </Button>
      ) : null}
      {acoes.includes("limpar") && selected.status !== "limpo" ? (
        confirmarLimpar ? (
          <div className="rounded-xl border border-ink-800 p-3" data-testid="limpar-dia">
            <p className="mb-2 text-sm">
              {selected.nome && doDia
                ? `Deixar este dia de folga? ${selected.nome} continua no plano e passa para o próximo dia de treino livre. Nenhuma série é apagada.`
                : "Deixar este dia de folga? Nenhum treino será colocado aqui."}
            </p>
            <div className="flex gap-2">
              <Button
                variant="warn"
                className="min-h-11 flex-1 text-sm"
                onClick={() => {
                  const r = limparDiaCalendario(selected.data, doDia);
                  setConfirmarLimpar(false);
                  setAviso(
                    r.ok
                      ? r.tirado
                        ? `Dia de folga. ${r.tirado} voltou para a fila.`
                        : "Dia de folga."
                      : r.motivo === "projetado"
                        ? "Esse dia é previsto de uma semana futura e ainda não dá para mudar."
                        : "Este dia tem treino feito ou em andamento e não mudou.",
                  );
                }}
              >
                Confirmar
              </Button>
              <Button variant="ghost" className="min-h-11 flex-1 text-sm" onClick={() => setConfirmarLimpar(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="min-h-11 text-sm" data-acao="limpar" onClick={() => setConfirmarLimpar(true)}>
            Folga (limpar dia)
          </Button>
        )
      ) : null}
      {acoes.includes("desfazer") ? (
        <Button
          variant="ghost"
          className="min-h-11 text-sm"
          data-acao="desfazer"
          disabled={!podeDesfazer}
          onClick={() => {
            if (selected.status === "limpo") desfazerLimpezaDia(selected.data);
            else markCalendario(doDia, "desfazer", selected.data);
            setAviso("Marcação desfeita. O dia volta a seguir a agenda.");
          }}
        >
          {podeDesfazer ? "Desfazer" : "Desfazer (nada marcado à mão aqui)"}
        </Button>
      ) : null}
      {aviso ? <p className="text-xs text-muted" role="status">{aviso}</p> : null}
    </div>
  );
}
