import Link from "next/link";
import type { TypeAnomalie } from "@/db/schema";
import { IconeAlerte, IconeCadenas, IconeCheck, IconeCorrige, IconeHorloge, IconeRotation } from "@/components/icones";

/** Kicker monospace : « 01 — FONDATIONS », « SEMAINE 38 · 2026 ». */
export function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="kicker">{children}</div>;
}

/** Onglet de l'espace gérant : soulignement cyan de 3 px quand il est actif. */
export function Onglet({ href, actif, children }: { href: string; actif: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-0.5 pt-[18px] pb-4 text-sm whitespace-nowrap"
      style={{
        fontWeight: actif ? 700 : 500,
        color: actif ? "var(--navy)" : "var(--muted)",
        boxShadow: actif ? "inset 0 -3px 0 var(--cyan)" : "none",
      }}
      aria-current={actif ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

/** Filtre en capsule : navy plein quand il est sélectionné. */
export function Chip({ href, actif, children }: { href: string; actif: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full px-4 py-[7px] text-[13px] font-semibold"
      style={
        actif
          ? { background: "var(--navy)", color: "#fff", border: "1px solid var(--navy)" }
          : { background: "#fff", color: "var(--muted)", border: "1px solid var(--line-portal)" }
      }
    >
      {children}
    </Link>
  );
}

export type EtatRecap = "valide" | "a-valider" | "en-cours";

/** Statut d'un récap : une icône, un mot, jamais la couleur seule. */
export function PastilleRecap({ etat }: { etat: EtatRecap }) {
  if (etat === "valide")
    return (
      <span className="pastille pastille-ok">
        <IconeCheck size={13} strokeWidth={3} />
        validé
      </span>
    );
  if (etat === "a-valider")
    return (
      <span className="pastille pastille-attente">
        <IconeHorloge size={13} />à valider
      </span>
    );
  return (
    <span className="pastille pastille-info">
      <IconeRotation size={13} />
      en cours
    </span>
  );
}

export function PastilleVerrouille() {
  return (
    <span className="pastille pastille-danger">
      <IconeCadenas size={13} />
      badge verrouillé
    </span>
  );
}

export function PastilleCorrige() {
  return (
    <span className="pastille pastille-info">
      <IconeCorrige size={12} />
      corrigé
    </span>
  );
}

export function PastilleAnomalie({ statut }: { statut: "OUVERTE" | "TRAITEE" | "IGNOREE" }) {
  if (statut === "OUVERTE")
    return (
      <span className="pastille pastille-alerte">
        <IconeAlerte size={12} />
        ouverte
      </span>
    );
  if (statut === "TRAITEE")
    return (
      <span className="pastille pastille-ok">
        <IconeCheck size={12} strokeWidth={3} />
        traitée
      </span>
    );
  return <span className="pastille pastille-attente">ignorée</span>;
}

/** État d'un terminal : point coloré + mot. */
export function PastilleTerminal({ etat }: { etat: "connecte" | "silencieux" | "non-appaire" | "desactive" }) {
  const map = {
    connecte: ["pastille-ok", "#2BB673", "connecté"],
    silencieux: ["pastille-danger", "#E5484D", "silencieux"],
    "non-appaire": ["pastille-attente", "#9AA7BD", "non appairé"],
    desactive: ["pastille-attente", "#9AA7BD", "désactivé"],
  } as const;
  const [cls, dot, libelle] = map[etat];
  return (
    <span className={`pastille ${cls}`}>
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: dot }} />
      {libelle}
    </span>
  );
}

const LIBELLES_ANOMALIE: Record<TypeAnomalie, string> = {
  OUBLI_SORTIE: "Oubli de sortie",
  DOUBLE_SCAN: "Double scan",
  HORS_PLAGE: "Pointage incohérent",
  REPOS_11H: "Repos quotidien < 11 h",
  REPOS_HEBDO: "Repos hebdomadaire < 35 h",
  PAUSE_MANQUANTE: "Pause manquante",
  AMPLITUDE: "Amplitude > 13 h",
  PIN_VERROUILLE: "PIN verrouillé",
  POINTAGE_HORS_LIGNE: "Pointage hors ligne",
};

export function libelleAnomalie(type: TypeAnomalie): string {
  return LIBELLES_ANOMALIE[type];
}

/** Anomalie dans un tableau : icône ambre + libellé. */
export function LigneAnomalie({ type }: { type: TypeAnomalie }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "var(--warn-ink)" }}>
      <IconeAlerte size={14} />
      {libelleAnomalie(type)}
    </span>
  );
}
