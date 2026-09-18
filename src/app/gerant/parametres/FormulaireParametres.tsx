"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconeCheck } from "@/components/icones";
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

const PRESETS: Record<"legal" | "hcr", { seuilHeures: number; taux: number }[]> = {
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

const CONVENTIONS = [
  "HCR — Hôtels, cafés, restaurants (IDCC 1979)",
  "Coiffure (IDCC 2596)",
  "Services de l'automobile (IDCC 1090)",
  "Bâtiment — ouvriers (IDCC 1596)",
  "Transports routiers (IDCC 16)",
  "Commerce de détail (IDCC 1517)",
];

function memeParliers(a: { seuilHeures: number; taux: number }[], b: { seuilHeures: number; taux: number }[]) {
  return a.length === b.length && a.every((p, i) => p.seuilHeures === b[i]!.seuilHeures && p.taux === b[i]!.taux);
}

export function FormulaireParametres({ organisation }: { organisation: Valeurs }) {
  const router = useRouter();
  const [v, setV] = useState<Valeurs>(organisation);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setErreur(null);
    setEnCours(true);
    try {
      await appelApi("/api/admin/organisation", { method: "PATCH", json: v });
      setMessage("Paramètres enregistrés.");
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : "Enregistrement impossible.");
    } finally {
      setEnCours(false);
    }
  }

  const petit = "h-[38px] w-[74px] rounded-[9px] border bg-white px-2 text-center text-[13px] tabnum";
  const stylePetit = { borderColor: "var(--line-portal)", color: "var(--ink)" };

  /** Un seuil exprimé en minutes dans la base, saisi en heures : « 11 h » se lit mieux que « 660 min ». */
  const seuilEnHeures = (cle: keyof Valeurs, libelle: string) => (
    <div className="flex items-center gap-3">
      <label className="flex-1 text-[13px]" style={{ color: "var(--muted)" }} htmlFor={`p-${cle}`}>
        {libelle}
      </label>
      <div className="flex flex-none items-center gap-2">
        <input
          id={`p-${cle}`}
          type="number"
          step={0.25}
          min={0}
          className={petit}
          style={stylePetit}
          value={String(Number(v[cle]) / 60)}
          onChange={(e) => setV({ ...v, [cle]: Math.round(Number(e.target.value) * 60) })}
        />
        <span className="w-6 text-[13px]" style={{ color: "var(--muted)" }}>
          h
        </span>
      </div>
    </div>
  );

  const seuilEnMinutes = (cle: keyof Valeurs, libelle: string, unite: string) => (
    <div className="flex items-center gap-3">
      <label className="flex-1 text-[13px]" style={{ color: "var(--muted)" }} htmlFor={`p-${cle}`}>
        {libelle}
      </label>
      <div className="flex flex-none items-center gap-2">
        <input
          id={`p-${cle}`}
          type="number"
          step={1}
          min={0}
          className={petit}
          style={stylePetit}
          value={String(v[cle])}
          onChange={(e) => setV({ ...v, [cle]: Number(e.target.value) })}
        />
        <span className="w-6 text-[13px]" style={{ color: "var(--muted)" }}>
          {unite}
        </span>
      </div>
    </div>
  );

  return (
    <form onSubmit={soumettre} className="flex flex-col gap-[18px]">
      <div className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))" }}>
        <section className="card">
          <div className="kicker">Entreprise</div>
          <div className="mt-4 flex flex-col gap-3.5">
            <div>
              <label className="label" htmlFor="p-rs">
                Raison sociale
              </label>
              <input id="p-rs" className="input" value={v.raison_sociale} onChange={(e) => setV({ ...v, raison_sociale: e.target.value })} required />
            </div>
            <div>
              <label className="label" htmlFor="p-siret">
                SIRET
              </label>
              <input id="p-siret" className="input tabnum" value={v.siret} onChange={(e) => setV({ ...v, siret: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="p-cc">
                Convention collective
              </label>
              <input
                id="p-cc"
                className="input"
                list="conventions"
                value={v.convention_collective}
                onChange={(e) => setV({ ...v, convention_collective: e.target.value })}
                placeholder="HCR — Hôtels, cafés, restaurants (IDCC 1979)"
              />
              <datalist id="conventions">
                {CONVENTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="kicker">Heures supplémentaires</div>
            <div className="flex gap-2">
              {(["legal", "hcr"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="rounded-full px-3 py-[5px] text-xs font-bold"
                  style={
                    memeParliers(v.paliers_heures_sup, PRESETS[k])
                      ? { background: "var(--navy)", color: "#fff", border: "1px solid var(--navy)" }
                      : { background: "#fff", color: "var(--muted)", border: "1px solid var(--line-portal)" }
                  }
                  onClick={() => setV({ ...v, paliers_heures_sup: PRESETS[k].map((p) => ({ ...p })) })}
                >
                  {k === "legal" ? "Légal" : "HCR"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <div>
              <label className="label" htmlFor="p-ref">
                Durée hebdomadaire de référence
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="p-ref"
                  type="number"
                  step="0.5"
                  min={0}
                  max={60}
                  className={petit}
                  style={stylePetit}
                  value={String(v.duree_hebdo_reference)}
                  onChange={(e) => setV({ ...v, duree_hebdo_reference: Number(e.target.value) })}
                />
                <span className="text-[13px]" style={{ color: "var(--muted)" }}>
                  h / semaine
                </span>
              </div>
            </div>
            {v.paliers_heures_sup.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-[13px]" style={{ color: "var(--muted)" }}>
                <span className="whitespace-nowrap">Au-delà de</span>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  className={petit}
                  style={stylePetit}
                  aria-label={`Seuil du palier ${i + 1}, en heures`}
                  value={String(p.seuilHeures)}
                  onChange={(e) =>
                    setV({ ...v, paliers_heures_sup: v.paliers_heures_sup.map((x, j) => (j === i ? { ...x, seuilHeures: Number(e.target.value) } : x)) })
                  }
                />
                <span>h&nbsp;:</span>
                <input
                  type="number"
                  min={0}
                  max={200}
                  className={petit}
                  style={stylePetit}
                  aria-label={`Majoration du palier ${i + 1}, en pourcent`}
                  value={String(p.taux)}
                  onChange={(e) => setV({ ...v, paliers_heures_sup: v.paliers_heures_sup.map((x, j) => (j === i ? { ...x, taux: Number(e.target.value) } : x)) })}
                />
                <span>%</span>
                <button
                  type="button"
                  className="ml-auto flex h-7 w-7 flex-none items-center justify-center rounded-full text-base"
                  style={{ border: "1px solid var(--line-portal)", background: "#fff", color: "var(--muted)" }}
                  disabled={v.paliers_heures_sup.length <= 1}
                  aria-label={`Supprimer le palier ${i + 1}`}
                  onClick={() => setV({ ...v, paliers_heures_sup: v.paliers_heures_sup.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-dashed btn-sm w-max"
              onClick={() => setV({ ...v, paliers_heures_sup: [...v.paliers_heures_sup, { seuilHeures: 48, taux: 50 }] })}
            >
              + Ajouter un palier
            </button>
          </div>
        </section>

        <section className="card">
          <div className="kicker">Seuils d'alerte</div>
          <div className="mt-4 flex flex-col gap-3">
            {seuilEnHeures("repos_quotidien_min", "Repos quotidien minimum")}
            {seuilEnHeures("repos_hebdo_min", "Repos hebdomadaire minimum")}
            {seuilEnHeures("pause_obligatoire_apres", "Pause obligatoire après")}
            {seuilEnMinutes("pause_duree_min", "Durée minimale de la pause", "min")}
            {seuilEnHeures("amplitude_max", "Amplitude quotidienne maximale")}
          </div>
          <p className="mt-3.5 text-xs" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
            Ces seuils génèrent des alertes ; ils ne bloquent jamais un pointage.
          </p>
        </section>

        <section className="card">
          <div className="kicker">Pointage</div>
          <div className="mt-4 flex flex-col gap-3">
            {seuilEnMinutes("journee_debut_heure", "Début de la journée de pointage", "h")}
            {seuilEnMinutes("anti_doublon_secondes", "Refus d'un second scan sous", "s")}
          </div>
          <p className="mt-3.5 text-xs" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
            Un service qui finit à 01:30 est rattaché à la journée de la veille : c'est le rôle du début de journée à 04:00.
          </p>
        </section>
      </div>

      {message && (
        <p className="encart-ok flex items-center gap-2 py-3 text-sm font-semibold">
          <IconeCheck size={16} /> {message}
        </p>
      )}
      {erreur && <p className="text-sm" style={{ color: "var(--danger-ink)" }}>{erreur}</p>}

      <div>
        <button type="submit" className="btn-primary" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer les paramètres"}
        </button>
      </div>
    </form>
  );
}
