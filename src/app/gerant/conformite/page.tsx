import Link from "next/link";
import { exigerGerant } from "@/lib/auth/session";

export const metadata = { title: "Conformité" };

export default async function PageConformite() {
  await exigerGerant();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Conformité (RGPD et droit du travail)</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2">
          <h2 className="font-semibold">1. Information préalable des salariés</h2>
          <p className="text-sm text-slate-600">
            Avant la mise en service, remettez à chaque salarié la note d'information (et consultez le CSE s'il existe). Elle précise notamment que la caméra de la tablette ne
            filme ni n'enregistre rien : le QR est décodé localement, aucune image n'est stockée ni transmise.
          </p>
          <div className="flex gap-2">
            <Link href="/gerant/conformite/note-information" className="btn-primary btn-sm">
              Ouvrir la note (imprimable)
            </Link>
            <a href="/documents/note-information-salaries.md" download className="btn-secondary btn-sm">
              Télécharger (Markdown)
            </a>
          </div>
        </div>
        <div className="card space-y-2">
          <h2 className="font-semibold">2. Registre des traitements</h2>
          <dl className="text-sm text-slate-700">
            <dt className="font-medium">Traitement</dt>
            <dd>Gestion du temps de travail (pointage)</dd>
            <dt className="mt-1 font-medium">Base légale</dt>
            <dd>Obligation légale de l'employeur (art. L.3171-2 et D.3171-8 du Code du travail)</dd>
            <dt className="mt-1 font-medium">Données</dt>
            <dd>Identité, matricule, horodatages d'entrée/sortie, corrections motivées. Pas de biométrie, pas de géolocalisation, pas d'image.</dd>
            <dt className="mt-1 font-medium">Durée de conservation</dt>
            <dd>5 ans (purge automatique quotidienne), récaps archivés 5 ans en mode gouvernance</dd>
            <dt className="mt-1 font-medium">Hébergement</dt>
            <dd>Union européenne exclusivement : Vercel Paris (cdg1), Neon EU, Scaleway Paris (fr-par)</dd>
            <dt className="mt-1 font-medium">Destinataires</dt>
            <dd>Gérant, service paie / expert-comptable</dd>
          </dl>
        </div>
        <div className="card space-y-2">
          <h2 className="font-semibold">3. Droits des personnes</h2>
          <p className="text-sm text-slate-600">
            Chaque salarié disposant d'un compte peut consulter et exporter ses propres pointages (espace salarié). Tout accès du gérant aux données d'un salarié est journalisé (menu Journal).
          </p>
        </div>
        <div className="card space-y-2">
          <h2 className="font-semibold">4. Valeur probante des récaps</h2>
          <p className="text-sm text-slate-600">
            Un récap hebdomadaire validé est figé : PDF archivé sur un stockage à verrouillage d'objet (Object Lock, mode gouvernance) et empreinte SHA-256 conservée en base. Les pointages
            d'origine ne sont jamais modifiés : les corrections sont additives et motivées.
          </p>
        </div>
      </div>
    </div>
  );
}
