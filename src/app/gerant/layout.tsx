import { LogoKipointe } from "@/components/Logomark";
import { exigerGerant } from "@/lib/auth/session";
import { chargerOrganisation } from "@/lib/ui/data";
import { Deconnexion } from "./Deconnexion";
import { NavigationGerant } from "./NavigationGerant";

export const dynamic = "force-dynamic";

export default async function LayoutGerant({ children }: { children: React.ReactNode }) {
  const u = await exigerGerant();
  const { org } = await chargerOrganisation(u);
  return (
    <div className="min-h-screen">
      <header className="no-print bg-white" style={{ borderBottom: "1px solid var(--line-portal)" }}>
        <div className="mx-auto max-w-[1180px] px-6">
          <div className="flex flex-wrap items-center justify-between gap-5 pt-3.5">
            <div className="flex items-center gap-3">
              <LogoKipointe size={26} />
              <span className="h-5 w-px" style={{ background: "var(--line-portal)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
                {org.raisonSociale}
              </span>
            </div>
            <div className="flex items-center gap-3.5">
              <span className="text-[13px]" style={{ color: "var(--muted)" }}>
                {u.email}
              </span>
              <Deconnexion />
            </div>
          </div>
          <NavigationGerant />
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-6 py-7">{children}</main>
    </div>
  );
}
