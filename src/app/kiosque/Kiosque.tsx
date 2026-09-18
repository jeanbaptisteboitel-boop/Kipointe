"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconeAlerte, IconeCheck, IconeCroix, IconeHorsLigne, IconeQr, IconeSynchro } from "@/components/icones";
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
  | { mode: "ERREUR"; titre: string; detail: string };

const DUREE_CONFIRMATION_MS = 3000;
const DUREE_ERREUR_MS = 3500;
const DELAI_ABANDON_PIN_MS = 30_000;
const APPUI_LONG_MS = 5000;

function heureLocale(d: Date, tz: string) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
}
function dateLongue(d: Date, tz: string) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}
function formatDuree(min: number) {
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}

/** Échelle typographique du kiosque : ancrée sur 800 × 1280, bornée pour rester lisible à 1 m. */
const T = {
  heure: "clamp(96px, 21vw, 172px)",
  dateLongue: "clamp(22px, 4vw, 32px)",
  titre: "clamp(36px, 6.5vw, 56px)",
  sousTitre: "clamp(22px, 3.4vw, 27px)",
  bandeau: "clamp(18px, 2.8vw, 22px)",
  sens: "clamp(64px, 13.5vw, 108px)",
  heurePointage: "clamp(30px, 5.5vw, 44px)",
  totalJour: "clamp(22px, 3.8vw, 30px)",
  nomComplet: "clamp(19px, 3.2vw, 26px)",
  erreurTitre: "clamp(38px, 7.5vw, 60px)",
  erreurDetail: "clamp(20px, 3.5vw, 28px)",
};

export function Kiosque() {
  const router = useRouter();
  const [config, setConfig] = useState<ConfigTerminal | null | undefined>(undefined);
  const [ecran, setEcran] = useState<Ecran>({ mode: "ACCUEIL" });
  const [pin, setPin] = useState("");
  const [reseau, setReseau] = useState<EtatReseau>({ enLigne: true, enAttente: 0, derniereSynchro: null, offsetMs: 0, synchroEnCours: false });
  const [maintenant, setMaintenant] = useState(() => new Date());
  const [overlay, setOverlay] = useState(false);
  const [lecteurPret, setLecteurPret] = useState(false);
  const service = useRef<ServiceKiosque | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const ecranRef = useRef(ecran);
  ecranRef.current = ecran;
  const timerRetour = useRef<number | null>(null);
  const appuiLong = useRef<number | null>(null);

  // ─── Démarrage : configuration, Service Worker, service kiosque ───
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
    const surDesappairage = () => void toutEffacer().then(() => router.replace("/kiosque/appairage"));
    window.addEventListener("kipointe:desappaire", surDesappairage);
    return () => {
      s.arreter();
      window.removeEventListener("kipointe:desappaire", surDesappairage);
    };
  }, [router]);

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

  // ─── Badge lu ───
  const surBadge = useCallback(
    async (uuid: string) => {
      const s = service.current;
      if (!s || ecranRef.current.mode === "ENVOI") return;
      const { prenom, inconnu } = await s.resoudreBadge(uuid);
      if (inconnu) {
        retour(false);
        setEcran({ mode: "ERREUR", titre: "Badge inconnu", detail: "Hors ligne, ce badge n'est pas dans la liste de la tablette. Voir le gérant." });
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
    if (natif()) {
      setLecteurPret(true);
    } else if (barcodeDetectorDisponible() && video.current) {
      demarrerCamera(video.current, traiter)
        .then((stop) => {
          arreterCamera = stop;
          setLecteurPret(true);
        })
        .catch(() => setLecteurPret(false));
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
        return;
      }
      retour(false);
      if (res.conserverBadge) {
        const restantes = typeof res.detail?.tentativesRestantes === "number" ? res.detail.tentativesRestantes : null;
        setEcran({
          mode: "PIN",
          badge,
          prenom,
          message: restantes !== null ? `Code incorrect — ${restantes} essai${restantes > 1 ? "s" : ""} restant${restantes > 1 ? "s" : ""}` : res.message,
        });
        programmerRetour(DELAI_ABANDON_PIN_MS);
        return;
      }
      const details: Record<string, string> = {
        BADGE_VERROUILLE: "Voir le gérant pour déverrouiller le badge et réinitialiser le code.",
        BADGE_INCONNU: "Ce badge n'est rattaché à aucun salarié de l'établissement.",
        DOUBLON: "Un pointage a été enregistré il y a quelques secondes. Patientez avant de recommencer.",
        RATE_LIMIT: "Trop de tentatives sur ce terminal. Patientez une minute.",
      };
      setEcran({ mode: "ERREUR", titre: res.message.replace(/\s*:.*$/, ""), detail: details[res.code] ?? res.message });
      programmerRetour(DUREE_ERREUR_MS);
    },
    [programmerRetour],
  );

  const touche = useCallback(
    (t: string) => {
      if (ecran.mode !== "PIN") return;
      programmerRetour(DELAI_ABANDON_PIN_MS);
      if (t === "back") return setPin((p) => p.slice(0, -1));
      if (t === "clear") {
        setPin("");
        setEcran({ mode: "ACCUEIL" });
        return;
      }
      setPin((p) => {
        if (p.length >= 4) return p;
        const suivant = p + t;
        if (suivant.length === 4) void envoyer(ecran.badge, ecran.prenom, suivant);
        return suivant;
      });
    },
    [ecran, envoyer, programmerRetour],
  );

  // Appui long de 5 s sur le nom de l'établissement : seule issue du kiosque.
  const debutAppui = () => {
    appuiLong.current = window.setTimeout(() => setOverlay(true), APPUI_LONG_MS);
  };
  const finAppui = () => {
    if (appuiLong.current) window.clearTimeout(appuiLong.current);
  };

  if (config === undefined) return <div className="kiosque" />;
  if (!config) return null;
  const tz = config.etablissement.timezone;

  return (
    <main className="kiosque relative">
      {/* La caméra n'est jamais affichée : le flux est analysé en mémoire puis jeté. */}
      <video ref={video} muted playsInline className="camera-muette" />

      {/* Bandeau d'état : discret en ligne, franchement visible hors ligne. */}
      <header
        className="flex flex-none items-center justify-between gap-4 px-8 py-5"
        style={{ background: "rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.09)" }}
      >
        <button
          type="button"
          onPointerDown={debutAppui}
          onPointerUp={finAppui}
          onPointerLeave={finAppui}
          onContextMenu={(e) => e.preventDefault()}
          className="cursor-pointer text-left font-semibold"
          style={{ color: "rgba(255,255,255,0.78)", fontSize: "clamp(17px, 3vw, 24px)", letterSpacing: "-0.01em" }}
        >
          {config.organisation.raison_sociale}
        </button>

        {reseau.enLigne && reseau.enAttente === 0 ? (
          <div className="flex items-center gap-2.5 rounded-full px-4 py-2" style={{ background: "var(--k-surface)" }}>
            <span className="anim-pulse h-2.5 w-2.5 rounded-full" style={{ background: "#34D399" }} />
            <span style={{ fontSize: T.bandeau, color: "rgba(255,255,255,0.58)", fontWeight: 500 }}>En ligne</span>
          </div>
        ) : (
          <div
            className="flex items-center gap-3 rounded-full px-5 py-2.5"
            style={{ background: "var(--k-warn)", color: "var(--k-warn-ink)" }}
            role="status"
          >
            {reseau.enLigne ? <IconeSynchro size={24} /> : <IconeHorsLigne size={24} />}
            <span style={{ fontSize: T.bandeau, fontWeight: 700 }}>
              {reseau.enLigne ? "Synchronisation" : "Hors ligne"} — {reseau.enAttente} pointage{reseau.enAttente > 1 ? "s" : ""} en attente
            </span>
          </div>
        )}
      </header>

      {ecran.mode === "ACCUEIL" && (
        <section className="flex flex-1 flex-col items-center justify-center gap-10 px-12 pt-8 pb-14 text-center">
          <div>
            <div className="tabnum" style={{ fontSize: T.heure, fontWeight: 800, lineHeight: 0.9, letterSpacing: "-0.05em" }}>
              {heureLocale(maintenant, tz)}
            </div>
            <div className="mt-2" style={{ fontSize: T.dateLongue, fontWeight: 500, color: "rgba(255,255,255,0.62)" }}>
              {dateLongue(maintenant, tz)}
            </div>
          </div>

          {/* Cadre de lecture : un pictogramme, jamais un aperçu vidéo. */}
          <div
            className="flex flex-col items-center justify-center gap-6"
            style={{
              width: "min(392px, 62vw)",
              height: "min(392px, 62vw)",
              borderRadius: 32,
              border: "4px solid var(--k-accent)",
              background: "rgba(34,211,238,0.07)",
            }}
          >
            <IconeQr size={176} stroke="#22D3EE" />
            <div className="flex items-center gap-3">
              <span className="anim-pulse h-3 w-3 rounded-full" style={{ background: "var(--k-accent)" }} />
              <span style={{ fontSize: "clamp(19px, 3vw, 24px)", fontWeight: 600, color: "var(--k-accent)", letterSpacing: "0.02em" }}>
                {lecteurPret ? "Lecteur prêt" : "Lecteur de badge"}
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: T.titre, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>Présentez votre badge</div>
            <div className="mt-3.5" style={{ fontSize: T.sousTitre, fontWeight: 500, color: "rgba(255,255,255,0.62)" }}>
              Puis saisissez votre code à 4 chiffres
            </div>
          </div>
        </section>
      )}

      {ecran.mode === "PIN" && (
        <section className="flex flex-1 flex-col items-center justify-center gap-9 px-12 pt-6 pb-12 text-center">
          <div>
            <div style={{ fontSize: T.titre, fontWeight: 800, letterSpacing: "-0.03em" }}>Bonjour {ecran.prenom ?? ""}</div>
            <div className="mt-2.5" style={{ fontSize: T.sousTitre, fontWeight: 500, color: "rgba(255,255,255,0.62)" }}>
              Saisissez votre code à 4 chiffres
            </div>
          </div>

          <div className="flex items-center gap-7">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="block h-[34px] w-[34px] rounded-full transition-all"
                style={
                  pin.length > i
                    ? { background: "var(--k-accent)", border: "3px solid var(--k-accent)", boxShadow: "0 0 0 8px rgba(34,211,238,0.14)" }
                    : { border: "3px solid rgba(255,255,255,0.32)" }
                }
              />
            ))}
          </div>

          {ecran.message && (
            <div
              className="anim-rise flex items-center gap-3.5 rounded-2xl px-7 py-4"
              role="alert"
              style={{ background: "rgba(245,158,11,0.16)", border: "2px solid var(--k-warn)" }}
            >
              <IconeAlerte size={30} className="text-[#FBBF24]" />
              <span style={{ fontSize: T.sousTitre, fontWeight: 700, color: "#FDE68A" }}>{ecran.message}</span>
            </div>
          )}

          <div className="grid w-full max-w-[680px] grid-cols-3 gap-4">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((t) => (
              <button key={t} type="button" className="k-touche" onPointerDown={() => touche(t)}>
                {t}
              </button>
            ))}
            <button type="button" className="k-touche-annuler" aria-label="Annuler" onPointerDown={() => touche("clear")}>
              <IconeCroix size={28} strokeWidth={2.8} />
              Annuler
            </button>
            <button type="button" className="k-touche" onPointerDown={() => touche("0")}>
              0
            </button>
            <button type="button" className="k-touche-effacer" aria-label="Effacer le dernier chiffre" onPointerDown={() => touche("back")}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 5H9l-6 7 6 7h12z" />
                <path d="M15 9l-4 6M11 9l4 6" />
              </svg>
              Effacer
            </button>
          </div>
        </section>
      )}

      {ecran.mode === "ENVOI" && (
        <section className="flex flex-1 flex-col items-center justify-center gap-12 p-12 text-center">
          <div
            className="anim-spin rounded-full"
            style={{ width: 148, height: 148, border: "10px solid rgba(255,255,255,0.14)", borderTopColor: "var(--k-accent)" }}
          />
          <div style={{ fontSize: T.titre, fontWeight: 800, letterSpacing: "-0.03em" }}>Enregistrement…</div>
          <div style={{ fontSize: T.sousTitre, fontWeight: 500, color: "rgba(255,255,255,0.58)" }}>
            Bonjour {ecran.prenom ?? ""} — ne retirez pas votre badge
          </div>
        </section>
      )}

      {ecran.mode === "CONFIRMATION" && (
        <section className="flex flex-1 flex-col items-center justify-center gap-10 px-12 pt-10 pb-14 text-center">
          <div
            className="anim-pop flex items-center justify-center rounded-full"
            style={{ width: "min(288px, 46vw)", height: "min(288px, 46vw)", background: "var(--k-success)" }}
          >
            <IconeCheck size={150} className="text-[#04281C]" strokeWidth={3} />
          </div>
          <div className="anim-rise">
            <div style={{ fontSize: T.sens, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.04em", color: "var(--k-success-soft)" }}>
              {ecran.resultat.type ? LIBELLES_TYPE[ecran.resultat.type] : "Pointage"}
            </div>
            <div className="tabnum mt-4" style={{ fontSize: T.heurePointage, fontWeight: 600 }}>
              à {heureLocale(ecran.resultat.horodatage, tz)}
            </div>
            {ecran.resultat.totalJourMinutes !== null && (
              <div className="tabnum mt-5" style={{ fontSize: T.totalJour, fontWeight: 500, color: "rgba(255,255,255,0.68)" }}>
                Total du jour : {formatDuree(ecran.resultat.totalJourMinutes)}
              </div>
            )}
            {(ecran.resultat.nomComplet ?? ecran.resultat.prenom) && (
              <div className="mt-6" style={{ fontSize: T.nomComplet, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>
                {ecran.resultat.nomComplet ?? ecran.resultat.prenom}
              </div>
            )}
          </div>
          {ecran.resultat.horsLigne && (
            <div
              className="flex max-w-[640px] items-center gap-4 rounded-2xl px-8 py-5"
              style={{ background: "var(--k-warn)", color: "var(--k-warn-ink)" }}
            >
              <IconeSynchro size={32} />
              <span style={{ fontSize: T.nomComplet, fontWeight: 700, lineHeight: 1.35 }}>
                Enregistré hors ligne — transmis dès le retour du réseau
              </span>
            </div>
          )}
        </section>
      )}

      {ecran.mode === "ERREUR" && (
        <section className="flex flex-1 flex-col items-center justify-center gap-11 px-12 pt-10 pb-14 text-center" role="alert">
          <div
            className="anim-pop flex items-center justify-center rounded-full"
            style={{ width: "min(288px, 46vw)", height: "min(288px, 46vw)", background: "var(--k-danger)" }}
          >
            <IconeCroix size={140} className="text-[#2E0707]" strokeWidth={3} />
          </div>
          <div className="anim-rise max-w-[640px]">
            <div style={{ fontSize: T.erreurTitre, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: "var(--k-danger-soft)" }}>
              {ecran.titre}
            </div>
            <div className="mt-6" style={{ fontSize: T.erreurDetail, fontWeight: 500, color: "rgba(255,255,255,0.68)", lineHeight: 1.4 }}>
              {ecran.detail}
            </div>
          </div>
        </section>
      )}

      {overlay && <OverlayMaintenance config={config} reseau={reseau} onFermer={() => setOverlay(false)} onSynchroniser={() => void service.current?.synchroniser()} router={router} />}
    </main>
  );
}

function OverlayMaintenance({
  config,
  reseau,
  onFermer,
  onSynchroniser,
  router,
}: {
  config: ConfigTerminal;
  reseau: EtatReseau;
  onFermer: () => void;
  onSynchroniser: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const n = natif();
  const lignes: [string, string, string?][] = [
    ["État du réseau", reseau.enLigne ? "Connecté" : "Hors ligne", reseau.enLigne ? "var(--success-ink)" : "var(--danger-ink)"],
    ["Pointages en attente", String(reseau.enAttente)],
    ["Dernière synchronisation", reseau.derniereSynchro ? new Date(reseau.derniereSynchro).toLocaleString("fr-FR") : "—"],
    ["Décalage d'horloge", `${reseau.offsetMs >= 0 ? "+" : "−"} ${Math.abs(reseau.offsetMs / 1000).toFixed(1).replace(".", ",")} s`],
  ];

  return (
    <div className="absolute inset-0 flex items-center justify-center p-12" style={{ background: "rgba(4,12,26,0.82)" }} onClick={onFermer}>
      <div
        className="anim-rise w-full max-w-[648px] rounded-[20px] bg-white p-10"
        style={{ color: "var(--ink)", boxShadow: "0 24px 64px rgba(0,0,0,.45)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="titre" style={{ fontSize: 34 }}>
          Maintenance du terminal
        </div>
        <div className="mt-2" style={{ fontSize: 22, color: "var(--muted)" }}>
          {config.terminal.libelle} · {config.etablissement.libelle}
        </div>

        <div className="mt-7 overflow-hidden rounded-xl" style={{ border: "1px solid var(--line-portal)" }}>
          {lignes.map(([cle, valeur, couleur], i) => (
            <div
              key={cle}
              className="flex items-center justify-between gap-4 px-5 py-4"
              style={{ background: i % 2 === 0 ? "var(--bg-portal)" : "#fff" }}
            >
              <span style={{ fontSize: 22, color: "var(--muted)" }}>{cle}</span>
              <span className="tabnum font-bold" style={{ fontSize: 23, color: couleur ?? "var(--ink)" }}>
                {valeur}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3">
          <button type="button" className="rounded-xl font-bold text-white" style={{ height: 84, fontSize: 22, background: "var(--navy)" }} onClick={onSynchroniser}>
            Forcer la synchronisation
          </button>
          <button
            type="button"
            className="rounded-xl bg-white font-bold"
            style={{ height: 84, fontSize: 22, border: "1px solid var(--line-portal)", color: "var(--ink)" }}
            onClick={() => {
              if (!n) return alert("Sortie du kiosque disponible uniquement sur la tablette OMNIUP.");
              const code = prompt("Code administrateur (6 chiffres)") ?? "";
              if (!n.exitKiosk(code)) alert("Code refusé.");
            }}
          >
            Quitter le kiosque
          </button>
          <button
            type="button"
            className="rounded-xl font-bold"
            style={{ height: 84, fontSize: 22, border: "2px solid var(--danger)", background: "var(--danger-bg)", color: "#B4262A" }}
            onClick={() => {
              if (reseau.enAttente > 0 && !confirm(`${reseau.enAttente} pointage(s) non transmis seront perdus. Continuer ?`)) return;
              if (prompt("Tapez DESAPPAIRER pour confirmer") !== "DESAPPAIRER") return;
              void toutEffacer().then(() => router.replace("/kiosque/appairage"));
            }}
          >
            Désappairer ce terminal
          </button>
          <button
            type="button"
            className="rounded-xl font-bold"
            style={{ height: 84, fontSize: 22, border: "1px solid var(--line-portal)", background: "var(--bg-portal)", color: "var(--muted)" }}
            onClick={onFermer}
          >
            Fermer
          </button>
        </div>
        <p className="mt-5" style={{ fontSize: 19, color: "var(--muted)", lineHeight: 1.45 }}>
          Accessible par appui long de 5 secondes sur le nom de l'établissement. Aucune sortie du kiosque n'est possible autrement.
        </p>
      </div>
    </div>
  );
}
