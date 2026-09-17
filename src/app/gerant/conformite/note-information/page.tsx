import { exigerGerant } from "@/lib/auth/session";
import { chargerOrganisation } from "@/lib/ui/data";

export const metadata = { title: "Note d'information des salariés" };

export default async function PageNote() {
  const u = await exigerGerant();
  const { org } = await chargerOrganisation(u);
  return (
    <article className="prose mx-auto max-w-3xl rounded-lg bg-white p-8 text-[15px] leading-relaxed text-slate-900 shadow-sm">
      <p className="no-print text-sm text-slate-500">Imprimez cette page (Ctrl+P) ou remettez-la par email. Complétez les champs entre crochets.</p>
      <h1 className="text-2xl font-bold">Note d'information sur le dispositif de pointage</h1>
      <p>
        <strong>{org.raisonSociale}</strong>
        {org.siret ? ` — SIRET ${org.siret}` : ""}
      </p>
      <p>Madame, Monsieur,</p>
      <p>
        Conformément aux articles L.3171-2 et D.3171-8 du Code du travail, l'entreprise doit enregistrer les heures de travail effectuées par chaque salarié et établir un récapitulatif
        hebdomadaire. Pour y satisfaire, elle met en place à compter du <strong>[date]</strong> un dispositif de pointage électronique appelé Kipointe.
      </p>
      <h2 className="text-lg font-semibold">Comment ça fonctionne</h2>
      <ul className="list-disc pl-6">
        <li>Une tablette murale est installée à <strong>[lieu]</strong>. Vous présentez votre badge (carte ou porte-clés) devant sa caméra, puis vous saisissez votre code personnel à 4 chiffres.</li>
        <li>Le type de pointage (entrée, sortie) est déterminé automatiquement ; une confirmation s'affiche 3 secondes avec l'heure et votre total du jour.</li>
        <li>Votre badge ne contient qu'un identifiant technique, aucune donnée personnelle. En cas de perte, prévenez immédiatement <strong>[responsable]</strong> : il sera désactivé et remplacé.</li>
        <li>Votre code PIN est strictement personnel. Le prêter à un collègue pour pointer à sa place constitue une faute.</li>
      </ul>
      <h2 className="text-lg font-semibold">La caméra ne filme pas</h2>
      <p>
        La caméra de la tablette sert uniquement à lire le QR code du badge. <strong>Aucune image n'est enregistrée, stockée ni transmise</strong> : le décodage se fait localement sur la
        tablette et le flux vidéo n'est jamais conservé. Le dispositif ne comporte ni reconnaissance faciale, ni biométrie, ni géolocalisation.
      </p>
      <h2 className="text-lg font-semibold">Données traitées et durée de conservation</h2>
      <p>
        Sont enregistrés : vos nom, prénom, matricule, les horodatages de vos pointages et, le cas échéant, les corrections effectuées par la direction (toujours motivées et tracées). Ces données sont
        conservées <strong>5 ans</strong> puis supprimées automatiquement. Elles sont hébergées exclusivement dans l'Union européenne.
      </p>
      <p>
        Base légale du traitement : obligation légale de l'employeur. Destinataires : la direction et le service paie / le cabinet d'expertise comptable. Responsable du traitement :{" "}
        <strong>{org.raisonSociale}</strong>.
      </p>
      <h2 className="text-lg font-semibold">Vos droits</h2>
      <p>
        Vous pouvez consulter et exporter vos propres pointages à tout moment depuis votre espace personnel, ou en demander une copie à <strong>[responsable]</strong>. Vous disposez d'un droit
        d'accès, de rectification et de limitation, et vous pouvez saisir la CNIL en cas de difficulté. Tout accès de la direction à vos données est journalisé.
      </p>
      <h2 className="text-lg font-semibold">En cas de panne de réseau</h2>
      <p>La tablette continue d'enregistrer vos pointages hors ligne et les transmet automatiquement dès le retour de la connexion. Un bandeau vous indique alors que le pointage est en attente.</p>
      <p className="mt-6">
        Fait à <strong>[ville]</strong>, le <strong>[date]</strong>.
      </p>
      <p>Signature de l'employeur : ______________________</p>
      <p>Signature du salarié (pour remise) : ______________________</p>
    </article>
  );
}
