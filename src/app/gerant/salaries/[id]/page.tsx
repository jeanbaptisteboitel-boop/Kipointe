import Link from "next/link";
import { notFound } from "next/navigation";
import { IconeChevronGauche } from "@/components/icones";
import { LigneAnomalie, PastilleVerrouille } from "@/components/ui";
import { exigerGerant } from "@/lib/auth/session";
import { libelleType } from "@/lib/pointage/service";
import { formatDateCourte, formatDateFr, formatDuree, formatHeure, formatSemaine, joursSemaine, nomJour } from "@/lib/temps/journee";
import { chargerSemaineSalarie, semaineDemandee } from "@/lib/ui/data";
import { LIBELLES_SOURCE } from "@/lib/ui/libelles";
import { SelecteurSemaine } from "../../SelecteurSemaine";
import { ActionsSalarie } from "./ActionsSalarie";
import { Pointages } from "./Pointages";
import { CarteRecap } from "./CarteRecap";

export const metadata = { title: "Fiche salarié" };

export default async function PageSalarie({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ semaine?: string }>;
}) {
  const u = await exigerGerant();
  const { id } = await params;
  const { semaine: param } = await searchParams;
  const { annee, semaine } = semaineDemandee(param);
  const data = await chargerSemaineSalarie(u, id, annee, semaine);
  if (!data) notFound();

  const { salarie: s, resultat, pointages, recap, parametres } = data;
  const maintenant = new Date();
  const verrouille = !!s.pinVerrouilleJusqua && s.pinVerrouilleJusqua > maintenant;
  const tz = parametres.timezone;
  const base = `/gerant/salaries/${s.id}`;
  const jours = joursSemaine(annee, semaine);
  const totalSup = resultat.heuresSup.reduce((x, h) => x + h.minutes, 0);
  const nbCorrections = pointages.filter((p) => p.corrige).length;
  const nbSaisiesManuelles = pointages.filter((p) => p.source === "SAISIE_MANUELLE").length;
  const nbHorsLigne = pointages.filter((p) => p.source === "KIOSQUE_HORS_LIGNE").length;
  const nbAnomaliesOuvertes = data.anomalies.filter((a) => a.statut === "OUVERTE" && jours.includes(a.dateJour)).length;

  return (
    <div className="flex flex-col gap-[18px]">
      <Link href="/gerant/salaries" className="flex w-max items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--muted)" }}>
        <IconeChevronGauche size={15} />
        Tous les salariés
      </Link>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="titre text-[28px]">
                {s.prenom} {s.nom}
              </h1>
              {verrouille && <PastilleVerrouille />}
              {!s.actif && <span className="pastille pastille-attente">sorti</span>}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-[18px] text-[13px]" style={{ color: "var(--muted)" }}>
              {s.matricule && (
                <span>
                  Matricule <strong className="mono" style={{ color: "var(--ink)" }}>{s.matricule}</strong>
                </span>
              )}
              <span>
                Contrat <strong className="tabnum" style={{ color: "var(--ink)" }}>{formatDuree(s.contratHeuresHebdo)}</strong> / semaine
              </span>
              <span>
                Badge <strong className="mono" style={{ color: "var(--ink)" }}>{s.badgeUuid.slice(0, 13).toUpperCase()}</strong>
              </span>
              {s.dateEntree && <span>Entré le {formatDateFr(s.dateEntree)}</span>}
            </div>
            {verrouille && (
              <p className="mt-2.5 text-[13px]" style={{ color: "var(--danger-ink)" }}>
                Badge verrouillé jusqu'à {formatHeure(s.pinVerrouilleJusqua!, tz)} après cinq codes erronés.
              </p>
            )}
          </div>
          <ActionsSalarie salarieId={s.id} actif={s.actif} verrouille={verrouille} />
        </div>
      </div>

      <SelecteurSemaine annee={annee} semaine={semaine} base={base} />

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-1 basis-[560px] flex-col gap-[18px]">
          <div className="card-plat overflow-x-auto">
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-[18px] py-4"
              style={{ borderBottom: "1px solid var(--line-portal)", minWidth: 620 }}
            >
              <span className="titre-sm">
                Semaine {semaine} · du {formatDateCourte(jours[0]!)} au {formatDateCourte(jours[6]!)}
              </span>
              <span className="tabnum text-[13px]" style={{ color: "var(--muted)" }}>
                Total {formatDuree(resultat.totalMinutes)} · H. sup. {formatDuree(totalSup)}
              </span>
            </div>
            <table className="tbl" style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th className="whitespace-nowrap" style={{ width: 104 }}>
                    Jour
                  </th>
                  <th>Intervalles</th>
                  <th className="text-right whitespace-nowrap" style={{ width: 84 }}>
                    Total
                  </th>
                  <th style={{ width: 190 }}>Anomalie</th>
                </tr>
              </thead>
              <tbody>
                {resultat.jours.map((j) => {
                  const alertes = resultat.anomalies.filter((a) => a.dateJour === j.date);
                  const repos = j.intervalles.length === 0;
                  return (
                    <tr key={j.date} style={alertes.length ? { background: "var(--warn-bg)" } : undefined}>
                      <td className="tabnum text-[13px] font-semibold whitespace-nowrap" style={alertes.length ? { color: "var(--warn-ink)" } : undefined}>
                        {nomJour(j.date, true)} {formatDateCourte(j.date)}
                      </td>
                      <td className="tabnum" style={{ color: repos ? "var(--faint)" : alertes.length ? "var(--warn-ink)" : undefined }}>
                        {repos
                          ? "Repos"
                          : j.intervalles.map((it, i) => (
                              <span key={i} className="mr-4 inline-block whitespace-nowrap">
                                {formatHeure(it.debut, tz)} → {it.fin ? formatHeure(it.fin, tz) : it.enCours ? "en cours" : "?"}
                              </span>
                            ))}
                      </td>
                      <td
                        className="tabnum text-right font-bold whitespace-nowrap"
                        style={{ color: repos ? "var(--faint)" : alertes.length ? "var(--warn-ink)" : undefined }}
                      >
                        {j.minutes > 0 ? formatDuree(j.minutes) : "—"}
                      </td>
                      <td>
                        {alertes.length === 0 ? (
                          <span style={{ color: "var(--faint)" }}>—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {alertes.map((a, i) => (
                              <LigneAnomalie key={i} type={a.type} />
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pointages
            salarieId={s.id}
            timezone={tz}
            pointages={pointages.map((p) => ({
              id: p.id,
              horodatage: p.horodatage.toISOString(),
              jour: `${nomJour(p.horodatage.toISOString().slice(0, 10), true)}`,
              heure: formatHeure(p.horodatage, tz),
              type: p.type,
              typeLibelle: libelleType(p.type),
              source: LIBELLES_SOURCE[p.source] ?? p.source,
              corrige: p.corrige,
              motif: p.motif,
            }))}
          />
        </div>

        <CarteRecap
          recap={{ id: recap.id, valideLe: recap.valideLe?.toISOString() ?? null, hash: recap.hashSha256 }}
          terminee={resultat.terminee}
          totalMinutes={resultat.totalMinutes}
          dureeReference={parametres.dureeHebdoReference}
          heuresSup={resultat.heuresSup}
          nbCorrections={nbCorrections}
          nbSaisiesManuelles={nbSaisiesManuelles}
          nbHorsLigne={nbHorsLigne}
          nbAnomaliesOuvertes={nbAnomaliesOuvertes}
          nbOublis={resultat.anomalies.filter((a) => a.type === "OUBLI_SORTIE").length}
          semaineLabel={formatSemaine(annee, semaine)}
        />
      </div>
    </div>
  );
}
