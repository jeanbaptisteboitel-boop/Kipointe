"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appelApi, ErreurApi } from "@/lib/ui/client";

export function ActionsSalarie({ salarieId, actif, verrouille }: { salarieId: string; actif: boolean; verrouille: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function action(fn: () => Promise<string | null>) {
    setErreur(null);
    try {
      setMessage(await fn());
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : "Action impossible.");
    }
  }

  return (
    <div className="no-print flex flex-col items-end gap-2.5">
      <div className="flex flex-wrap justify-end gap-2.5">
        <a href={`/gerant/salaries/${salarieId}/badge`} className="btn-secondary btn-sm">
          Imprimer le badge
        </a>
        {verrouille && (
          <button
            type="button"
            className="btn-navy btn-sm"
            onClick={() =>
              void action(async () => {
                await appelApi(`/api/admin/salaries/${salarieId}/deverrouiller`, { method: "POST" });
                return "Badge déverrouillé.";
              })
            }
          >
            Déverrouiller
          </button>
        )}
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => {
            if (!confirm("Réinitialiser le PIN ? L'ancien code ne fonctionnera plus.")) return;
            void action(async () => {
              const r = await appelApi<{ pin: string }>(`/api/admin/salaries/${salarieId}/pin/reinitialiser`, { method: "POST" });
              return `Nouveau PIN : ${r.pin} — à remettre en main propre, il ne sera plus affiché.`;
            });
          }}
        >
          Réinitialiser le PIN
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => {
            if (!confirm("Régénérer le badge ? L'ancien badge devient immédiatement invalide.")) return;
            void action(async () => {
              await appelApi(`/api/admin/salaries/${salarieId}/badge/regenerer`, { method: "POST" });
              return "Badge régénéré : imprimez le nouveau badge.";
            });
          }}
        >
          Régénérer le badge
        </button>
        <button
          type="button"
          className={actif ? "btn-danger btn-sm" : "btn-secondary btn-sm"}
          onClick={() => {
            if (!confirm(actif ? "Marquer ce salarié comme sorti ? Son badge sera refusé." : "Réactiver ce salarié ?")) return;
            void action(async () => {
              await appelApi(`/api/admin/salaries/${salarieId}`, {
                method: "PATCH",
                json: actif ? { actif: false, date_sortie: new Date().toISOString().slice(0, 10) } : { actif: true, date_sortie: null },
              });
              return actif ? "Salarié marqué sorti." : "Salarié réactivé.";
            });
          }}
        >
          {actif ? "Marquer sorti" : "Réactiver"}
        </button>
      </div>
      {message && (
        <p className="max-w-sm rounded-lg px-3 py-2 text-right text-[13px]" style={{ background: "var(--success-bg)", color: "var(--success-ink)" }}>
          {message}
        </p>
      )}
      {erreur && (
        <p className="text-[13px]" style={{ color: "var(--danger-ink)" }}>
          {erreur}
        </p>
      )}
    </div>
  );
}
