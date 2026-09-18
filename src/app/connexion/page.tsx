import { redirect } from "next/navigation";
import { Logomark } from "@/components/Logomark";
import { utilisateurCourant } from "@/lib/auth/session";
import { FormulaireConnexion } from "./FormulaireConnexion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexion" };

export default async function PageConnexion() {
  const u = await utilisateurCourant();
  if (u) redirect(u.role === "GERANT" ? "/gerant" : "/salarie");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-[440px] p-8" style={{ boxShadow: "0 4px 20px rgba(2,10,36,0.08)" }}>
        <div className="mb-5 flex justify-center">
          <Logomark size={40} />
        </div>
        <h1 className="titre text-center text-[26px]">Espace gérant</h1>
        <p className="mt-2 mb-6 text-center text-sm" style={{ color: "var(--muted)" }}>
          Kipointe — pointage du temps de travail
        </p>
        <FormulaireConnexion />
        <p className="mt-6 text-center text-[11px]" style={{ color: "var(--faint)" }}>
          Édité par OMNIUP · Le pointage se fait sur la tablette murale
        </p>
      </div>
    </main>
  );
}
