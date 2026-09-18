"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appelApi, ErreurApi } from "@/lib/ui/client";

export function Etablissements({ etablissements }: { etablissements: { id: string; libelle: string; adresse: string | null; timezone: string }[] }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setErreur(null);
    try {
      await appelApi("/api/admin/etablissements", {
        method: "POST",
        json: { libelle: fd.get("libelle"), adresse: fd.get("adresse") || null, timezone: fd.get("timezone") || "Europe/Paris" },
      });
      form.reset();
      setOuvert(false);
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : "Création impossible.");
    }
  }

  return (
    <section className="card">
      <div className="kicker">Établissements (lieux de pointage)</div>
      <div className="mt-4 overflow-hidden rounded-[10px]" style={{ border: "1px solid var(--line-portal)" }}>
        {etablissements.map((e, i) => (
          <div key={e.id} className="flex items-center justify-between gap-4 px-4 py-3" style={{ background: i % 2 === 0 ? "var(--bg-portal)" : "#fff" }}>
            <div>
              <div className="text-sm font-bold">{e.libelle}</div>
              <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                {e.adresse ? `${e.adresse} · ` : ""}
                {e.timezone}
              </div>
            </div>
          </div>
        ))}
        {etablissements.length === 0 && (
          <div className="px-4 py-3 text-sm" style={{ color: "var(--muted)" }}>
            Aucun établissement.
          </div>
        )}
      </div>

      {ouvert ? (
        <form onSubmit={creer} className="mt-4 flex flex-wrap items-end gap-3">
          <div style={{ flex: "1 1 180px" }}>
            <label className="label" htmlFor="e-lib">
              Libellé
            </label>
            <input id="e-lib" name="libelle" className="input" placeholder="Annexe — rive gauche" required />
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label className="label" htmlFor="e-adr">
              Adresse
            </label>
            <input id="e-adr" name="adresse" className="input" placeholder="4 av. Jean Jaurès, 76100 Rouen" />
          </div>
          <div style={{ flex: "0 1 170px" }}>
            <label className="label" htmlFor="e-tz">
              Fuseau
            </label>
            <input id="e-tz" name="timezone" className="input" defaultValue="Europe/Paris" />
          </div>
          <button type="submit" className="btn-navy btn-sm h-[42px]">
            Ajouter
          </button>
          <button type="button" className="btn-secondary btn-sm h-[42px]" onClick={() => setOuvert(false)}>
            Annuler
          </button>
        </form>
      ) : (
        <button type="button" className="btn-dashed btn-sm mt-3.5 w-max" onClick={() => setOuvert(true)}>
          + Ajouter un établissement
        </button>
      )}
      {erreur && <p className="mt-2 text-sm" style={{ color: "var(--danger-ink)" }}>{erreur}</p>}
    </section>
  );
}
