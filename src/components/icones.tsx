/**
 * Icônes maison : tracés géométriques 24×24, `stroke="currentColor"`, `fill="none"`.
 * Aucune bibliothèque tierce — c'est une règle du design system OMNIUP.
 */
type Props = { size?: number; className?: string; strokeWidth?: number };

function Svg({ size = 16, className, strokeWidth = 2, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      style={{ flex: "0 0 auto" }}
    >
      {children}
    </svg>
  );
}

export const IconeCheck = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.6}>
    <path d="M4 12.5l5.2 5.2L20 7" />
  </Svg>
);

export const IconeAlerte = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M12 8v5" />
    <path d="M12 17h.01" />
    <circle cx="12" cy="12" r="9" />
  </Svg>
);

export const IconeCroix = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.6}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconeInfo = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M12 11v6" />
    <path d="M12 7h.01" />
    <circle cx="12" cy="12" r="9" />
  </Svg>
);

export const IconeHorloge = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const IconeRotation = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M4 12a8 8 0 1 0 8-8" />
    <path d="M4 5v4h4" />
  </Svg>
);

export const IconeCadenas = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
  </Svg>
);

export const IconeCorrige = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M4 18L18 4" />
    <path d="M14 4h4v4" />
  </Svg>
);

export const IconeTelecharger = (p: Props) => (
  <Svg {...p}>
    <path d="M12 4v11" />
    <path d="M8 12l4 4 4-4" />
    <path d="M5 20h14" />
  </Svg>
);

export const IconeChevronGauche = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);

export const IconeChevronDroite = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const IconeFleche = (p: Props) => (
  <Svg {...p}>
    <path d="M5 12h14M13 5l7 7-7 7" />
  </Svg>
);

export const IconeHorsLigne = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M12 19h.01" />
    <path d="M5 12.5a9 9 0 0 1 14 0" />
    <path d="M8.5 16a5 5 0 0 1 7 0" />
    <path d="M3 3l18 18" />
  </Svg>
);

export const IconeSynchro = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M12 8v8" />
    <path d="M8.5 12.5L12 16l3.5-3.5" />
    <circle cx="12" cy="12" r="9.5" />
  </Svg>
);

/** Cadre de lecture QR : c'est un pictogramme, jamais un aperçu vidéo. */
export const IconeQr = ({ size = 24, stroke = "currentColor", strokeWidth = 1.6 }: { size?: number; stroke?: string; strokeWidth?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8.5V5a2 2 0 0 1 2-2h3.5" />
    <path d="M15.5 3H19a2 2 0 0 1 2 2v3.5" />
    <path d="M21 15.5V19a2 2 0 0 1-2 2h-3.5" />
    <path d="M8.5 21H5a2 2 0 0 1-2-2v-3.5" />
    <rect x="7" y="7" width="4" height="4" />
    <rect x="13" y="13" width="4" height="4" />
    <path d="M13 7h4v4" />
    <path d="M7 13v4h4" />
  </svg>
);

export const IconePower = ({ size = 24, stroke = "currentColor", strokeWidth = 2.6 }: { size?: number; stroke?: string; strokeWidth?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden>
    <path d="M12 4v8" />
    <path d="M7.5 7a7 7 0 1 0 9 0" />
  </svg>
);

export const IconeDocument = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M9 12h7M9 16h7" />
  </Svg>
);

export const IconeBouclier = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <path d="M12 3l8 3.5V12c0 4.6-3.3 7.9-8 9-4.7-1.1-8-4.4-8-9V6.5z" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </Svg>
);

export const IconePersonne = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
  </Svg>
);

export const IconeSceau = (p: Props) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M8 12l2.6 2.6L16 9" />
  </Svg>
);
