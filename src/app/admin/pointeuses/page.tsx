import { asc, desc, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { ecarterBadge, modifierPointeuse, retraiterBadges, supprimerPointeuse } from "@/app/actions/pointeuses";
import { BoutonAction } from "@/components/client";
import { FormulairePointeuse, ImportCsv, ModePointeuse, RattacherBadge } from "@/components/Formulaires";
import { EnTete, Section, Vide } from "@/components/ui";
import { badgeage, pointeuse, salarie } from "@/db/schema";
import { lire } from "@/lib/acces";
import { exigerAdmin } from "@/lib/auth/session";
import { chargerOrganisation, nomComplet } from "@/lib/donnees";
import { SILENCE_MAX_MS } from "@/lib/notifications/quotidien";
import { frDateHeure } from "@/lib/temps/zone";

export const metadata = { title: "Pointeuses" };

export default async function PagePointeuses() {
  const u = await exigerAdmin();
  const d = await lire(u, async (tx) => ({
    org: await chargerOrganisation(tx, u.organisationId),
    appareils: await tx.select().from(pointeuse).orderBy(asc(pointeuse.createdAt)),
    fiches: await tx.select().from(salarie).where(eq(salarie.actif, true)).orderBy(asc(salarie.nom), asc(salarie.prenom)),
    orphelins: await tx
      .select({ pin: badgeage.pin, n: sql<number>`count(*)::int`, premier: sql<string>`min(${badgeage.horodatageLocal})`, dernier: sql<string>`max(${badgeage.horodatageLocal})` })
      .from(badgeage)
      .where(eq(badgeage.etat, "NON_RATTACHE"))
      .groupBy(badgeage.pin)
      .orderBy(desc(sql`max(${badgeage.horodatageLocal})`)),
  }));
  const hote = (await headers()).get("host") ?? "votre-domaine";
  const salaries = d.fiches.map((f) => ({ id: f.id, nom: nomComplet(f) + (f.pointeuseRef ? ` (n° ${f.pointeuseRef})` : "") }));

  return (
    <>
      <EnTete kicker="Matériel" titre="Pointeuses" />
      <div className="flex flex-col gap-6">
        <Section titre="Appareils" aide="Une pointeuse enregistrée ici envoie d'elle-même ses badgeages, au fil de l'eau, et les renvoie après une coupure de réseau.">
          {d.appareils.length === 0 ? (
            <Vide>Aucune pointeuse enregistrée.</Vide>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Appareil</th>
                    <th className="text-left">État</th>
                    <th className="text-left">Dernier contact</th>
                    <th className="text-left">Dernier badgeage</th>
                    <th className="text-left">Sens des badgeages</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.appareils.map((a) => {
                    const muette = !a.derniereConnexion || Date.now() - a.derniereConnexion.getTime() > SILENCE_MAX_MS;
                    return (
                      <tr key={a.id}>
                        <td>
                          <div className="font-bold">{a.nom ?? "Pointeuse"}</div>
                          <div className="mono text-[12px]" style={{ color: "var(--muted)" }}>
                            {a.numeroSerie}
                          </div>
                        </td>
                        <td>
                          {!a.actif ? (
                            <span className="pastille pastille-attente">désactivée</span>
                          ) : !a.derniereConnexion ? (
                            <span className="pastille pastille-alerte">jamais connectée</span>
                          ) : muette ? (
                            <span className="pastille pastille-danger">silencieuse</span>
                          ) : (
                            <span className="pastille pastille-ok">connectée</span>
                          )}
                        </td>
                        <td className="tabnum">{frDateHeure(a.derniereConnexion, d.org.timezone)}</td>
                        <td className="tabnum">{frDateHeure(a.dernierPointage, d.org.timezone)}</td>
                        <td>
                          <ModePointeuse id={a.id} mode={a.modeStatut} />
                        </td>
                        <td className="text-right">
                          <span className="inline-flex gap-2">
                            <BoutonAction action={modifierPointeuse.bind(null, a.id, { actif: !a.actif })}>{a.actif ? "Désactiver" : "Réactiver"}</BoutonAction>
                            <BoutonAction action={supprimerPointeuse.bind(null, a.id)} className="btn-danger btn-sm" confirmer="Retirer cette pointeuse ? Ses badgeages déjà reçus restent comptés ; elle ne pourra plus en envoyer.">
                              Retirer
                            </BoutonAction>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[12px]" style={{ color: "var(--muted)" }}>
                « Alternance » : à choisir si l'appareil n'a pas de touches Entrée / Sortie ou si vos salariés ne les utilisent pas — le premier badgeage du jour est une arrivée, le suivant un départ, et ainsi de suite.
              </p>
            </div>
          )}
          <div className="mt-5 pt-5" style={{ borderTop: "1px solid var(--line-portal)" }}>
            <FormulairePointeuse />
          </div>
        </Section>

        <Section
          titre="Badgeages non rattachés"
          aide="Des badgeages reçus avec un numéro qu'aucune fiche ne porte. Rattachez le numéro à un salarié : ses badgeages sont alors comptés rétroactivement."
          actions={d.orphelins.length > 0 ? <BoutonAction action={retraiterBadges}>Retraiter</BoutonAction> : undefined}
        >
          {d.orphelins.length === 0 ? (
            <Vide>Tous les badgeages reçus sont rattachés à un salarié.</Vide>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">N° dans la pointeuse</th>
                    <th className="text-right">Badgeages</th>
                    <th className="text-left">Du</th>
                    <th className="text-left">Au</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.orphelins.map((o) => (
                    <tr key={o.pin}>
                      <td className="mono font-bold">{o.pin}</td>
                      <td className="tabnum text-right">{o.n}</td>
                      <td className="tabnum">{o.premier.slice(0, 16)}</td>
                      <td className="tabnum">{o.dernier.slice(0, 16)}</td>
                      <td className="text-right">
                        <span className="inline-flex flex-wrap items-start justify-end gap-2">
                          <RattacherBadge pin={o.pin} salaries={salaries} />
                          <BoutonAction action={ecarterBadge.bind(null, o.pin)} confirmer={`Écarter les badgeages du numéro ${o.pin} ? Ils ne seront jamais comptés (badge de test, visiteur).`}>
                            Écarter
                          </BoutonAction>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section titre="Brancher la pointeuse" aide="À faire une fois, sur l'appareil. Enregistrez d'abord son numéro de série ci-dessus.">
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm" style={{ lineHeight: 1.6 }}>
            <li>
              Reliez l'appareil au réseau : <strong>Menu → Comm. → Paramètres Wi-Fi</strong> (ou câble Ethernet).
            </li>
            <li>
              Ouvrez <strong>Menu → Comm. → Paramétrage serveur cloud</strong> (« Cloud Server Setting » ou « ADMS ») et saisissez :
              <ul className="mt-1 list-disc pl-5">
                <li>
                  mode nom de domaine : <strong>activé</strong> ; adresse du serveur : <span className="mono font-bold">{hote}</span>
                </li>
                <li>
                  port : <span className="mono font-bold">443</span> ; HTTPS : <strong>activé</strong> ; proxy : désactivé.
                </li>
              </ul>
            </li>
            <li>
              Réglez la date et l'heure : <strong>Menu → Système → Date / heure</strong>. L'heure du badgeage est celle de l'appareil.
            </li>
            <li>
              Enregistrez chaque salarié sur l'appareil avec un <strong>ID utilisateur</strong>, et reportez ce numéro sur sa fiche (« N° dans la pointeuse »).
            </li>
            <li>Faites un badgeage d'essai : « Dernier contact » ci-dessus se met à jour dans la minute, et le badgeage apparaît sur la fiche du salarié.</li>
          </ol>
          <div className="encart-alerte mt-4 text-[13px]">
            <strong>Badge ou code, pas d'empreinte ni de visage.</strong> La CNIL exclut le recours à la biométrie (empreinte digitale, reconnaissance faciale) pour contrôler les horaires des salariés. Enregistrez vos
            salariés sur l'appareil avec un badge ou un code personnel, et laissez les fonctions biométriques désactivées.
          </div>
          <p className="mt-3 text-[13px]" style={{ color: "var(--muted)" }}>
            Certains appareils ne savent pas joindre un serveur en HTTPS : ils restent « jamais connectée ». Utilisez alors l'import du fichier ci-dessous, ou demandez à votre revendeur un boîtier relais.
          </p>
        </Section>

        <Section
          titre="Importer le fichier de la pointeuse"
          aide="Solution de repli quand l'appareil n'est pas connecté : exportez son rapport de pointage sur clé USB (format CSV) et déposez-le ici. Un jour présent dans le fichier remplace ce qui était enregistré pour ce jour."
        >
          <ImportCsv />
        </Section>
      </div>
    </>
  );
}
