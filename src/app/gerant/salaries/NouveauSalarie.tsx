"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appelApi, ErreurApi } from "@/lib/ui/client";

export function NouveauSalarie({ etablissements }: { etablissements: { id: string; libelle: string }[] }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [resultat, setResultat] = useState<{ nom: string; pin: string; badge: string; id: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErreur(null);
    setEnCours(true);
    try {
      const r = await appelApi<{ salarie: { id: string; nom: string; prenom: string; badge_contenu: string }; pin_initial: string }>("/api/admin/salaries", {
        method: "POST",
        json: {
          nom: fd.get("nom"),
          prenom: fd.get("prenom"),
          matricule: fd.get("matricule") || null,
          email: fd.get("email") || null,
          etablissement_id: fd.get("etablissement_id") || null,
          contrat_heures_hebdo: Number(fd.get("contrat_heures_hebdo") || 35),
          date_entree: fd.get("date_entree") || null,
        },
      });
      setResultat({ nom: `${r.salarie.prenom} ${r.salarie.nom}`, pin: r.pin_initial, badge: r.salarie.badge_contenu, id: r.salarie.id });
      setOuvert(false);
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : "Création impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="space-y-3">
      {resultat && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-semibold text-emerald-900">
            {resultat.nom} créé. PIN initial : <span className="font-mono text-lg">{resultat.pin}</span>
          </p>
          <p className="mt-1 text-emerald-900">Notez ce PIN maintenant, il ne sera plus affiché. Remettez-le au salarié en main propre avec son badge.</p>
          <a href={`/gerant/salaries/${resultat.id}/badge`} className="btn-primary btn-sm mt-2">
            Imprimer le badge
          </a>
        </div>
      )}
      {!ouvert ? (
        <button type="button" className="btn-primary" onClick={() => setOuvert(true)}>
          + Nouveau salarié
        </button>
      ) : (
        <form onSubmit={soumettre} className="card grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Nom</label>
            <input name="nom" className="input" required />
          </div>
          <div>
            <label className="label">Prénom</label>
            <input name="prenom" className="input" required />
          </div>
          <div>
            <label className="label">Matricule</label>
            <input name="matricule" className="input" />
          </div>
          <div>
            <label className="label">Email (accès salarié, optionnel)</label>
            <input name="email" type="email" className="input" />
          </div>
          <div>
            <label className="label">Établissement</label>
            <select name="etablissement_id" className="input" defaultValue={etablissements[0]?.id ?? ""}>
              {etablissements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Heures hebdo (contrat)</label>
            <input name="contrat_heures_hebdo" type="number" step="0.5" min="0" max="60" defaultValue={35} className="input" />
          </div>
          <div>
            <label className="label">Date d'entrée</label>
            <input name="date_entree" type="date" className="input" />
          </div>
          {erreur && <p className="text-sm text-red-600 sm:col-span-3">{erreur}</p>}
          <div className="flex gap-2 sm:col-span-3">
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Création…" : "Créer et générer badge + PIN"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setOuvert(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
