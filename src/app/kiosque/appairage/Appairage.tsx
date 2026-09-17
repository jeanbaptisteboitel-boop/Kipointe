"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/kiosque/api";
import { natif } from "@/lib/kiosque/natif";
import { ecrireConfig, idb, lireConfig } from "@/lib/kiosque/stockage";
import type { ConfigTerminal, SalarieCache } from "@/lib/kiosque/types";

export function Appairage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (lireConfig()) router.replace("/kiosque");
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, [router]);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const n = natif();
      const { status, corps } = await api.appairer(code, n?.getTerminalId() ?? null, n?.getAppVersion() ?? null);
      if (status !== 200) {
        setErreur(status === 404 ? "Code inconnu ou expiré. Générez un nouveau code depuis l'espace gérant." : "Appairage impossible.");
        return;
      }
      const c = corps as unknown as Omit<ConfigTerminal, "appaire_le">;
      const config: ConfigTerminal = { ...c, appaire_le: new Date().toISOString() };
      ecrireConfig(config);
      // Amorçage du cache hors ligne : liste des salariés.
      try {
        const r = await api.salaries(config.token);
        if (r.status === 200) for (const s of r.corps.salaries) await idb.mettre<SalarieCache>("salaries", s);
      } catch {
        /* sera fait au premier heartbeat */
      }
      router.replace("/kiosque");
    } catch {
      setErreur("Réseau indisponible : l'appairage nécessite une connexion.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main className="kiosque items-center justify-center p-8">
      <form onSubmit={soumettre} className="w-full max-w-md space-y-6 text-center">
        <img src="/icons/icon.svg" alt="" width={96} height={96} className="mx-auto" />
        <h1 className="text-4xl font-bold">Appairage de la tablette</h1>
        <p className="text-xl text-white/70">Saisissez le code à 8 chiffres généré dans l'espace gérant (Terminaux → Générer un code).</p>
        <input
          inputMode="numeric"
          autoFocus
          className="w-full rounded-2xl bg-white px-6 py-5 text-center text-5xl font-bold tracking-[0.3em] text-[var(--navy)]"
          placeholder="0000-0000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d-]/g, "").slice(0, 9))}
        />
        {erreur && <p className="rounded-lg bg-red-500/80 px-4 py-3 text-lg font-semibold">{erreur}</p>}
        <button type="submit" className="w-full rounded-2xl bg-cyan-400 px-6 py-5 text-3xl font-bold text-[var(--navy)] disabled:opacity-50" disabled={enCours || code.replace(/\D/g, "").length !== 8}>
          {enCours ? "Appairage…" : "Appairer"}
        </button>
      </form>
    </main>
  );
}
