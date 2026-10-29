"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VISAO_UI } from "@/lib/flags";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Badge } from "@/components/ui";
import { buildCoachContext } from "@/lib/llm/coach-context";
import type { GrupoMuscular } from "@/lib/domain";
import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { AJUSTAR_PLANO_HREF } from "@/lib/nav";
import { Composer } from "@/components/Composer";
import { mensagemEnviavel } from "@/lib/chat-input";
import {
  MIDIA_LIMITES,
  comprimirImagem,
  dataUrlBytes,
  extrairFramesVideo,
  type FrameExtraido,
} from "@/lib/media/client-media";

type Anexo = {
  tipo: "imagem" | "video";
  frames: FrameExtraido[];
  duracao_seg?: number;
  nome: string;
  bytes: number;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  stubHint?: boolean;
  thumbs?: string[];
  cta?: { label: string; href: string } | null;
};

const GRUPOS: GrupoMuscular[] = [
  "peito",
  "costas",
  "ombros",
  "biceps",
  "triceps",
  "quadriceps",
  "isquiotibiais",
  "gluteos",
];

const SUGGESTS = [
  "Por que esse split e não outro?",
  "Por que essa carga?",
  "Como está meu peito esta semana?",
  "Devo deload?",
];

export default function CoachPage() {
  const { state, ready } = useApp();
  const router = useRouter();
  const [grupo, setGrupo] = useState<GrupoMuscular | undefined>(undefined);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Olá — sou seu coach. Pergunte qualquer coisa de treino, técnica, recuperação ou objetivos; uso seu histórico e o racional do seu plano quando ajuda. Kg quem decide é o motor.",
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [anexo, setAnexo] = useState<Anexo | null>(null);
  const [prep, setPrep] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      if (file.type.startsWith("image/")) {
        setPrep("Comprimindo foto…");
        let url = await comprimirImagem(file);
        if (dataUrlBytes(url) > 1_100_000) url = await comprimirImagem(file, 1024, 0.7);
        setAnexo({ tipo: "imagem", frames: [{ data_url: url }], nome: file.name || "foto", bytes: dataUrlBytes(url) });
      } else if (file.type.startsWith("video/")) {
        setPrep(`Extraindo ${MIDIA_LIMITES.video_frames} frames do vídeo…`);
        let r = await extrairFramesVideo(file);
        let total = r.frames.reduce((a, f) => a + dataUrlBytes(f.data_url), 0);
        if (total > MIDIA_LIMITES.payload_max_mb * 1024 * 1024 * 0.9) {
          r = await extrairFramesVideo(file, MIDIA_LIMITES.video_frames, 560, 0.55);
          total = r.frames.reduce((a, f) => a + dataUrlBytes(f.data_url), 0);
        }
        if (total > MIDIA_LIMITES.payload_max_mb * 1024 * 1024) throw new Error("Frames grandes demais mesmo comprimidos.");
        setAnexo({ tipo: "video", frames: r.frames, duracao_seg: r.duracao_seg, nome: file.name || "vídeo", bytes: total });
      } else {
        throw new Error("Formato não suportado — envie imagem ou vídeo.");
      }
    } catch (e) {
      setAnexo(null);
      setError(e instanceof Error ? e.message : "Falha ao preparar mídia");
    } finally {
      setPrep(null);
      if (fileRef.current) fileRef.current.value = "";
      if (camRef.current) camRef.current.value = "";
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (!state.perfil?.onboarding_concluido) {
      router.replace("/onboarding");
    }
  }, [ready, state.perfil, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  const contextoPreview = useMemo(() => {
    if (!ready) return null;
    return buildCoachContext(state, { grupo });
  }, [ready, state, grupo]);

  async function send(text: string) {
    const midia = anexo;
    const mensagem =
      text.trim() ||
      (midia ? (midia.tipo === "video" ? "Analisa a técnica desse vídeo da minha execução." : "Analisa a técnica nessa foto.") : "");
    if (!mensagem || busy || prep) return;
    if (!midia && !mensagemEnviavel(mensagem)) return; // evita "C" acidental
    setError(null);
    setInput("");
    setAnexo(null);
    const userMsg: ChatMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      content: midia ? `${mensagem}\n📎 ${midia.tipo === "video" ? `vídeo ${Math.round(midia.duracao_seg ?? 0)} s · ${midia.frames.length} frames` : "foto"}` : mensagem,
      ...(midia ? { thumbs: midia.frames.slice(0, 4).map((f) => f.data_url) } : {}),
    };
    setMsgs((m) => [...m, userMsg]);
    setBusy(true);

    const historico = [...msgs, userMsg]
      .filter((m) => m.id !== "welcome")
      .slice(-8)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const contexto = buildCoachContext(state, {
      grupo,
      mensagem,
    });

    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensagem,
          grupo,
          historico,
          contexto,
          ...(midia
            ? { midia: { tipo: midia.tipo, frames: midia.frames, ...(midia.duracao_seg ? { duracao_seg: midia.duracao_seg } : {}) } }
            : {}),
        }),
      });
      const json = (await res.json()) as {
        mensagem_usuario?: string;
        cta?: { label: string; href: string } | null;
        error?: string;
        errors?: string[];
      };
      if (!res.ok) {
        throw new Error(
          json.error ||
            json.errors?.join("; ") ||
            `Falha ${res.status}`,
        );
      }
      const reply =
        json.mensagem_usuario?.trim() ||
        "Sem mensagem do coach — tente de novo.";
      setMsgs((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: reply,
          cta: json.cta ?? null,
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro";
      setError(msg);
      setMsgs((m) => [
        ...m,
        {
          id: `a-err-${Date.now()}`,
          role: "assistant",
          content:
            "Não consegui responder agora. Seu plano e o histórico continuam intactos — tente de novo em instantes.",
          stubHint: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <main className="px-4 pb-28 pt-6">
        <p className="text-sm text-muted">Carregando…</p>
      </main>
    );
  }

  const nEst = contextoPreview?.estados.length ?? 0;
  const nVol = contextoPreview?.volumes_semanais.length ?? 0;
  const hasCk = Boolean(contextoPreview?.checkin_hoje);

  return (
    <main className="flex min-h-dvh flex-col px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-4">
      <header className="mb-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight text-bone-50">
            Coach
          </h1>
          <Badge tone="accent">Coach PhD · treino geral</Badge>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted">
          Contexto: 4–8 sem + estado + check-in
          {grupo ? ` · foco ${grupo}` : ""}.{" "}
          <span className="text-faint">
            {nEst} estado(s) · {nVol} vol · check-in{" "}
            {hasCk ? "hoje" : "—"}
          </span>
        </p>
      </header>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setGrupo(undefined)}
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${
            !grupo
              ? "bg-accent text-ink-950"
              : "bg-white/5 text-muted"
          }`}
        >
          Geral
        </button>
        {GRUPOS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGrupo(g)}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold capitalize ${
              grupo === g
                ? "bg-accent text-ink-950"
                : "bg-white/5 text-muted"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto">
        {msgs.map((m) => (
          <div
            key={m.id}
            className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              m.role === "user"
                ? "ml-auto bg-accent/20 text-bone-50"
                : "mr-auto bg-card text-bone-50 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
            }`}
          >
            {VISAO_UI && m.thumbs?.length ? (
              <div className="mb-1.5 flex gap-1">
                {m.thumbs.map((t, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={t} alt="" className="h-14 w-14 rounded-lg object-cover" />
                ))}
              </div>
            ) : null}
            {m.role === "assistant" ? <Markdown text={m.content} /> : <div className="whitespace-pre-wrap">{m.content}</div>}
            {m.role === "assistant" && m.cta ? (
              <Link href={m.cta.href || AJUSTAR_PLANO_HREF} className="mt-2 inline-block rounded-full bg-accent/20 px-3 py-1 text-[11px] font-semibold text-accent">
                {m.cta.label} →
              </Link>
            ) : null}
          </div>
        ))}
        {busy && (
          <div className="mr-auto rounded-2xl bg-card px-3.5 py-2.5 text-sm text-muted">
            {anexo === null && msgs[msgs.length - 1]?.thumbs ? "Analisando a execução (pode levar ~30–60 s)…" : "Pensando com o seu histórico…"}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => send(s)}
            className="rounded-full border border-border bg-ink-900 px-3 py-1.5 text-[11px] font-medium text-bone-200 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {(anexo || prep) && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-ink-900 p-2 text-[11px] text-bone-200">
          {prep ? (
            <span>{prep}</span>
          ) : anexo ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={anexo.frames[0].data_url} alt="" className="h-10 w-10 rounded object-cover" />
              <span className="flex-1">
                {anexo.tipo === "video"
                  ? `Vídeo ${anexo.duracao_seg} s → ${anexo.frames.length} frames`
                  : "Foto"}{" "}
                · {(anexo.bytes / 1024).toFixed(0)} KB enviados
              </span>
              <button type="button" onClick={() => setAnexo(null)} className="px-2 text-muted">
                ✕
              </button>
            </>
          ) : null}
        </div>
      )}
      {VISAO_UI ? (<>
      <p className="mt-2 text-[10px] text-faint">
        Mídia: foto até {MIDIA_LIMITES.imagem_max_mb} MB (reduzida a {MIDIA_LIMITES.imagem_max_px}px) · vídeo até{" "}
        {MIDIA_LIMITES.video_max_seg} s e {MIDIA_LIMITES.video_max_mb} MB ({MIDIA_LIMITES.video_frames} frames extraídos no aparelho; o vídeo não é enviado nem salvo).
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <input
        ref={camRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      </>) : null}
      <Composer
        className="sticky bottom-0 mt-3 rounded-2xl bg-[rgba(5,5,5,.96)] pt-1 backdrop-blur-xl"
        value={input}
        onChange={setInput}
        onSend={(t) => void send(t)}
        disabled={busy || !!prep}
        podeEnviarSemTexto={VISAO_UI && !!anexo}
        placeholder={VISAO_UI && anexo ? "O que quer que eu olhe? (opcional)" : "Pergunta qualquer coisa: treino, carga, dor, rotina. Eu te digo a real"}
        leading={
          VISAO_UI ? (
            <>
        <button
          type="button"
          aria-label="Anexar foto ou vídeo"
          disabled={busy || !!prep}
          onClick={() => fileRef.current?.click()}
          className="min-h-11 shrink-0 rounded-xl bg-ink-800 px-3 text-base disabled:opacity-50"
        >
          📎
        </button>
        <button
          type="button"
          aria-label="Câmera"
          disabled={busy || !!prep}
          onClick={() => camRef.current?.click()}
          className="min-h-11 shrink-0 rounded-xl bg-ink-800 px-3 text-base disabled:opacity-50"
        >
          📷
        </button>
            </>
          ) : null
        }
      />
    </main>
  );
}
