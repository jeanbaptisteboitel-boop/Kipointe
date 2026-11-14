import type { SemaineCompteur } from "@/lib/heures/compteur";
import { formatEcart, formatMinutes } from "@/lib/pointage/paires";
import { frDate, semaineIso } from "@/lib/temps/zone";

/**
 * Heures réalisées par semaine, comparées au contrat.
 *
 * Une colonne empilée par semaine — heures pointées, puis absences assimilées (congés, maladie,
 * formation, fériés) — et un trait pour la durée prévue. Les valeurs sont dans le tableau des
 * semaines de la page ; chaque colonne porte son détail en infobulle.
 * Couleurs vérifiées (validate_palette) : #1565C0 / #1FA9F0, séparées par un filet blanc.
 */
const TRAVAILLE = "#1565C0";
const ASSIMILE = "#1FA9F0";
const HAUTEUR = 150;

export function HeuresGraphique({ semaines }: { semaines: SemaineCompteur[] }) {
  const max = Math.max(60, ...semaines.map((s) => Math.max(s.horsCompteur ? 0 : s.prevuMinutes, s.realiseMinutes)));
  const echelle = (m: number) => Math.round((m / max) * HAUTEUR);
  const graduation = Math.ceil(max / 60 / 10) * 10;
  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]" style={{ color: "var(--muted)" }}>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TRAVAILLE }} /> heures pointées
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ASSIMILE }} /> absences comptées (congés, maladie, formation, fériés)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ background: "var(--ink)" }} /> durée prévue au contrat
        </span>
      </div>
      <div className="flex items-end gap-1 overflow-x-auto pb-1" role="img" aria-label="Heures réalisées par semaine, comparées à la durée prévue">
        <div className="flex flex-col justify-between text-right text-[10px]" style={{ height: HAUTEUR, color: "var(--faint)" }} aria-hidden>
          <span>{graduation} h</span>
          <span>0</span>
        </div>
        {semaines.map((s) => {
          const hT = echelle(s.travailleMinutes);
          const hA = echelle(s.assimileMinutes);
          const detail = `Semaine du ${frDate(s.lundi)}${s.terminee ? "" : " (en cours)"} — pointé ${formatMinutes(s.travailleMinutes)}, absences comptées ${formatMinutes(s.assimileMinutes)}, ${s.horsCompteur ? "avant le début du suivi" : `prévu ${formatMinutes(s.prevuMinutes)}, écart ${formatEcart(s.ecartMinutes)}`}`;
          return (
            <div key={s.lundi} className="flex min-w-[16px] flex-1 flex-col items-center gap-1" title={detail}>
              <div className="relative flex w-full flex-col-reverse items-center" style={{ height: HAUTEUR, borderBottom: "1px solid var(--line-portal)" }}>
                {hT > 0 && <div style={{ height: hT, width: "min(18px, 100%)", background: TRAVAILLE, borderRadius: hA > 0 ? 0 : "4px 4px 0 0", opacity: s.terminee ? 1 : 0.55 }} />}
                {hA > 0 && <div style={{ height: hA, width: "min(18px, 100%)", background: ASSIMILE, borderRadius: "4px 4px 0 0", marginBottom: hT > 0 ? 2 : 0, opacity: s.terminee ? 1 : 0.55 }} />}
                {s.prevuMinutes > 0 && !s.horsCompteur && <div className="absolute left-0 w-full" style={{ bottom: echelle(s.prevuMinutes), height: 2, background: "var(--ink)" }} />}
              </div>
              <span className="mono text-[10px]" style={{ color: "var(--muted)" }}>
                S{semaineIso(s.lundi).semaine}
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
