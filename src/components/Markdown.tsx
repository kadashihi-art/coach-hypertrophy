"use client";
/** Markdown básico e seguro: **negrito**, *itálico*, quebras de linha, listas curtas. Sem HTML cru. */
import { Fragment, type ReactNode } from "react";

function inline(t: string, k: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  let last = 0;
  let i = 0;
  for (const m of t.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(t.slice(last, idx));
    const s = m[0];
    if (s.startsWith("**") || s.startsWith("__")) out.push(<strong key={`${k}b${i++}`} className="font-semibold">{s.slice(2, -2)}</strong>);
    else out.push(<em key={`${k}i${i++}`}>{s.slice(1, -1)}</em>);
    last = idx + s.length;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/^\s{0,3}#{1,6}\s+/, ""));
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      const k = `p${blocks.length}`;
      blocks.push(<p key={k}>{para.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, `${k}-${j}`)}</Fragment>)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `l${blocks.length}`;
      const items = list.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>);
      blocks.push(list.ordered ? <ol key={k} className="list-decimal space-y-0.5 pl-5">{items}</ol> : <ul key={k} className="list-disc space-y-0.5 pl-5">{items}</ul>);
      list = null;
    }
  };
  for (const l of lines) {
    const ul = l.match(/^\s*[-*•]\s+(.*)$/);
    const ol = l.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((ul ?? ol)![1]);
    } else if (!l.trim()) { flushPara(); flushList(); }
    else { flushList(); para.push(l); }
  }
  flushPara(); flushList();
  return <div className={`space-y-2 ${className}`}>{blocks}</div>;
}
