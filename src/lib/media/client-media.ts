/**
 * Mídia no cliente (browser): comprime imagem e extrai frames de vídeo via <video>+<canvas>.
 * Nada de vídeo bruto vai para a função (limite de body Vercel ~4,5 MB).
 */
export const MIDIA_LIMITES = {
  imagem_max_mb: 15,
  imagem_max_px: 1280,
  imagem_qualidade: 0.82,
  video_max_mb: 100,
  video_max_seg: 60,
  video_frames: 8,
  video_frame_max_px: 768,
  video_frame_qualidade: 0.72,
  payload_max_mb: 3.8,
} as const;

export type FrameExtraido = { data_url: string; t_seg?: number };

function canvasToJpeg(src: CanvasImageSource, w: number, h: number, maxPx: number, q: number): string {
  const scale = Math.min(1, maxPx / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(src, 0, 0, cw, ch);
  return c.toDataURL("image/jpeg", q);
}

export function dataUrlBytes(u: string): number {
  const i = u.indexOf(",");
  return Math.floor(((u.length - i - 1) * 3) / 4);
}

export async function comprimirImagem(file: File, maxPx: number = MIDIA_LIMITES.imagem_max_px, q: number = MIDIA_LIMITES.imagem_qualidade): Promise<string> {
  if (file.size > MIDIA_LIMITES.imagem_max_mb * 1024 * 1024) {
    throw new Error(`Imagem acima de ${MIDIA_LIMITES.imagem_max_mb} MB.`);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Não consegui ler a imagem (formato não suportado?)."));
      img.src = url;
    });
    return canvasToJpeg(img, img.naturalWidth, img.naturalHeight, maxPx, q);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function extrairFramesVideo(
  file: File,
  n: number = MIDIA_LIMITES.video_frames,
  maxPx: number = MIDIA_LIMITES.video_frame_max_px,
  q: number = MIDIA_LIMITES.video_frame_qualidade,
): Promise<{ frames: FrameExtraido[]; duracao_seg: number }> {
  if (file.size > MIDIA_LIMITES.video_max_mb * 1024 * 1024) {
    throw new Error(`Vídeo acima de ${MIDIA_LIMITES.video_max_mb} MB.`);
  }
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error("Não consegui ler o vídeo (codec não suportado no navegador?)."));
    });
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    if (!dur) throw new Error("Duração do vídeo desconhecida.");
    if (dur > MIDIA_LIMITES.video_max_seg + 0.5) {
      throw new Error(`Vídeo com ${Math.round(dur)} s — máximo ${MIDIA_LIMITES.video_max_seg} s. Corte só a série.`);
    }
    const frames: FrameExtraido[] = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(dur - 0.05, ((i + 0.5) / n) * dur);
      await new Promise<void>((res, rej) => {
        const to = setTimeout(() => rej(new Error("Timeout extraindo frame.")), 8000);
        v.onseeked = () => {
          clearTimeout(to);
          res();
        };
        v.currentTime = Math.max(0, t);
      });
      frames.push({ data_url: canvasToJpeg(v, v.videoWidth, v.videoHeight, maxPx, q), t_seg: Math.round(t * 10) / 10 });
    }
    return { frames, duracao_seg: Math.round(dur * 10) / 10 };
  } finally {
    URL.revokeObjectURL(url);
  }
}
