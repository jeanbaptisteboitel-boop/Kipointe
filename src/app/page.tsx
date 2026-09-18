import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoKipointe } from "@/components/Logomark";
import { IconeFleche } from "@/components/icones";
import { utilisateurCourant } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Accueil() {
  const u = await utilisateurCourant();
  if (u?.role === "GERANT") redirect("/gerant");
  if (u?.role === "SALARIE") redirect("/salarie");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-7 p-6 text-center">
      <LogoKipointe size={44} />
      <p className="max-w-md text-base" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
        Pointage du temps de travail par badge QR et code PIN, sur tablette murale. Récapitulatif hebdomadaire conforme à l'article D.3171-8 du Code du travail.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link href="/connexion" className="btn-primary">
          Espace gérant et salarié <IconeFleche size={15} />
        </Link>
        <Link href="/kiosque" className="btn-secondary">
          Tablette de pointage
        </Link>
      </div>
      <p className="kicker" style={{ color: "var(--faint)" }}>
        Édité par OMNIUP
      </p>
    </main>
  );
}
