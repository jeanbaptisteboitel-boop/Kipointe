import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { exigerGerant } from "@/lib/auth/session";
import { chargerOrganisation, chargerSalarie } from "@/lib/ui/data";

export const metadata = { title: "Badge à imprimer" };

export default async function PageBadge({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigerGerant();
  const { id } = await params;
  const [s, { org }] = await Promise.all([chargerSalarie(u, id), chargerOrganisation(u)]);
  if (!s) notFound();
  const contenu = `BADGE:${s.badgeUuid}`;
  const svg = await QRCode.toString(contenu, { type: "svg", margin: 1, errorCorrectionLevel: "M", width: 300 });

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center gap-3">
        <a href={`/gerant/salaries/${s.id}`} className="btn-secondary btn-sm">
          ← Retour
        </a>
        <p className="text-sm text-slate-600">Imprimez, plastifiez (format carte 85 × 54 mm) ou fixez sur un porte-clés. Le badge ne contient aucune donnée personnelle, seulement un identifiant opaque.</p>
      </div>
      <div className="flex flex-wrap gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="flex h-[54mm] w-[85mm] items-center gap-4 rounded-xl border-2 border-slate-800 bg-white p-4" style={{ breakInside: "avoid" }}>
            <div className="h-[42mm] w-[42mm] shrink-0" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{org.raisonSociale}</div>
              <div className="mt-1 truncate text-xl font-bold text-[var(--navy)]">{s.prenom}</div>
              <div className="truncate text-lg font-semibold text-[var(--navy)]">{s.nom}</div>
              {s.matricule && <div className="mt-1 text-xs text-slate-500">Matricule {s.matricule}</div>}
              <div className="mt-2 text-[9px] text-slate-400">Badge de pointage · Kipointe</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
