"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconeCheck, IconeTelecharger } from "@/components/icones";
import type { DetailHeuresSup } from "@/db/schema";
import { formatDuree } from "@/lib/temps/journee";
import { appelApi, ErreurApi } from "@/lib/ui/client";

/** Récapitulatif hebdomadaire : décompte, validation, archive scellée. */
export function CarteRecap({
  recap,
  terminee,
  totalMinutes,
  dureeReference,
  heuresSup,
  nbCorrections,
  nbSaisiesManuelles,
  nbHorsLigne,
  nbAnomaliesOuvertes,
  nbOublis,
  semaineLabel,
}: {
  recap: { id: string; valideLe: string | null; hash: string | null };
  terminee: boolean;
  totalMinutes: number;
  dureeReference: number;
  heuresSup: DetailHeuresSup;
  nbCorrections: number;
  nbSaisiesManuelles: number;
  nbHorsLigne: number;
  nbAnomaliesOuvertes: number;
  nbOublis: number;
  semaineLabel: string;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function valider() {
    if (nbOublis > 0 && !confirm(`${nbOublis} oubli(s) de sortie non corrigé(s) : les heures correspondantes ne seront pas comptées. Valider quand même ?`)) return;
    if (!confirm("Valider ce récapitulatif ? Il sera figé, archivé en PDF scellé et ne pourra plus être modifié.")) return;
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

  const lignes: [string, string, boolean?][] = [
    ["Total travaillé", formatDuree(totalMinutes), true],
    ["Durée de référence", formatDuree(dureeReference)],
    ...heuresSup.filter((h) => h.minutes > 0).map((h): [string, string, boolean] => [`H. sup. à ${h.taux} %`, formatDuree(h.minutes), true]),
    ["Corrections tracées", String(nbCorrections)],
    ["Saisies manuelles", String(nbSaisiesManuelles)],
    ["Pointages hors ligne", String(nbHorsLigne)],
  ];

  return (
    <div className="card no-print" style={{ flex: "0 1 320px", minWidth: 280 }}>
      <div className="titre-sm">Récapitulatif hebdomadaire</div>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
        Article D.3171-8 du Code du travail. À valider et archiver chaque semaine.
      </p>

      <div className="mt-[18px] overflow-hidden rounded-[10px]" style={{ border: "1px solid var(--line-portal)" }}>
        {lignes.map(([cle, valeur, fort], i) => (
          <div key={cle} className="flex justify-between px-3.5 py-[11px]" style={{ background: i % 2 === 0 ? "var(--bg-portal)" : "#fff" }}>
            <span className="text-[13px]" style={{ color: "var(--muted)" }}>
              {cle}
            </span>
            <span className={`tabnum text-sm ${fort ? "font-bold" : "font-semibold"}`}>{valeur}</span>
          </div>
        ))}
        {nbAnomaliesOuvertes > 0 && (
          <div className="flex justify-between px-3.5 py-[11px]" style={{ background: "var(--warn-bg)" }}>
            <span className="text-[13px]" style={{ color: "var(--warn-ink)" }}>
              Anomalie{nbAnomaliesOuvertes > 1 ? "s" : ""} ouverte{nbAnomaliesOuvertes > 1 ? "s" : ""}
            </span>
            <span className="tabnum text-sm font-bold" style={{ color: "var(--warn-ink)" }}>
              {nbAnomaliesOuvertes}
            </span>
          </div>
        )}
      </div>

      {recap.valideLe ? (
        <div className="mt-[18px]">
          <div className="flex items-center gap-2 text-[13px] font-bold" style={{ color: "var(--success-ink)" }}>
            <IconeCheck size={15} />
            Semaine {semaineLabel} archivée
          </div>
          <div className="tabnum mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
            Validée le {new Date(recap.valideLe).toLocaleString("fr-FR")}
          </div>
          {recap.hash && (
            <div className="mono mt-2.5 rounded-lg p-2.5 text-[10px] break-all" style={{ background: "var(--bg-portal)", color: "var(--muted)", lineHeight: 1.5 }}>
              SHA-256 · {recap.hash}
            </div>
          )}
          <a href={`/api/admin/recap/${recap.id}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm mt-3">
            <IconeTelecharger size={15} />
            Télécharger le PDF archivé
          </a>
        </div>
      ) : (
        <div className="mt-[18px]">
          <button type="button" className="btn-primary w-full" disabled={!terminee || enCours} onClick={() => void valider()}>
            {enCours ? "Génération du PDF…" : "Valider et archiver"}
          </button>
          <p className="mt-3 text-xs" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
            {terminee
              ? "Une anomalie ouverte n'empêche pas la validation, mais elle est reportée sur le PDF."
              : "La semaine n'est pas terminée : la validation s'ouvre le lundi suivant."}
          </p>
          {erreur && (
            <p className="mt-2 text-[13px]" style={{ color: "var(--danger-ink)" }}>
              {erreur}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
