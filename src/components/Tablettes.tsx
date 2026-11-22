"use client";

import { useState } from "react";
import { ajouterTablette, genererCodeSalarie, nouvelleActivation, reglerModesTablette } from "@/app/actions/tablettes";
import { Messages, useAction } from "@/components/client";

function CodeAffiche({ titre, code, aide }: { titre: string; code: string; aide: string }) {
  return (
    <div className="encart-ok" role="status">
      <div className="text-[13px] font-semibold">{titre}</div>
      <div className="mono my-1 text-[26px] font-bold" style={{ letterSpacing: "0.2em" }}>
        {code}
      </div>
      <div className="text-[12px]">{aide}</div>
    </div>
  );
}

const AIDE_ACTIVATION = "À saisir sur la tablette, à l'adresse indiquée plus bas. Valable 24 heures, une seule fois ; il ne sera plus affiché.";

export function FormulaireTablette() {
  const [nom, setNom] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const a = useAction();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setCode(null);
        a.lancer(
          () => ajouterTablette(nom),
          (r) => {
            setCode(r.codeActivation);
            setNom("");
          },
        );
      }}
    >
      <label className="max-w-[360px]">
        <span className="label">Nom de la tablette</span>
        <input className="input" required maxLength={80} placeholder="Entrée atelier" value={nom} onChange={(e) => setNom(e.target.value)} />
      </label>
      <Messages erreur={a.erreur} />
      {code && <CodeAffiche titre="Code d'activation" code={code} aide={AIDE_ACTIVATION} />}
      <div>
        <button type="submit" className="btn-primary btn-sm" disabled={a.enCours}>
          Ajouter une tablette
        </button>
      </div>
    </form>
  );
}

export function RenouvelerActivation({ id, reliee }: { id: string; reliee: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const a = useAction();
  return (
    <span className="inline-flex flex-col items-end gap-2">
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={a.enCours}
        onClick={() => {
          if (reliee && !window.confirm("Donner un nouveau code d'activation ? La tablette actuellement reliée sera déconnectée et devra être activée de nouveau.")) return;
          a.lancer(() => nouvelleActivation(id), (r) => setCode(r.codeActivation));
        }}
      >
        {reliee ? "Relier de nouveau" : "Nouveau code d'activation"}
      </button>
      {a.erreur && <span className="text-[12px] font-semibold" style={{ color: "var(--danger-ink)" }} role="alert">{a.erreur}</span>}
      {code && <CodeAffiche titre="Code d'activation" code={code} aide={AIDE_ACTIVATION} />}
    </span>
  );
}

export function ModesTablette({ code, qr, photo }: { code: boolean; qr: boolean; photo: boolean }) {
  const [c, setC] = useState(code);
  const [q, setQ] = useState(qr);
  const [ph, setPh] = useState(photo);
  const a = useAction();
  const change = c !== code || q !== qr || ph !== photo;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        a.lancer(() => reglerModesTablette({ code: c, qr: q, photo: ph }), () => "Réglage enregistré : les tablettes l'appliquent dans les dix secondes.");
      }}
    >
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={c} onChange={(e) => setC(e.target.checked)} />
        <span>
          <span className="font-bold">Code personnel</span>
          <span className="block text-[13px]" style={{ color: "var(--muted)" }}>
            Le salarié tape son code sur la tablette. Aucun téléphone nécessaire.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={q} onChange={(e) => setQ(e.target.checked)} />
        <span>
          <span className="font-bold">QR code lu par le téléphone</span>
          <span className="block text-[13px]" style={{ color: "var(--muted)" }}>
            Le salarié vise le QR code de la tablette avec son téléphone, connecté à son espace salarié. Le QR code change toutes les trente secondes : une photo envoyée à un collègue ne sert à rien.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3" style={{ opacity: c ? 1 : 0.6 }}>
        <input type="checkbox" className="mt-1" checked={ph && c} disabled={!c} onChange={(e) => setPh(e.target.checked)} />
        <span>
          <span className="font-bold">Photo au pointage par code</span>
          <span className="block text-[13px]" style={{ color: "var(--muted)" }}>
            La tablette photographie la personne qui valide un code, pour vérifier en cas de doute que le salarié a pointé lui-même. Photos visibles des seuls administrateurs, détruites au bout de 30 jours.
          </span>
        </span>
      </label>
      {ph && c && (
        <div className="encart-alerte text-[13px]">
          <strong>À savoir avant d'activer.</strong> La CNIL considère qu'une photo prise systématiquement à chaque pointage est excessive et a mis en demeure des employeurs pour ce motif. Si vous l'activez :
          informez vos salariés par écrit (finalité, durée de conservation, droit d'accès), consultez le CSE s'il existe, inscrivez ce traitement à votre registre, et ne consultez les photos qu'en cas de doute sur un
          pointage. Le code personnel seul, ou le QR code, suffisent dans la plupart des cas.
        </div>
      )}
      {!c && !q && <p className="encart-alerte text-[13px] font-semibold">Aucun mode ouvert : personne ne pourra pointer sur les tablettes.</p>}
      <Messages erreur={a.erreur} info={a.info} />
      <div>
        <button type="submit" className="btn-primary btn-sm" disabled={a.enCours || !change}>
          Enregistrer
        </button>
      </div>
    </form>
  );
}

export function CodeSalarie({ salarieId, nom, aUnCode }: { salarieId: string; nom: string; aUnCode: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const a = useAction();
  return (
    <span className="inline-flex flex-col items-end gap-2">
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={a.enCours}
        onClick={() => {
          if (aUnCode && !window.confirm(`Donner un nouveau code à ${nom} ? Son code actuel ne fonctionnera plus.`)) return;
          a.lancer(() => genererCodeSalarie(salarieId), (r) => setCode(r.code));
        }}
      >
        {aUnCode ? "Nouveau code" : "Donner un code"}
      </button>
      {a.erreur && <span className="text-[12px] font-semibold" style={{ color: "var(--danger-ink)" }} role="alert">{a.erreur}</span>}
      {code && <CodeAffiche titre={`Code de ${nom}`} code={code} aide="À lui remettre en main propre. Il ne sera plus affiché : en cas d'oubli, donnez-lui un nouveau code." />}
    </span>
  );
}
