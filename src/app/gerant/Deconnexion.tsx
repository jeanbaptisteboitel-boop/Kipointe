"use client";

import { useRouter } from "next/navigation";
import { appelApi } from "@/lib/ui/client";

export function Deconnexion() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
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
