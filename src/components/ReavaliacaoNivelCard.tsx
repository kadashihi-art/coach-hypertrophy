"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Button, Card } from "@/components/ui";
import { avaliarNivel, resumoMudancaNivel, silencioAte } from "@/lib/nivel/reavaliacao";
import { gerarPlanoFromPerfil } from "@/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "@/lib/catalog/exercicios";

/**
 * Cartão de reavaliação de nível. Quem decide é o código determinístico (avaliarNivel);
 * aqui só mostra. Nada é salvo sem o usuário tocar em "Confirmar e remontar".
 */
export function ReavaliacaoNivelCard() {
  const { state, ready, updatePerfil, updatePerfilAndRemount } = useApp();
  const [etapa, setEtapa] = useState<"cartao" | "resumo" | "salvando" | "feito">("cartao");
  const [erro, setErro] = useState<string | null>(null);
  const av = useMemo(() => (ready ? avaliarNivel(state) : null), [ready, state]);
  const sug = av?.sugestao ?? null;

  const resumo = useMemo(() => {
    if (!sug || !state.perfil) return [] as string[];
    try {
      const cat = state.exercicios.length ? state.exercicios : CATALOG_EXERCICIOS;
      const antes = gerarPlanoFromPerfil({ ...state.perfil, experiencia: sug.de }, cat);
      const depois = gerarPlanoFromPerfil({ ...state.perfil, experiencia: sug.para }, cat);
      return resumoMudancaNivel({ de: sug.de, para: sug.para, antes, depois });
    } catch {
      return resumoMudancaNivel({ de: sug.de, para: sug.para, antes: { sessoes: [] }, depois: { sessoes: [] } });
    }
  }, [sug, state.perfil, state.exercicios]);

  if (etapa === "feito") {
    return (
      <Card className="mb-4 border border-go/30 text-sm" >
        <p className="font-semibold text-go" data-testid="nivel-feito">✅ Plano remontado</p>
        <p className="mt-1 text-bone-50/90">Seu novo plano já está valendo a partir do próximo treino. Suas cargas continuam as mesmas.</p>
      </Card>
    );
  }
  if (!sug || !state.perfil || state.active_sessao_id) return null;

  const confirmar = async () => {
    setEtapa("salvando");
    setErro(null);
    const r = await updatePerfilAndRemount(
      { experiencia: sug.para, nivel_mudado_em: new Date().toISOString(), nivel_silenciado_ate: null },
      { skipLlm: true },
    );
    if (r.ok) setEtapa("feito");
    else { setErro(r.error ?? "Não consegui remontar agora. Tenta de novo em instantes."); setEtapa("resumo"); }
  };

  return (
    <Card className="mb-4 border border-accent/30 text-sm" >
      <div data-testid="nivel-card">
        <p className="flex items-center gap-2 font-semibold text-accent">
          <span role="img" aria-label="Sugestão">{sug.direcao === "subir" ? "📈" : "🧭"}</span>
          <span>{sug.titulo}</span>
        </p>
        <p className="mt-1 text-bone-50/90">{sug.frase}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-bone-50/85">
          {sug.motivos.map((m) => <li key={m}>{m}</li>)}
        </ul>
        {etapa === "cartao" ? (
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" onClick={() => setEtapa("resumo")}>Mudar meu plano</Button>
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => updatePerfil({ nivel_silenciado_ate: silencioAte() })}
            >
              Agora não
            </Button>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3" data-testid="nivel-resumo">
            <p className="mb-1 font-semibold">O que muda</p>
            <ul className="list-disc space-y-1 pl-5 text-bone-50/85">
              {resumo.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <p className="mt-2 text-xs text-muted">Nada muda até você confirmar.</p>
            {erro ? <p className="mt-2 text-xs text-danger">{erro}</p> : null}
            <div className="mt-3 flex gap-2">
              <Button className="flex-1" disabled={etapa === "salvando"} onClick={confirmar}>
                {etapa === "salvando" ? "Remontando…" : "Confirmar e remontar"}
              </Button>
              <Button variant="ghost" className="flex-1" disabled={etapa === "salvando"} onClick={() => setEtapa("cartao")}>Voltar</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
