"use client";

import { useRouter } from "next/navigation";
import { appelApi } from "@/lib/ui/client";

export function StatutAnomalie({ id, statut }: { id: string; statut: string }) {
  const router = useRouter();
  async function changer(nouveau: string) {
    await appelApi(`/api/admin/anomalies/${id}`, { method: "PATCH", json: { statut: nouveau } });
    router.refresh();
  }
  return (
    <div className="flex justify-end gap-1">
      {statut !== "TRAITEE" && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => void changer("TRAITEE")}>
          Traitée
        </button>
      )}
      {statut !== "IGNOREE" && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => void changer("IGNOREE")}>
          Ignorer
        </button>
      )}
      {statut !== "OUVERTE" && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => void changer("OUVERTE")}>
          Rouvrir
        </button>
      )}
    </div>
  );
}
