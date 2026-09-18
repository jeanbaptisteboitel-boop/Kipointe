import { exigerGerant } from "@/lib/auth/session";
import { listerTerminaux } from "@/lib/ui/data";
import { Terminaux } from "./Terminaux";

export const metadata = { title: "Terminaux" };

export default async function PageTerminaux() {
  const u = await exigerGerant();
  const { terminaux, etablissements } = await listerTerminaux(u);
  const maintenant = Date.now();

  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <h1 className="titre text-[28px]">Terminaux</h1>
        <p className="mt-2 max-w-[74ch] text-sm" style={{ color: "var(--muted)", lineHeight: 1.55 }}>
          Un terminal par tablette murale. Générez un code d'appairage, valable 15 minutes, et saisissez-le sur la tablette. Un terminal est «&nbsp;silencieux&nbsp;» s'il n'a pas
          synchronisé depuis plus de 15 minutes : vérifiez le réseau avant de le révoquer.
        </p>
      </div>
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
