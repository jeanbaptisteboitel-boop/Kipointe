"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Logomark } from "@/components/Logomark";
import { appelApi, ErreurApi } from "@/lib/ui/client";

type Sens = "arrivee" | "depart" | "double_badge";
interface Etat {
  nom: string;
  entreprise: string;
  fuseau: string;
  modeCode: boolean;
  qr: { svg: string; resteMs: number } | null;
  dernier: { id: string; prenom: string; sens: Sens; heure: string } | null;
  bloqueeMs: number;
}
type Retour = { ton: "ok" | "neutre" | "erreur"; titre: string; detail: string };

const PERIODE_MS = 10_000;

/** Présent quand la page tourne dans l'application Android Kipointe (android/). */
type Natif = { bip?: (ok: boolean) => void; demanderSortie?: () => void };
const natif = (): Natif | undefined => (typeof window === "undefined" ? undefined : (window as unknown as { KipointeNative?: Natif }).KipointeNative);
const fond = { background: "linear-gradient(160deg, var(--navy-deep), var(--navy-darker))", color: "#fff" } as const;

function retourDe(p: { prenom: string; sens: Sens; heure: string }): Retour {
  if (p.sens === "arrivee") return { ton: "ok", titre: `Bonjour ${p.prenom}`, detail: `Arrivée enregistrée à ${p.heure}` };
  if (p.sens === "depart") return { ton: "ok", titre: `Au revoir ${p.prenom}`, detail: `Départ enregistré à ${p.heure}` };
  return { ton: "neutre", titre: `${p.prenom}, c'est déjà fait`, detail: "Votre pointage vient d'être enregistré : rien à refaire." };
}

/** Garde l'écran allumé tant que la page est affichée (les tablettes Android le permettent en HTTPS). */
function useEcranAllume() {
  useEffect(() => {
    let verrou: { release: () => Promise<void> } | null = null;
    const demander = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        if (document.visibilityState === "visible") verrou = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        // Refusé (batterie faible, navigateur ancien) : l'application de verrouillage prend le relais.
      }
    };
    void demander();
    document.addEventListener("visibilitychange", demander);
    return () => {
      document.removeEventListener("visibilitychange", demander);
      void verrou?.release().catch(() => undefined);
    };
  }, []);
}

function Horloge({ fuseau }: { fuseau: string }) {
  const [t, setT] = useState<Date | null>(null);
  useEffect(() => {
    setT(new Date());
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  if (!t) return <div style={{ height: 120 }} />;
  const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: fuseau, hour: "2-digit", minute: "2-digit" }).format(t);
  const jour = new Intl.DateTimeFormat("fr-FR", { timeZone: fuseau, weekday: "long", day: "numeric", month: "long" }).format(t);
  return (
    <div>
      <div className="tabnum font-extrabold leading-none" style={{ fontSize: "clamp(56px, 11vw, 112px)", letterSpacing: "-0.03em" }}>
        {heure}
      </div>
      <div className="mt-2 text-lg first-letter:uppercase" style={{ color: "rgba(255,255,255,0.72)" }}>
        {jour}
      </div>
    </div>
  );
}

export function EcranTablette() {
  useEcranAllume();
  const [etat, setEtat] = useState<Etat | null>(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [code, setCode] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [retour, setRetour] = useState<Retour | null>(null);
  const [blocage, setBlocage] = useState(0); // instant de fin, en ms
  const [, forcer] = useState(0);
  const dernierVu = useRef<string | null | undefined>(undefined);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sortie = useRef<ReturnType<typeof setTimeout> | null>(null);

  const afficher = useCallback((r: Retour, duree = 4500) => {
    setRetour(r);
    try {
      natif()?.bip?.(r.ton !== "erreur");
    } catch {
      // Sans l'application, pas de son : l'écran suffit.
    }
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setRetour(null), duree);
  }, []);

  const rafraichir = useCallback(
    async (silencieux = false) => {
      try {
        const e = await appelApi<Etat>("/api/tablette/etat");
        setEtat(e);
        setHorsLigne(false);
        if (e.bloqueeMs > 0) setBlocage(Date.now() + e.bloqueeMs);
        const id = e.dernier?.id ?? null;
        // Un pointage arrivé par téléphone s'affiche ici ; celui tapé au clavier l'a déjà été.
        if (dernierVu.current !== undefined && id && id !== dernierVu.current && !silencieux) afficher(retourDe(e.dernier!));
        dernierVu.current = id;
      } catch (err) {
        if (err instanceof ErreurApi && err.status === 401) window.location.reload();
        else setHorsLigne(true);
      }
    },
    [afficher],
  );

  useEffect(() => {
    void rafraichir();
    const i = setInterval(() => void rafraichir(), PERIODE_MS);
    return () => clearInterval(i);
  }, [rafraichir]);

  // Un code laissé à moitié tapé s'efface : le suivant ne pointe pas avec les chiffres d'un autre.
  useEffect(() => {
    if (!code) return;
    const i = setTimeout(() => setCode(""), 12_000);
    return () => clearTimeout(i);
  }, [code]);

  const bloque = blocage > Date.now();
  useEffect(() => {
    if (!bloque) return;
    const i = setInterval(() => forcer((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [bloque]);

  async function valider() {
    if (code.length < 4 || envoi || bloque) return;
    setEnvoi(true);
    try {
      const r = await appelApi<{ prenom: string; sens: Sens; heure: string }>("/api/tablette/pointer", { method: "POST", json: { code } });
      afficher(retourDe(r));
      await rafraichir(true);
    } catch (err) {
      if (err instanceof ErreurApi && err.code === "CLAVIER_BLOQUE") {
        const s = Number((err.detail as { attenteSecondes?: number } | null)?.attenteSecondes ?? 60);
        setBlocage(Date.now() + s * 1000);
        afficher({ ton: "erreur", titre: "Clavier bloqué", detail: "Trop de codes faux à la suite. Patientez une minute." });
      } else if (err instanceof ErreurApi && err.status === 401 && err.code === "TABLETTE_INCONNUE") {
        window.location.reload();
      } else if (err instanceof ErreurApi && err.code === "CODE_INCONNU") {
        afficher({ ton: "erreur", titre: "Code inconnu", detail: "Vérifiez votre code et recommencez." }, 3000);
      } else {
        afficher({ ton: "erreur", titre: "Pointage impossible", detail: "La tablette n'a pas pu joindre le service. Réessayez dans un instant." });
      }
    } finally {
      setCode("");
      setEnvoi(false);
    }
  }

  if (!etat) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-center" style={fond}>
        <p className="text-lg">{horsLigne ? "Connexion au service impossible. Vérifiez le Wi-Fi de la tablette." : "Chargement…"}</p>
      </main>
    );
  }

  const touche = "flex h-[72px] select-none items-center justify-center rounded-2xl text-[28px] font-bold active:scale-95 disabled:opacity-40";
  const aucunMode = !etat.modeCode && !etat.qr;

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden p-6 sm:p-10" style={{ ...fond, userSelect: "none" }}>
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Appui long sur le logo : l'application Android demande le code de sortie. */}
          <span
            onPointerDown={() => {
              sortie.current = setTimeout(() => natif()?.demanderSortie?.(), 3000);
            }}
            onPointerUp={() => sortie.current && clearTimeout(sortie.current)}
            onPointerLeave={() => sortie.current && clearTimeout(sortie.current)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Logomark size={34} />
          </span>
          <div>
            <div className="text-lg font-extrabold">{etat.entreprise}</div>
            <div className="mono text-[12px] uppercase" style={{ color: "rgba(255,255,255,0.6)", letterSpacing: "0.08em" }}>
              {etat.nom}
            </div>
          </div>
        </div>
        {horsLigne && (
          <span className="rounded-full px-4 py-2 text-sm font-bold" style={{ background: "var(--warn)", color: "#3d2500" }} role="status">
            Hors connexion — pointage suspendu
          </span>
        )}
      </header>

      <div className="mt-8 grid flex-1 items-center gap-10 landscape:grid-cols-2">
        <section className="flex flex-col gap-8">
          <Horloge fuseau={etat.fuseau} />
          {etat.qr && (
            <div className="flex items-center gap-5">
              <div className="shrink-0 rounded-2xl bg-white p-3" style={{ width: "min(40vw, 230px)" }} aria-label="QR code de pointage" dangerouslySetInnerHTML={{ __html: etat.qr.svg }} />
              <div>
                <div className="text-xl font-extrabold">Avec votre téléphone</div>
                <p className="mt-1 text-[15px]" style={{ color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>
                  Ouvrez l'appareil photo, visez ce QR code et suivez le lien : votre pointage est enregistré.
                </p>
              </div>
            </div>
          )}
          {aucunMode && <p className="text-lg">Aucun mode de pointage n'est ouvert pour cette tablette. L'administrateur peut en activer un dans Kipointe, page Tablettes.</p>}
        </section>

        {etat.modeCode && (
          <section className="mx-auto w-full max-w-[360px]">
            <div className="text-center text-xl font-extrabold">Avec votre code</div>
            <div
              className="mono mt-4 flex h-[68px] items-center justify-center rounded-2xl text-[34px] font-bold"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", letterSpacing: "0.4em" }}
              aria-live="polite"
              aria-label={`${code.length} chiffres saisis`}
            >
              {bloque ? <span className="text-base tracking-normal">Bloqué {Math.max(1, Math.ceil((blocage - Date.now()) / 1000))} s</span> : "•".repeat(code.length) || <span style={{ opacity: 0.35 }}>····</span>}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((c) => (
                <button key={c} type="button" className={touche} style={{ background: "rgba(255,255,255,0.12)" }} disabled={bloque || envoi || horsLigne} onClick={() => setCode((v) => (v.length < 6 ? v + c : v))}>
                  {c}
                </button>
              ))}
              <button type="button" className={`${touche} text-[17px]`} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.25)" }} disabled={!code || envoi} onClick={() => setCode("")}>
                Effacer
              </button>
              <button type="button" className={touche} style={{ background: "rgba(255,255,255,0.12)" }} disabled={bloque || envoi || horsLigne} onClick={() => setCode((v) => (v.length < 6 ? v + "0" : v))}>
                0
              </button>
              <button type="button" className={`${touche} text-[17px]`} style={{ background: "var(--cyan)", color: "#04122e" }} disabled={code.length < 4 || envoi || bloque || horsLigne} onClick={valider}>
                {envoi ? "…" : "Valider"}
              </button>
            </div>
          </section>
        )}
      </div>

      {retour && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center"
          style={{ background: retour.ton === "ok" ? "var(--success)" : retour.ton === "erreur" ? "var(--danger)" : "var(--navy)", color: "#fff" }}
          role="alert"
          onClick={() => setRetour(null)}
        >
          <div className="font-extrabold" style={{ fontSize: "clamp(36px, 7vw, 68px)", letterSpacing: "-0.02em" }}>
            {retour.titre}
          </div>
          <div className="text-2xl font-semibold">{retour.detail}</div>
        </div>
      )}
    </main>
  );
}

export function ActivationTablette() {
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center p-6" style={fond}>
      <form
        className="card w-full max-w-[460px] p-8"
        style={{ color: "var(--ink)" }}
        onSubmit={async (e) => {
          e.preventDefault();
          setErreur(null);
          setEnCours(true);
          try {
            await appelApi("/api/tablette/activer", { method: "POST", json: { code } });
            window.location.reload();
          } catch (err) {
            setErreur(err instanceof ErreurApi && err.status === 429 ? "Trop d'essais : réessayez dans un quart d'heure." : "Code d'activation inconnu ou expiré. Demandez-en un nouveau à l'administrateur.");
            setEnCours(false);
          }
        }}
      >
        <div className="mb-4 flex justify-center">
          <Logomark size={40} />
        </div>
        <h1 className="titre text-center text-[24px]">Relier cette tablette</h1>
        <p className="mt-2 mb-5 text-center text-sm" style={{ color: "var(--muted)" }}>
          Saisissez le code d'activation affiché dans Kipointe, page Tablettes, par l'administrateur de l'entreprise.
        </p>
        <label className="label" htmlFor="code-activation">
          Code d'activation
        </label>
        <input id="code-activation" className="input mono text-center text-[22px] uppercase" style={{ letterSpacing: "0.25em" }} autoComplete="off" autoCapitalize="characters" maxLength={12} required value={code} onChange={(e) => setCode(e.target.value)} />
        {erreur && (
          <p className="encart-danger mt-3 text-[13px] font-semibold" role="alert">
            {erreur}
          </p>
        )}
        <button type="submit" className="btn-primary mt-5 h-[46px] w-full text-[15px]" disabled={enCours}>
          {enCours ? "Activation…" : "Activer"}
        </button>
      </form>
    </main>
  );
}
