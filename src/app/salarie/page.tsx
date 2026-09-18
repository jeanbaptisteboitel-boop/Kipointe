import { redirect } from "next/navigation";
import { LogoKipointe } from "@/components/Logomark";
import { IconeAlerte, IconeTelecharger } from "@/components/icones";
import { PastilleCorrige, libelleAnomalie } from "@/components/ui";
import { getDb } from "@/db";
import { withTenant } from "@/db/tenant";
import { exigerConnecte } from "@/lib/auth/session";
import { calculerSemaineSalarie } from "@/lib/calcul/recap";
import { libelleType } from "@/lib/pointage/service";
import { formatDateCourte, formatDuree, formatHeure, formatSemaine, nomJour } from "@/lib/temps/journee";
import { semaineDemandee } from "@/lib/ui/data";
import { LIBELLES_SOURCE } from "@/lib/ui/libelles";
import { SelecteurSemaine } from "../gerant/SelecteurSemaine";
import { DeconnexionSalarie } from "./DeconnexionSalarie";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes pointages" };

export default async function PageSalarie({ searchParams }: { searchParams: Promise<{ semaine?: string }> }) {
  const u = await exigerConnecte();
  if (u.role === "GERANT") redirect("/gerant");
  if (!u.salarieId) redirect("/connexion");

  const { semaine: param } = await searchParams;
  const { annee, semaine } = semaineDemandee(param);
  const res = await withTenant(getDb(), u.organisationId, (tx) =>
    calculerSemaineSalarie(tx, u.organisationId, u.salarieId!, annee, semaine, new Date(), { synchroniser: false }),
  );
  const tz = res.parametres.timezone;
  const totalSup = res.resultat.heuresSup.reduce((s, h) => s + h.minutes, 0);
  const alertes = res.resultat.anomalies;

  return (
    <div className="mx-auto max-w-[520px] px-4 pb-10">
      <header className="-mx-4 px-[18px] pt-4 pb-[18px] text-white" style={{ background: "var(--navy)" }}>
        <div className="flex items-center justify-between gap-3">
          <LogoKipointe size={22} onDark />
          <DeconnexionSalarie />
        </div>
        <div className="mono mt-[18px]" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--cyan-bright)" }}>
          Mes pointages
        </div>
        <h1 className="titre mt-1.5 text-[25px]">
          {res.salarie.prenom} {res.salarie.nom}
        </h1>
        <div className="mt-1 text-[13px]" style={{ color: "rgba(255,255,255,0.68)" }}>
          {res.salarie.matricule ? `${res.salarie.matricule} · ` : ""}Durée contractuelle {formatDuree(res.salarie.contratHeuresHebdo)} / semaine
        </div>
      </header>

      <div className="mt-4 flex flex-col gap-3.5">
        <SelecteurSemaine annee={annee} semaine={semaine} base="/salarie" />

        <div className="flex items-end justify-between rounded-xl p-[18px] text-white" style={{ background: "var(--navy)" }}>
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--cyan-bright)" }}>
              Total de la semaine
            </div>
            <div className="titre tabnum mt-[7px]" style={{ fontSize: 40, letterSpacing: "-0.04em", lineHeight: 1 }}>
              {formatDuree(res.resultat.totalMinutes)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.68)" }}>
              dont h. sup.
            </div>
            <div className="tabnum text-[17px] font-bold">{totalSup > 0 ? formatDuree(totalSup) : "—"}</div>
          </div>
        </div>

        <div className="card-plat overflow-hidden">
          {res.resultat.jours.map((j, i) => {
            const alerte = alertes.some((a) => a.dateJour === j.date);
            const repos = j.minutes === 0 && !j.enCours;
            return (
              <div
                key={j.date}
                className="flex items-center justify-between gap-2.5 px-3.5 py-[11px]"
                style={{
                  borderTop: i === 0 ? "none" : "1px solid var(--line-portal)",
                  background: alerte ? "var(--warn-bg)" : undefined,
                }}
              >
                <span
                  className="tabnum flex items-center gap-2 text-[13px] font-semibold"
                  style={{ color: alerte ? "var(--warn-ink)" : repos ? "var(--faint)" : undefined }}
                >
                  {alerte && <IconeAlerte size={14} />}
                  {nomJour(j.date, true)} {formatDateCourte(j.date)}
                </span>
                <span
                  className="tabnum text-sm font-bold"
                  style={{ color: alerte ? "var(--warn-ink)" : repos ? "var(--faint)" : undefined, fontWeight: repos ? 400 : 700 }}
                >
                  {j.minutes > 0 ? formatDuree(j.minutes) : j.enCours ? "en cours" : "Repos"}
                </span>
              </div>
            );
          })}
        </div>

        {alertes.length > 0 && (
          <div className="encart-alerte flex items-start gap-2.5 py-3">
            <IconeAlerte size={17} className="mt-0.5" />
            <span className="text-xs font-semibold" style={{ lineHeight: 1.45 }}>
              {alertes
                .slice(0, 3)
                .map((a) => `${nomJour(a.dateJour, true)} ${formatDateCourte(a.dateJour)} : ${libelleAnomalie(a.type).toLowerCase()}`)
                .join(" · ")}
              . Signalez-le à votre gérant.
            </span>
          </div>
        )}

        <div>
          <div className="mono mb-2.5" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)" }}>
            Détail des pointages
          </div>
          <div className="card-plat overflow-hidden">
            {res.pointages.length === 0 && (
              <p className="px-3.5 py-5 text-sm" style={{ color: "var(--muted)" }}>
                Aucun pointage cette semaine.
              </p>
            )}
            {res.pointages.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-2.5 px-3.5 py-[11px]"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--line-portal)" }}
              >
                <span className="tabnum flex-none text-[13px] font-semibold" style={{ width: 46, color: "var(--muted)" }}>
                  {nomJour(p.horodatage.toISOString().slice(0, 10), true)}
                </span>
                <span className="tabnum flex-none text-sm font-bold" style={{ width: 46 }}>
                  {formatHeure(p.horodatage, tz)}
                </span>
                <span className="flex-none text-[13px] font-semibold" style={{ width: 90 }}>
                  {libelleType(p.type)}
                </span>
                <span className="flex-1 text-xs" style={{ color: "var(--muted)" }}>
                  {LIBELLES_SOURCE[p.source] ?? p.source}
                </span>
                {p.corrige && <PastilleCorrige />}
              </div>
            ))}
          </div>
        </div>

        <a href={`/api/salarie/pointages?semaine=${formatSemaine(annee, semaine)}&format=csv`} className="btn-secondary h-12">
          <IconeTelecharger size={16} />
          Exporter (CSV)
        </a>
        <p className="px-2 text-center text-[11px]" style={{ color: "var(--faint)", lineHeight: 1.5 }}>
          L'export contient vos pointages de la semaine affichée — c'est l'exercice de votre droit d'accès. Pour toute correction, adressez-vous à votre gérant.
        </p>
      </div>
    </div>
  );
}
