"use client";

import { useSyncExternalStore } from "react";

function assinar(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Selo "Offline": só aparece sem internet (antes ficava fixo na tela, mesmo online). */
export function StatusConexao() {
  const online = useSyncExternalStore(assinar, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <span className="pill-offline" role="status" title="Sem internet: o que você registrar fica guardado neste aparelho e sobe quando a conexão voltar.">
      Offline
    </span>
  );
}
