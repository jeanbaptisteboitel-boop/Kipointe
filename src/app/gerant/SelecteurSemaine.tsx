import Link from "next/link";
import { formatDateFr, formatSemaine, joursSemaine, semainePrecedente, semaineSuivante } from "@/lib/temps/journee";

export function SelecteurSemaine({ annee, semaine, base }: { annee: number; semaine: number; base: string }) {
  const prec = semainePrecedente(annee, semaine);
  const suiv = semaineSuivante(annee, semaine);
  const jours = joursSemaine(annee, semaine);
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="no-print flex flex-wrap items-center gap-3">
      <Link href={`${base}${sep}semaine=${formatSemaine(prec.annee, prec.semaine)}`} className="btn-secondary btn-sm">
        ← Semaine précédente
      </Link>
      <div className="text-lg font-semibold">
        Semaine {semaine} · {annee}
        <span className="ml-2 text-sm font-normal text-slate-500">
          du {formatDateFr(jours[0]!)} au {formatDateFr(jours[6]!)}
        </span>
      </div>
      <Link href={`${base}${sep}semaine=${formatSemaine(suiv.annee, suiv.semaine)}`} className="btn-secondary btn-sm">
        Semaine suivante →
      </Link>
      <Link href={base} className="text-sm text-slate-500 underline">
        Semaine en cours
      </Link>
    </div>
  );
}
