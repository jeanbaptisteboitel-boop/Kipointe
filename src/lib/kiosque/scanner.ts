/**
 * Lecture du badge :
 *  1. natif : événement `omniup:badge` poussé par ML Kit (wrapper Android) ;
 *  2. navigateur : caméra + BarcodeDetector (Chrome / WebView) ;
 *  3. lecteur clavier (douchette USB/Bluetooth) : les caractères tapés rapidement suivis d'Entrée.
 * Dans tous les cas, l'image n'est jamais stockée ni transmise : décodage local uniquement.
 */
type Detecteur = { detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]> };
type DetecteurCtor = new (options: { formats: string[] }) => Detecteur;

export function barcodeDetectorDisponible(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

export function ecouterNatif(onCode: (brut: string) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ uuid?: string }>).detail;
    if (detail?.uuid) onCode(detail.uuid);
  };
  window.addEventListener("omniup:badge", handler);
  return () => window.removeEventListener("omniup:badge", handler);
}

export function ecouterClavier(onCode: (brut: string) => void): () => void {
  let tampon = "";
  let dernier = 0;
  const handler = (e: KeyboardEvent) => {
    const cible = e.target as HTMLElement | null;
    if (cible && (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA")) return;
    const maintenant = Date.now();
    if (maintenant - dernier > 500) tampon = "";
    dernier = maintenant;
    if (e.key === "Enter") {
      if (tampon.length >= 36) onCode(tampon);
      tampon = "";
      return;
    }
    if (e.key.length === 1) tampon += e.key;
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}

export async function demarrerCamera(video: HTMLVideoElement, onCode: (brut: string) => void): Promise<() => void> {
  if (!barcodeDetectorDisponible()) throw new Error("BarcodeDetector indisponible");
  const Ctor = (window as unknown as { BarcodeDetector: DetecteurCtor }).BarcodeDetector;
  const detecteur = new Ctor({ formats: ["qr_code"] });
  const flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = flux;
  await video.play();
  let actif = true;
  let occupe = false;
  const timer = setInterval(async () => {
    if (!actif || occupe || video.readyState < 2) return;
    occupe = true;
    try {
      const codes = await detecteur.detect(video);
      for (const c of codes) if (c.rawValue) onCode(c.rawValue);
    } catch {
      /* image non décodable */
    } finally {
      occupe = false;
    }
  }, 250);
  return () => {
    actif = false;
    clearInterval(timer);
    for (const piste of flux.getTracks()) piste.stop();
    video.srcObject = null;
  };
}

/** Anti-rebond : ignore le même badge relu dans les 3 secondes. */
export function antiRebond(onCode: (uuid: string) => void, delaiMs = 3000): (brut: string) => void {
  let dernierUuid = "";
  let dernierInstant = 0;
  return (brut) => {
    const m = /^(?:BADGE:)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(brut.trim());
    if (!m) return;
    const uuid = m[1]!.toLowerCase();
    const maintenant = Date.now();
    if (uuid === dernierUuid && maintenant - dernierInstant < delaiMs) return;
    dernierUuid = uuid;
    dernierInstant = maintenant;
    onCode(uuid);
  };
}
