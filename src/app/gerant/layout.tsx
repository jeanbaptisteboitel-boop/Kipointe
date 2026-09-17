import Link from "next/link";
import { exigerGerant } from "@/lib/auth/session";
import { Deconnexion } from "./Deconnexion";

export const dynamic = "force-dynamic";

const NAV = [
  ["/gerant", "Semaine"],
  ["/gerant/salaries", "Salariés"],
  ["/gerant/anomalies", "Anomalies"],
  ["/gerant/recaps", "Récaps"],
  ["/gerant/terminaux", "Terminaux"],
  ["/gerant/parametres", "Paramètres"],
  ["/gerant/conformite", "Conformité"],
  ["/gerant/journal", "Journal"],
] as const;

export default async function LayoutGerant({ children }: { children: React.ReactNode }) {
  const u = await exigerGerant();
  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/gerant" className="flex items-center gap-2 font-bold text-[var(--navy)]">
            <img src="/icons/icon.svg" alt="" width={28} height={28} /> Kipointe
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {NAV.map(([href, libelle]) => (
              <Link key={href} href={href} className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100">
                {libelle}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
            <span>
              {u.prenom} {u.nom}
            </span>
            <Deconnexion />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
