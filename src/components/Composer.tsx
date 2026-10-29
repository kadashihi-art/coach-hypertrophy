"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { COMPOSER_PLACEHOLDER, mensagemEnviavel } from "@/lib/chat-input";

/**
 * Composer do coach: textarea largo, visível, multilinha com auto-grow; enviar compacto (ícone).
 * Enter envia (Shift+Enter quebra linha). Desabilitado se texto trimado < 2 caracteres.
 */
export function Composer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = COMPOSER_PLACEHOLDER,
  label,
  podeEnviarSemTexto = false,
  leading,
  maxLength = 2000,
  className = "",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: (texto: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Rótulo visível acima do campo (ex.: "Escreve do seu jeito"). */
  label?: string;
  /** ex.: anexo de mídia presente */
  podeEnviarSemTexto?: boolean;
  leading?: ReactNode;
  maxLength?: number;
  className?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const pode = !disabled && (mensagemEnviavel(value) || podeEnviarSemTexto);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  function enviar() {
    if (!pode) return;
    onSend(value.trim());
  }

  return (
    <div className={className}>
      {label ? <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">{label}</p> : null}
      <form
        className="flex items-end gap-2 rounded-2xl border border-[rgba(245,245,240,.28)] bg-[#151515] p-1.5 focus-within:border-accent/70"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        {leading}
        <textarea
          ref={ref}
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              enviar();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          autoFocus={autoFocus}
          aria-label={label ?? "Mensagem pro coach"}
          className="max-h-[180px] min-h-[52px] min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] leading-snug text-bone-50 outline-none placeholder:text-bone-300/70"
        />
        <button
          type="submit"
          aria-label="Enviar"
          disabled={!pode}
          className="motion-press mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-ink-950 disabled:bg-ink-800 disabled:text-faint"
        >
          <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
          </svg>
        </button>
      </form>
    </div>
  );
}
