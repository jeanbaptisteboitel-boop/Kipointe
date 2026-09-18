"use client";

export function BoutonImprimerNote() {
  return (
    <button type="button" className="btn-navy btn-sm" onClick={() => window.print()}>
      Imprimer la note
    </button>
  );
}
