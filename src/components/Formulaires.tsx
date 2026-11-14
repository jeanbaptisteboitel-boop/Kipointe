"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { changerMotDePasse, creerClient, modifierOrganisation } from "@/app/actions/compte";
import { importerFichierPointeuse } from "@/app/actions/pointage";
import { ajouterPointeuse, modifierPointeuse, rattacherBadge } from "@/app/actions/pointeuses";
import { creerSalarie, definirPlanning, modifierSalarie, ouvrirAcces, reglerCompteur, reglerSoldeConges, type SaisieSalarie } from "@/app/actions/salaries";
import { Messages, useAction } from "@/components/client";
import { JOURS_PLANNING, LIBELLES_JOURS, dureeHebdo, formatHeures, type PlanningTravail } from "@/lib/planning";
import { frDate } from "@/lib/temps/zone";

function Champ({ libelle, aide, children, large = false }: { libelle: string; aide?: string; children: React.ReactNode; large?: boolean }) {
  return (
    <label className={large ? "sm:col-span-2" : undefined}>
      <span className="label">{libelle}</span>
      {children}
      {aide && (
        <span className="mt-1 block text-[12px]" style={{ color: "var(--muted)" }}>
          {aide}
        </span>
      )}
    </label>
  );
}

// ─── Salarié ───

export function FormulaireSalarie({ id, initial }: { id?: string; initial?: SaisieSalarie }) {
  const router = useRouter();
  const [s, setS] = useState<SaisieSalarie>(initial ?? { nom: "", prenom: "", matricule: "", email: "", pointeuseRef: "", dateEntree: "", dateSortie: "", actif: true });
  const a = useAction();
  const champ = (cle: keyof SaisieSalarie) => ({ value: (s[cle] as string) ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [cle]: e.target.value }) });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (id) a.lancer(() => modifierSalarie(id, s), () => "Fiche enregistrée.");
        else
          a.lancer(
            () => creerSalarie(s),
            (r) => {
              router.push(`/admin/salaries/${r.id}`);
            },
          );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Prénom">
          <input className="input" required maxLength={120} {...champ("prenom")} />
        </Champ>
        <Champ libelle="Nom">
          <input className="input" required maxLength={120} {...champ("nom")} />
        </Champ>
        <Champ libelle="N° dans la pointeuse" aide="L'« ID utilisateur » attribué au salarié sur l'appareil : c'est lui qui relie ses badgeages à sa fiche.">
          <input className="input mono" inputMode="numeric" maxLength={32} {...champ("pointeuseRef")} />
        </Champ>
        <Champ libelle="Matricule (facultatif)">
          <input className="input" maxLength={40} {...champ("matricule")} />
        </Champ>
        <Champ libelle="Adresse e-mail" aide="Identifiant de son espace salarié et adresse de ses notifications." large>
          <input className="input" type="email" maxLength={200} {...champ("email")} />
        </Champ>
        <Champ libelle="Date d'entrée">
          <input className="input" type="date" {...champ("dateEntree")} />
        </Champ>
        <Champ libelle="Date de sortie">
          <input className="input" type="date" {...champ("dateSortie")} />
        </Champ>
        {id && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={s.actif !== false} onChange={(e) => setS({ ...s, actif: e.target.checked })} />
            Fiche active (décochée : le salarié n'apparaît plus dans le suivi et perd l'accès à son espace)
          </label>
        )}
      </div>
      <Messages erreur={a.erreur} info={a.info} />
      <div>
        <button type="submit" className="btn-primary" disabled={a.enCours}>
          {a.enCours ? "Enregistrement…" : id ? "Enregistrer la fiche" : "Créer le salarié"}
        </button>
      </div>
    </form>
  );
}

/** Ouvre l'accès du salarié à son espace ; le mot de passe provisoire n'est affiché qu'une fois. */
export function BoutonAcces({ salarieId, existe }: { salarieId: string; existe: boolean }) {
  const a = useAction();
  const [acces, setAcces] = useState<{ email: string; motDePasse: string } | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={a.enCours}
          onClick={() => {
            if (existe && !window.confirm("Réinitialiser le mot de passe ? Le salarié sera déconnecté et devra utiliser le nouveau mot de passe provisoire.")) return;
            a.lancer(
              () => ouvrirAcces(salarieId),
              (r) => setAcces({ email: r.email, motDePasse: r.motDePasse }),
            );
          }}
        >
          {existe ? "Réinitialiser le mot de passe" : "Ouvrir l'accès à l'espace salarié"}
        </button>
      </div>
      <Messages erreur={a.erreur} />
      {acces && (
        <div className="encart-info text-sm" role="status">
          <p className="font-bold">Identifiants à remettre au salarié — ils ne seront plus affichés :</p>
          <p className="mono mt-2">
            {acces.email}
            <br />
            {acces.motDePasse}
          </p>
          <p className="mt-2 text-[13px]">Il devra choisir son propre mot de passe à la première connexion.</p>
        </div>
      )}
    </div>
  );
}

// ─── Planning ───

export function FormulairePlanning({ salarieId, planning, propre, planningEntreprise }: { salarieId: string | null; planning: PlanningTravail; propre?: boolean; planningEntreprise?: PlanningTravail }) {
  const versTexte = (p: PlanningTravail) => Object.fromEntries(JOURS_PLANNING.map((j) => [j, String(p[j]).replace(".", ",")])) as Record<string, string>;
  const [saisie, setSaisie] = useState(versTexte(planning));
  const a = useAction();
  const total = dureeHebdo(Object.fromEntries(JOURS_PLANNING.map((j) => [j, Number(saisie[j]!.replace(",", ".")) || 0])) as PlanningTravail);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        a.lancer(
          () => definirPlanning(salarieId, saisie),
          (r) => (r.identique ? "Planning identique à celui de l'entreprise : le salarié continue de le suivre." : "Planning enregistré."),
        );
      }}
    >
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {JOURS_PLANNING.map((j) => (
          <label key={j}>
            <span className="label">{LIBELLES_JOURS[j].slice(0, 3)}.</span>
            <input className="input tabnum text-center" inputMode="decimal" value={saisie[j]} onChange={(e) => setSaisie({ ...saisie, [j]: e.target.value })} aria-label={`Heures prévues le ${LIBELLES_JOURS[j].toLowerCase()}`} />
          </label>
        ))}
      </div>
      <p className="text-[13px]" style={{ color: "var(--muted)" }}>
        Heures prévues par jour, au quart d'heure (7,5 = 7 h 30). Durée hebdomadaire : <strong style={{ color: "var(--ink)" }}>{formatHeures(total)}</strong>
      </p>
      <Messages erreur={a.erreur} info={a.info} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary btn-sm" disabled={a.enCours}>
          Enregistrer le planning
        </button>
        {salarieId && propre && planningEntreprise && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={a.enCours}
            onClick={() =>
              a.lancer(
                () => definirPlanning(salarieId, null),
                () => {
                  setSaisie(versTexte(planningEntreprise));
                  return "Le salarié suit de nouveau le planning de l'entreprise.";
                },
              )
            }
          >
            Revenir au planning de l'entreprise
          </button>
        )}
      </div>
    </form>
  );
}

// ─── Compteurs ───

export function FormulaireCompteur({ salarieId, depart, soldeMinutes, departApplique }: { salarieId: string; depart: string | null; soldeMinutes: number; departApplique: string }) {
  const [d, setD] = useState(depart ?? "");
  const [solde, setSolde] = useState(soldeMinutes ? String(Math.round((soldeMinutes / 60) * 100) / 100).replace(".", ",") : "");
  const a = useAction();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        a.lancer(() => reglerCompteur(salarieId, { depart: d, solde }), () => "Compteur réglé.");
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Date de départ du compteur" aide={`Vide : ${frDate(departApplique)} (1er janvier, date d'entrée ou premier jour pointé).`}>
          <input type="date" className="input" value={d} onChange={(e) => setD(e.target.value)} />
        </Champ>
        <Champ libelle="Solde repris à cette date (heures)" aide="Exemples : 3,5 · -1:30. Positif : heures dues au salarié.">
          <input className="input tabnum" value={solde} onChange={(e) => setSolde(e.target.value)} />
        </Champ>
      </div>
      <Messages erreur={a.erreur} info={a.info} />
      <div>
        <button type="submit" className="btn-secondary btn-sm" disabled={a.enCours}>
          Régler le compteur
        </button>
      </div>
    </form>
  );
}

export function FormulaireSoldeConges({ salarieId, solde, au }: { salarieId: string; solde: number | null; au: string | null }) {
  const [s, setS] = useState(solde == null ? "" : String(solde).replace(".", ","));
  const [d, setD] = useState(au ?? "");
  const a = useAction();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        a.lancer(() => reglerSoldeConges(salarieId, { solde: s, au: d }), () => "Solde enregistré.");
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Solde de congés payés (jours)" aide="Tel qu'il figure sur le bulletin de paie. Vide : pas de suivi du solde.">
          <input className="input tabnum" inputMode="decimal" value={s} onChange={(e) => setS(e.target.value)} />
        </Champ>
        <Champ libelle="Constaté le" aide="Les congés payés acceptés qui commencent après cette date en sont déduits.">
          <input type="date" className="input" value={d} onChange={(e) => setD(e.target.value)} />
        </Champ>
      </div>
      <Messages erreur={a.erreur} info={a.info} />
      <div>
        <button type="submit" className="btn-secondary btn-sm" disabled={a.enCours}>
          Enregistrer le solde
        </button>
      </div>
    </form>
  );
}

// ─── Pointeuses ───

export function FormulairePointeuse() {
  const [numeroSerie, setNumeroSerie] = useState("");
  const [nom, setNom] = useState("");
  const a = useAction();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        a.lancer(
          () => ajouterPointeuse({ numeroSerie, nom }),
          () => {
            setNumeroSerie("");
            setNom("");
            return "Pointeuse enregistrée : elle peut maintenant envoyer ses badgeages.";
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Numéro de série" aide="Étiquette au dos de l'appareil, ou Menu → Infos système → Infos appareil.">
          <input className="input mono uppercase" required value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} />
        </Champ>
        <Champ libelle="Nom (facultatif)" aide="Par exemple : Entrée atelier.">
          <input className="input" maxLength={80} value={nom} onChange={(e) => setNom(e.target.value)} />
        </Champ>
      </div>
      <Messages erreur={a.erreur} info={a.info} />
      <div>
        <button type="submit" className="btn-primary btn-sm" disabled={a.enCours}>
          Enregistrer la pointeuse
        </button>
      </div>
    </form>
  );
}

export function ModePointeuse({ id, mode }: { id: string; mode: string }) {
  const a = useAction();
  return (
    <select className="input w-auto py-1.5 text-[13px]" value={mode} disabled={a.enCours} onChange={(e) => a.lancer(() => modifierPointeuse(id, { modeStatut: e.target.value }))} aria-label="Lecture du sens des badgeages">
      <option value="AUTO">Sens indiqué par l'appareil</option>
      <option value="ALTERNANCE">Alternance entrée / sortie</option>
    </select>
  );
}

export function RattacherBadge({ pin, salaries }: { pin: string; salaries: { id: string; nom: string }[] }) {
  const [qui, setQui] = useState("");
  const a = useAction();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex gap-2">
        <select className="input w-auto py-1.5 text-[13px]" value={qui} onChange={(e) => setQui(e.target.value)} aria-label={`Salarié du numéro ${pin}`}>
          <option value="">Rattacher à…</option>
          {salaries.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
        <button type="button" className="btn-primary btn-sm" disabled={!qui || a.enCours} onClick={() => a.lancer(() => rattacherBadge({ pin, salarieId: qui }))}>
          Rattacher
        </button>
      </span>
      {a.erreur && (
        <span className="max-w-[320px] text-right text-[12px] font-semibold" style={{ color: "var(--danger-ink)" }} role="alert">
          {a.erreur}
        </span>
      )}
    </span>
  );
}

export function ImportCsv() {
  const a = useAction();
  return (
    <div className="flex flex-col gap-3">
      <input
        type="file"
        accept=".csv,text/csv"
        className="text-sm"
        disabled={a.enCours}
        onChange={async (e) => {
          const fichier = e.target.files?.[0];
          e.target.value = "";
          if (!fichier) return;
          const texte = await fichier.text();
          a.lancer(
            () => importerFichierPointeuse(texte),
            ({ bilan }) =>
              [
                `${bilan.semaines} semaine(s) importée(s) pour ${bilan.salaries} salarié(s).`,
                bilan.nonApparies.length ? `Non reconnus (créez leur fiche ou renseignez leur numéro de pointeuse, puis réimportez) : ${bilan.nonApparies.join(", ")}.` : "",
                bilan.saisiesRemplacees.length ? `Journées saisies à la main remplacées par le fichier : ${bilan.saisiesRemplacees.map((s) => `${s.nom} le ${frDate(s.date)}`).join(", ")}.` : "",
              ]
                .filter(Boolean)
                .join("\n"),
          );
        }}
      />
      {a.enCours && <p className="text-[13px]">Import en cours…</p>}
      <Messages erreur={a.erreur} info={a.info} />
    </div>
  );
}

// ─── Organisation, compte, plateforme ───

export function FormulaireOrganisation({ initial }: { initial: { raisonSociale: string; siret: string; seuilEcartMinutes: number; notificationsEmail: boolean } }) {
  const [o, setO] = useState({ ...initial, seuilEcartMinutes: String(initial.seuilEcartMinutes) });
  const a = useAction();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        a.lancer(() => modifierOrganisation(o), () => "Paramètres enregistrés.");
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Raison sociale">
          <input className="input" required value={o.raisonSociale} onChange={(e) => setO({ ...o, raisonSociale: e.target.value })} />
        </Champ>
        <Champ libelle="SIRET">
          <input className="input tabnum" inputMode="numeric" value={o.siret} onChange={(e) => setO({ ...o, siret: e.target.value })} />
        </Champ>
        <Champ libelle="Seuil de notification (minutes)" aide="Écart hebdomadaire au contrat à partir duquel le salarié et vous êtes prévenus.">
          <input className="input tabnum" inputMode="numeric" value={o.seuilEcartMinutes} onChange={(e) => setO({ ...o, seuilEcartMinutes: e.target.value })} />
        </Champ>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={o.notificationsEmail} onChange={(e) => setO({ ...o, notificationsEmail: e.target.checked })} />
          Envoyer aussi les notifications par e-mail
        </label>
      </div>
      <Messages erreur={a.erreur} info={a.info} />
      <div>
        <button type="submit" className="btn-primary btn-sm" disabled={a.enCours}>
          Enregistrer
        </button>
      </div>
    </form>
  );
}

export function FormulaireMotDePasse({ provisoire }: { provisoire: boolean }) {
  const router = useRouter();
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const a = useAction();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (nouveau !== confirmation) return a.setErreur("Les deux saisies du nouveau mot de passe diffèrent.");
        a.lancer(
          () => changerMotDePasse({ actuel, nouveau }),
          (r) => {
            if (provisoire) router.replace(r.suite);
            setActuel("");
            setNouveau("");
            setConfirmation("");
            return "Mot de passe modifié.";
          },
        );
      }}
    >
      <Champ libelle={provisoire ? "Mot de passe provisoire" : "Mot de passe actuel"}>
        <input className="input" type="password" autoComplete="current-password" required value={actuel} onChange={(e) => setActuel(e.target.value)} />
      </Champ>
      <Champ libelle="Nouveau mot de passe" aide="Dix caractères au moins.">
        <input className="input" type="password" autoComplete="new-password" required minLength={10} value={nouveau} onChange={(e) => setNouveau(e.target.value)} />
      </Champ>
      <Champ libelle="Nouveau mot de passe, à nouveau">
        <input className="input" type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
      </Champ>
      <Messages erreur={a.erreur} info={a.info} />
      <button type="submit" className="btn-primary" disabled={a.enCours}>
        {a.enCours ? "Enregistrement…" : "Changer le mot de passe"}
      </button>
    </form>
  );
}

export function FormulaireClient() {
  const vide = { raisonSociale: "", siret: "", email: "", prenom: "", nom: "" };
  const [c, setC] = useState(vide);
  const [acces, setAcces] = useState<{ email: string; motDePasse: string } | null>(null);
  const a = useAction();
  const champ = (cle: keyof typeof vide) => ({ value: c[cle], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [cle]: e.target.value }) });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        a.lancer(
          () => creerClient(c),
          (r) => {
            setAcces({ email: r.email, motDePasse: r.motDePasse });
            setC(vide);
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Raison sociale">
          <input className="input" required {...champ("raisonSociale")} />
        </Champ>
        <Champ libelle="SIRET (facultatif)">
          <input className="input tabnum" inputMode="numeric" {...champ("siret")} />
        </Champ>
        <Champ libelle="Prénom de l'administrateur">
          <input className="input" required {...champ("prenom")} />
        </Champ>
        <Champ libelle="Nom de l'administrateur">
          <input className="input" required {...champ("nom")} />
        </Champ>
        <Champ libelle="Adresse e-mail de l'administrateur" large>
          <input className="input" type="email" required {...champ("email")} />
        </Champ>
      </div>
      <Messages erreur={a.erreur} />
      {acces && (
        <div className="encart-info text-sm" role="status">
          <p className="font-bold">Client créé. Identifiants à lui remettre — ils ne seront plus affichés :</p>
          <p className="mono mt-2">
            {acces.email}
            <br />
            {acces.motDePasse}
          </p>
        </div>
      )}
      <div>
        <button type="submit" className="btn-primary btn-sm" disabled={a.enCours}>
          Créer le client
        </button>
      </div>
    </form>
  );
}
