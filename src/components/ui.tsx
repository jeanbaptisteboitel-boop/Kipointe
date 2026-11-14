import Link from "next/link";
import type { StatutConge, StatutSemaine } from "@/db/schema";
import { IconeAlerte, IconeCheck, IconeCroix, IconeHorloge } from "@/components/icones";
import { LIBELLES_STATUT_CONGE } from "@/lib/conges/types";
import { formatEcart } from "@/lib/pointage/paires";

/** Kicker monospace : « SEMAINE 46 · 2026 ». */
export function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="kicker">{children}</div>;
}

/** Onglet de navigation : soulignement cyan de 3 px quand il est actif. */
export function Onglet({ href, actif, children }: { href: string; actif: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-0.5 pt-[18px] pb-4 text-sm whitespace-nowrap"
      style={{ fontWeight: actif ? 700 : 500, color: actif ? "var(--navy)" : "var(--muted)", boxShadow: actif ? "inset 0 -3px 0 var(--cyan)" : "none" }}
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
      style={actif ? { background: "var(--navy)", color: "#fff", border: "1px solid var(--navy)" } : { background: "#fff", color: "var(--muted)", border: "1px solid var(--line-portal)" }}
    >
      {children}
    </Link>
  );
}

/** En-tête de page : kicker, titre, et actions à droite. */
export function EnTete({ kicker, titre, children }: { kicker?: string; titre: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <Kicker>{kicker}</Kicker>}
        <h1 className="titre mt-1 text-[26px]">{titre}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}

/** Bloc titré d'une fiche. */
export function Section({ titre, aide, actions, children }: { titre: string; aide?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="titre-sm text-[17px]">{titre}</h2>
          {aide && (
            <p className="mt-1 text-[13px]" style={{ color: "var(--muted)" }}>
              {aide}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Statut d'une semaine de pointage : une icône et un mot, jamais la couleur seule. */
export function PastilleSemaine({ statut }: { statut: StatutSemaine }) {
  if (statut === "VALIDE")
    return (
      <span className="pastille pastille-ok">
        <IconeCheck size={13} strokeWidth={3} />
        validée
      </span>
    );
  if (statut === "MODIF_DEMANDEE")
    return (
      <span className="pastille pastille-danger">
        <IconeAlerte size={13} />
        modification demandée
      </span>
    );
  return (
    <span className="pastille pastille-alerte">
      <IconeHorloge size={13} />à valider
    </span>
  );
}

export function PastilleConge({ statut }: { statut: StatutConge }) {
  const libelle = LIBELLES_STATUT_CONGE[statut].toLowerCase();
  if (statut === "ACCEPTEE")
    return (
      <span className="pastille pastille-ok">
        <IconeCheck size={13} strokeWidth={3} />
        {libelle}
      </span>
    );
  if (statut === "REFUSEE")
    return (
      <span className="pastille pastille-danger">
        <IconeCroix size={13} />
        {libelle}
      </span>
    );
  return (
    <span className="pastille pastille-alerte">
      <IconeHorloge size={13} />
      {libelle}
    </span>
  );
}

/** Écart signé au contrat : « −2 h 00 » (heures dues) en rouge, « +1 h 30 » en bleu, toujours avec son signe. */
export function Ecart({ minutes, provisoire = false }: { minutes: number; provisoire?: boolean }) {
  const couleur = minutes < 0 ? "var(--danger-ink)" : minutes > 0 ? "var(--info-ink)" : "var(--muted)";
  return (
    <span className="tabnum font-bold" style={{ color: couleur }} title={minutes < 0 ? "Heures non effectuées par rapport au contrat" : minutes > 0 ? "Heures au-delà du contrat" : "Conforme au contrat"}>
      {formatEcart(minutes)}
      {provisoire && <span className="font-medium"> *</span>}
    </span>
  );
}

/** Chiffre clé d'un tableau de bord. */
export function Chiffre({ libelle, valeur, detail }: { libelle: string; valeur: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <div className="card-plat px-5 py-4">
      <div className="kicker">{libelle}</div>
      <div className="display tabnum mt-1.5 text-[26px]">{valeur}</div>
      {detail && (
        <div className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
          {detail}
        </div>
      )}
    </div>
  );
}

export function Vide({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
      {children}
    </p>
  );
}
