"use client";
/**
 * Cronômetro de descanso do logger (pill sticky no rodapé).
 * Tempo vem de endAt (timestamp) persistido em localStorage — continua certo em background.
 * Fim: vibração + bip curto (WebAudio) + flash. Tela bloqueada: notificação via service worker
 * (Notification Triggers onde existir; senão o SW tenta agendar enquanto estiver vivo).
 */
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  PASSO_AJUSTE_S,
  REST_STORAGE_KEY,
  ajustar,
  formatar,
  iniciar,
  progresso,
  pular,
  restanteSeg,
  retomar,
  serializar,
  type FaseSerie,
  type RestTimerState,
} from "@/lib/treino/rest-timer";

function semMovimento(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

let audioCtx: AudioContext | null = null;
/** Precisa ser chamado num gesto (ex.: registrar série) pro iOS liberar o áudio. */
function destravarAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audioCtx ??= new AC();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    /* sem áudio */
  }
}
function bip() {
  const ctx = audioCtx;
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    [0, 0.18].forEach((d, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = i ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(t + d);
      o.stop(t + d + 0.18);
    });
  } catch {
    /* ignore */
  }
}
function vibrar() {
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    /* ignore */
  }
}

async function swPost(msg: unknown) {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage(msg);
  } catch {
    /* ignore */
  }
}
function podeNotificar(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}
function agendarAviso(t: RestTimerState | null) {
  if (!t || t.pulado || !podeNotificar()) {
    void swPost({ type: "rest-cancel" });
    return;
  }
  void swPost({ type: "rest-schedule", endAt: t.endAt, title: "Descanso acabou", body: "Bora pra próxima série 💪" });
}

export function useRestTimer() {
  const [timer, setTimer] = useState<RestTimerState | null>(null);
  const [agora, setAgora] = useState(0);
  const avisado = useRef<number | null>(null);

  // Retoma do localStorage ao montar / voltar pro app
  useEffect(() => {
    const ler = () => {
      setTimer(retomar(localStorage.getItem(REST_STORAGE_KEY)));
      setAgora(Date.now());
    };
    ler();
    const onVis = () => document.visibilityState === "visible" && ler();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const salvar = useCallback((t: RestTimerState | null) => {
    const raw = serializar(t);
    if (raw) localStorage.setItem(REST_STORAGE_KEY, raw);
    else localStorage.removeItem(REST_STORAGE_KEY);
    setTimer(t);
    setAgora(Date.now());
    agendarAviso(t);
  }, []);

  const ativo = !!timer && !timer.pulado && timer.endAt > agora;
  useEffect(() => {
    if (!timer || timer.pulado) return;
    const id = window.setInterval(() => setAgora(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [timer]);

  // Fim natural: vibra + bip uma vez por endAt
  useEffect(() => {
    if (!timer || timer.pulado || timer.endAt > agora || avisado.current === timer.endAt) return;
    avisado.current = timer.endAt;
    if (agora - timer.endAt < 5000) {
      vibrar();
      bip();
    }
  }, [timer, agora]);

  return {
    timer,
    agora,
    ativo,
    iniciar: (seg: number, fase: FaseSerie) => {
      destravarAudio();
      avisado.current = null;
      salvar(iniciar(seg, fase));
    },
    mais: () => timer && salvar(ajustar(timer, PASSO_AJUSTE_S)),
    menos: () => timer && salvar(ajustar(timer, -PASSO_AJUSTE_S)),
    pular: () => timer && salvar(pular(timer)),
    fechar: () => salvar(null),
  };
}

export function RestTimerPill({ rt }: { rt: ReturnType<typeof useRestTimer> }) {
  const { timer, agora } = rt;
  const [perm, setPerm] = useState<NotificationPermission | "indisponivel">("indisponivel");
  useEffect(() => {
    const id = requestAnimationFrame(() => setPerm(typeof Notification === "undefined" ? "indisponivel" : Notification.permission));
    return () => cancelAnimationFrame(id);
  }, []);
  if (!timer) return null;
  const seg = restanteSeg(timer, agora);
  const fim = seg === 0;
  const reta = !fim && seg <= 5;
  const p = progresso(timer, agora);
  const rm = semMovimento();
  const cls = ["rt-pill", fim ? "rt-fim" : "", reta ? "rt-reta" : "", rm ? "rt-rm" : ""].join(" ");
  // portal no body: ancestrais com transform (motion-fade-up) quebram position:fixed
  return (
    <>
      <div aria-hidden className="rt-spacer" />
      {createPortal(
      <div className={cls} role="timer" aria-live={fim || reta ? "assertive" : "off"} aria-label={fim ? "Descanso acabou" : `Descanso: faltam ${seg} segundos`}>
        {fim && !rm ? <span key={timer.endAt} aria-hidden className="rt-burst" /> : null}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-muted">{fim ? (timer.pulado ? "Descanso encerrado" : "Descanso acabou — bora!") : timer.rotulo}</p>
            <p key={reta ? seg : "t"} className="rt-tempo num">{fim ? "0:00" : formatar(seg)}</p>
          </div>
          {fim ? (
            <button type="button" onClick={rt.fechar} className="rt-btn rt-btn-main">Ok</button>
          ) : (
            <div className="flex gap-1.5">
              <button type="button" onClick={rt.menos} className="rt-btn" aria-label="Tirar 15 segundos">−15s</button>
              <button type="button" onClick={rt.mais} className="rt-btn" aria-label="Somar 15 segundos">+15s</button>
              <button type="button" onClick={rt.pular} className="rt-btn rt-btn-main">Pular</button>
            </div>
          )}
        </div>
        <div className="rt-track" aria-hidden>
          <div className="rt-fill" style={{ "--rt-p": p } as CSSProperties} />
        </div>
        {perm === "default" && !fim ? (
          <button
            type="button"
            className="mt-1.5 text-[11px] font-semibold text-accent underline-offset-2 hover:underline"
            onClick={async () => {
              try {
                const r = await Notification.requestPermission();
                setPerm(r);
                if (r === "granted") agendarAviso(timer);
              } catch {
                /* ignore */
              }
            }}
          >
            Me avisar mesmo com a tela bloqueada
          </button>
        ) : null}
      </div>
      , document.body)}
    </>
  );
}
