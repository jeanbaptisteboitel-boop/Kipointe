import Link from "next/link";
import { IconeChevronDroite, IconeChevronGauche } from "@/components/icones";
import { formatDateCourte, formatSemaine, joursSemaine, semainePrecedente, semaineSuivante } from "@/lib/temps/journee";

/** Sélecteur de semaine ISO en capsule : ← Semaine 38 · 2026 du 14/09 au 20/09 → */
export function SelecteurSemaine({ annee, semaine, base }: { annee: number; semaine: number; base: string }) {
  const prec = semainePrecedente(annee, semaine);
  const suiv = semaineSuivante(annee, semaine);
  const jours = joursSemaine(annee, semaine);
  const sep = base.includes("?") ? "&" : "?";
  const bouton = "flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--bg-portal)]";

  return (
    <div className="no-print flex items-center gap-1.5 rounded-full bg-white p-1" style={{ border: "1px solid var(--line-portal)", color: "var(--muted)" }}>
      <Link href={`${base}${sep}semaine=${formatSemaine(prec.annee, prec.semaine)}`} className={bouton} aria-label="Semaine précédente">
        <IconeChevronGauche size={17} />
      </Link>
      <span className="flex flex-col items-center px-2 text-center sm:flex-row sm:gap-2.5">
        <span className="tabnum text-sm font-bold whitespace-nowrap" style={{ color: "var(--ink)" }}>
          Semaine {semaine} · {annee}
        </span>
        <span className="tabnum text-[13px] whitespace-nowrap">
          du {formatDateCourte(jours[0]!)} au {formatDateCourte(jours[6]!)}
        </span>
      </span>
      <Link href={`${base}${sep}semaine=${formatSemaine(suiv.annee, suiv.semaine)}`} className={bouton} aria-label="Semaine suivante">
        <IconeChevronDroite size={17} />
      </Link>
    </div>
  );
}
