"use client";

import { useState } from "react";
import { deciderDemande, enregistrerConge, supprimerDemande } from "@/app/actions/conges";
import { Messages, useAction } from "@/components/client";
import { PastilleConge } from "@/components/ui";
import type { CongeAbsence, TypeConge } from "@/db/schema";
import { LIBELLES_CONGE, TYPES_CONGE, TYPES_CONGE_ADMIN, TYPES_CONGE_VALIDABLES, formatJours } from "@/lib/conges/types";
import { frDate } from "@/lib/temps/zone";

export type CongeAffiche = CongeAbsence & { nomSalarie?: string };

function periode(c: CongeAbsence): string {
  const debut = `${frDate(c.dateDebut)}${c.demiJourDebut === "APREM" ? " (après-midi)" : ""}`;
  if (c.dateDebut === c.dateFin) return c.demiJourFin === "MATIN" ? `${frDate(c.dateDebut)} (matin)` : debut;
  return `${debut} → ${frDate(c.dateFin)}${c.demiJourFin === "MATIN" ? " (matin)" : ""}`;
}

/** Liste des absences, avec décision (administrateur) et annulation (auteur d'une demande en attente). */
export function ListeConges({ conges, mode, vide }: { conges: CongeAffiche[]; mode: "admin" | "salarie"; vide: string }) {
  const a = useAction();
  if (!conges.length)
    return (
      <p className="py-4 text-sm" style={{ color: "var(--muted)" }}>
        {vide}
      </p>
    );
  return (
    <div className="flex flex-col">
      <Messages erreur={a.erreur} />
      {conges.map((c) => (
        <div key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3" style={{ borderTop: "1px solid var(--line-portal)" }}>
          <div className="text-sm">
            <div className="font-bold">
              {c.nomSalarie && <span>{c.nomSalarie} · </span>}
              {LIBELLES_CONGE[c.type]}
            </div>
            <div className="tabnum mt-0.5" style={{ color: "var(--muted)" }}>
              {periode(c)} · {formatJours(c.nbJours)}
            </div>
            {c.motif && <div className="mt-0.5 text-[13px]">« {c.motif} »</div>}
            {c.commentaireDecision && (
              <div className="mt-0.5 text-[13px]" style={{ color: "var(--muted)" }}>
                Réponse : « {c.commentaireDecision} »
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PastilleConge statut={c.statut} />
            {mode === "admin" && c.statut === "EN_ATTENTE" && (
              <>
                <button type="button" className="btn-primary btn-sm" disabled={a.enCours} onClick={() => a.lancer(() => deciderDemande({ id: c.id, statut: "ACCEPTEE" }))}>
                  Accepter
                </button>
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  disabled={a.enCours}
                  onClick={() => {
                    const commentaire = window.prompt("Motif du refus (facultatif) :");
                    if (commentaire !== null) a.lancer(() => deciderDemande({ id: c.id, statut: "REFUSEE", commentaire }));
                  }}
                >
                  Refuser
                </button>
              </>
            )}
            {(mode === "admin" ? c.statut !== "EN_ATTENTE" : c.statut === "EN_ATTENTE") && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={a.enCours}
                onClick={() => {
                  if (window.confirm(mode === "admin" ? "Supprimer cette absence ? Le compteur d'heures sera recalculé." : "Annuler cette demande ?")) a.lancer(() => supprimerDemande(c.id));
                }}
              >
                {mode === "admin" ? "Supprimer" : "Annuler"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Nouvelle demande (salarié) ou saisie d'une absence (administrateur, pour un salarié donné ou à choisir). */
export function FormulaireConge({ mode, salarieId, salaries }: { mode: "admin" | "salarie"; salarieId?: string; salaries?: { id: string; nom: string }[] }) {
  const types = TYPES_CONGE.filter((t) => mode === "admin" || !TYPES_CONGE_ADMIN.includes(t));
  const [ouvert, setOuvert] = useState(false);
  const [qui, setQui] = useState(salarieId ?? "");
  const [type, setType] = useState<TypeConge>("CONGE_PAYE");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [aprem, setAprem] = useState(false);
  const [matin, setMatin] = useState(false);
  const [motif, setMotif] = useState("");
  const a = useAction();

  if (!ouvert)
    return (
      <div className="flex flex-col gap-2">
        <Messages erreur={null} info={a.info} />
        <div>
          <button type="button" className="btn-primary btn-sm" onClick={() => setOuvert(true)}>
            {mode === "admin" ? "Saisir une absence" : "Nouvelle demande"}
          </button>
        </div>
      </div>
    );

  return (
    <form
      className="flex flex-col gap-3 rounded-lg p-4"
      style={{ background: "var(--bg-portal)", border: "1px solid var(--line-portal)" }}
      onSubmit={(e) => {
        e.preventDefault();
        a.lancer(
          () => enregistrerConge({ salarieId: qui, type, dateDebut: debut, dateFin: fin || debut, demiJourDebut: aprem ? "APREM" : null, demiJourFin: matin ? "MATIN" : null, motif }),
          (r) => {
            setOuvert(false);
            setDebut("");
            setFin("");
            setMotif("");
            return r.statut === "EN_ATTENTE" ? `Demande envoyée (${formatJours(r.nbJours)}) : votre employeur est prévenu.` : `Absence enregistrée (${formatJours(r.nbJours)}).`;
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {salaries && !salarieId && (
          <label className="sm:col-span-2">
            <span className="label">Salarié</span>
            <select className="input" value={qui} onChange={(e) => setQui(e.target.value)} required>
              <option value="">Choisir…</option>
              {salaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="sm:col-span-2">
          <span className="label">Type</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as TypeConge)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {LIBELLES_CONGE[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Du</span>
          <input type="date" className="input" value={debut} onChange={(e) => setDebut(e.target.value)} required />
        </label>
        <label>
          <span className="label">Au (inclus)</span>
          <input type="date" className="input" value={fin} min={debut} onChange={(e) => setFin(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={aprem} onChange={(e) => setAprem(e.target.checked)} />
          Le premier jour, l'après-midi seulement
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={matin} onChange={(e) => setMatin(e.target.checked)} />
          Le dernier jour, le matin seulement
        </label>
        <label className="sm:col-span-2">
          <span className="label">Motif ou précision (facultatif)</span>
          <input className="input" value={motif} maxLength={500} onChange={(e) => setMotif(e.target.value)} />
        </label>
      </div>
      {mode === "salarie" && (
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>
          {TYPES_CONGE_VALIDABLES.includes(type)
            ? "Cette demande sera transmise à votre employeur, qui l'acceptera ou la refusera."
            : "Cette absence est enregistrée directement : remettez le justificatif (arrêt de travail, acte) à votre employeur dans les délais."}
        </p>
      )}
      <Messages erreur={a.erreur} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOuvert(false)} disabled={a.enCours}>
          Annuler
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={a.enCours}>
          {a.enCours ? "Envoi…" : mode === "admin" ? "Enregistrer" : "Envoyer la demande"}
        </button>
      </div>
    </form>
  );
}
