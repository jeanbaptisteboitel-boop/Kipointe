"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appelApi, ErreurApi } from "@/lib/ui/client";

type TerminalUi = { id: string; libelle: string; etablissement: string; appaire: boolean; derniereSynchro: string | null; silencieux: boolean; versionApp: string | null; actif: boolean };

export function Terminaux({ terminaux, etablissements }: { terminaux: TerminalUi[]; etablissements: { id: string; libelle: string }[] }) {
  const router = useRouter();
  const [code, setCode] = useState<{ id: string; code: string; expire: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErreur(null);
    try {
      await appelApi("/api/admin/terminaux", { method: "POST", json: { libelle: fd.get("libelle"), etablissement_id: fd.get("etablissement_id") } });
      e.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : "Création impossible.");
    }
  }

  async function genererCode(id: string) {
    setErreur(null);
    try {
      const r = await appelApi<{ code: string; expire_le: string }>(`/api/admin/terminaux/${id}/appairage`, { method: "POST" });
      setCode({ id, code: r.code, expire: r.expire_le });
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : "Génération impossible.");
    }
  }

  async function modifier(id: string, json: Record<string, unknown>) {
    await appelApi(`/api/admin/terminaux/${id}`, { method: "PATCH", json });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={creer} className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Libellé</label>
          <input name="libelle" className="input" placeholder="Tablette cuisine" required />
        </div>
        <div>
          <label className="label">Établissement</label>
          <select name="etablissement_id" className="input" defaultValue={etablissements[0]?.id ?? ""} required>
            {etablissements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.libelle}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary">
          + Ajouter un terminal
        </button>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      </form>

      {code && (
        <div className="rounded-lg border border-cyan-300 bg-cyan-50 p-4">
          <p className="text-sm text-slate-700">Code d'appairage à saisir sur la tablette (expire à {new Date(code.expire).toLocaleTimeString("fr-FR")}) :</p>
          <p className="mt-1 font-mono text-4xl font-bold tracking-widest text-[var(--navy)]">{code.code}</p>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Terminal</th>
              <th>Établissement</th>
              <th>État</th>
              <th>Dernière synchro</th>
              <th>Version</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {terminaux.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">
                  Aucun terminal.
                </td>
              </tr>
            )}
            {terminaux.map((t) => (
              <tr key={t.id}>
                <td className="font-medium">{t.libelle}</td>
                <td>{t.etablissement}</td>
                <td>
                  {!t.actif ? (
                    <span className="badge bg-slate-200 text-slate-700">désactivé</span>
                  ) : !t.appaire ? (
                    <span className="badge bg-slate-100 text-slate-700">non appairé</span>
                  ) : t.silencieux ? (
                    <span className="badge bg-red-100 text-red-800">silencieux</span>
                  ) : (
                    <span className="badge bg-emerald-100 text-emerald-800">connecté</span>
                  )}
                </td>
                <td className="text-xs">{t.derniereSynchro ? new Date(t.derniereSynchro).toLocaleString("fr-FR") : "—"}</td>
                <td className="text-xs">{t.versionApp ?? "—"}</td>
                <td className="flex justify-end gap-1">
                  {t.actif && (
                    <button type="button" className="btn-primary btn-sm" onClick={() => void genererCode(t.id)}>
                      {t.appaire ? "Ré-appairer" : "Générer un code"}
                    </button>
                  )}
                  {t.appaire && t.actif && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        if (confirm("Révoquer l'accès de cette tablette ? Elle devra être réappairée.")) void modifier(t.id, { revoquer: true });
                      }}
                    >
                      Révoquer
                    </button>
                  )}
                  <button type="button" className={t.actif ? "btn-danger btn-sm" : "btn-secondary btn-sm"} onClick={() => void modifier(t.id, { actif: !t.actif, revoquer: t.actif })}>
                    {t.actif ? "Désactiver" : "Réactiver"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
