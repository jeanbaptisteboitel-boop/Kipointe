import Link from "next/link";
import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Accueil() {
  const u = await utilisateurCourant();
  if (u?.role === "GERANT") redirect("/gerant");
  if (u?.role === "SALARIE") redirect("/salarie");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <img src="/icons/icon.svg" alt="" width={72} height={72} />
      <h1 className="text-3xl font-bold text-[var(--navy)]">Kipointe</h1>
      <p className="text-slate-600">Pointage du temps de travail par badge QR et code PIN, sur tablette murale.</p>
      <div className="flex w-full flex-col gap-3">
        <Link href="/connexion" className="btn-primary">
          Espace gérant / salarié
        </Link>
        <Link href="/kiosque" className="btn-secondary">
          Tablette de pointage
        </Link>
      </div>
    </main>
  );
}
