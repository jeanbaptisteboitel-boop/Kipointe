"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { pointerAvecQr } from "@/app/actions/tablettes";

type Etat = { phase: "envoi" } | { phase: "fait"; prenom: string; sens: string; heure: string; tablette: string } | { phase: "refus"; erreur: string };

/** Pointe dès l'ouverture de la page : le salarié n'a rien d'autre à faire que de viser le QR code. */
export function PointageQr({ jeton }: { jeton: string }) {
  const [etat, setEtat] = useState<Etat>({ phase: "envoi" });
  const lance = useRef(false);
  useEffect(() => {
    if (lance.current) return;
    lance.current = true;
    pointerAvecQr(jeton)
      .then((r) => setEtat(r.ok ? { phase: "fait", prenom: r.prenom, sens: r.sens, heure: r.heure, tablette: r.tablette } : { phase: "refus", erreur: r.erreur }))
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
      <Link href="/salarie" className="btn-secondary mt-5 inline-flex">
        Voir mes pointages
      </Link>
    </div>
  );
}
