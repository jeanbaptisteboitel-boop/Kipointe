import Link from "next/link";
import { exigerGerant } from "@/lib/auth/session";
import { chargerOrganisation } from "@/lib/ui/data";
import { BoutonImprimerNote } from "./BoutonImprimerNote";

export const metadata = { title: "Note d'information des salariés" };

export default async function PageNote() {
  const u = await exigerGerant();
  const { org, etablissements } = await chargerOrganisation(u);
  const lieu = etablissements[0]?.adresse ?? "[lieu]";

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[62ch] text-sm" style={{ color: "var(--muted)" }}>
          Imprimez cette note, affichez-la près de la tablette et remettez-en un exemplaire à chaque salarié. Complétez les champs entre crochets.
        </p>
        <div className="flex gap-2.5">
          <BoutonImprimerNote />
          <Link href="/gerant/conformite" className="btn-secondary btn-sm">
            Retour
          </Link>
        </div>
      </div>

      <article
        className="page-a4 mx-auto bg-white text-[15px]"
        style={{ width: 794, minHeight: 1123, padding: "58px 62px 46px", boxShadow: "0 12px 40px rgba(2,10,36,0.18)", color: "#000", lineHeight: 1.6 }}
      >
        <div className="flex items-start justify-between gap-6 pb-3.5" style={{ borderBottom: "2px solid #000" }}>
          <div>
            <div className="titre" style={{ fontSize: 21, lineHeight: 1.25 }}>
              Note d'information
              <br />
              sur le dispositif de pointage
            </div>
            <div className="mt-2 text-xs">Remise aux salariés préalablement à la mise en service.</div>
          </div>
          <div className="flex-none text-right">
            <div className="titre" style={{ fontSize: 15 }}>
              Kipointe
            </div>
            <div className="mt-[3px] text-[11px]">Édité par OMNIUP</div>
          </div>
        </div>

        <p className="mt-6 text-[15px] font-bold">
          {org.raisonSociale}
          {org.siret ? ` — SIRET ${org.siret}` : ""}
        </p>

        <p className="mt-4">Madame, Monsieur,</p>
        <p className="mt-2">
          Conformément aux articles L.3171-2 et D.3171-8 du Code du travail, l'entreprise doit enregistrer les heures de travail effectuées par chaque salarié et établir un
          récapitulatif hebdomadaire. Pour y satisfaire, elle met en place à compter du <strong>[date]</strong> un dispositif de pointage électronique appelé Kipointe.
        </p>

        <h2 className="mt-5 text-base font-bold">Comment ça fonctionne</h2>
        <ul className="mt-2 list-disc pl-5">
          <li>
            Une tablette murale est installée à <strong>{lieu}</strong>. Vous présentez votre badge devant son lecteur, puis vous saisissez votre code personnel à 4 chiffres.
          </li>
          <li>Le sens du pointage — entrée ou sortie — est déterminé automatiquement ; une confirmation s'affiche trois secondes avec l'heure et votre total du jour.</li>
          <li>
            Votre badge ne contient qu'un identifiant technique, aucune donnée personnelle. En cas de perte, prévenez immédiatement <strong>[responsable]</strong> : il sera
            désactivé et remplacé.
          </li>
          <li>Votre code est strictement personnel. Le prêter à un collègue pour pointer à sa place constitue une faute.</li>
        </ul>

        <h2 className="mt-5 text-base font-bold">La caméra ne filme pas</h2>
        <p className="mt-2">
          Le lecteur de la tablette sert uniquement à décoder le QR code de votre badge. <strong>Aucune image n'est enregistrée, stockée ni transmise</strong> : le décodage se fait
          localement sur la tablette et le flux vidéo n'est jamais conservé ni affiché. Le dispositif ne comporte ni reconnaissance faciale, ni biométrie, ni géolocalisation.
        </p>

        <h2 className="mt-5 text-base font-bold">Données traitées et durée de conservation</h2>
        <p className="mt-2">
          Sont enregistrés : vos nom, prénom, matricule, les horodatages de vos pointages et, le cas échéant, les corrections effectuées par la direction — toujours motivées et
          tracées. Ces données sont conservées <strong>5 ans</strong> puis supprimées automatiquement. Elles sont hébergées exclusivement dans l'Union européenne.
        </p>
        <p className="mt-2">
          Base légale : obligation légale de l'employeur. Destinataires : la direction, le service paie et le cabinet d'expertise comptable. Responsable du traitement :{" "}
          <strong>{org.raisonSociale}</strong>.
        </p>

        <h2 className="mt-5 text-base font-bold">Vos droits</h2>
        <p className="mt-2">
          Vous pouvez consulter et exporter vos propres pointages à tout moment depuis votre espace personnel, ou en demander une copie à <strong>[responsable]</strong>. Vous
          disposez d'un droit d'accès, de rectification et de limitation, et vous pouvez saisir la CNIL en cas de difficulté. Tout accès de la direction à vos données est
          journalisé.
        </p>

        <h2 className="mt-5 text-base font-bold">En cas de panne de réseau</h2>
        <p className="mt-2">
          La tablette continue d'enregistrer vos pointages hors ligne et les transmet automatiquement dès le retour de la connexion. Un bandeau vous indique alors que le pointage
          est en attente : il est bien acquis.
        </p>

        <p className="mt-8">
          Fait à <strong>[ville]</strong>, le <strong>[date]</strong>.
        </p>
        <div className="mt-6 flex flex-wrap gap-10">
          <div style={{ flex: "1 1 280px" }}>
            <div className="text-[11px] font-bold tracking-[0.12em] uppercase">Pour l'employeur</div>
            <div className="mt-1.5 h-14" style={{ borderBottom: "1px solid #000" }} />
            <div className="mt-1.5 text-[11px]">Nom, qualité, date et signature</div>
          </div>
          <div style={{ flex: "1 1 280px" }}>
            <div className="text-[11px] font-bold tracking-[0.12em] uppercase">Le salarié, pour remise</div>
            <div className="mt-1.5 h-14" style={{ borderBottom: "1px solid #000" }} />
            <div className="mt-1.5 text-[11px]">Nom, date et signature</div>
          </div>
        </div>
      </article>
    </div>
  );
}
