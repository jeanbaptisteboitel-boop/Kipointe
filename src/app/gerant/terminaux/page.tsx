import { exigerGerant } from "@/lib/auth/session";
import { listerTerminaux } from "@/lib/ui/data";
import { Terminaux } from "./Terminaux";

export const metadata = { title: "Terminaux" };

export default async function PageTerminaux() {
  const u = await exigerGerant();
  const { terminaux, etablissements } = await listerTerminaux(u);
  const maintenant = Date.now();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Terminaux (tablettes murales)</h1>
      <p className="text-sm text-slate-600">
        Créez un terminal par tablette, générez un code d'appairage (valable 15 minutes) et saisissez-le sur la tablette. Un terminal silencieux depuis plus de 15 minutes est signalé.
      </p>
      <Terminaux
        etablissements={etablissements.map((e) => ({ id: e.id, libelle: e.libelle }))}
        terminaux={terminaux.map((t) => ({
          id: t.id,
          libelle: t.libelle,
          etablissement: t.etablissement.libelle,
          appaire: !!t.tokenHash,
          derniereSynchro: t.derniereSynchro?.toISOString() ?? null,
          silencieux: !!t.tokenHash && (!t.derniereSynchro || maintenant - t.derniereSynchro.getTime() > 15 * 60_000),
          versionApp: t.versionApp,
          actif: t.actif,
        }))}
      />
    </div>
  );
}
