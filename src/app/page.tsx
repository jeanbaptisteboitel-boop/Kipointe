import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoKipointe } from "@/components/Logomark";
import { IconeFleche } from "@/components/icones";
import { accueilDe, utilisateurCourant } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Accueil() {
  const u = await utilisateurCourant();
  if (u) redirect(u.motDePasseProvisoire ? "/compte" : accueilDe(u));
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-7 p-6 text-center">
      <LogoKipointe size={44} />
      <p className="max-w-md text-base" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
        Le suivi du temps de travail relié à la pointeuse de l'entreprise : heures pointées, plannings, absences, congés et compteur d'heures, pour l'employeur comme pour chaque salarié.
      </p>
      <Link href="/connexion" className="btn-primary w-full max-w-xs">
        Se connecter <IconeFleche size={15} />
      </Link>
      <p className="kicker" style={{ color: "var(--faint)" }}>
        Édité par OMNIUP
      </p>
    </main>
  );
}
