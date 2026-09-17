/** Pont vers le wrapper Android (annexe §12.6 du brief). Absent dans un navigateur classique. */
export type OmniupNative = {
  getTerminalId(): string;
  getAppVersion(): string;
  isOnline(): boolean;
  beep(ok: boolean): void;
  vibrate(ms: number): void;
  exitKiosk(code: string): boolean;
};

declare global {
  interface Window {
    OmniupNative?: OmniupNative;
  }
}

export function natif(): OmniupNative | null {
  return typeof window !== "undefined" && window.OmniupNative ? window.OmniupNative : null;
}

export function estEnLigne(): boolean {
  const n = natif();
  if (n) {
    try {
      return n.isOnline();
    } catch {
      /* ignore */
    }
  }
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

let ctxAudio: AudioContext | null = null;

function bip(frequence: number, dureeMs: number, delaiMs = 0, type: OscillatorType = "sine") {
  try {
    ctxAudio ??= new AudioContext();
    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();
    osc.type = type;
    osc.frequency.value = frequence;
    gain.gain.value = 0.25;
    osc.connect(gain).connect(ctxAudio.destination);
    const t = ctxAudio.currentTime + delaiMs / 1000;
    osc.start(t);
    osc.stop(t + dureeMs / 1000);
  } catch {
    /* pas d'audio */
  }
}

/** Retour sonore + haptique : deux sons nettement différents (succès aigu montant, échec grave). */
export function retour(ok: boolean): void {
  const n = natif();
  if (n) {
    try {
      n.beep(ok);
      n.vibrate(ok ? 80 : 300);
      return;
    } catch {
      /* fallback web */
    }
  }
  if (ok) {
    bip(880, 90);
    bip(1320, 140, 100);
  } else {
    bip(220, 350, 0, "square");
  }
  try {
    navigator.vibrate?.(ok ? 80 : [120, 60, 120]);
  } catch {
    /* ignore */
  }
}
