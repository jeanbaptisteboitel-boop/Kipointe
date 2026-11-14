"use client";

import { useState } from "react";
import { corrigerJour, deciderMaSemaine } from "@/app/actions/pointage";
import { Messages, useAction } from "@/components/client";
import { PastilleSemaine } from "@/components/ui";
import type { SemaineLue } from "@/lib/donnees";
import { formatMinutes, jourIncomplet, type Pointage } from "@/lib/pointage/paires";
import { frDate, frJourCourt, joursDeSemaine } from "@/lib/temps/zone";

/**
 * Heures pointées, semaine par semaine. Pour chaque jour : les paires entrée → sortie et le
 * total. L'administrateur corrige une journée ou en ajoute une ; le salarié valide sa semaine
 * ou demande une modification. Toute correction remet la semaine « à valider ».
 */
export function PointagesSemaines({ semaines, mode, salarieId, aujourdhui }: { semaines: SemaineLue[]; mode: "admin" | "salarie"; salarieId: string; aujourdhui: string }) {
  const [ouverte, setOuverte] = useState<string | null>(semaines[0]?.id ?? null);
  const [correction, setCorrection] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);
  const a = useAction();

  return (
    <div className="flex flex-col gap-2.5">
      {mode === "admin" &&
        (ajout ? (
          <AjoutJour salarieId={salarieId} max={aujourdhui} fermer={() => setAjout(false)} />
        ) : (
          <div>
            <button type="button" className="btn-dashed btn-sm" onClick={() => setAjout(true)}>
              + Ajouter une journée
            </button>
          </div>
        ))}
      <Messages erreur={a.erreur} info={a.info} />
      {semaines.length === 0 && (
        <p className="py-4 text-sm" style={{ color: "var(--muted)" }}>
          Aucun pointage reçu pour l'instant.
        </p>
      )}
      {semaines.map((s) => {
        const ouvert = ouverte === s.id;
        const parDate = new Map(s.jours.map((j) => [j.date, j]));
        // Tous les jours pointés, plus les jours de la semaine déjà passés (pour corriger un oubli).
        const jours = joursDeSemaine(s.semaineDebut).filter((d) => parDate.has(d) || (mode === "admin" && d <= aujourdhui));
        return (
          <div key={s.id} className="card-plat px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="flex items-center gap-2 text-left text-sm font-semibold" onClick={() => setOuverte(ouvert ? null : s.id)} aria-expanded={ouvert}>
                <span aria-hidden>{ouvert ? "▾" : "▸"}</span>
                Semaine du {frDate(s.semaineDebut)}
                <span className="tabnum font-bold" style={{ color: "var(--navy)" }}>
                  {formatMinutes(s.totalMinutes)}
                </span>
              </button>
              <PastilleSemaine statut={s.statut} />
            </div>

            {ouvert && (
              <div className="mt-2.5 flex flex-col">
                {jours.map((date) => {
                  const j = parDate.get(date);
                  const cle = `${s.id}:${date}`;
                  return (
                    <div key={date} className="py-2" style={{ borderTop: "1px solid var(--line-portal)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-[13px]">
                          <span className="mr-2 font-semibold" style={{ color: "var(--muted)" }}>
                            {frJourCourt(date)}
                          </span>
                          <span className="tabnum font-bold">{formatMinutes(j?.minutes ?? 0)}</span>
                          <div className="tabnum mt-0.5" style={{ color: "var(--muted)" }}>
                            {j?.pointages.length ? (
                              j.pointages.map((p, i) => (
                                <span key={i} className="mr-3 inline-block">
                                  {p.entree ?? "?"} → {p.sortie ?? "?"}
                                  {p.source === "manuel" && <Marque titre="Journée saisie à la main">saisie</Marque>}
                                  {p.pause && <Marque titre="Départ en pause">pause</Marque>}
                                </span>
                              ))
                            ) : (
                              <span>aucun pointage</span>
                            )}
                          </div>
                          {j && jourIncomplet(j.pointages) && (
                            <div className="mt-0.5 text-[12px] font-semibold" style={{ color: "var(--warn-ink)" }}>
                              Entrée ou sortie manquante : cette paire ne compte pas tant qu'elle n'est pas complétée.
                            </div>
                          )}
                          {j?.note && (
                            <div className="mt-0.5 text-[12px]" style={{ color: "var(--warn-ink)" }}>
                              {j.note}
                            </div>
                          )}
                        </div>
                        {mode === "admin" && correction !== cle && (
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setCorrection(cle)}>
                            Corriger
                          </button>
                        )}
                      </div>
                      {correction === cle && <Editeur salarieId={salarieId} date={date} pointages={j?.pointages ?? []} fermer={() => setCorrection(null)} />}
                    </div>
                  );
                })}
              </div>
            )}

            {s.commentaire && (
              <p className="mt-2 text-[12px] font-semibold" style={{ color: "var(--danger-ink)" }}>
                Modification demandée : « {s.commentaire} »
              </p>
            )}

            {mode === "salarie" && s.statut !== "VALIDE" && s.semaineFin < aujourdhui && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn-primary btn-sm" disabled={a.enCours} onClick={() => a.lancer(() => deciderMaSemaine({ semaineId: s.id, action: "valider" }))}>
                  Valider mes heures
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={a.enCours}
                  onClick={() => {
                    const commentaire = window.prompt("Que faut-il corriger ? (jour, heure d'arrivée ou de départ)") ?? "";
                    if (commentaire.trim()) a.lancer(() => deciderMaSemaine({ semaineId: s.id, action: "demander_modif", commentaire }));
                  }}
                >
                  Demander une modification
                </button>
              </div>
            )}
            {mode === "salarie" && s.statut !== "VALIDE" && s.semaineFin >= aujourdhui && (
              <p className="mt-2 text-[12px]" style={{ color: "var(--muted)" }}>
                Semaine en cours : vous pourrez la valider une fois terminée.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Marque({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <span title={titre} className="ml-1 rounded-full px-1.5 text-[10px]" style={{ background: "#eef1f6", color: "#4a5975" }}>
      {children}
    </span>
  );
}

function AjoutJour({ salarieId, max, fermer }: { salarieId: string; max: string; fermer: () => void }) {
  const [date, setDate] = useState("");
  return (
    <div className="card-plat px-4 py-3">
      <label className="flex flex-wrap items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--muted)" }}>
        Journée à ajouter
        <input type="date" className="input w-auto" value={date} max={max} onChange={(e) => setDate(e.target.value)} />
      </label>
      <Editeur salarieId={salarieId} date={date} pointages={[]} ajout fermer={fermer} />
    </div>
  );
}

function Editeur({ salarieId, date, pointages, ajout = false, fermer }: { salarieId: string; date: string; pointages: Pointage[]; ajout?: boolean; fermer: () => void }) {
  const [lignes, setLignes] = useState<Pointage[]>(pointages.length ? pointages.map((p) => ({ ...p })) : [{ entree: null, sortie: null }]);
  const a = useAction();
  const modifier = (i: number, champ: "entree" | "sortie", v: string) => setLignes((l) => l.map((p, k) => (k === i ? { ...p, [champ]: v || null } : p)));
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg p-3" style={{ background: "var(--bg-portal)", border: "1px solid var(--line-portal)" }}>
      <p className="text-[12px]" style={{ color: "var(--muted)" }}>
        Heures d'arrivée et de départ ; une pause est l'intervalle entre deux lignes. Le total du jour est recalculé.
      </p>
      {lignes.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="time" className="input w-[120px]" value={p.entree ?? ""} onChange={(e) => modifier(i, "entree", e.target.value)} aria-label={`Arrivée ${i + 1}`} />
          <span aria-hidden>→</span>
          <input type="time" className="input w-[120px]" value={p.sortie ?? ""} onChange={(e) => modifier(i, "sortie", e.target.value)} aria-label={`Départ ${i + 1}`} />
          <button type="button" className="btn-secondary btn-sm" onClick={() => setLignes((l) => l.filter((_, k) => k !== i))} aria-label={`Supprimer la ligne ${i + 1}`}>
            Retirer
          </button>
        </div>
      ))}
      <Messages erreur={a.erreur} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-dashed btn-sm" onClick={() => setLignes((l) => [...l, { entree: null, sortie: null }])}>
          + Ajouter une ligne
        </button>
        <span className="flex-1" />
        <button type="button" className="btn-secondary btn-sm" disabled={a.enCours} onClick={fermer}>
          Annuler
        </button>
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={a.enCours}
          onClick={() => {
            if (!date) return a.setErreur("Choisissez la date de la journée.");
            a.lancer(
              () => corrigerJour({ salarieId, date, pointages: lignes, ajout }),
              () => fermer(),
            );
          }}
        >
          {a.enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
