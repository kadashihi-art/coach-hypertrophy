"use client";

import { useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Button, Card } from "@/components/ui";
import { gerarBackup, lerBackup, nomeDoArquivo, resumoDoEstado, type ResumoBackup } from "@/lib/backup";
import { hojeIsoSaoPaulo } from "@/lib/plan/proxima-sessao";
import type { AppState } from "@/lib/domain";

const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "nenhum");

function Resumo({ r }: { r: ResumoBackup }) {
  return (
    <span>
      {r.treinos_feitos} {r.treinos_feitos === 1 ? "treino feito" : "treinos feitos"} · {r.series} {r.series === 1 ? "série" : "séries"} · último treino: {ddmm(r.ultimo_treino)}
    </span>
  );
}

/**
 * Exportar e importar seus dados. Lê e grava só neste aparelho, então funciona mesmo com o servidor
 * fora do ar. Importar troca os dados deste aparelho só depois do "Substituir".
 */
export function BackupDados({ soImportar = false, aoImportar }: { soImportar?: boolean; aoImportar?: () => void } = {}) {
  const { state, importarDados } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, setPendente] = useState<{ state: AppState; resumo: ResumoBackup; exportado_em: string | null } | null>(null);

  async function exportar() {
    setAviso(null);
    const texto = gerarBackup(state);
    const nome = nomeDoArquivo(hojeIsoSaoPaulo());
    const arquivo = new File([texto], nome, { type: "application/json" });
    // No celular, a folha de compartilhar deixa salvar em Arquivos, Drive ou mandar pra você mesmo.
    try {
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], title: "Cópia do Coach Hypertrophy" });
        setAviso("Cópia pronta. Guarde o arquivo num lugar seguro (Arquivos, Drive ou e-mail).");
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setAviso(`Baixei o arquivo ${nome}. Guarde num lugar seguro.`);
  }

  async function escolherArquivo(f: File | undefined) {
    setAviso(null);
    setPendente(null);
    if (!f) return;
    const r = lerBackup(await f.text());
    if (!r.ok) {
      setAviso(r.erro);
      return;
    }
    setPendente({ state: r.state, resumo: r.resumo, exportado_em: r.exportado_em });
  }

  const atual = resumoDoEstado(state);

  return (
    <section data-testid="backup-dados" aria-label="Cópia dos seus dados">
      <Card className="mb-3">
        <p className="text-sm font-semibold">{soImportar ? "Já usava o app?" : "Cópia dos seus dados"}</p>
        <p className="mt-1 text-xs text-muted">
          {soImportar
            ? "Importe a cópia que você exportou (Perfil → Exportar meus dados) e continue de onde parou, sem refazer o cadastro."
            : "Leva seu histórico pra outro aparelho ou outro endereço do app. Funciona mesmo sem o servidor."}
        </p>
        {soImportar ? null : (
          <p className="mt-2 text-xs text-muted">
            Neste aparelho: <Resumo r={atual} />
          </p>
        )}
        <div className="mt-3 flex gap-2">
          {soImportar ? null : (
            <Button className="min-h-11 flex-1 text-sm" data-testid="exportar-dados" onClick={() => void exportar()}>
              Exportar meus dados
            </Button>
          )}
          <Button variant="ghost" className="min-h-11 flex-1 text-sm" data-testid="importar-dados" onClick={() => inputRef.current?.click()}>
            {soImportar ? "Importar cópia" : "Importar"}
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="arquivo-backup"
          onChange={(e) => {
            void escolherArquivo(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {pendente ? (
          <div className="mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs" data-testid="confirmar-importar">
            <p className="font-semibold text-bone-50">Substituir os dados deste aparelho por esta cópia?</p>
            <p className="mt-1 text-muted">
              Cópia{pendente.exportado_em ? ` de ${ddmm(hojeIsoSaoPaulo(Date.parse(pendente.exportado_em)))}` : ""}: <Resumo r={pendente.resumo} />
            </p>
            <p className="mt-1 text-muted">
              Agora: <Resumo r={atual} />
            </p>
            <p className="mt-1 text-warn">O que está neste aparelho e não está na cópia some. Se tiver dúvida, exporte antes.</p>
            <div className="mt-3 flex gap-2">
              <Button
                className="min-h-11 flex-1 text-sm"
                data-testid="substituir-dados"
                onClick={() => {
                  importarDados(pendente.state);
                  setPendente(null);
                  setAviso("Pronto: os dados da cópia estão neste aparelho.");
                  aoImportar?.();
                }}
              >
                Substituir
              </Button>
              <Button variant="ghost" className="min-h-11 flex-1 text-sm" onClick={() => setPendente(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
        {aviso ? <p role="status" className="mt-2 text-xs text-muted">{aviso}</p> : null}
      </Card>
    </section>
  );
}
