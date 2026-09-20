"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PastilleCorrige } from "@/components/ui";
import { appelApi, ErreurApi } from "@/lib/ui/client";

type PointageUi = {
  id: string;
  horodatage: string;
  jour: string;
  heure: string;
  type: string;
  typeLibelle: string;
  source: string;
  corrige: boolean;
  motif: string | null;
};

const TYPES = ["ENTREE", "SORTIE", "DEBUT_PAUSE", "FIN_PAUSE"] as const;
const LIBELLES: Record<string, string> = { ENTREE: "Entrée", SORTIE: "Sortie", DEBUT_PAUSE: "Début de pause", FIN_PAUSE: "Fin de pause" };

/** Instant ISO → valeur `datetime-local` dans le fuseau de l'établissement. */
function versLocal(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour").replace("24", "00")}:${g("minute")}`;
}

/** Valeur `datetime-local` (fuseau établissement) → ISO UTC. */
function versIso(local: string, tz: string): string {
  const [date, heure] = local.split("T") as [string, string];
  const [a, m, j] = date.split("-").map(Number) as [number, number, number];
  const [h, mn] = heure.split(":").map(Number) as [number, number];
  for (let offsetH = -14; offsetH <= 14; offsetH++) {
    const candidat = new Date(Date.UTC(a, m - 1, j, h - offsetH, mn));
    if (versLocal(candidat.toISOString(), tz) === local) return candidat.toISOString();
  }
  return new Date(Date.UTC(a, m - 1, j, h, mn)).toISOString();
}

export function Pointages({ salarieId, pointages, timezone }: { salarieId: string; pointages: PointageUi[]; timezone: string }) {
  const router = useRouter();
  const [formulaires, setFormulaires] = useState(false);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function messageErreur(err: unknown, defaut: string) {
    if (err instanceof ErreurApi) return err.code === "DONNEES_INVALIDES" ? "Motif obligatoire (5 caractères minimum)." : err.message;
    return defaut;
  }

  async function corriger(id: string, fd: FormData) {
    setErreur(null);
    const annule = fd.get("annule") === "on";
    try {
      await appelApi(`/api/admin/pointage/${id}/corriger`, {
        method: "POST",
        json: {
          nouvelle_valeur: annule ? { annule: true } : { horodatage: versIso(String(fd.get("horodatage")), timezone), type: fd.get("type") },
          motif: fd.get("motif"),
        },
      });
      setEnEdition(null);
      router.refresh();
    } catch (err) {
      setErreur(messageErreur(err, "Correction impossible."));
    }
  }

  async function ajouter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setErreur(null);
    try {
      await appelApi("/api/admin/pointage", {
        method: "POST",
        json: {
          salarie_id: salarieId,
          horodatage: versIso(String(fd.get("horodatage")), timezone),
          type: fd.get("type"),
          motif: fd.get("motif"),
        },
      });
      form.reset();
      router.refresh();
    } catch (err) {
      setErreur(messageErreur(err, "Saisie impossible."));
    }
  }

  const champ = "h-10 rounded-[10px] border bg-white px-3 text-[13px]";
  const styleChamp = { borderColor: "var(--line-portal)", color: "var(--ink)" };

  return (
    <div className="card-plat overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] py-4" style={{ borderBottom: "1px solid var(--line-portal)" }}>
        <span className="titre-sm">Pointages de la semaine ({pointages.length})</span>
        <button type="button" className="btn-secondary btn-sm no-print" onClick={() => setFormulaires((v) => !v)}>
          {formulaires ? "Masquer les formulaires" : "Formulaires de correction"}
        </button>
      </div>

      {pointages.length === 0 ? (
        <p className="px-[18px] py-6 text-sm" style={{ color: "var(--muted)" }}>
          Aucun pointage cette semaine.
        </p>
      ) : (
        pointages.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-[18px] py-3" style={{ borderTop: "1px solid var(--line-portal)" }}>
            <span className="tabnum flex-none text-[13px] font-semibold" style={{ width: 52, color: "var(--muted)" }}>
              {p.jour}
            </span>
            <span className="tabnum flex-none text-[15px] font-bold" style={{ width: 52 }}>
              {p.heure}
            </span>
            <span className="flex-none text-sm font-semibold" style={{ width: 104 }}>
              {p.typeLibelle}
            </span>
            <span className="flex-1 text-[13px]" style={{ color: "var(--muted)" }}>
              {p.source}
              {p.motif ? ` · ${p.motif}` : ""}
            </span>
            {p.corrige && <PastilleCorrige />}
            {formulaires && (
              <button type="button" className="btn-secondary btn-sm no-print" onClick={() => setEnEdition(enEdition === p.id ? null : p.id)}>
                Corriger
              </button>
            )}
          </div>
        ))
      )}

      {formulaires && (
        <div className="no-print p-[18px]" style={{ borderTop: "1px solid var(--line-portal)", background: "var(--bg-portal)" }}>
          {enEdition &&
            (() => {
              const p = pointages.find((x) => x.id === enEdition)!;
              return (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void corriger(enEdition, new FormData(e.currentTarget));
                  }}
                >
                  <div className="text-sm font-bold" style={{ color: "var(--navy)" }}>
                    Corriger le pointage de {p.jour} {p.heure}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <label className="flex flex-col gap-1.5" style={{ flex: "0 0 200px" }}>
                      <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                        Horodatage
                      </span>
                      <input name="horodatage" type="datetime-local" className={`${champ} tabnum`} style={styleChamp} defaultValue={versLocal(p.horodatage, timezone)} />
                    </label>
                    <label className="flex flex-col gap-1.5" style={{ flex: "0 0 152px" }}>
                      <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                        Type
                      </span>
                      <select name="type" className={champ} style={styleChamp} defaultValue={p.type}>
                        {TYPES.map((t) => (
                          <option key={t} value={t}>
                            {LIBELLES[t]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5" style={{ flex: "1 1 240px", minWidth: 200 }}>
                      <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                        Motif (obligatoire)
                      </span>
                      <input name="motif" className={champ} style={styleChamp} required minLength={5} placeholder="Oubli de badge signalé par la salariée" />
                    </label>
                  </div>
                  <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold" style={{ color: "var(--danger-ink)" }}>
                    <input type="checkbox" name="annule" style={{ width: 17, height: 17, accentColor: "var(--danger)" }} />
                    Annuler ce pointage
                  </label>
                  <div className="mt-3.5 flex flex-wrap gap-2.5">
                    <button type="submit" className="btn-primary btn-sm">
                      Enregistrer la correction
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setEnEdition(null)}>
                      Annuler
                    </button>
                  </div>
                  <p className="mt-3 text-xs" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
                    Toute correction est tracée dans le journal des accès avec l'auteur, l'horodatage et le motif. La valeur d'origine est conservée.
                  </p>
                  <div className="my-5 h-px" style={{ background: "var(--line-portal)" }} />
                </form>
              );
            })()}

          <form onSubmit={ajouter}>
            <div className="text-sm font-bold" style={{ color: "var(--navy)" }}>
              Ajouter un pointage manquant <span className="font-medium" style={{ color: "var(--muted)" }}>(saisie manuelle tracée)</span>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5" style={{ flex: "0 0 200px" }}>
                <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                  Horodatage
                </span>
                <input name="horodatage" type="datetime-local" className={`${champ} tabnum`} style={styleChamp} required />
              </label>
              <label className="flex flex-col gap-1.5" style={{ flex: "0 0 152px" }}>
                <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                  Type
                </span>
                <select name="type" className={champ} style={styleChamp} defaultValue="SORTIE">
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {LIBELLES[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5" style={{ flex: "1 1 240px", minWidth: 200 }}>
                <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                  Motif (obligatoire)
                </span>
                <input name="motif" className={champ} style={styleChamp} required minLength={5} placeholder="Oubli de sortie — service du soir" />
              </label>
              <button type="submit" className="btn-navy btn-sm h-10">
                Ajouter
              </button>
            </div>
          </form>

          {erreur && (
            <p className="mt-3 text-[13px]" style={{ color: "var(--danger-ink)" }}>
              {erreur}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
