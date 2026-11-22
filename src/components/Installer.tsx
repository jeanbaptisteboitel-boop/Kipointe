"use client";

import { useEffect, useState } from "react";

type Invite = Event & { prompt: () => Promise<void> };

/**
 * Propose d'installer Kipointe sur l'écran d'accueil du téléphone. Android : bouton d'installation
 * du navigateur. iPhone : Safari n'offre pas de bouton, on indique le geste. Masqué une fois
 * l'application installée, ou si le salarié l'écarte.
 */
export function Installer() {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [iphone, setIphone] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const installee = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let ecartee = false;
    try {
      ecartee = localStorage.getItem("kipointe-installer") === "non";
    } catch {
      // Stockage indisponible (navigation privée) : on propose simplement à chaque fois.
    }
    // Dans l'application des magasins, il n'y a plus rien à installer.
    if (installee || ecartee || /KipointeApp\//.test(navigator.userAgent)) return;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    setIphone(ios);
    if (ios) setVisible(true);
    const surInvite = (e: Event) => {
      e.preventDefault();
      setInvite(e as Invite);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", surInvite);
    return () => window.removeEventListener("beforeinstallprompt", surInvite);
  }, []);

  if (!visible) return null;
  const ecarter = () => {
    setVisible(false);
    try {
      localStorage.setItem("kipointe-installer", "non");
    } catch {
      // Sans stockage, l'encart reviendra à la prochaine visite.
    }
  };
  return (
    <div className="encart-info mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span>
        <strong>Kipointe sur votre téléphone.</strong>{" "}
        {iphone ? "Touchez le bouton Partager de Safari, puis « Sur l'écran d'accueil » : Kipointe s'ouvrira comme une application." : "Installez l'application pour l'ouvrir d'un geste depuis votre écran d'accueil."}
      </span>
      <span className="inline-flex gap-2">
        {invite && (
          <button
            type="button"
            className="btn-navy btn-sm"
            onClick={async () => {
              await invite.prompt().catch(() => undefined);
              setVisible(false);
            }}
          >
            Installer
          </button>
        )}
        <button type="button" className="btn-secondary btn-sm" onClick={ecarter}>
          Plus tard
        </button>
      </span>
    </div>
  );
}
