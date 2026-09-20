"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconeAlerte } from "@/components/icones";
import { appelApi, ErreurApi } from "@/lib/ui/client";

export function FormulaireConnexion() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const r = await appelApi<{ utilisateur: { role: string } }>("/api/auth/connexion", {
        method: "POST",
        json: { email, mot_de_passe: motDePasse },
      });
      router.replace(r.utilisateur.role === "GERANT" ? "/gerant" : "/salarie");
      router.refresh();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? "Adresse e-mail ou mot de passe incorrect." : "Connexion impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={soumettre} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="email">
          Adresse e-mail
        </label>
        <input
          id="email"
          type="email"
          className={`input${erreur ? " input-erreur" : ""}`}
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="mdp">
          Mot de passe
        </label>
        <input
          id="mdp"
          type="password"
          className={`input${erreur ? " input-erreur" : ""}`}
          autoComplete="current-password"
          required
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
        />
      </div>
      {erreur && (
        <div className="encart-danger flex items-center gap-2 py-3" role="alert">
          <IconeAlerte size={17} />
          <span className="text-[13px] font-semibold">{erreur}</span>
        </div>
      )}
      <button type="submit" className="btn-primary h-[46px] text-[15px]" disabled={enCours}>
        {enCours ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
