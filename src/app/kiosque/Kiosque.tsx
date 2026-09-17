"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { natif, retour } from "@/lib/kiosque/natif";
import { antiRebond, barcodeDetectorDisponible, demarrerCamera, ecouterClavier, ecouterNatif } from "@/lib/kiosque/scanner";
import { ServiceKiosque } from "@/lib/kiosque/service";
import { lireConfig, toutEffacer } from "@/lib/kiosque/stockage";
import { LIBELLES_TYPE, type ConfigTerminal, type EtatReseau, type ResultatLocal } from "@/lib/kiosque/types";

type Ecran =
  | { mode: "ACCUEIL" }
  | { mode: "PIN"; badge: string; prenom: string | null; message?: string }
  | { mode: "ENVOI"; badge: string; prenom: string | null }
  | { mode: "CONFIRMATION"; resultat: Extract<ResultatLocal, { ok: true }> }
  | { mode: "ERREUR"; message: string; sousTitre?: string };

const DUREE_CONFIRMATION_MS = 3000;
const DUREE_ERREUR_MS = 3500;
const DELAI_ABANDON_PIN_MS = 30_000;

function heureLocale(d: Date, tz: string) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
}
function dateLocale(d: Date, tz: string) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);
}
function formatDuree(min: number) {
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}

export function Kiosque() {
  const router = useRouter();
  const [config, setConfig] = useState<ConfigTerminal | null | undefined>(undefined);
  const [ecran, setEcran] = useState<Ecran>({ mode: "ACCUEIL" });
  const [pin, setPin] = useState("");
  const [reseau, setReseau] = useState<EtatReseau>({ enLigne: true, enAttente: 0, derniereSynchro: null, offsetMs: 0, synchroEnCours: false });
  const [maintenant, setMaintenant] = useState(() => new Date());
  const [overlay, setOverlay] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const service = useRef<ServiceKiosque | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const ecranRef = useRef(ecran);
  ecranRef.current = ecran;
  const timerRetour = useRef<number | null>(null);
  const appuiLong = useRef<number | null>(null);

  // ─── Démarrage : config, service worker, service kiosque ───
  useEffect(() => {
    const c = lireConfig();
    setConfig(c);
    if (!c) {
      router.replace("/kiosque/appairage");
      return;
    }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const s = new ServiceKiosque(c, setReseau);
    service.current = s;
    void s.demarrer();
    const surDesappairage = () => {
      void toutEffacer().then(() => router.replace("/kiosque/appairage"));
    };
    window.addEventListener("kipointe:desappaire", surDesappairage);
    return () => {
      s.arreter();
      window.removeEventListener("kipointe:desappaire", surDesappairage);
    };
  }, [router]);

  // ─── Horloge (heure corrigée de l'offset serveur) ───
  useEffect(() => {
    const t = window.setInterval(() => setMaintenant(service.current?.maintenantCorrige() ?? new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const programmerRetour = useCallback((delai: number) => {
    if (timerRetour.current) window.clearTimeout(timerRetour.current);
    timerRetour.current = window.setTimeout(() => {
      setEcran({ mode: "ACCUEIL" });
      setPin("");
    }, delai);
  }, []);

  // ─── Badge scanné ───
  const surBadge = useCallback(
    async (uuid: string) => {
      const s = service.current;
      if (!s) return;
      const courant = ecranRef.current;
      if (courant.mode === "ENVOI") return;
      const { prenom, inconnu } = await s.resoudreBadge(uuid);
      if (inconnu) {
        retour(false);
        setEcran({ mode: "ERREUR", message: "Badge inconnu", sousTitre: "Hors ligne : ce badge n'est pas dans la liste de la tablette." });
        programmerRetour(DUREE_ERREUR_MS);
        return;
      }
      retour(true);
      setPin("");
      setEcran({ mode: "PIN", badge: uuid, prenom });
      programmerRetour(DELAI_ABANDON_PIN_MS);
    },
    [programmerRetour],
  );

  useEffect(() => {
    const traiter = antiRebond((uuid) => void surBadge(uuid));
    const arreterNatif = ecouterNatif(traiter);
    const arreterClavier = ecouterClavier(traiter);
    let arreterCamera: (() => void) | null = null;
    if (!natif() && barcodeDetectorDisponible() && video.current) {
      demarrerCamera(video.current, traiter)
        .then((stop) => {
          arreterCamera = stop;
          setCameraActive(true);
        })
        .catch(() => setCameraActive(false));
    }
    return () => {
      arreterNatif();
      arreterClavier();
      arreterCamera?.();
    };
  }, [surBadge]);

  // ─── Saisie du PIN ───
  const envoyer = useCallback(
    async (badge: string, prenom: string | null, code: string) => {
      const s = service.current;
      if (!s) return;
      setEcran({ mode: "ENVOI", badge, prenom });
      const res = await s.pointer(badge, code, prenom);
      setPin("");
      if (res.ok) {
        retour(true);
        setEcran({ mode: "CONFIRMATION", resultat: res });
        programmerRetour(DUREE_CONFIRMATION_MS);
      } else {
        retour(false);
        if (res.conserverBadge) {
          const restantes = res.detail && typeof res.detail.tentativesRestantes === "number" ? res.detail.tentativesRestantes : null;
          setEcran({ mode: "PIN", badge, prenom, message: restantes !== null ? `Code incorrect — ${restantes} essai${restantes > 1 ? "s" : ""} restant${restantes > 1 ? "s" : ""}` : res.message });
          programmerRetour(DELAI_ABANDON_PIN_MS);
        } else {
          setEcran({ mode: "ERREUR", message: res.message, sousTitre: res.code === "BADGE_VERROUILLE" ? "Demandez au gérant de déverrouiller votre badge." : undefined });
          programmerRetour(DUREE_ERREUR_MS);
        }
      }
    },
    [programmerRetour],
  );

  const touche = useCallback(
    (t: string) => {
      if (ecran.mode !== "PIN") return;
      programmerRetour(DELAI_ABANDON_PIN_MS);
      if (t === "⌫") return setPin((p) => p.slice(0, -1));
      if (t === "✕") {
        setPin("");
        setEcran({ mode: "ACCUEIL" });
        return;
      }
      setPin((p) => {
        if (p.length >= 4) return p;
        const nouveau = p + t;
        if (nouveau.length === 4) void envoyer(ecran.badge, ecran.prenom, nouveau);
        return nouveau;
      });
    },
    [ecran, envoyer, programmerRetour],
  );

  // ─── Appui long 5 s sur le logo : overlay technique ───
  const debutAppui = () => {
    appuiLong.current = window.setTimeout(() => setOverlay(true), 5000);
  };
  const finAppui = () => {
    if (appuiLong.current) window.clearTimeout(appuiLong.current);
  };

  if (config === undefined) return <div className="kiosque" />;
  if (!config) return null;
  const tz = config.etablissement.timezone;

  return (
    <main className="kiosque">
      {/* Bandeau d'état réseau, discret mais permanent */}
      <div className={`flex items-center justify-between px-4 py-2 text-sm ${reseau.enLigne && reseau.enAttente === 0 ? "bg-white/5 text-white/60" : "bg-amber-400 text-[var(--navy)]"}`}>
        <span onPointerDown={debutAppui} onPointerUp={finAppui} onPointerLeave={finAppui} className="font-semibold">
          {config.organisation.raison_sociale} · {config.etablissement.libelle}
        </span>
        <span>
          {reseau.enLigne ? (reseau.enAttente > 0 ? `Synchronisation — ${reseau.enAttente} en attente` : "En ligne") : `Hors ligne — ${reseau.enAttente} pointage${reseau.enAttente > 1 ? "s" : ""} en attente`}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        {ecran.mode === "ACCUEIL" && (
          <>
            <div className="kiosque-heure">{heureLocale(maintenant, tz)}</div>
            <div className="mt-3 text-2xl text-white/70 capitalize">{dateLocale(maintenant, tz)}</div>
            <div className="mt-12 text-4xl font-semibold">Présentez votre badge</div>
            <div className="mt-4 text-xl text-white/60">Puis saisissez votre code à 4 chiffres</div>
            <div className="mt-10 h-56 w-56 overflow-hidden rounded-3xl border-4 border-cyan-400/60 bg-black/30">
              <video ref={video} muted playsInline className={`h-full w-full object-cover ${cameraActive ? "" : "hidden"}`} />
              {!cameraActive && (
                <div className="flex h-full items-center justify-center p-4 text-base text-white/50">{natif() ? "Caméra active" : "Lecteur de badge prêt"}</div>
              )}
            </div>
          </>
        )}

        {(ecran.mode === "PIN" || ecran.mode === "ENVOI") && (
          <>
            <div className="text-5xl font-bold">Bonjour {ecran.prenom ?? ""}</div>
            <div className="mt-3 text-2xl text-white/70">{ecran.mode === "ENVOI" ? "Enregistrement…" : "Saisissez votre code"}</div>
            {ecran.mode === "PIN" && ecran.message && <div className="mt-3 rounded-lg bg-red-500/80 px-4 py-2 text-xl font-semibold">{ecran.message}</div>}
            <div className="mt-8 flex gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`h-6 w-6 rounded-full border-2 border-cyan-300 ${pin.length > i ? "bg-cyan-300" : ""}`} />
              ))}
            </div>
            <div className="mt-8 grid w-full max-w-sm grid-cols-3 gap-4">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "✕", "0", "⌫"].map((t) => (
                <button key={t} type="button" className={`pin-touche ${t === "✕" ? "text-3xl text-red-300" : ""}`} disabled={ecran.mode === "ENVOI"} onPointerDown={() => touche(t)}>
                  {t}
                </button>
              ))}
            </div>
          </>
        )}

        {ecran.mode === "CONFIRMATION" && (
          <>
            <div className="flex h-36 w-36 items-center justify-center rounded-full bg-emerald-400 text-8xl text-[var(--navy)]">✓</div>
            <div className="mt-8 text-6xl font-bold">{ecran.resultat.type ? LIBELLES_TYPE[ecran.resultat.type] : "Pointage"}</div>
            <div className="mt-3 text-4xl text-white/80">à {heureLocale(ecran.resultat.horodatage, tz)}</div>
            {ecran.resultat.totalJourMinutes !== null && <div className="mt-6 text-2xl text-white/70">Total du jour : {formatDuree(ecran.resultat.totalJourMinutes)}</div>}
            {ecran.resultat.horsLigne && (
              <div className="mt-6 rounded-lg bg-amber-400 px-4 py-2 text-xl font-semibold text-[var(--navy)]">Enregistré hors ligne — transmis dès le retour du réseau</div>
            )}
          </>
        )}

        {ecran.mode === "ERREUR" && (
          <>
            <div className="flex h-36 w-36 items-center justify-center rounded-full bg-red-500 text-8xl">✕</div>
            <div className="mt-8 text-4xl font-bold">{ecran.message}</div>
            {ecran.sousTitre && <div className="mt-4 text-2xl text-white/70">{ecran.sousTitre}</div>}
          </>
        )}
      </div>

      {overlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6" onClick={() => setOverlay(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-left text-slate-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Terminal « {config.terminal.libelle} »</h2>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt>Réseau</dt><dd>{reseau.enLigne ? "en ligne" : "hors ligne"}</dd></div>
              <div className="flex justify-between"><dt>Pointages en attente</dt><dd>{reseau.enAttente}</dd></div>
              <div className="flex justify-between"><dt>Dernière synchronisation</dt><dd>{reseau.derniereSynchro ? new Date(reseau.derniereSynchro).toLocaleString("fr-FR") : "—"}</dd></div>
              <div className="flex justify-between"><dt>Décalage d'horloge</dt><dd>{Math.round(reseau.offsetMs / 1000)} s</dd></div>
              <div className="flex justify-between"><dt>Appairé le</dt><dd>{new Date(config.appaire_le).toLocaleString("fr-FR")}</dd></div>
              <div className="flex justify-between"><dt>Lecture</dt><dd>{natif() ? "ML Kit (natif)" : cameraActive ? "caméra navigateur" : "lecteur clavier"}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => void service.current?.synchroniser()}>
                Forcer la synchronisation
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  if (reseau.enAttente > 0 && !confirm(`${reseau.enAttente} pointage(s) non transmis seront perdus. Continuer ?`)) return;
                  if (prompt("Tapez DESAPPAIRER pour confirmer") !== "DESAPPAIRER") return;
                  void toutEffacer().then(() => router.replace("/kiosque/appairage"));
                }}
              >
                Désappairer
              </button>
              {natif() && (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => {
                    const code = prompt("Code administrateur (6 chiffres)") ?? "";
                    if (!natif()?.exitKiosk(code)) alert("Code refusé.");
                  }}
                >
                  Quitter le kiosque
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={() => setOverlay(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
