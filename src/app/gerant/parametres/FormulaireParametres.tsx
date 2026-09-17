"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appelApi, ErreurApi } from "@/lib/ui/client";

type Valeurs = {
  raison_sociale: string;
  siret: string;
  convention_collective: string;
  duree_hebdo_reference: number;
  paliers_heures_sup: { seuilHeures: number; taux: number }[];
  repos_quotidien_min: number;
  repos_hebdo_min: number;
  pause_obligatoire_apres: number;
  pause_duree_min: number;
  amplitude_max: number;
  journee_debut_heure: number;
  anti_doublon_secondes: number;
};

const PRESETS: Record<string, { seuilHeures: number; taux: number }[]> = {
  legal: [
    { seuilHeures: 35, taux: 25 },
    { seuilHeures: 43, taux: 50 },
  ],
  hcr: [
    { seuilHeures: 35, taux: 10 },
    { seuilHeures: 39, taux: 20 },
    { seuilHeures: 43, taux: 50 },
  ],
};

export function FormulaireParametres({ organisation }: { organisation: Valeurs }) {
  const router = useRouter();
  const [v, setV] = useState<Valeurs>(organisation);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setErreur(null);
    try {
      await appelApi("/api/admin/organisation", { method: "PATCH", json: v });
      setMessage("Paramètres enregistrés.");
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : "Enregistrement impossible.");
    }
  }

  const champ = (cle: keyof Valeurs, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={String(v[cle] ?? "")} onChange={(e) => setV({ ...v, [cle]: props.type === "number" ? Number(e.target.value) : e.target.value })} {...props} />
    </div>
  );

  return (
    <form onSubmit={soumettre} className="card space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {champ("raison_sociale", "Raison sociale", { required: true })}
        {champ("siret", "SIRET")}
        {champ("convention_collective", "Convention collective", { placeholder: "HCR (IDCC 1979)" })}
      </div>

      <fieldset className="space-y-3">
        <legend className="font-semibold">Heures supplémentaires</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {champ("duree_hebdo_reference", "Durée hebdo de référence (h)", { type: "number", step: "0.5", min: 0, max: 60 })}
          <div className="sm:col-span-2">
            <label className="label">Paliers de majoration</label>
            <div className="space-y-2">
              {v.paliers_heures_sup.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span>au-delà de</span>
                  <input type="number" step="0.5" className="input w-24" value={p.seuilHeures} onChange={(e) => setV({ ...v, paliers_heures_sup: v.paliers_heures_sup.map((x, j) => (j === i ? { ...x, seuilHeures: Number(e.target.value) } : x)) })} />
                  <span>h :</span>
                  <input type="number" className="input w-20" value={p.taux} onChange={(e) => setV({ ...v, paliers_heures_sup: v.paliers_heures_sup.map((x, j) => (j === i ? { ...x, taux: Number(e.target.value) } : x)) })} />
                  <span>%</span>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setV({ ...v, paliers_heures_sup: v.paliers_heures_sup.filter((_, j) => j !== i) })} disabled={v.paliers_heures_sup.length <= 1}>
                    ×
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary btn-sm" onClick={() => setV({ ...v, paliers_heures_sup: [...v.paliers_heures_sup, { seuilHeures: 48, taux: 50 }] })}>
                  + palier
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setV({ ...v, paliers_heures_sup: PRESETS.legal! })}>
                  Légal (25 % / 50 %)
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setV({ ...v, paliers_heures_sup: PRESETS.hcr! })}>
                  HCR (10 % / 20 % / 50 %)
                </button>
              </div>
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold">Alertes (générées, jamais bloquantes)</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {champ("repos_quotidien_min", "Repos quotidien minimal (min)", { type: "number", min: 0 })}
          {champ("repos_hebdo_min", "Repos hebdomadaire minimal (min)", { type: "number", min: 0 })}
          {champ("amplitude_max", "Amplitude quotidienne max (min)", { type: "number", min: 0 })}
          {champ("pause_obligatoire_apres", "Pause obligatoire après (min de travail continu)", { type: "number", min: 0 })}
          {champ("pause_duree_min", "Durée minimale de la pause (min)", { type: "number", min: 0 })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold">Pointage</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {champ("journee_debut_heure", "Début de journée de pointage (heure locale)", { type: "number", min: 0, max: 23 })}
          {champ("anti_doublon_secondes", "Anti-rebond : refus d'un second scan sous (s)", { type: "number", min: 0, max: 600 })}
        </div>
        <p className="text-xs text-slate-500">Un pointage avant l'heure de début de journée (04:00 par défaut) est rattaché à la veille : utile pour les services de nuit.</p>
      </fieldset>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <button type="submit" className="btn-primary">
        Enregistrer
      </button>
    </form>
  );
}
