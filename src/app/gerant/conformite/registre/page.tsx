import Link from "next/link";
import { exigerGerant } from "@/lib/auth/session";
import { chargerOrganisation } from "@/lib/ui/data";

export const metadata = { title: "Registre des traitements" };

const LIGNES: [string, string][] = [
  ["Nom du traitement", "Gestion du temps de travail (pointage)"],
  ["Finalité", "Enregistrer les heures de travail effectuées et établir le récapitulatif hebdomadaire imposé par les articles L.3171-2 et D.3171-8 du Code du travail"],
  ["Base légale", "Obligation légale à laquelle est soumis le responsable de traitement (art. 6.1.c du RGPD)"],
  ["Personnes concernées", "Salariés de l'entreprise disposant d'un badge de pointage"],
  ["Catégories de données", "Identité (nom, prénom, matricule), horodatages d'entrée et de sortie, établissement, corrections motivées, journal des accès"],
  ["Données exclues", "Aucune donnée biométrique, aucune image, aucune géolocalisation. La caméra de la tablette décode le QR code localement sans jamais enregistrer ni transmettre le flux"],
  ["Destinataires", "Direction de l'entreprise, service paie, cabinet d'expertise comptable"],
  ["Sous-traitants", "Vercel (hébergement applicatif, Paris cdg1), Neon (base de données, Union européenne), Scaleway (archivage des récapitulatifs, Paris fr-par)"],
  ["Transferts hors UE", "Aucun"],
  ["Durée de conservation", "Pointages 5 ans, purgés automatiquement ; récapitulatifs archivés 5 ans en mode gouvernance ; journal des tentatives 1 an"],
  ["Mesures de sécurité", "PIN haché en Argon2id, verrouillage après cinq échecs, isolation des organisations par Row Level Security, accès par sessions à cookie httpOnly, archives scellées par empreinte SHA-256"],
  ["Droits des personnes", "Accès et export de ses propres pointages depuis l'espace salarié ; rectification par demande au gérant, tracée au journal"],
];

export default async function PageRegistre() {
  const u = await exigerGerant();
  const { org } = await chargerOrganisation(u);
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="titre text-[28px]">Registre des traitements</h1>
        <Link href="/gerant/conformite" className="btn-secondary btn-sm">
          Retour à la conformité
        </Link>
      </div>

      <article className="card max-w-[900px]">
        <div className="kicker">Fiche de traitement</div>
        <p className="mt-2 text-sm font-bold">
          Responsable du traitement : {org.raisonSociale}
          {org.siret ? ` — SIRET ${org.siret}` : ""}
        </p>
        <div className="mt-5 overflow-hidden rounded-[10px]" style={{ border: "1px solid var(--line-portal)" }}>
          {LIGNES.map(([cle, valeur], i) => (
            <div key={cle} className="flex flex-wrap gap-4 px-4 py-3" style={{ background: i % 2 === 0 ? "var(--bg-portal)" : "#fff" }}>
              <div className="text-[13px] font-semibold" style={{ flex: "0 0 200px", color: "var(--muted)" }}>
                {cle}
              </div>
              <div className="flex-1 text-sm" style={{ minWidth: 260, lineHeight: 1.55 }}>
                {valeur}
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
