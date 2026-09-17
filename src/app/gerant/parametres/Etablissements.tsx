"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appelApi, ErreurApi } from "@/lib/ui/client";

export function Etablissements({ etablissements }: { etablissements: { id: string; libelle: string; adresse: string | null; timezone: string }[] }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  async function creer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErreur(null);
    try {
      await appelApi("/api/admin/etablissements", { method: "POST", json: { libelle: fd.get("libelle"), adresse: fd.get("adresse") || null, timezone: fd.get("timezone") || "Europe/Paris" } });
      e.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : "Création impossible.");
    }
  }
  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Établissements (lieux de pointage)</h2>
      <ul className="text-sm">
        {etablissements.map((e) => (
          <li key={e.id} className="border-b border-slate-100 py-1">
            <span className="font-medium">{e.libelle}</span> {e.adresse ? `· ${e.adresse}` : ""} <span className="text-slate-500">· {e.timezone}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={creer} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Libellé</label>
          <input name="libelle" className="input" required />
        </div>
        <div>
          <label className="label">Adresse</label>
          <input name="adresse" className="input" />
        </div>
        <div>
          <label className="label">Fuseau</label>
          <input name="timezone" className="input" defaultValue="Europe/Paris" />
        </div>
        <button type="submit" className="btn-secondary">
          + Ajouter
        </button>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      </form>
    </div>
  );
}
