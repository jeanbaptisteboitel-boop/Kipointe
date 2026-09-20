"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconeTelecharger } from "@/components/icones";
import { appelApi, ErreurApi } from "@/lib/ui/client";

export function ActionsRecap({
  recapId,
  valide,
  terminee,
  nbOublis,
}: {
  recapId: string;
  valide: boolean;
  terminee: boolean;
  nbOublis: number;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  if (valide) {
    return (
      <a href={`/api/admin/recap/${recapId}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm w-max">
        <IconeTelecharger size={14} />
        PDF archivé
      </a>
    );
  }

  async function valider() {
    if (nbOublis > 0 && !confirm(`${nbOublis} oubli(s) de sortie non corrigé(s). Valider quand même ?`)) return;
    if (!confirm("Valider ce récapitulatif ? Il sera figé et archivé.")) return;
    setErreur(null);
    setEnCours(true);
    try {
      await appelApi(`/api/admin/recap/${recapId}/valider`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : "Validation impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn-primary btn-sm w-max" disabled={!terminee || enCours} onClick={() => void valider()}>
        {enCours ? "Génération…" : "Valider et archiver"}
      </button>
      {!terminee && (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Semaine en cours.
        </p>
      )}
      {erreur && (
        <p className="mt-2 text-xs" style={{ color: "var(--danger-ink)" }}>
          {erreur}
        </p>
      )}
    </div>
  );
}
