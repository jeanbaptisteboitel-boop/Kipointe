"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appelApi } from "@/lib/ui/client";

export function StatutAnomalie({ id, statut }: { id: string; statut: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);

  async function changer(nouveau: string) {
    setEnCours(true);
    try {
      await appelApi(`/api/admin/anomalies/${id}`, { method: "PATCH", json: { statut: nouveau } });
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {statut !== "TRAITEE" && (
        <button type="button" className="btn-secondary btn-sm" disabled={enCours} onClick={() => void changer("TRAITEE")}>
          Traitée
        </button>
      )}
      {statut !== "IGNOREE" && (
        <button type="button" className="btn-secondary btn-sm" disabled={enCours} style={{ color: "var(--muted)" }} onClick={() => void changer("IGNOREE")}>
          Ignorer
        </button>
      )}
      {statut !== "OUVERTE" && (
        <button type="button" className="btn-secondary btn-sm" disabled={enCours} onClick={() => void changer("OUVERTE")}>
          Rouvrir
        </button>
      )}
    </div>
  );
}
