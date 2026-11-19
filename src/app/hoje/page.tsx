"use client";

import { alertaVolumeValido } from "@/lib/engine/alertas-volume";
import { inicioDeUso } from "@/lib/inicio";
import { semCodigoRegra } from "@/lib/llm/tom";
import { apresentarAlerta } from "@/lib/alertas/apresentar";
import { labelGrupo } from "@/lib/labels";
import { proximoTreinoParaAlerta } from "@/lib/alertas/proximo-treino";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { ehSemanaDeload, mesocicloEfetivo } from "@/lib/plan/mesociclo";
import { aplicarRampaVolume, resumoRampa, voltarParaBase } from "@/lib/engine/rampa-volume";
import { aplicarVolumeAutorregulado, gruposPrincipaisDoTreino, textosAutorregulado } from "@/lib/inteligencia/volume-autorregulado";
import { montarBriefing } from "@/lib/inteligencia/briefing";
import { BriefingTreino } from "@/components/BriefingTreino";
import { RevisaoSemanalResumo } from "@/components/RevisaoSemanal";
import { FechamentoBlocoCard } from "@/components/FechamentoBlocoCard";
import { ativos, encurtarTreino, limparPulos, opcoesDeTempo } from "@/lib/inteligencia/tempo-curto";
import { estimateDurationMin } from "@/lib/plan/gerar-plano";
import { revisarSemana } from "@/lib/inteligencia/revisao-semanal";
import {
  Button,
  Card,
  EvidenciaBadge,
} from "@/components/ui";
import { addDaysIso } from "@/lib/plan/calendario";
import { treinoAbertoAntigo } from "@/lib/treino/sessao-aberta";
import {
  hojeIsoSaoPaulo,
  proximaSessao,
  sessoesDoPlano,
} from "@/lib/plan/proxima-sessao";
import { agendaEfetiva, avisoPendente } from "@/lib/plan/pendente";
import { projetarOcorrencias } from "@/lib/plan/projecao";
import { faixaDeDias, TEXTO_STATUS, type StatusFaixa } from "@/lib/plan/faixa";
import { DiaAcoes } from "@/components/DiaAcoes";
import { MensagensCoach, type MensagemCoach } from "@/components/MensagensCoach";
import { StatusConexao } from "@/components/StatusConexao";
import { faseAtiva } from "@/lib/plan/estrutura";
import { alvoEditarHoje } from "@/lib/plan/hoje-editar";
import { EditarTreinoSheet } from "@/components/EditarTreinoSheet";
import { ReavaliacaoNivelCard } from "@/components/ReavaliacaoNivelCard";
import {
  avaliarCheckinDeload,
  resumoAjusteDeload,
} from "@/lib/engine/checkin-deload";
import {
  resumoSonoCheckin,
} from "@/lib/domain/sono";
import { useSonoAgua } from "@/components/SonoAgua";
import { CardioResumo } from "@/components/Cardio";
import {
  precisaResponderParq,
  parqBloqueiaPrescricao,
} from "@/lib/plan/parq";
import { textoCarga } from "@/lib/catalog/tipo-carga";
import { useModoCarga } from "@/lib/use-modo-carga";

const COR_STATUS: Record<StatusFaixa, string> = {
  feito: "text-go",
  pendente: "text-warn",
  planejado: "text-accent",
  folga: "text-faint",
  pulado: "text-warn/80",
  limpo: "text-faint",
  em_andamento: "text-accent",
};

export default function HojePage() {
  const { state, ready, startSession, trocarTreinoDeHoje, syncErro } = useApp();
  // Trocar o treino de hoje (ex.: o calendário diz Upper, mas hoje você vai fazer Lower).
  const [trocarAberto, setTrocarAberto] = useState(false);
  // Treino marcado na lista; só muda depois de "Confirmar mudança".
  const [escolhaHoje, setEscolhaHoje] = useState<string | null>(null);
  const { alternado } = useModoCarga();
  const sonoAgua = useSonoAgua(7);
  const router = useRouter();
  // escolha manual vale só enquanto a sugerida não muda (ex.: acabou de concluir)
  const [picked, setPicked] = useState<{ id: string; sug: string | null } | null>(null);
  const [editar, setEditar] = useState<string | null>(null);
  // "Tenho menos tempo": as opções de duração só aparecem quando pedidas.
  const [tempoAberto, setTempoAberto] = useState(false);
  // Meta de cada exercício (briefing): detalhe recolhido abaixo do treino.
  const [briefingAberto, setBriefingAberto] = useState(false);
  const [avisoEdicao, setAvisoEdicao] = useState<string | null>(null);
  // Faixa de dias: dia aberto no painel + rolagem inicial até hoje (uma vez).
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const rolouFaixa = useRef(false);
  const faixaRef = useCallback((el: HTMLDivElement | null) => {
    if (!el || rolouFaixa.current) return;
    const hojeEl = el.querySelector<HTMLElement>("[data-hoje='1']");
    if (!hojeEl) return;
    rolouFaixa.current = true;
    el.scrollLeft = Math.max(0, hojeEl.offsetLeft - el.offsetLeft - 20);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!state.perfil?.onboarding_concluido) {
      router.replace("/onboarding");
    }
  }, [ready, state.perfil, router]);

  const hojeSP = ready ? hojeIsoSaoPaulo() : null;
  const ciclo = useMemo(() => sessoesDoPlano(state, hojeSP), [state, hojeSP]);
  const sugerida = useMemo(() => proximaSessao(state), [state]);
  const fase = useMemo(() => faseAtiva(state.plano, hojeSP), [state.plano, hojeSP]);

  const pickedId = picked && picked.sug === (sugerida?.id ?? null) ? picked.id : (sugerida?.id ?? null);
  const setPickedId = (id: string) => setPicked({ id, sug: sugerida?.id ?? null });

  const sess =
    ciclo.find((s) => s.id === pickedId) ??
    sugerida ??
    ciclo[0];

  const plano = state.plano;
  // ready só é true no cliente (estado hidratado), então dá pra ler a data direto
  const agora = ready ? new Date() : null;
  // Dia de São Paulo (o UTC já vira amanhã às 21h).
  const hojeIso = hojeSP;
  // Treino esquecido aberto de outro dia: começa do zero hoje (as séries ficam no dia delas).
  const abertoAntigo = agora ? treinoAbertoAntigo(sess, agora.getTime()) : false;
  const emAndamento = sess?.status === "em_andamento" && !abertoAntigo;
  const hojeLabel = agora
    ? agora.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "short",
        timeZone: "America/Sao_Paulo",
      })
    : "";
  const inicioUso = inicioDeUso(state);
  const alertasVisiveis = state.alertas.filter((a) => alertaVolumeValido(a.motivo, inicioUso));
  const alerta =
    alertasVisiveis.find((a) => !a.resolvido) ??
    alertasVisiveis.find((a) => a.nivel !== "N0") ??
    alertasVisiveis[0];
  // Semana real do bloco (a salva no plano fica em 1).
  const meso = useMemo(() => mesocicloEfetivo(state, hojeIso), [state, hojeIso]);
  const ck = hojeIso
    ? state.checkins.find((c) => c.data === hojeIso)
    : undefined;

  // Prévia da rampa de volume (o mesmo cálculo do início do treino). Em andamento já está aplicada.
  const rampaPreview = useMemo(() => {
    if (!sess || !hojeIso || emAndamento) return null;
    return aplicarRampaVolume({
      prescricoes: limparPulos(voltarParaBase(sess.prescricoes)),
      exercicios: state.exercicios,
      estados: state.estados,
      mesociclo: meso,
      experiencia: state.perfil?.experiencia,
      checkin: ck ?? null,
      sessoesDaSemana: sessoesDoPlano(state, hojeIso),
      registros: state.registros,
      hojeIso,
    });
  }, [sess, hojeIso, state, meso, ck, emAndamento]);

  // Prévia do volume autorregulado (feedback por músculo), por cima da rampa — mesmo cálculo do início do treino.
  const autoPreview = useMemo(() => {
    if (!sess || !hojeIso || emAndamento || !rampaPreview) return null;
    return aplicarVolumeAutorregulado({
      prescricoes: rampaPreview.prescricoes,
      exercicios: state.exercicios,
      feedbacks: state.feedbacks_musculo,
      mesociclo: meso,
      checkin: ck ?? null,
      sessoesDaSemana: sessoesDoPlano(state, hojeIso),
    });
  }, [sess, hojeIso, state, meso, ck, rampaPreview, emAndamento]);

  const deloadPreview = useMemo(() => {
    if (!sess || !hojeIso) return null;
    // Sessão já em andamento: prescricoes já podem estar ajustadas —
    // ainda assim mostramos resumo a partir do check-in/meso/estados.
    return avaliarCheckinDeload({
      checkin: ck ?? null,
      mesociclo: meso,
      estados: state.estados,
      prescricoes: autoPreview?.prescricoes ?? rampaPreview?.prescricoes ?? sess.prescricoes,
      exercicios: state.exercicios,
      data: hojeIso,
    });
  }, [sess, ck, meso, state.estados, state.exercicios, hojeIso, rampaPreview, autoPreview]);

  const revisao = useMemo(() => {
    if (!hojeIso) return null;
    const dow = new Date(hojeIso + "T12:00:00Z").getUTCDay();
    return dow === 0 || dow === 1 ? revisarSemana(state, hojeIso) : null;
  }, [state, hojeIso]);

  // Tempo curto: prévia do treino encurtado (o mesmo cálculo do início do treino).
  const [tempoHoje, setTempoHoje] = useState<number | null>(null);
  const duracaoDia = useMemo(
    () => (sess && deloadPreview ? estimateDurationMin(ativos(deloadPreview.prescricoes), state.exercicios) : 0),
    [sess, deloadPreview, state.exercicios],
  );
  const tempoPreview = useMemo(() => {
    if (!sess || !deloadPreview || !tempoHoje || emAndamento) return null;
    return encurtarTreino({
      prescricoes: deloadPreview.prescricoes,
      exercicios: state.exercicios,
      minutos: tempoHoje,
      prioridades: state.perfil?.prioridades_musculares,
      duracao: (ps) => estimateDurationMin(ps, state.exercicios),
    });
  }, [sess, deloadPreview, tempoHoje, state.exercicios, state.perfil?.prioridades_musculares, emAndamento]);

  // Briefing: meta de cada exercício com as séries do dia já ajustadas.
  const briefing = useMemo(() => {
    if (!sess || !hojeIso || emAndamento) return null;
    const base = new Map(voltarParaBase(sess.prescricoes).map((p) => [p.id, p.series]));
    return montarBriefing({
      state,
      prescricoes: ativos(tempoPreview?.prescricoes ?? deloadPreview?.prescricoes ?? limparPulos(sess.prescricoes)),
      mesociclo: meso,
      checkin: ck ?? null,
      hojeIso,
      baseSeries: base,
    });
  }, [sess, hojeIso, state, meso, ck, deloadPreview, tempoPreview, emAndamento]);

  const deloadResumo =
    [rampaPreview ? resumoRampa(rampaPreview, state.exercicios) : null, deloadPreview ? resumoAjusteDeload(deloadPreview) : null]
      .filter(Boolean)
      .join(" ") || null;

  const parqBloqueado = parqBloqueiaPrescricao(state.perfil);
  const parqPendente = precisaResponderParq(state.perfil);

  function iniciar() {
    if (!sess) return;
    if (parqBloqueado) {
      if (parqPendente) router.push("/onboarding");
      return;
    }
    startSession(sess.id, tempoPreview ? { minutos: tempoHoje ?? undefined } : undefined);
    router.push("/treino");
  }

  if (!ready || !state.perfil?.onboarding_concluido) {
    return (
      <main className="motion-fade-up flex min-h-dvh items-center justify-center p-6">
        <p className="text-sm text-muted">Carregando…</p>
      </main>
    );
  }


  const ultimaDecisao = state.decisoes
    .filter((d) => sess && d.exercicio_id && sess.prescricoes.some((p) => p.exercicio_id === d.exercicio_id))
    .slice(-1)[0];

  // Hero: 4 estados (não iniciado · em andamento · feito · descanso)
  const totalSeries = sess ? (emAndamento ? ativos(sess.prescricoes) : sess.prescricoes).reduce((n, p) => n + p.series, 0) : 0;
  const feitas = sess ? state.registros.filter((r) => r.sessao_id === sess.id).length : 0;
  const hoje = hojeSP ?? hojeIso;
  // Agenda efetiva (só leitura): treino não feito não é pulado, a sequência anda por treino.
  const agenda = agendaEfetiva(state, hoje);
  const agendaSess = agenda.sessoes;
  const aviso = hoje ? avisoPendente(agenda.pendentes, hoje) : null;
  // Mesma agenda do calendário (inclui as ocorrências de treinos já feitos em semanas anteriores).
  const doCalendario = hoje ? projetarOcorrencias(state, hoje, agenda) : agendaSess;
  const dataEfetiva = (id: string | undefined) =>
    doCalendario.filter((x) => x.id.split("#")[0] === id && !!x.data && (!hoje || x.data >= hoje) && x.status === "planejada").map((x) => x.data!).sort()[0] ??
    agendaSess.find((x) => x.id === id)?.data ??
    null;
  const temAgenda = state.sessoes.some((s) => !!s.data);
  const faixa = faixaDeDias(state, hoje);
  const diaSel = faixa.find((f) => f.dia.data === diaAberto) ?? null;
  const sessHoje = hoje ? doCalendario.find((s) => s.data === hoje && s.status !== "pulada") : undefined;
  // Treino já feito hoje (o de hoje acabou): o cartão passa a mostrar o próximo, com o dia dele.
  const feitoHoje = hoje
    ? doCalendario.find((s) => s.data === hoje && (s.status === "concluida" || s.status === "parcial"))
    : undefined;
  const estadoHero: "andamento" | "feito" | "descanso" | "novo" | "proximo" =
    emAndamento
      ? "andamento"
      : sess?.status === "concluida" && (!hoje || sess.data === hoje || !sess.data)
        ? "feito"
        : feitoHoje && sess && sess.id !== feitoHoje.id.split("#")[0] && sess.id !== feitoHoje.id
          ? "proximo"
          : temAgenda && hoje && !sessHoje
            ? "descanso"
            : "novo";
  const proxData = dataEfetiva(sess?.id)
    ? new Date(`${dataEfetiva(sess?.id)}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" })
    : null;

  const consistencia = (() => {
    if (!hoje) return null;
    const ini = addDaysIso(hoje, -27);
    const janela = agendaSess.filter((x) => x.data && x.data >= ini && x.data <= hoje);
    if (!janela.length) return null;
    return { feitos: janela.filter((x) => x.status === "concluida").length, total: janela.length };
  })();

  // Avisos do coach num formato só, em ordem de prioridade: o Hoje mostra o primeiro e guarda o resto.
  const mensagens: MensagemCoach[] = [];
  if (parqBloqueado) {
    mensagens.push({
      id: "parq",
      tom: "bloqueio",
      titulo: "Plano pausado por segurança",
      texto: "Uma resposta do questionário de saúde pede liberação profissional antes de treinar com progressão. Procure um médico ou profissional de saúde.",
      acao: parqPendente ? { rotulo: "Responder triagem PAR-Q+", href: "/onboarding" } : { rotulo: "Abrir eparmedx.com", onClick: () => window.open("https://eparmedx.com/", "_blank", "noreferrer") },
      fechavel: false,
    });
  }
  if (syncErro) {
    mensagens.push({
      id: "sync",
      tom: "atencao",
      titulo: syncErro.startsWith("leitura") ? "Não consegui ler seus dados do servidor" : "Não consegui salvar no servidor",
      texto: syncErro.startsWith("leitura")
        ? "Este aparelho mostra só o que está guardado nele, então outro aparelho pode estar diferente."
        : "Suas mudanças estão guardadas neste aparelho e sobem quando o servidor voltar.",
      dica: /403|blocked|bloque/i.test(syncErro) ? `O armazenamento recusou o acesso (${syncErro}): confira o Blob no painel da Vercel.` : `Detalhe: ${syncErro}. Se continuar, me manda um print.`,
    });
  }
  if (!parqBloqueado && alerta && alerta.nivel !== "N0") {
    const ap = apresentarAlerta(alerta);
    const alvo = ap.acao?.tipo === "revisar_treino" ? proximoTreinoParaAlerta(state, ap.acao.grupo) : null;
    mensagens.push({
      id: "alerta",
      tom: ap.urgencia,
      titulo: ap.titulo,
      texto: ap.porque,
      dica: ap.dica,
      acao: ap.acao && alvo ? { rotulo: ap.acao.rotulo, onClick: () => { setAvisoEdicao(null); setEditar(alvo); } } : undefined,
    });
  }
  if (aviso && sess?.id === agenda.pendentes[0]?.sessao_id) {
    mensagens.push({ id: "pendente", tom: "atencao", titulo: aviso.titulo, texto: aviso.texto });
  }
  if (!parqBloqueado && deloadResumo) {
    mensagens.push({ id: "rampa", tom: "info", titulo: ehSemanaDeload(meso) ? "Semana leve" : "Ajuste de hoje", texto: deloadResumo });
  }
  if (state.plano?.estrutura?.fases?.length && state.plano.mesociclo?.data_inicio && !state.perfil?.dias_treino_semana?.length) {
    mensagens.push({
      id: "dias",
      tom: "info",
      titulo: "Quais dias você treina?",
      texto: "Marque os dias da semana pra o calendário bater com a sua rotina.",
      acao: { rotulo: "Escolher dias", href: "/plano/calendario" },
    });
  }
  // Sono, água e proteína: o mais urgente vira uma mensagem (antes era um cartão a mais na tela).
  {
    const ordem = { bloqueio: 0, atencao: 1, info: 2 } as const;
    const top = [sonoAgua.sono, sonoAgua.agua, sonoAgua.proteina]
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => ordem[a.urgencia] - ordem[b.urgencia])[0];
    if (top) mensagens.push({ id: "sono-agua", tom: top.urgencia === "bloqueio" ? "atencao" : top.urgencia, titulo: top.titulo, texto: top.porque, acao: { rotulo: "Ver sono, água e proteína", href: "/progresso#sono-agua" } });
  }
  const tituloDia =
    estadoHero === "andamento"
      ? "Treino em andamento"
      : estadoHero === "feito" || estadoHero === "proximo"
        ? "Treino feito ✓"
        : estadoHero === "descanso"
          ? "Dia de descanso"
          : "Bora treinar";

  // Opções pra trocar o treino de hoje: qualquer treino do plano (um já feito vira "repetir").
  // Treino aberto sem nenhuma série (tocou em Começar e voltou) também pode ser trocado.
  const podeTrocarHoje =
    !!sess && !parqBloqueado && !plano?.bloqueado &&
    (estadoHero === "novo" || estadoHero === "descanso" || (estadoHero === "andamento" && feitas === 0));
  const opcoesHoje = podeTrocarHoje
    ? // Só treinos da fase atual do plano: são os que o Hoje e o calendário mostram.
      ciclo.filter((o) => !o.id.includes("#") && o.status !== "em_andamento" && (estadoHero === "descanso" || o.id !== sess?.id))
    : [];
  const ddmmHoje = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
  function trocarHojePara(id: string) {
    const nome = state.sessoes.find((x) => x.id === id)?.nome ?? "Treino";
    let r: ReturnType<typeof trocarTreinoDeHoje>;
    try {
      r = trocarTreinoDeHoje(id);
    } catch (e) {
      setAvisoEdicao(`Não consegui trocar o treino (${e instanceof Error ? e.message : "erro"}). Me manda um print disso.`);
      return;
    }
    setTrocarAberto(false);
    setEscolhaHoje(null);
    if (!r.ok) {
      setAvisoEdicao(
        r.motivo === "com_series"
          ? "Esse treino já tem série registrada hoje. Finalize ele antes de trocar."
          : "Não consegui colocar esse treino hoje. Me manda um print disso.",
      );
      return;
    }
    // Fixa o escolhido hoje (no calendário, quando o plano tem data de início); o que saiu volta pra fila.
    setPicked(null);
    const nomeDe = (sid: string) => state.sessoes.find((x) => x.id === sid)?.nome ?? sid;
    const saiu = r.saiu ? nomeDe(r.saiu) : null;
    const desm = (r.desmarcados ?? []).map(nomeDe);
    // Nome do treino feito (a execução guardada tem id "<treino>#feito-<data>").
    const feitos = (r.feitosHoje ?? []).map((sid) => nomeDe(sid.split("#")[0]!));
    setAvisoEdicao(
      `Pronto, hoje é ${nome} (no Hoje e no calendário).` +
        (saiu ? ` ${saiu} voltou pra fila e entra no próximo dia de treino.` : "") +
        (desm.length ? ` ${desm.join(" e ")} ${desm.length > 1 ? "estavam marcados" : "estava marcado"} como feito hoje sem nenhuma série e ${desm.length > 1 ? "voltaram" : "voltou"} pra fila.` : "") +
        (feitos.length
          ? ` Hoje você já tem ${feitos.join(" e ")} feito com séries: no calendário o dia aparece como feito, e ${nome} fica como o treino a fazer aqui no Hoje. Se ${feitos.length > 1 ? "eles não foram" : "ele não foi"} hoje, corrija no calendário.`
          : ""),
    );
  }

  const alvoEdicao = alvoEditarHoje(state, sess?.id);
  const botaoEdicao = alvoEdicao ? (
    <button
      type="button"
      data-testid="hoje-editar-treino"
      onClick={() => {
        if (alvoEdicao.modo === "bloqueado") setAvisoEdicao(alvoEdicao.motivo);
        else { setAvisoEdicao(null); setEditar(alvoEdicao.sessaoId); }
      }}
      className="motion-press mt-2 min-h-11 w-full rounded-2xl border border-accent/40 text-sm font-semibold text-accent"
    >
      {alvoEdicao.label}
    </button>
  ) : null;

  // Séries do dia no cartão: já com rampa, ajuste por músculo, check-in e tempo curto (o mesmo que o treino vai usar).
  const prescricoesHero =
    estadoHero === "novo" ? ativos(tempoPreview?.prescricoes ?? deloadPreview?.prescricoes ?? sess?.prescricoes ?? []) : (sess?.prescricoes ?? []);
  const ctaDisabled = !sess || !!plano?.bloqueado || sess.prescricoes.length === 0 || parqBloqueado;
  const coachPergunta = sess
    ? `Por que ${sess.nome} hoje com esse volume?`
    : "Por que meu plano está montado assim?";

  return (
    <main className="motion-fade-up motion-stagger px-5 pb-28 pt-8">
      {editar ? (
        <EditarTreinoSheet sessaoId={editar} onClose={() => setEditar(null)} onSalvo={(m) => setAvisoEdicao(m)} />
      ) : null}
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted capitalize">{hojeLabel || "Hoje"}</p>
          <h1 className="text-2xl font-bold">{tituloDia}</h1>
          {plano && meso ? (
            <p className="mt-1 text-xs text-muted" data-testid="semana-bloco">
              {meso.semana_atual > meso.total_semanas ? (
                "Bloco concluído"
              ) : (
                <>
                  Semana <span className="num text-bone-50">{meso.semana_atual}</span> de {meso.total_semanas}
                  {ehSemanaDeload(meso) ? " · semana leve (deload)" : ""}
                  {fase && (state.plano?.estrutura?.fases.length ?? 0) > 1 ? ` · ${fase.nome}` : ""}
                </>
              )}
            </p>
          ) : null}
        </div>
        <StatusConexao />
      </header>

      <MensagensCoach mensagens={mensagens} />

      {/* Hero: Treino do dia */}
      {sess && (
        <Card className="motion-press mb-4 border border-accent/25 p-5">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-xs uppercase text-muted">
              {estadoHero === "descanso"
                ? "Hoje é descanso"
                : estadoHero === "feito"
                  ? "Treino de hoje"
                  : estadoHero === "proximo"
                    ? `Próximo treino${proxData ? ` · ${proxData}` : ""}`
                    : "Treino do dia"}
            </div>
            {sess.prescricoes[0] && <EvidenciaBadge evidencia={sess.prescricoes[0].evidencia} />}
          </div>
          {estadoHero === "descanso" ? (
            <>
              <h2 className="text-3xl font-bold tracking-tight">Descanso</h2>
              <p className="mt-2 text-sm text-bone-300">
                {sess.id === sugerida?.id ? "Próximo" : sess.status === "concluida" ? "Feito" : "Escolhido"}: <span className="font-semibold">{sess.nome}</span>
                {proxData ? <span className="capitalize"> · {proxData}</span> : null}
              </p>
            </>
          ) : estadoHero === "proximo" ? (
            <>
              <p className="mb-2 text-sm text-go" data-testid="feito-hoje">
                ✓ Hoje: {feitoHoje?.nome} feito
              </p>
              <h2 className="text-3xl font-bold tracking-tight" data-testid="proximo-treino">{sess.nome}</h2>
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-bone-300">
                <span className="num">~{sess.duracao_estimada_min} min</span>
                <span>·</span>
                <span>{sess.grupos.slice(0, 4).map((g) => labelGrupo(g).toLowerCase()).join(" · ")}</span>
              </div>
            </>
          ) : estadoHero === "feito" ? (
            <>
              <h2 className="pr-pop text-3xl font-bold tracking-tight">Treino feito ✓</h2>
              <p className="mt-2 text-sm text-bone-300">
                {sess.nome} · <span className="num">{feitas}</span> séries registradas
              </p>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold tracking-tight">{sess.nome}</h2>
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-bone-300">
                <span className="num">~{estadoHero === "novo" ? (tempoPreview ? tempoPreview.duracao_depois : duracaoDia || sess.duracao_estimada_min) : sess.duracao_estimada_min} min</span>
                <span>·</span>
                <span>{sess.grupos.slice(0, 4).map((g) => labelGrupo(g).toLowerCase()).join(" · ")}</span>
              </div>
            </>
          )}
          {estadoHero === "andamento" && totalSeries > 0 ? (
            <div className="bar-track mt-3">
              <div className="bar-fill h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.round((feitas / totalSeries) * 100))}%`, height: "100%" }} />
            </div>
          ) : null}
          {ultimaDecisao && sugerida?.id === sess.id && estadoHero === "novo" && (
            <p className="mt-3 text-xs text-muted">
              {semCodigoRegra(ultimaDecisao.motivo).slice(0, 120)}
              {ultimaDecisao.motivo.length > 120 ? "…" : ""}
            </p>
          )}
          {estadoHero === "novo" || estadoHero === "andamento" || estadoHero === "proximo" ? (
            <ul className="mt-3 space-y-1.5 border-t border-border pt-3" data-testid="hero-exercicios">
              {prescricoesHero.slice(0, 4).map((p) => {
                const ex = state.exercicios.find((e) => e.id === p.exercicio_id);
                const est = state.estados.find((e) => e.exercicio_id === p.exercicio_id);
                const carga = est?.alvo_proxima_sessao.carga_kg ?? p.carga.trabalho_kg;
                return (
                  <li key={p.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{ex?.nome ?? "Exercício"}</span>
                      <span className="load-num shrink-0 text-bone-200">
                        {p.series}×{p.faixa_reps[0]}–{p.faixa_reps[1]}
                        {(() => {
                          const base = sess.prescricoes.find((x) => x.id === p.id)?.series ?? p.series;
                          return p.series !== base ? (
                            <span className={p.series > base ? "text-accent" : "text-warn"}> ({p.series > base ? "+" : ""}{p.series - base})</span>
                          ) : null;
                        })()}
                      </span>
                    </div>
                    <div className="load-num truncate text-xs text-muted">{textoCarga(carga, ex, alternado(ex?.id))}</div>
                  </li>
                );
              })}
              {prescricoesHero.length > 4 ? (
                <li className="text-xs text-faint">+{prescricoesHero.length - 4} exercícios</li>
              ) : null}
            </ul>
          ) : null}
          <div className="mt-4">
            {estadoHero === "proximo" ? (
              <div className="flex gap-2">
                <Link href="/plano/calendario" className="motion-press block flex-1 rounded-[14px] bg-white/5 py-3 text-center text-sm font-semibold text-accent">
                  Ver semana →
                </Link>
                <button
                  type="button"
                  data-testid="adiantar-proximo"
                  onClick={iniciar}
                  disabled={ctaDisabled}
                  className="motion-press flex-1 rounded-[14px] border border-border py-3 text-center text-sm font-semibold text-bone-50 disabled:opacity-50"
                >
                  Adiantar pra hoje
                </button>
              </div>
            ) : estadoHero === "feito" ? (
              <Link href="/progresso" className="motion-press block rounded-[14px] bg-white/5 py-3 text-center text-sm font-semibold text-accent">
                Ver progresso →
              </Link>
            ) : estadoHero === "descanso" ? (
              <Link href="/plano/calendario" className="motion-press block rounded-[14px] bg-white/5 py-3 text-center text-sm font-semibold text-accent">
                Ver semana →
              </Link>
            ) : (
              <>
              {estadoHero === "novo" && !parqBloqueado && opcoesDeTempo(duracaoDia).length > 0 && (tempoAberto || tempoHoje !== null) ? (
                <div className="mb-3" data-testid="tempo-curto">
                  <p className="mb-1.5 text-xs text-muted">Quanto tempo você tem hoje?</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" aria-pressed={tempoHoje === null} className={`chip-motion text-xs ${tempoHoje === null ? "on" : ""}`} onClick={() => setTempoHoje(null)}>
                      Treino completo
                    </button>
                    {opcoesDeTempo(duracaoDia).map((m) => (
                      <button key={m} type="button" aria-pressed={tempoHoje === m} className={`chip-motion text-xs ${tempoHoje === m ? "on" : ""}`} onClick={() => setTempoHoje(m)}>
                        {m} min
                      </button>
                    ))}
                  </div>
                  {tempoPreview ? (
                    <div className="mt-2 rounded-xl border border-border p-3 text-xs">
                      <p className="mb-1 text-sm font-semibold">
                        {tempoPreview.cabe ? `Cabe em ~${tempoPreview.duracao_depois} min.` : `O mínimo que rende leva ~${tempoPreview.duracao_depois} min.`}
                      </p>
                      <ul className="space-y-0.5 text-muted">
                        {tempoPreview.mudancas.map((m) => {
                          const nome = state.exercicios.find((e) => e.id === m.exercicio_id)?.nome ?? m.exercicio_id;
                          return <li key={m.prescricao_id}>{m.pulado ? `${nome}: fica pra semana que vem` : `${nome}: ${m.de} → ${m.para} séries`}</li>;
                        })}
                      </ul>
                      <p className="mt-1 text-muted">Mantive a primeira série pesada de cada músculo. Vale só hoje: semana que vem o treino volta inteiro.</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <Button onClick={iniciar} disabled={ctaDisabled} className="motion-cta-glow min-h-14 py-5 text-lg">
                {estadoHero === "andamento"
                  ? `Continuar · série ${Math.min(feitas + 1, totalSeries || 1)}/${totalSeries}`
                  : `Começar · ~${tempoPreview ? tempoPreview.duracao_depois : duracaoDia || sess.duracao_estimada_min} min`}
              </Button>
              </>
            )}
            {opcoesHoje.length > 0 ? (
              trocarAberto ? (
                <div className="mt-2 rounded-2xl border border-border p-3" data-testid="trocar-treino-hoje">
                  <p className="mb-2 text-sm font-semibold">
                    {estadoHero === "descanso" ? "Qual treino você vai fazer hoje?" : `Trocar ${sess?.nome} por:`}
                  </p>
                  <div className="flex flex-col gap-2" role="radiogroup" aria-label="Treino de hoje">
                    {opcoesHoje.map((o) => {
                      const marcado = escolhaHoje === o.id;
                      const feito = o.status === "concluida" || o.status === "parcial";
                      return (
                        <button
                          key={o.id}
                          type="button"
                          role="radio"
                          aria-checked={marcado}
                          data-testid="opcao-treino-hoje"
                          onClick={() => setEscolhaHoje(o.id)}
                          className={`motion-press flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left ${
                            marcado ? "border-accent bg-accent/10" : "border-border"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-bone-50">{o.nome}</span>
                            <span className="block truncate text-xs text-muted">
                              {o.grupos.slice(0, 4).map((g) => labelGrupo(g).toLowerCase()).join(" · ")}
                            </span>
                            {feito ? (
                              <span className="block text-xs text-accent">
                                {!state.registros.some((r) => r.sessao_id === o.id)
                                  ? "Marcado como feito sem nenhuma série: vira o treino de hoje"
                                  : o.data === hoje
                                    ? "Já feito hoje: fazer de novo"
                                    : `Já feito em ${ddmmHoje(o.data)}: fazer de novo hoje`}
                              </span>
                            ) : null}
                          </span>
                          <span
                            aria-hidden
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                              marcado ? "border-accent bg-accent text-ink-950" : "border-border"
                            }`}
                          >
                            {marcado ? "✓" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {escolhaHoje ? (
                    <p className="mt-3 text-xs text-muted" data-testid="previa-troca-hoje">
                      Hoje passa a ser <span className="font-semibold text-bone-50">{opcoesHoje.find((o) => o.id === escolhaHoje)?.nome}</span>
                      {estadoHero !== "descanso" && sess ? `. ${sess.nome} volta pra fila e entra no próximo dia de treino` : ""}. Nenhuma série é apagada.
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-faint">Escolha um treino e confirme.</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Button
                      className="min-h-11 flex-1 text-sm"
                      data-testid="confirmar-troca-hoje"
                      disabled={!escolhaHoje}
                      onClick={() => escolhaHoje && trocarHojePara(escolhaHoje)}
                    >
                      Confirmar mudança
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-11 flex-1 text-sm"
                      onClick={() => { setTrocarAberto(false); setEscolhaHoje(null); }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 grid grid-flow-col auto-cols-fr gap-2">
                  {estadoHero === "novo" && !parqBloqueado && opcoesDeTempo(duracaoDia).length > 0 && !tempoAberto && tempoHoje === null ? (
                    <button
                      type="button"
                      data-testid="abrir-tempo-curto"
                      onClick={() => setTempoAberto(true)}
                      className="motion-press min-h-11 rounded-2xl border border-border px-2 text-sm font-semibold text-bone-50"
                    >
                      Menos tempo
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-testid="hoje-trocar-treino"
                    onClick={() => { setTrocarAberto(true); setEscolhaHoje(null); setAvisoEdicao(null); }}
                    className="motion-press min-h-11 rounded-2xl border border-border px-2 text-sm font-semibold text-bone-50"
                  >
                    {estadoHero === "descanso" ? "Treinar hoje mesmo assim" : "Trocar treino"}
                  </button>
                </div>
              )
            ) : null}
            {/* Corrigir um registro antigo do mesmo treino não faz sentido antes de começar: só depois de feito. */}
            {alvoEdicao && !(estadoHero === "novo" && alvoEdicao.modo === "corrigir") ? botaoEdicao : null}
            {avisoEdicao ? (
              <p role="status" className="mt-2 text-xs text-muted">{avisoEdicao}</p>
            ) : null}
          </div>
        </Card>
      )}

      {/* Briefing: recuperação, ajustes do dia e meta de cada exercício (só antes de começar). Recolhido: abre ao tocar. */}
      {sess && briefing && estadoHero === "novo" && !parqBloqueado ? (
        (() => {
          const ajustesHoje = autoPreview ? textosAutorregulado(autoPreview, state.exercicios) : [];
          const trocarHoje = (autoPreview?.trocar ?? []).map((t) => state.exercicios.find((e) => e.id === t.exercicio_id)?.nome ?? t.exercicio_id);
          if (briefingAberto || trocarHoje.length) {
            return (
              <BriefingTreino
                briefing={briefing}
                grupos={gruposPrincipaisDoTreino(sess.prescricoes, state.exercicios)}
                ajustes={ajustesHoje}
                trocar={trocarHoje}
              />
            );
          }
          return (
            <button
              type="button"
              data-testid="abrir-briefing"
              onClick={() => setBriefingAberto(true)}
              className="motion-press mb-4 flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border border-border bg-surface px-4 py-2 text-left text-sm"
            >
              <span className="min-w-0">
                <span className="font-semibold">Meta de cada exercício</span>
                <span className="block truncate text-xs text-muted">
                  {ajustesHoje.length ? "Ajustei o volume pra hoje · " : ""}recuperação, carga e o que buscar
                </span>
              </span>
              <span className="shrink-0 text-accent">›</span>
            </button>
          );
        })()
      ) : null}

      <ReavaliacaoNivelCard />

      {/* Fim do bloco: análise por músculo e proposta do próximo (só muda com confirmação). */}
      {hojeSP ? <FechamentoBlocoCard hojeIso={hojeSP} /> : null}

      {/* Revisão da semana: domingo (semana fechando) e segunda (semana que passou). */}
      {revisao ? <RevisaoSemanalResumo r={revisao} /> : null}

      {/* Faixa de dias: mesma agenda do calendário (datas reais). Tocar abre as ações do dia aqui. */}
      {faixa.length ? (
        <section aria-label="Seus dias de treino" className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase text-muted">
              Sua semana
              {consistencia ? (
                <span className="normal-case text-faint"> · <span className="num text-bone-200">{consistencia.feitos}</span> de {consistencia.total} treinos em 4 semanas</span>
              ) : null}
            </p>
            <Link href="/plano/calendario" className="shrink-0 text-xs font-semibold text-accent">Calendário ›</Link>
          </div>
          <div
            ref={faixaRef}
            data-testid="faixa-dias"
            className="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {faixa.map((f) => {
              const aberto = diaAberto === f.dia.data;
              return (
                <button
                  key={f.dia.data}
                  type="button"
                  data-dia={f.dia.data}
                  data-status={f.status}
                  data-hoje={f.hoje ? "1" : undefined}
                  aria-pressed={aberto}
                  aria-label={`${f.rotulo}${f.hoje ? ", hoje" : ""}: ${f.dia.nome ?? "sem treino"}, ${TEXTO_STATUS[f.status]}`}
                  onClick={() => setDiaAberto(aberto ? null : f.dia.data)}
                  className={`chip-motion w-[92px] shrink-0 snap-start rounded-[14px] border px-2.5 py-2 text-left ${
                    aberto ? "border-accent bg-[rgba(184,255,60,.12)]" : f.hoje ? "border-accent/70 bg-surface" : "border-border bg-surface"
                  }`}
                >
                  <div className={`text-[10px] uppercase tracking-wide ${f.hoje ? "font-bold text-accent" : "text-faint"}`}>
                    {f.hoje ? "Hoje" : f.rotulo.split(" ")[0]} · {f.rotulo.split(" ")[1]}
                  </div>
                  <div className="truncate text-sm font-semibold">{f.dia.nome ?? "—"}</div>
                  <div className={`text-[11px] font-semibold ${COR_STATUS[f.status]}`}>{TEXTO_STATUS[f.status]}</div>
                </button>
              );
            })}
          </div>
          {diaSel ? (
            <div data-testid="painel-dia"><Card className="mt-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">
                  {diaSel.rotulo}
                  {diaSel.dia.nome ? ` · ${diaSel.dia.nome}` : ""}
                </p>
                <span className={`text-xs font-semibold ${COR_STATUS[diaSel.status]}`}>{TEXTO_STATUS[diaSel.status]}</span>
              </div>
              <DiaAcoes key={`${diaSel.dia.data}:${diaSel.dia.sessao_id ?? ""}`} dia={diaSel.dia} />
              <div className="mt-3 flex gap-2">
                {diaSel.dia.sessao_id && !diaSel.dia.sessao_id.includes("#") && diaSel.status !== "feito" && diaSel.dia.sessao_id !== sess?.id ? (
                  <Button variant="ghost" className="min-h-11 flex-1 text-sm" onClick={() => { setPickedId(diaSel.dia.sessao_id!); setAvisoEdicao(null); }}>
                    Ver este treino
                  </Button>
                ) : null}
                <Link href={`/plano/calendario?dia=${diaSel.dia.data}`} className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-semibold text-accent">
                  Abrir calendário
                </Link>
                <Button variant="ghost" className="min-h-11 text-sm" aria-label="Fechar" onClick={() => setDiaAberto(null)}>
                  ✕
                </Button>
              </div>
            </Card></div>
          ) : null}
        </section>
      ) : null}

      {/* Atalhos do dia: check-in e cardio numa linha cada (o detalhe fica em Evolução). */}
      <div className="mb-4 flex flex-col gap-2">
        <Link
          href="/checkin"
          data-testid="atalho-checkin"
          className="motion-press flex min-h-12 items-center justify-between gap-2 rounded-2xl border border-border bg-surface px-4 py-2 text-sm"
        >
          {ck ? (
            <span className="min-w-0">
              <span className="text-muted">Check-in </span>
              <span className="font-semibold text-go">feito</span>
              <span className="text-muted">
                {" "}· disposição <span className="num text-bone-50">{ck.prontidao}</span>/5 · sono {resumoSonoCheckin(ck)}
              </span>
              {ck.prontidao <= 2 || ck.sono_h < 6 ? (
                <span className="block text-xs text-warn">Treino de hoje ajustado: −1 série nos compostos, carga mantida.</span>
              ) : null}
            </span>
          ) : (
            <span className="min-w-0">
              <span className="font-semibold text-accent">Check-in · 30 s</span>
              <span className="text-muted"> · sono, energia, dor</span>
            </span>
          )}
          <span className="shrink-0 text-accent">›</span>
        </Link>
        <CardioResumo compacto />
      </div>

      {/* Atalho coach contextual */}
      <Link href="/coach" className="motion-press mb-2 flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-border px-4 py-2" data-testid="atalho-coach">
        <span className="min-w-0">
          <span className="block text-xs text-muted">Pergunta pro coach</span>
          <span className="block truncate text-sm font-semibold">{coachPergunta}</span>
        </span>
        <span className="text-accent">›</span>
      </Link>
    </main>
  );
}
