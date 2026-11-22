import { asc, eq, isNotNull } from "drizzle-orm";
import { headers } from "next/headers";
import { modifierTablette, retirerCode, supprimerTablette } from "@/app/actions/tablettes";
import { BoutonAction } from "@/components/client";
import { CodeSalarie, FormulaireTablette, ModesTablette, RenouvelerActivation } from "@/components/Tablettes";
import { EnTete, Section, Vide } from "@/components/ui";
import { salarie, tablette, utilisateur } from "@/db/schema";
import { lire } from "@/lib/acces";
import { exigerAdmin } from "@/lib/auth/session";
import { chargerOrganisation, nomComplet } from "@/lib/donnees";
import { SILENCE_TABLETTE_MS } from "@/lib/notifications/quotidien";
import { frDateHeure } from "@/lib/temps/zone";

export const metadata = { title: "Tablettes" };

export default async function PageTablettes() {
  const u = await exigerAdmin();
  const d = await lire(u, async (tx) => ({
    org: await chargerOrganisation(tx, u.organisationId),
    tablettes: await tx.select().from(tablette).orderBy(asc(tablette.createdAt)),
    fiches: await tx.select().from(salarie).where(eq(salarie.actif, true)).orderBy(asc(salarie.nom), asc(salarie.prenom)),
    comptes: await tx.select({ salarieId: utilisateur.salarieId }).from(utilisateur).where(isNotNull(utilisateur.salarieId)),
  }));
  const h = await headers();
  const adresse = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "votre-domaine"}/tablette`;
  const avecCompte = new Set(d.comptes.map((c) => c.salarieId));

  return (
    <>
      <EnTete kicker="Matériel" titre="Tablettes de pointage" />
      <div className="flex flex-col gap-6">
        <Section titre="Tablettes" aide="Une tablette Android posée à l'entrée affiche en permanence l'écran de pointage. Elle est reliée une fois, par un code d'activation.">
          {d.tablettes.length === 0 ? (
            <Vide>Aucune tablette enregistrée.</Vide>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Tablette</th>
                    <th className="text-left">État</th>
                    <th className="text-left">Dernier contact</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.tablettes.map((t) => {
                    const muette = !t.dernierContact || Date.now() - t.dernierContact.getTime() > SILENCE_TABLETTE_MS;
                    return (
                      <tr key={t.id}>
                        <td className="font-bold">{t.nom}</td>
                        <td>
                          {!t.actif ? (
                            <span className="pastille pastille-attente">désactivée</span>
                          ) : !t.jetonHash ? (
                            <span className="pastille pastille-alerte">à activer</span>
                          ) : muette ? (
                            <span className="pastille pastille-danger">éteinte ou hors connexion</span>
                          ) : (
                            <span className="pastille pastille-ok">en service</span>
                          )}
                        </td>
                        <td className="tabnum">{frDateHeure(t.dernierContact, d.org.timezone)}</td>
                        <td className="text-right">
                          <span className="inline-flex flex-wrap items-start justify-end gap-2">
                            <RenouvelerActivation id={t.id} reliee={!!t.jetonHash} />
                            <BoutonAction action={modifierTablette.bind(null, t.id, { actif: !t.actif })}>{t.actif ? "Désactiver" : "Réactiver"}</BoutonAction>
                            <BoutonAction action={supprimerTablette.bind(null, t.id)} className="btn-danger btn-sm" confirmer="Retirer cette tablette ? Les pointages déjà faits restent comptés ; elle ne pourra plus en enregistrer.">
                              Retirer
                            </BoutonAction>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-5 pt-5" style={{ borderTop: "1px solid var(--line-portal)" }}>
            <FormulaireTablette />
          </div>
        </Section>

        <Section titre="Façons de pointer" aide="Vous pouvez ouvrir les deux : chaque salarié utilise celle qui lui convient.">
          <ModesTablette code={d.org.tabletteCode} qr={d.org.tabletteQr} />
        </Section>

        <Section
          titre="Salariés"
          aide="Pour le code : donnez un code personnel à chacun. Pour le QR code : le salarié doit avoir un espace salarié (ouvert depuis sa fiche) et y être connecté sur son téléphone."
        >
          {d.fiches.length === 0 ? (
            <Vide>Aucun salarié.</Vide>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Salarié</th>
                    <th className="text-left">Code personnel</th>
                    <th className="text-left">QR code</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.fiches.map((f) => (
                    <tr key={f.id}>
                      <td className="font-bold">{nomComplet(f)}</td>
                      <td>{f.codePointageHash ? <span className="pastille pastille-ok">attribué</span> : <span className="pastille pastille-attente">aucun</span>}</td>
                      <td>{avecCompte.has(f.id) ? <span className="pastille pastille-ok">espace salarié ouvert</span> : <span className="pastille pastille-attente">pas d'espace salarié</span>}</td>
                      <td className="text-right">
                        <span className="inline-flex flex-wrap items-start justify-end gap-2">
                          <CodeSalarie salarieId={f.id} nom={nomComplet(f)} aUnCode={!!f.codePointageHash} />
                          {f.codePointageHash && (
                            <BoutonAction action={retirerCode.bind(null, f.id)} confirmer={`Retirer le code de ${nomComplet(f)} ? Il ne pourra plus pointer par code.`}>
                              Retirer le code
                            </BoutonAction>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section titre="Installer une tablette" aide="À faire une fois par tablette.">
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm" style={{ lineHeight: 1.6 }}>
            <li>
              Installez l'<strong>application Kipointe</strong> sur la tablette (fichier APK fourni par votre revendeur). Elle garde l'écran allumé, masque le reste d'Android et se relance au démarrage.
            </li>
            <li>Ajoutez la tablette ci-dessus : un code d'activation s'affiche.</li>
            <li>
              Au premier lancement de l'application, saisissez l'adresse <span className="mono font-bold">{adresse.replace(/\/tablette$/, "")}</span>, choisissez un code de sortie, puis entrez le code d'activation.
            </li>
            <li>Acceptez l'épinglage de l'application quand Android le propose, et laissez la tablette branchée sur secteur, fixée au mur ou sur un support.</li>
            <li>Faites un pointage d'essai : il apparaît aussitôt sur la fiche du salarié.</li>
          </ol>
          <p className="mt-3 text-[13px]" style={{ color: "var(--muted)" }}>
            Pour sortir de l'écran de pointage : appui long sur le logo, en haut à gauche, puis code de sortie. Sans l'application, la page <span className="mono">{adresse}</span> s'ouvre aussi dans un navigateur.
          </p>
          <div className="encart-info mt-4 text-[13px]">
            <strong>Sens du pointage.</strong> Le premier pointage de la journée est une arrivée, le suivant un départ, et ainsi de suite (pause déjeuner comprise). Deux pointages à moins de deux minutes d'écart : le second
            est ignoré. Un oubli se corrige depuis la fiche du salarié.
          </div>
          <div className="encart-alerte mt-3 text-[13px]">
            <strong>Sans connexion, pas de pointage.</strong> La tablette a besoin du réseau pour enregistrer. En cas de coupure, elle l'affiche ; les heures manquées se saisissent ensuite depuis la fiche du salarié.
          </div>
        </Section>
      </div>
    </>
  );
}
