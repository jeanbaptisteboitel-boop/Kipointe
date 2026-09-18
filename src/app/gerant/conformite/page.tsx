import Link from "next/link";
import { IconeBouclier, IconeDocument, IconePersonne, IconeSceau } from "@/components/icones";
import { exigerGerant } from "@/lib/auth/session";

export const metadata = { title: "Conformité" };

function Carte({
  icone,
  titre,
  texte,
  action,
}: {
  icone: React.ReactNode;
  titre: string;
  texte: string;
  action: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col gap-3">
      <span className="grid h-[38px] w-[38px] place-items-center rounded-[10px]" style={{ background: "var(--info-bg)", color: "var(--info-ink)" }}>
        {icone}
      </span>
      <div className="titre-sm">{titre}</div>
      <p className="flex-1 text-[13px]" style={{ color: "var(--muted)", lineHeight: 1.55 }}>
        {texte}
      </p>
      {action}
    </div>
  );
}

export default async function PageConformite() {
  await exigerGerant();
  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <h1 className="titre text-[28px]">Conformité</h1>
        <p className="mt-2 max-w-[74ch] text-sm" style={{ color: "var(--muted)", lineHeight: 1.55 }}>
          Les quatre pièces à tenir à jour. Kipointe les produit ; l'affichage et l'information des salariés restent de la responsabilité de l'employeur.
        </p>
      </div>

      <div className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <Carte
          icone={<IconeDocument size={20} />}
          titre="Note d'information aux salariés"
          texte="Finalité du dispositif, données traitées, durée de conservation, droits. Elle précise noir sur blanc que la caméra ne filme pas. À afficher près de la tablette et à remettre à l'embauche."
          action={
            <Link href="/gerant/conformite/note-information" className="btn-secondary btn-sm w-max">
              Ouvrir la note imprimable
            </Link>
          }
        />
        <Carte
          icone={<IconeBouclier size={20} />}
          titre="Registre RGPD"
          texte="Traitement « gestion du temps de travail » : base légale l'obligation légale de l'employeur, conservation 5 ans, hébergement exclusivement dans l'Union européenne."
          action={
            <Link href="/gerant/conformite/registre" className="btn-secondary btn-sm w-max">
              Voir la fiche de traitement
            </Link>
          }
        />
        <Carte
          icone={<IconePersonne size={20} />}
          titre="Droits des personnes"
          texte="Chaque salarié consulte ses propres pointages et les exporte en CSV depuis son espace. Tout accès du gérant à ses données est journalisé."
          action={
            <Link href="/gerant/salaries" className="btn-secondary btn-sm w-max">
              Traiter une demande
            </Link>
          }
        />
        <Carte
          icone={<IconeSceau size={20} />}
          titre="Valeur probante"
          texte="Récapitulatifs hebdomadaires archivés et scellés par empreinte SHA-256, corrections additives tracées avec auteur et motif, pointages d'origine jamais modifiés."
          action={
            <Link href="/gerant/journal" className="btn-secondary btn-sm w-max">
              Voir le journal
            </Link>
          }
        />
      </div>
    </div>
  );
}
