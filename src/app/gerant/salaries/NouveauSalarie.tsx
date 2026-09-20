"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconeCheck } from "@/components/icones";
import { appelApi, ErreurApi } from "@/lib/ui/client";

export function NouveauSalarie({ etablissements }: { etablissements: { id: string; libelle: string }[] }) {
  const router = useRouter();
  const [resultat, setResultat] = useState<{ nom: string; pin: string; id: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setErreur(null);
    setEnCours(true);
    try {
      const r = await appelApi<{ salarie: { id: string; nom: string; prenom: string }; pin_initial: string }>("/api/admin/salaries", {
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
      setResultat({ nom: `${r.salarie.prenom} ${r.salarie.nom}`, pin: r.pin_initial, id: r.salarie.id });
      form.reset();
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : "Création impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex basis-[330px] flex-col gap-4" style={{ flexGrow: 0, flexShrink: 1, minWidth: 290 }}>
      {resultat && (
        <div className="encart-ok flex items-start gap-3.5">
          <IconeCheck size={21} className="mt-0.5" />
          <div>
            <div className="text-[15px] font-bold">
              {resultat.nom} a été créé. PIN initial : <span className="mono tabnum text-[19px] tracking-[0.08em]">{resultat.pin}</span>
            </div>
            <div className="mt-1.5 text-sm" style={{ lineHeight: 1.5 }}>
              Notez-le maintenant, il ne sera plus affiché. Remettez-le en main propre avec le badge.
            </div>
            <a href={`/gerant/salaries/${resultat.id}/badge`} className="btn-secondary btn-sm mt-3">
              Imprimer le badge
            </a>
          </div>
        </div>
      )}

      <form onSubmit={soumettre} className="card">
        <div className="titre-sm">Nouveau salarié</div>
        <div className="mt-[18px] flex flex-col gap-3.5">
          <div>
            <label className="label" htmlFor="ns-prenom">
              Prénom
            </label>
            <input id="ns-prenom" name="prenom" className="input" placeholder="Inès" required />
          </div>
          <div>
            <label className="label" htmlFor="ns-nom">
              Nom
            </label>
            <input id="ns-nom" name="nom" className="input" placeholder="Fabre" required />
          </div>
          <div>
            <label className="label" htmlFor="ns-mat">
              Matricule
            </label>
            <input id="ns-mat" name="matricule" className="input mono" placeholder="SAL-005" />
          </div>
          <div>
            <label className="label" htmlFor="ns-email">
              Adresse e-mail (accès salarié, facultatif)
            </label>
            <input id="ns-email" name="email" type="email" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="ns-h">
              Durée contractuelle hebdomadaire
            </label>
            <input id="ns-h" name="contrat_heures_hebdo" type="number" step="0.5" min="0" max="60" defaultValue={35} className="input tabnum" />
          </div>
          <div>
            <label className="label" htmlFor="ns-etab">
              Établissement
            </label>
            <select id="ns-etab" name="etablissement_id" className="input" defaultValue={etablissements[0]?.id ?? ""}>
              {etablissements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ns-date">
              Date d'entrée
            </label>
            <input id="ns-date" name="date_entree" type="date" className="input tabnum" />
          </div>
          <p className="text-[13px]" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
            Un badge QR et un PIN à 4 chiffres sont générés à la création.
          </p>
          {erreur && <p className="text-sm" style={{ color: "var(--danger-ink)" }}>{erreur}</p>}
          <button type="submit" className="btn-primary" disabled={enCours}>
            {enCours ? "Création…" : "Créer le salarié"}
          </button>
        </div>
      </form>
    </div>
  );
}
