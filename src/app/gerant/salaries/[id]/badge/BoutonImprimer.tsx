"use client";

export function BoutonImprimer() {
  return (
    <button type="button" className="btn-navy btn-sm" onClick={() => window.print()}>
      Imprimer la page
    </button>
  );
}
