"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PastilleTerminal } from "@/components/ui";
import { appelApi, ErreurApi } from "@/lib/ui/client";

type TerminalUi = {
  id: string;
  libelle: string;
  etablissement: string;
  appaire: boolean;
  derniereSynchro: string | null;
  silencieux: boolean;
  versionApp: string | null;
  actif: boolean;
};

function etatDe(t: TerminalUi) {
  if (!t.actif) return "desactive" as const;
  if (!t.appaire) return "non-appaire" as const;
  return t.silencieux ? ("silencieux" as const) : ("connecte" as const);
}

export function Terminaux({ terminaux, etablissements }: { terminaux: TerminalUi[]; etablissements: { id: string; libelle: string }[] }) {
  const router = useRouter();
  const [code, setCode] = useState<{ libelle: string; code: string; expire: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setErreur(null);
    try {
      const r = await appelApi<{ terminal: { id: string; libelle: string } }>("/api/admin/terminaux", {
        method: "POST",
        json: { libelle: fd.get("libelle"), etablissement_id: fd.get("etablissement_id") },
      });
      form.reset();
      await genererCode(r.terminal.id, r.terminal.libelle);
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : "Création impossible.");
    }
  }

  async function genererCode(id: string, libelle: string) {
    setErreur(null);
    try {
      const r = await appelApi<{ code: string; expire_le: string }>(`/api/admin/terminaux/${id}/appairage`, { method: "POST" });
      setCode({ libelle, code: r.code, expire: r.expire_le });
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : "Génération impossible.");
    }
  }

  async function modifier(id: string, json: Record<string, unknown>) {
    await appelApi(`/api/admin/terminaux/${id}`, { method: "PATCH", json });
    router.refresh();
  }

  const minutesRestantes = code ? Math.max(0, Math.round((Date.parse(code.expire) - Date.now()) / 60_000)) : 0;

  return (
    <div className="flex flex-col gap-[18px]">
      {code && (
        <div className="encart-info flex flex-wrap items-center justify-between gap-6 p-[22px]">
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Code d'appairage · {code.libelle}
            </div>
            <div className="mono tabnum mt-2" style={{ fontSize: 56, fontWeight: 500, letterSpacing: "0.05em", lineHeight: 1.1 }}>
              {code.code}
            </div>
            <div className="tabnum mt-1.5 text-[13px]">
              Valable jusqu'à {new Date(code.expire).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} — dans {minutesRestantes} minute
              {minutesRestantes > 1 ? "s" : ""}. Saisissez-le sur l'écran d'appairage de la tablette.
            </div>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setCode(null)}>
            Masquer
          </button>
        </div>
      )}

      {erreur && <p className="text-sm" style={{ color: "var(--danger-ink)" }}>{erreur}</p>}

      <div className="flex flex-wrap items-start gap-5">
        <div className="card-plat min-w-0 flex-1 basis-[520px] overflow-x-auto">
          <table className="tbl" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Terminal</th>
                <th style={{ width: 130 }}>État</th>
                <th className="whitespace-nowrap" style={{ width: 130 }}>
                  Dernière synchro
                </th>
                <th style={{ width: 80 }}>Version</th>
                <th style={{ width: 268 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {terminaux.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center" style={{ color: "var(--muted)" }}>
                    Aucun terminal. Créez-en un avec le formulaire ci-contre.
                  </td>
                </tr>
              )}
              {terminaux.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="text-sm font-bold">{t.libelle}</div>
                    <div className="mono mt-0.5 text-[11px]" style={{ color: "var(--faint)" }}>
                      {t.etablissement}
                    </div>
                  </td>
                  <td>
                    <PastilleTerminal etat={etatDe(t)} />
                  </td>
                  <td className="tabnum text-[13px] whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {t.derniereSynchro
                      ? new Date(t.derniereSynchro).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </td>
                  <td className="mono text-xs" style={{ color: "var(--muted)" }}>
                    {t.versionApp ?? "—"}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {t.actif && (
                        <button type="button" className="btn-secondary btn-sm" onClick={() => void genererCode(t.id, t.libelle)}>
                          {t.appaire ? "Ré-appairer" : "Générer un code"}
                        </button>
                      )}
                      {t.appaire && t.actif && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          style={{ color: "var(--muted)" }}
                          onClick={() => {
                            if (confirm("Révoquer l'accès de cette tablette ? Elle devra être réappairée.")) void modifier(t.id, { revoquer: true });
                          }}
                        >
                          Révoquer
                        </button>
                      )}
                      <button
                        type="button"
                        className={t.actif ? "btn-danger btn-sm" : "btn-secondary btn-sm"}
                        onClick={() => void modifier(t.id, { actif: !t.actif, revoquer: t.actif })}
                      >
                        {t.actif ? "Désactiver" : "Réactiver"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={creer} className="card" style={{ flex: "0 1 320px", minWidth: 280 }}>
          <div className="titre-sm">Ajouter un terminal</div>
          <div className="mt-[18px] flex flex-col gap-3.5">
            <div>
              <label className="label" htmlFor="t-lib">
                Nom du terminal
              </label>
              <input id="t-lib" name="libelle" className="input" placeholder="Tablette cuisine" required />
            </div>
            <div>
              <label className="label" htmlFor="t-etab">
                Établissement
              </label>
              <select id="t-etab" name="etablissement_id" className="input" defaultValue={etablissements[0]?.id ?? ""} required>
                {etablissements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.libelle}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary">
              Créer et générer un code
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
