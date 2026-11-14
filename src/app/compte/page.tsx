import Link from "next/link";
import { redirect } from "next/navigation";
import { FormulaireMotDePasse } from "@/components/Formulaires";
import { Logomark } from "@/components/Logomark";
import { accueilDe, utilisateurCourant } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon compte" };

export default async function PageCompte() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-[440px] p-8">
        <div className="mb-5 flex justify-center">
          <Logomark size={40} />
        </div>
        <h1 className="titre text-center text-[24px]">{u.motDePasseProvisoire ? "Choisissez votre mot de passe" : "Mon compte"}</h1>
        <p className="mt-2 mb-6 text-center text-sm" style={{ color: "var(--muted)" }}>
          {u.motDePasseProvisoire ? "Le mot de passe qui vous a été remis est provisoire : remplacez-le pour continuer." : `${u.prenom} ${u.nom} · ${u.email}`}
        </p>
        <FormulaireMotDePasse provisoire={u.motDePasseProvisoire} />
        {!u.motDePasseProvisoire && (
          <p className="mt-5 text-center text-sm">
            <Link href={accueilDe(u)} className="underline" style={{ color: "var(--navy)" }}>
              Retour
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
