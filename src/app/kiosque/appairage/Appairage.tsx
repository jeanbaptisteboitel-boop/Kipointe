"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconeCroix, IconePower } from "@/components/icones";
import { api } from "@/lib/kiosque/api";
import { natif } from "@/lib/kiosque/natif";
import { ecrireConfig, idb, lireConfig } from "@/lib/kiosque/stockage";
import type { ConfigTerminal, SalarieCache } from "@/lib/kiosque/types";

/** « 12345678 » → « 1234-5678 », comme l'affiche l'espace gérant. */
function formater(saisie: string): string {
  const chiffres = saisie.replace(/\D/g, "").slice(0, 8);
  return chiffres.length > 4 ? `${chiffres.slice(0, 4)}-${chiffres.slice(4)}` : chiffres;
}

const TOUCHES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

export function Appairage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (lireConfig()) router.replace("/kiosque");
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, [router]);

  const chiffres = code.replace(/\D/g, "");

  function touche(t: string) {
    setErreur(null);
    if (t === "clear") return setCode("");
    if (t === "back") return setCode((c) => formater(c.replace(/\D/g, "").slice(0, -1)));
    setCode((c) => formater(c + t));
  }

  async function appairer() {
    if (chiffres.length !== 8 || enCours) return;
    setErreur(null);
    setEnCours(true);
    try {
      const n = natif();
      const { status, corps } = await api.appairer(chiffres, n?.getTerminalId() ?? null, n?.getAppVersion() ?? null);
      if (status !== 200) {
        setErreur(status === 404 ? "Code inconnu ou expiré" : "Appairage impossible");
        setCode("");
        return;
      }
      const c = corps as unknown as Omit<ConfigTerminal, "appaire_le">;
      const config: ConfigTerminal = { ...c, appaire_le: new Date().toISOString() };
      ecrireConfig(config);
      // Amorçage du cache hors ligne dès l'appairage : la tablette peut démarrer sans réseau ensuite.
      try {
        const r = await api.salaries(config.token);
        if (r.status === 200) for (const s of r.corps.salaries) await idb.mettre<SalarieCache>("salaries", s);
      } catch {
        /* sera rattrapé au premier heartbeat */
      }
      router.replace("/kiosque");
    } catch {
      setErreur("Réseau indisponible — l'appairage demande une connexion");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main className="kiosque items-center justify-center gap-10 p-12 text-center">
      <div className="flex items-center justify-center rounded-full" style={{ width: 104, height: 104, background: "var(--k-accent)" }}>
        <IconePower size={56} stroke="#0B1F3A" />
      </div>

      <div>
        <div style={{ fontSize: "clamp(32px, 6vw, 48px)", fontWeight: 800, letterSpacing: "-0.03em" }}>Appairage de la tablette</div>
        <div className="mx-auto mt-3.5 max-w-[560px]" style={{ fontSize: "clamp(20px, 3.2vw, 26px)", fontWeight: 500, color: "rgba(255,255,255,0.62)", lineHeight: 1.4 }}>
          Saisissez le code à 8 chiffres affiché dans l'espace gérant, onglet Terminaux.
        </div>
      </div>

      <div
        className="flex w-full max-w-[640px] items-center justify-center"
        style={{ height: 152, borderRadius: 20, border: "3px solid rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.05)" }}
      >
        <span className="mono tabnum" style={{ fontSize: "clamp(48px, 10vw, 84px)", fontWeight: 500, letterSpacing: "0.06em" }}>
          {code || "0000-0000"}
        </span>
      </div>

      {erreur && (
        <div className="flex items-center gap-3.5 rounded-2xl px-7 py-4" role="alert" style={{ background: "rgba(239,68,68,0.16)", border: "2px solid var(--k-danger)" }}>
          <IconeCroix size={30} className="text-[#FCA5A5]" />
          <span style={{ fontSize: "clamp(20px, 3.2vw, 26px)", fontWeight: 700, color: "var(--k-danger-soft)" }}>{erreur}</span>
        </div>
      )}

      <div className="grid w-full max-w-[640px] grid-cols-3 gap-4">
        {TOUCHES.map((t) => (
          <button
            key={t}
            type="button"
            className={t === "clear" ? "k-touche-annuler" : t === "back" ? "k-touche-effacer" : "k-touche"}
            aria-label={t === "clear" ? "Tout effacer" : t === "back" ? "Effacer le dernier chiffre" : undefined}
            onPointerDown={() => touche(t)}
          >
            {t === "clear" ? "Effacer" : t === "back" ? "←" : t}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="w-full max-w-[640px] rounded-2xl font-extrabold disabled:opacity-40"
        style={{ height: 104, background: "var(--k-accent)", color: "var(--k-accent-ink)", fontSize: "clamp(26px, 4.4vw, 34px)", letterSpacing: "-0.01em" }}
        disabled={chiffres.length !== 8 || enCours}
        onClick={() => void appairer()}
      >
        {enCours ? "Appairage…" : "Appairer"}
      </button>
    </main>
  );
}
