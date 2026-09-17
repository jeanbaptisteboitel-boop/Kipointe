"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appelApi, ErreurApi } from "@/lib/ui/client";

type PointageUi = { id: string; horodatage: string; libelle: string; type: string; typeLibelle: string; source: string; corrige: boolean; motif: string | null };

/** Convertit un instant en valeur `datetime-local` exprimée dans le fuseau de l'établissement. */
function versLocal(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour").replace("24", "00")}:${g("minute")}`;
}

/** Convertit une valeur `datetime-local` (fuseau établissement) en ISO UTC. */
function versIso(local: string, tz: string): string {
  const [date, heure] = local.split("T") as [string, string];
  const [a, m, j] = date.split("-").map(Number) as [number, number, number];
  const [h, mn] = heure.split(":").map(Number) as [number, number];
  for (const offsetH of [-14, -12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
    const candidat = new Date(Date.UTC(a, m - 1, j, h - offsetH, mn));
    if (versLocal(candidat.toISOString(), tz) === local) return candidat.toISOString();
  }
  return new Date(Date.UTC(a, m - 1, j, h, mn)).toISOString();
}

const TYPES = ["ENTREE", "SORTIE", "DEBUT_PAUSE", "FIN_PAUSE"] as const;
const LIBELLES: Record<string, string> = { ENTREE: "Entrée", SORTIE: "Sortie", DEBUT_PAUSE: "Début de pause", FIN_PAUSE: "Fin de pause" };

export function Corrections({ pointages, timezone }: { pointages: PointageUi[]; timezone: string }) {
  const router = useRouter();
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function corriger(id: string, fd: FormData) {
    setErreur(null);
    const annule = fd.get("annule") === "on";
    const local = String(fd.get("horodatage") ?? "");
    try {
      await appelApi(`/api/admin/pointage/${id}/corriger`, {
        method: "POST",
        json: {
          nouvelle_valeur: annule ? { annule: true } : { horodatage: versIso(local, timezone), type: fd.get("type") },
          motif: fd.get("motif"),
        },
      });
      setEnEdition(null);
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? (err.code === "DONNEES_INVALIDES" ? "Motif obligatoire (5 caractères minimum)." : err.message) : "Correction impossible.");
    }
  }

  if (pointages.length === 0) return <p className="text-sm text-slate-500">Aucun pointage cette semaine.</p>;

  return (
    <div>
      <table className="table">
        <thead>
          <tr>
            <th>Moment</th>
            <th>Type</th>
            <th>Source</th>
            <th>Motif</th>
            <th className="no-print"></th>
          </tr>
        </thead>
        <tbody>
          {pointages.map((p) => (
            <tr key={p.id} className={p.corrige ? "bg-blue-50/50" : ""}>
              <td className="tabular-nums">{p.libelle}</td>
              <td>{p.typeLibelle}</td>
              <td className="text-xs text-slate-600">
                {p.source}
                {p.corrige && <span className="badge ml-1 bg-blue-100 text-blue-800">corrigé</span>}
              </td>
              <td className="text-xs text-slate-600">{p.motif ?? ""}</td>
              <td className="no-print text-right">
                <button type="button" className="btn-secondary btn-sm" onClick={() => setEnEdition(enEdition === p.id ? null : p.id)}>
                  Corriger
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {enEdition && (
        <form
          className="no-print mt-3 grid gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void corriger(enEdition, new FormData(e.currentTarget));
          }}
        >
          {(() => {
            const p = pointages.find((x) => x.id === enEdition)!;
            return (
              <>
                <div>
                  <label className="label">Nouvel horodatage</label>
                  <input name="horodatage" type="datetime-local" className="input" defaultValue={versLocal(p.horodatage, timezone)} />
                </div>
                <div>
                  <label className="label">Type</label>
                  <select name="type" className="input" defaultValue={p.type}>
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {LIBELLES[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <input id="annule" name="annule" type="checkbox" />
                  <label htmlFor="annule" className="text-sm">
                    Annuler ce pointage
                  </label>
                </div>
                <div className="sm:col-span-4">
                  <label className="label">Motif (obligatoire, conservé avec la correction)</label>
                  <input name="motif" className="input" required minLength={5} placeholder="Ex. : sortie oubliée, confirmée par le chef de rang" />
                </div>
                {erreur && <p className="text-sm text-red-600 sm:col-span-4">{erreur}</p>}
                <div className="flex gap-2 sm:col-span-4">
                  <button type="submit" className="btn-primary btn-sm">
                    Enregistrer la correction
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setEnEdition(null)}>
                    Annuler
                  </button>
                </div>
              </>
            );
          })()}
        </form>
      )}
    </div>
  );
}

export function SaisieManuelle({ salarieId, timezone }: { salarieId: string; timezone: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErreur(null);
    try {
      await appelApi("/api/admin/pointage", {
        method: "POST",
        json: { salarie_id: salarieId, horodatage: versIso(String(fd.get("horodatage")), timezone), type: fd.get("type"), motif: fd.get("motif") },
      });
      setOuvert(false);
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? (err.code === "DONNEES_INVALIDES" ? "Motif obligatoire (5 caractères minimum)." : err.message) : "Saisie impossible.");
    }
  }

  if (!ouvert)
    return (
      <button type="button" className="btn-secondary btn-sm no-print" onClick={() => setOuvert(true)}>
        + Ajouter un pointage manquant (saisie manuelle tracée)
      </button>
    );
  return (
    <form onSubmit={soumettre} className="no-print grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
      <div>
        <label className="label">Horodatage</label>
        <input name="horodatage" type="datetime-local" className="input" required />
      </div>
      <div>
        <label className="label">Type</label>
        <select name="type" className="input" defaultValue="SORTIE">
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {LIBELLES[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Motif (obligatoire)</label>
        <input name="motif" className="input" required minLength={5} />
      </div>
      {erreur && <p className="text-sm text-red-600 sm:col-span-4">{erreur}</p>}
      <div className="flex gap-2 sm:col-span-4">
        <button type="submit" className="btn-primary btn-sm">
          Enregistrer
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOuvert(false)}>
          Annuler
        </button>
      </div>
    </form>
  );
}
