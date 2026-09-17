import { exigerGerant } from "@/lib/auth/session";
import { listerJournal } from "@/lib/ui/data";
import { LIBELLES_ACTION } from "@/lib/ui/libelles";

export const metadata = { title: "Journal des accès" };

export default async function PageJournal() {
  const u = await exigerGerant();
  const { lignes, utilisateurs, salaries } = await listerJournal(u);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Journal des accès aux données salariés</h1>
      <p className="text-sm text-slate-600">200 derniers événements. Chaque consultation, export, correction ou modification par un gérant est tracée.</p>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Utilisateur</th>
              <th>Action</th>
              <th>Salarié</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const ut = l.utilisateurId ? utilisateurs.get(l.utilisateurId) : null;
              const s = l.salarieId ? salaries.get(l.salarieId) : null;
              return (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-xs">{l.createdAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</td>
                  <td>{ut ? `${ut.prenom} ${ut.nom}` : "—"}</td>
                  <td>{LIBELLES_ACTION[l.action] ?? l.action}</td>
                  <td>{s ? `${s.nom} ${s.prenom}` : "—"}</td>
                  <td className="max-w-md truncate font-mono text-xs text-slate-500">{Object.keys(l.detail).length ? JSON.stringify(l.detail) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
