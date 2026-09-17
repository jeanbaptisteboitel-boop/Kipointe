"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appelApi, ErreurApi } from "@/lib/ui/client";

export function ValidationRecap({ recap, terminee, nbOublis }: { recap: { id: string; valideLe: string | null; hash: string | null }; terminee: boolean; nbOublis: number }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function valider() {
    if (nbOublis > 0 && !confirm(`${nbOublis} oubli(s) de sortie non corrigé(s) : les heures correspondantes ne seront pas comptées. Valider quand même ?`)) return;
    if (!confirm("Valider ce récapitulatif ? Il sera figé, archivé en PDF (Object Lock) et ne pourra plus être modifié.")) return;
    setErreur(null);
    setEnCours(true);
    try {
      await appelApi(`/api/admin/recap/${recap.id}/valider`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : "Validation impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="card no-print">
      <h2 className="mb-2 font-semibold">Récapitulatif hebdomadaire</h2>
      {recap.valideLe ? (
        <div className="space-y-2 text-sm">
          <p className="text-emerald-800">Validé le {new Date(recap.valideLe).toLocaleString("fr-FR")}.</p>
          <p className="font-mono text-xs break-all text-slate-500">SHA-256 : {recap.hash}</p>
          <a href={`/api/admin/recap/${recap.id}/pdf`} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
            Télécharger le PDF archivé
          </a>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-slate-600">{terminee ? "Semaine terminée : vous pouvez figer le récap (article D.3171-8)." : "La semaine n'est pas terminée."}</p>
          <button type="button" className="btn-primary btn-sm" disabled={!terminee || enCours} onClick={() => void valider()}>
            {enCours ? "Génération du PDF…" : "Valider et archiver"}
          </button>
          {erreur && <p className="text-red-600">{erreur}</p>}
        </div>
      )}
    </div>
  );
}
