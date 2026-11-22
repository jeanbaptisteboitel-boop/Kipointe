"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { pointerAvecQr } from "@/app/actions/tablettes";

type Rappel = { id: string; intitule: string; quand: string; precision: string | null };
type Etat = { phase: "envoi" } | { phase: "fait"; prenom: string; sens: string; heure: string; tablette: string; rappels: Rappel[]; nonLues: number } | { phase: "refus"; erreur: string };

/** Pointe dès l'ouverture de la page : le salarié n'a rien d'autre à faire que de viser le QR code. */
export function PointageQr({ jeton }: { jeton: string }) {
  const [etat, setEtat] = useState<Etat>({ phase: "envoi" });
  const lance = useRef(false);
  useEffect(() => {
    if (lance.current) return;
    lance.current = true;
    pointerAvecQr(jeton)
      .then((r) => setEtat(r.ok ? { phase: "fait", prenom: r.prenom, sens: r.sens, heure: r.heure, tablette: r.tablette, rappels: r.rappels, nonLues: r.nonLues } : { phase: "refus", erreur: r.erreur }))
      .catch(() => setEtat({ phase: "refus", erreur: "Pointage impossible : vérifiez votre connexion, puis visez de nouveau le QR code." }));
  }, [jeton]);

  if (etat.phase === "envoi") return <p className="text-sm" style={{ color: "var(--muted)" }} role="status">Enregistrement de votre pointage…</p>;
  if (etat.phase === "refus") {
    return (
      <>
        <h1 className="titre text-[24px]">Pointage non enregistré</h1>
        <p className="encart-danger mt-4 text-left text-sm font-semibold" role="alert">
          {etat.erreur}
        </p>
        <Link href="/salarie" className="btn-secondary mt-5 inline-flex">
          Mon espace salarié
        </Link>
      </>
    );
  }
  const deja = etat.sens === "double_badge";
  return (
    <div role="status">
      <h1 className="titre text-[26px]">{deja ? "C'est déjà fait" : etat.sens === "arrivee" ? `Bonjour ${etat.prenom}` : `Au revoir ${etat.prenom}`}</h1>
      <p className={`${deja ? "encart-info" : "encart-ok"} mt-4 text-[15px] font-semibold`}>
        {deja ? "Votre pointage vient d'être enregistré : rien à refaire." : `${etat.sens === "arrivee" ? "Arrivée" : "Départ"} à ${etat.heure} — ${etat.tablette}`}
      </p>
      {etat.rappels.map((r) => (
        <div key={r.id} className="encart-alerte mt-3 text-left text-sm">
          <strong>
            {r.intitule} — {r.quand}
          </strong>
          {r.precision && <div className="mt-1">{r.precision}</div>}
        </div>
      ))}
      {etat.nonLues > 0 && (
        <Link href="/salarie/notifications" className="encart-info mt-3 block text-left text-sm font-semibold">
          {etat.nonLues === 1 ? "1 notification à lire" : `${etat.nonLues} notifications à lire`} →
        </Link>
      )}
      <Link href="/salarie" className="btn-secondary mt-5 inline-flex">
        Voir mes pointages
      </Link>
    </div>
  );
}
