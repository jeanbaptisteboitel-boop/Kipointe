import { redirect } from "next/navigation";
import { Logomark } from "@/components/Logomark";
import { utilisateurCourant } from "@/lib/auth/session";
import { lireJetonQr } from "@/lib/tablette/jeton";
import { PointageQr } from "./PointageQr";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pointer", robots: { index: false } };

/** Page ouverte par le téléphone du salarié quand il lit le QR code de la tablette. */
export default async function PagePointer({ searchParams }: { searchParams: Promise<{ j?: string }> }) {
  const jeton = (await searchParams).j ?? "";
  const lisible = !!lireJetonQr(jeton);
  const u = await utilisateurCourant();
  if (!u && lisible) redirect(`/connexion?suite=${encodeURIComponent(`/pointer?j=${jeton}`)}`);
  if (!u) redirect("/connexion");
  if (u.motDePasseProvisoire) redirect("/compte");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-[440px] p-8 text-center" style={{ boxShadow: "0 4px 20px rgba(2,10,36,0.08)" }}>
        <div className="mb-5 flex justify-center">
          <Logomark size={40} />
        </div>
        {lisible ? <PointageQr jeton={jeton} /> : <p className="encart-danger text-sm font-semibold">Ce lien de pointage est incomplet. Visez de nouveau le QR code de la tablette.</p>}
      </div>
    </main>
  );
}
