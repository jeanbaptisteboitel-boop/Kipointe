import { Ecart } from "@/components/ui";
import type { SemaineCompteur } from "@/lib/heures/compteur";
import { formatEcart, formatMinutes } from "@/lib/pointage/paires";
import { frDate } from "@/lib/temps/zone";

/** Prévu / réalisé / écart / solde, semaine par semaine (la plus récente en tête). */
export function TableauSemaines({ semaines }: { semaines: SemaineCompteur[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Semaine du</th>
            <th className="text-right">Prévu</th>
            <th className="text-right">Pointé</th>
            <th className="text-right">Absences comptées</th>
            <th className="text-right">Écart</th>
            <th className="text-right">Solde</th>
          </tr>
        </thead>
        <tbody>
          {[...semaines].reverse().map((s) => (
            <tr key={s.lundi}>
              <td>
                {frDate(s.lundi)}
                {!s.terminee && <span style={{ color: "var(--muted)" }}> · en cours</span>}
              </td>
              <td className="tabnum text-right">{s.horsCompteur ? "—" : formatMinutes(s.prevuMinutes)}</td>
              <td className="tabnum text-right">{formatMinutes(s.travailleMinutes)}</td>
              <td className="tabnum text-right">
                {formatMinutes(s.assimileMinutes)}
                {s.nonAutoriseMinutes > 0 && (
                  <div className="text-[11px]" style={{ color: "var(--danger-ink)" }}>
                    {formatMinutes(s.nonAutoriseMinutes)} non autorisée
                  </div>
                )}
              </td>
              <td className="text-right">{s.horsCompteur ? <span title="Avant le début du suivi">—</span> : <Ecart minutes={s.ecartMinutes} provisoire={!s.terminee} />}</td>
              <td className="tabnum text-right">{s.soldeApresMinutes == null ? "—" : formatEcart(s.soldeApresMinutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[12px]" style={{ color: "var(--muted)" }}>
        * Semaine en cours : écart provisoire, arrêté au dernier jour renseigné ; il n'entre dans le solde qu'une fois la semaine terminée.
      </p>
    </div>
  );
}
