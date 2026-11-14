import Link from "next/link";
import { LogoKipointe } from "@/components/Logomark";
import { Deconnexion, Navigation } from "@/components/client";

/** Cadre commun des trois espaces : marque, entreprise, navigation, compte. */
export function Coquille({
  entreprise,
  email,
  onglets,
  racine,
  libelle,
  lienAutreEspace,
  children,
}: {
  entreprise: string;
  email: string;
  onglets: [string, string][];
  racine: string;
  libelle: string;
  lienAutreEspace?: { href: string; texte: string };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="no-print bg-white" style={{ borderBottom: "1px solid var(--line-portal)" }}>
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 pt-3.5">
            <div className="flex items-center gap-3">
              <LogoKipointe size={26} />
              <span className="h-5 w-px" style={{ background: "var(--line-portal)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
                {entreprise}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {lienAutreEspace && (
                <Link href={lienAutreEspace.href} className="text-[13px] font-semibold underline" style={{ color: "var(--navy)" }}>
                  {lienAutreEspace.texte}
                </Link>
              )}
              <Link href="/compte" className="text-[13px]" style={{ color: "var(--muted)" }} title="Mon compte">
                {email}
              </Link>
              <Deconnexion />
            </div>
          </div>
          <Navigation onglets={onglets} racine={racine} libelle={libelle} />
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-4 py-7 sm:px-6">{children}</main>
    </div>
  );
}
