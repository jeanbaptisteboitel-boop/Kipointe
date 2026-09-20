/**
 * La marque OMNIUP : un bouton d'alimentation. « Pressé une fois, le cabinet tourne tout seul. »
 * Même tracé partout (design system OMNIUP) : ne pas le redessiner.
 */
export function Logomark({ size = 36, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: onDark ? "#22D3EE" : "#1FA9F0",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        boxShadow: onDark ? "none" : "0 4px 16px rgba(31,169,240,.45)",
      }}
    >
      <svg viewBox="0 0 24 24" style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden>
        <path d="M12 4v8" fill="none" stroke={onDark ? "#0B1F3A" : "#fff"} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M7.5 7a7 7 0 1 0 9 0" fill="none" stroke={onDark ? "#0B1F3A" : "#fff"} strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Logomark + mot-symbole « KIPOINTE », avec la mention d'édition. */
export function LogoKipointe({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <span className="inline-flex items-center" style={{ gap: size * 0.38 }}>
      <Logomark size={size} onDark={onDark} />
      <span
        className="titre whitespace-nowrap"
        style={{ fontSize: size * 0.64, color: onDark ? "#fff" : "var(--ink)", letterSpacing: "-0.035em" }}
      >
        Kipointe
      </span>
    </span>
  );
}
