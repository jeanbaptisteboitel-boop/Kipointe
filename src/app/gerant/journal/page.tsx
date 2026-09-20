import { exigerGerant } from "@/lib/auth/session";
import { listerJournal } from "@/lib/ui/data";
import { LIBELLES_ACTION } from "@/lib/ui/libelles";

export const metadata = { title: "Journal des accès" };

/** Détail d'une entrée, en français, jamais du JSON brut. */
function detailLisible(action: string, detail: Record<string, unknown>): string {
  const d = detail as Record<string, string | undefined>;
  if (action === "pointage.corriger") return d.motif ? `Motif : ${d.motif}` : "Correction tracée";
  if (action === "pointage.saisie_manuelle") return d.motif ? `Motif : ${d.motif}` : "Saisie manuelle";
  if (action === "recap.valider") return d.semaine ? `Semaine ${d.semaine}, archive scellée` : "Récapitulatif archivé";
  if (action === "recap.consulter" || action === "pointages.consulter") return d.semaine ? `Semaine ${d.semaine}` : "";
  if (action === "anomalie.statut") return d.statut ? `Nouveau statut : ${String(d.statut).toLowerCase()}` : "";
  if (action === "organisation.parametres") return "Paramètres de calcul modifiés";
  if (action === "pin.reinitialiser") return "Nouveau code remis en main propre";
  if (action === "badge.regenerer") return "Ancien badge révoqué";
  return "";
}

export default async function PageJournal() {
  const u = await exigerGerant();
  const { lignes, utilisateurs, salaries } = await listerJournal(u);
  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <h1 className="titre text-[28px]">Journal des accès</h1>
        <p className="mt-2 max-w-[74ch] text-sm" style={{ color: "var(--muted)", lineHeight: 1.55 }}>
          Toutes les actions du gérant et du cabinet sur les données d'un salarié sont enregistrées. Le journal ne peut être ni modifié ni purgé ; il est conservé 5 ans. Les 200
          dernières entrées sont affichées.
        </p>
      </div>

      <div className="card-plat overflow-x-auto">
        <table className="tbl" style={{ minWidth: 920 }}>
          <thead>
            <tr>
              <th style={{ width: 150 }}>Date</th>
              <th style={{ width: 200 }}>Utilisateur</th>
              <th style={{ width: 220 }}>Action</th>
              <th style={{ width: 160 }}>Salarié</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center" style={{ color: "var(--muted)" }}>
                  Aucun accès enregistré.
                </td>
              </tr>
            )}
            {lignes.map((l) => {
              const ut = l.utilisateurId ? utilisateurs.get(l.utilisateurId) : null;
              const s = l.salarieId ? salaries.get(l.salarieId) : null;
              return (
                <tr key={l.id}>
                  <td className="tabnum text-[13px] font-semibold whitespace-nowrap">
                    {l.createdAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="text-[13px]" style={{ color: "var(--muted)" }}>
                    {ut ? `${ut.prenom} ${ut.nom}` : "—"}
                  </td>
                  <td className="text-[13px] font-semibold">{LIBELLES_ACTION[l.action] ?? l.action}</td>
                  <td className="text-[13px]">{s ? `${s.nom} ${s.prenom}` : "—"}</td>
                  <td className="text-[13px]" style={{ color: "var(--muted)", lineHeight: 1.45 }}>
                    {detailLisible(l.action, l.detail)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
