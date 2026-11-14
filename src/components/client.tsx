"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { IconeAlerte, IconeCheck } from "@/components/icones";
import { Onglet } from "@/components/ui";
import type { Resultat } from "@/lib/actions";

/** Exécute une action serveur : état « en cours », message d'erreur, rafraîchissement de la page. */
export function useAction() {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function lancer<T extends object>(action: () => Promise<Resultat<T>>, suite?: (r: { ok: true } & T) => string | void) {
    setErreur(null);
    setInfo(null);
    demarrer(async () => {
      try {
        const r = await action();
        if (!r.ok) {
          setErreur(r.erreur);
          return;
        }
        const message = suite?.(r);
        if (message) setInfo(message);
        router.refresh();
      } catch {
        setErreur("Action impossible : vérifiez votre connexion et réessayez.");
      }
    });
  }
  return { enCours, erreur, info, lancer, setErreur, setInfo };
}

export function Messages({ erreur, info }: { erreur: string | null; info?: string | null }) {
  return (
    <>
      {erreur && (
        <div className="encart-danger flex items-start gap-2 py-3 text-[13px] font-semibold" role="alert">
          <IconeAlerte size={16} />
          <span>{erreur}</span>
        </div>
      )}
      {info && (
        <div className="encart-ok flex items-start gap-2 py-3 text-[13px] font-semibold" role="status">
          <IconeCheck size={16} strokeWidth={3} />
          <span className="whitespace-pre-line">{info}</span>
        </div>
      )}
    </>
  );
}

export function Navigation({ onglets, racine, libelle }: { onglets: [string, string][]; racine: string; libelle: string }) {
  const chemin = usePathname();
  return (
    <nav aria-label={libelle} className="flex gap-6 overflow-x-auto">
      {onglets.map(([href, texte]) => (
        <Onglet key={href} href={href} actif={href === racine ? chemin === racine : chemin.startsWith(href)}>
          {texte}
        </Onglet>
      ))}
    </nav>
  );
}

export function Deconnexion() {
  const [enCours, setEnCours] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      disabled={enCours}
      onClick={async () => {
        setEnCours(true);
        await fetch("/api/auth/deconnexion", { method: "POST" }).catch(() => undefined);
        window.location.href = "/connexion";
      }}
    >
      Se déconnecter
    </button>
  );
}

/** Bouton qui lance une action serveur, avec confirmation facultative. */
export function BoutonAction({
  action,
  children,
  className = "btn-secondary btn-sm",
  confirmer,
}: {
  action: () => Promise<Resultat<object>>;
  children: React.ReactNode;
  className?: string;
  confirmer?: string;
}) {
  const a = useAction();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className={className}
        disabled={a.enCours}
        onClick={() => {
          if (confirmer && !window.confirm(confirmer)) return;
          a.lancer(action);
        }}
      >
        {children}
      </button>
      {a.erreur && (
        <span className="text-[12px] font-semibold" style={{ color: "var(--danger-ink)" }} role="alert">
          {a.erreur}
        </span>
      )}
    </span>
  );
}
