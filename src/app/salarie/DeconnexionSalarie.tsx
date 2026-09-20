"use client";

import { useRouter } from "next/navigation";
import { appelApi } from "@/lib/ui/client";

export function DeconnexionSalarie() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-white"
      style={{ border: "1px solid rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.08)" }}
      onClick={async () => {
        await appelApi("/api/auth/deconnexion", { method: "POST" });
        router.replace("/connexion");
        router.refresh();
      }}
    >
      Se déconnecter
    </button>
  );
}
