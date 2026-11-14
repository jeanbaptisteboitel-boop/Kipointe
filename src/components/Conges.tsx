"use client";

import { useState } from "react";
import { deciderDemande, deposerUnJustificatif, enregistrerConge, retirerUnJustificatif, supprimerDemande } from "@/app/actions/conges";
import { Messages, useAction } from "@/components/client";
import { PastilleConge } from "@/components/ui";
import type { CongeAbsence, TypeConge } from "@/db/schema";
import type { JustificatifResume } from "@/lib/conges/justificatifs";
import { LIBELLES_CONGE, TYPES_CONGE, TYPES_CONGE_ADMIN, TYPES_CONGE_VALIDABLES, formatJours } from "@/lib/conges/types";
import { frDate } from "@/lib/temps/zone";

export type CongeAffiche = CongeAbsence & { nomSalarie?: string; justificatifs: JustificatifResume[] };

const TAILLE_MAX = 4 * 1024 * 1024;
const FORMATS = "application/pdf,image/jpeg,image/png";

/** Justificatifs d'une absence : liens de consultation, retrait, dépôt d'un nouveau fichier. */
function Justificatifs({ conge, peutDeposer }: { conge: CongeAffiche; peutDeposer: boolean }) {
  const a = useAction();
  return (
    <div className="mt-1.5 flex flex-col gap-1 text-[13px]">
      {conge.justificatifs.map((j) => (
        <span key={j.id} className="flex flex-wrap items-center gap-x-2">
          <a href={`/api/justificatifs/${j.id}`} target="_blank" rel="noreferrer" className="font-semibold underline" style={{ color: "var(--navy)" }}>
            {j.nom}
          </a>
          <span style={{ color: "var(--faint)" }}>{Math.max(1, Math.round(j.taille / 1024))} Ko</span>
          {peutDeposer && (
            <button
              type="button"
              className="underline"
              style={{ color: "var(--danger-ink)" }}
              disabled={a.enCours}
              onClick={() => {
                if (window.confirm(`Retirer « ${j.nom} » ?`)) a.lancer(() => retirerUnJustificatif(j.id));
              }}
            >
              retirer
            </button>
          )}
        </span>
      ))}
      {peutDeposer && (
        <label className="inline-flex cursor-pointer items-center gap-2 font-semibold underline" style={{ color: "var(--navy)" }}>
          {a.enCours ? "Envoi…" : conge.justificatifs.length ? "Ajouter un autre justificatif" : "Joindre un justificatif"}
          <input
            type="file"
            accept={FORMATS}
            className="sr-only"
            disabled={a.enCours}
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              e.target.value = "";
              if (!fichier) return;
              if (fichier.size > TAILLE_MAX) return a.setErreur("Fichier trop volumineux : 4 Mo au plus.");
              const donnees = new FormData();
              donnees.set("congeId", conge.id);
              donnees.set("fichier", fichier);
              a.lancer(() => deposerUnJustificatif(donnees));
            }}
          />
        </label>
      )}
      {a.erreur && (
        <span className="font-semibold" style={{ color: "var(--danger-ink)" }} role="alert">
          {a.erreur}
        </span>
      )}
    </div>
  );
}

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
            <Justificatifs conge={c} peutDeposer={c.statut !== "REFUSEE"} />
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
  const [fichier, setFichier] = useState<File | null>(null);
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
        if (fichier && fichier.size > TAILLE_MAX) return a.setErreur("Justificatif trop volumineux : 4 Mo au plus.");
        a.lancer(
          async () => {
            const r = await enregistrerConge({ salarieId: qui, type, dateDebut: debut, dateFin: fin || debut, demiJourDebut: aprem ? "APREM" : null, demiJourFin: matin ? "MATIN" : null, motif });
            if (!r.ok) return r;
            if (!fichier) return { ...r, depot: null as string | null };
            const donnees = new FormData();
            donnees.set("congeId", r.id);
            donnees.set("fichier", fichier);
            const d = await deposerUnJustificatif(donnees);
            // L'absence est enregistrée même si le fichier est refusé : on le dit, il pourra être rejoint.
            return { ...r, depot: d.ok ? null : d.erreur };
          },
          (r) => {
            setOuvert(false);
            setDebut("");
            setFin("");
            setMotif("");
            setFichier(null);
            const base = r.statut === "EN_ATTENTE" ? `Demande envoyée (${formatJours(r.nbJours)}) : votre employeur est prévenu.` : `Absence enregistrée (${formatJours(r.nbJours)}).`;
            return r.depot ? `${base}\nLe justificatif n'a pas pu être joint (${r.depot}) : ajoutez-le depuis la liste ci-dessous.` : base;
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
        <label className="sm:col-span-2">
          <span className="label">Justificatif (facultatif)</span>
          <input type="file" accept={FORMATS} className="text-sm" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} />
          <span className="mt-1 block text-[12px]" style={{ color: "var(--muted)" }}>
            PDF ou photo (JPEG, PNG), 4 Mo au plus. Pour un arrêt de travail, déposez le volet destiné à l'employeur (volet 3), qui ne porte aucune information médicale.
          </span>
        </label>
      </div>
      {mode === "salarie" && (
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>
          {TYPES_CONGE_VALIDABLES.includes(type)
            ? "Cette demande sera transmise à votre employeur, qui l'acceptera ou la refusera."
            : "Cette absence est enregistrée directement : joignez le justificatif (arrêt de travail, acte de naissance, de mariage ou de décès…) ici, ou ajoutez-le ensuite depuis la liste."}
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
