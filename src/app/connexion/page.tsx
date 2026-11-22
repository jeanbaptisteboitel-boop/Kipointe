import { redirect } from "next/navigation";
import { Logomark } from "@/components/Logomark";
import { accueilDe, utilisateurCourant } from "@/lib/auth/session";
import { FormulaireConnexion } from "./FormulaireConnexion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexion" };

/** Seule suite acceptée : le retour vers le pointage par QR code (jamais une adresse extérieure). */
function suiteSure(brut: string | undefined): string | null {
  return brut && /^\/pointer\?j=[A-Za-z0-9._-]{1,120}$/.test(brut) ? brut : null;
}

export default async function PageConnexion({ searchParams }: { searchParams: Promise<{ suite?: string }> }) {
  const suite = suiteSure((await searchParams).suite);
  const u = await utilisateurCourant();
  if (u) redirect(u.motDePasseProvisoire ? "/compte" : (suite ?? accueilDe(u)));
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-[440px] p-8" style={{ boxShadow: "0 4px 20px rgba(2,10,36,0.08)" }}>
        <div className="mb-5 flex justify-center">
          <Logomark size={40} />
        </div>
        <h1 className="titre text-center text-[26px]">Connexion</h1>
        <p className="mt-2 mb-6 text-center text-sm" style={{ color: "var(--muted)" }}>
          Kipointe — employeurs et salariés
        </p>
        <FormulaireConnexion suite={suite} />
        <p className="mt-6 text-center text-[11px]" style={{ color: "var(--faint)" }}>
          Édité par OMNIUP · Vos identifiants vous sont remis par votre employeur
        </p>
      </div>
    </main>
  );
}
