"use client";

import { useState } from "react";
import { ajouterRendezVous } from "@/app/actions/rendezvous";
import { Messages, useAction } from "@/components/client";

const OBJETS = ["Visite médicale (médecine du travail)", "Entretien avec la direction", "Entretien professionnel", "Formation"];

export function FormulaireRendezVous({ salarieId, aujourdhui }: { salarieId: string; aujourdhui: string }) {
  const vide = { intitule: "", jour: "", heure: "", precision: "" };
  const [s, setS] = useState(vide);
  const a = useAction();
  const champ = (cle: keyof typeof vide) => ({ value: s[cle], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [cle]: e.target.value }) });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        a.lancer(
          () => ajouterRendezVous({ salarieId, ...s }),
          () => {
            setS(vide);
            return "Rendez-vous enregistré : il sera rappelé au salarié à chaque pointage, trente jours avant.";
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">Objet</span>
          <input className="input" required maxLength={80} list="objets-rendez-vous" placeholder="Visite médicale (médecine du travail)" {...champ("intitule")} />
          <datalist id="objets-rendez-vous">
            {OBJETS.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </label>
        <label>
          <span className="label">Date</span>
          <input className="input" type="date" required min={aujourdhui} {...champ("jour")} />
        </label>
        <label>
          <span className="label">Heure (facultatif)</span>
          <input className="input" type="time" {...champ("heure")} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Précision (facultatif)</span>
          <input className="input" maxLength={200} placeholder="Lieu, document à apporter…" {...champ("precision")} />
        </label>
      </div>
      <Messages erreur={a.erreur} info={a.info} />
      <div>
        <button type="submit" className="btn-primary btn-sm" disabled={a.enCours}>
          Ajouter le rendez-vous
        </button>
      </div>
    </form>
  );
}
