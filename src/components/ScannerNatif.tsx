"use client";

import { useEffect, useState } from "react";
import { IconeQr } from "@/components/icones";

type Pont = { scanner?: () => void };
type Fenetre = Window & { KipointeApp?: Pont; webkit?: { messageHandlers?: { kipointe?: { postMessage: (m: string) => void } } } };

/** Vrai dans les applications Kipointe du salarié (android/salarie et ios/), reconnues à leur signature. */
export function dansApplication(): boolean {
  return typeof navigator !== "undefined" && /KipointeApp\//.test(navigator.userAgent);
}

/**
 * Bouton « Pointer » des applications du salarié : ouvre leur lecteur de QR code, qui ramène sur la
 * page de pointage. Invisible dans un navigateur, où l'appareil photo du téléphone fait ce travail.
 */
export function ScannerNatif() {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(dansApplication()), []);
  if (!visible) return null;
  return (
    <button
      type="button"
      className="btn-primary mb-6 flex h-[56px] w-full items-center justify-center gap-3 text-[16px]"
      onClick={() => {
        const f = window as Fenetre;
        if (f.KipointeApp?.scanner) f.KipointeApp.scanner();
        else f.webkit?.messageHandlers?.kipointe?.postMessage("scanner");
      }}
    >
      <IconeQr size={22} />
      Pointer : lire le QR code de la tablette
    </button>
  );
}
