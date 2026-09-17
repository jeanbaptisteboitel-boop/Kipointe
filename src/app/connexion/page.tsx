import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/auth/session";
import { FormulaireConnexion } from "./FormulaireConnexion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexion" };

export default async function PageConnexion() {
  const u = await utilisateurCourant();
  if (u) redirect(u.role === "GERANT" ? "/gerant" : "/salarie");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <div className="card">
        <div className="mb-6 flex items-center gap-3">
          <img src="/icons/icon.svg" alt="" width={40} height={40} />
          <div>
            <h1 className="text-xl font-bold text-[var(--navy)]">Kipointe</h1>
            <p className="text-xs text-slate-500">Espace gérant et salarié</p>
          </div>
        </div>
        <FormulaireConnexion />
      </div>
    </main>
  );
}
