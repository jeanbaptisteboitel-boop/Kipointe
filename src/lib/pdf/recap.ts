/**
 * Récapitulatif hebdomadaire PDF (article D.3171-8 du Code du travail) : par salarié et par semaine,
 * le détail quotidien des heures et le total hebdomadaire, avec les majorations.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { DetailHeuresSup, DetailJourRecap } from "@/db/schema";
import { formatDateFr, formatDuree, formatHeure, nomJour } from "@/lib/temps/journee";

export type DonneesRecapPdf = {
  recapId: string;
  organisation: { raisonSociale: string; siret: string | null; conventionCollective: string | null };
  salarie: { nom: string; prenom: string; matricule: string | null; contratHeuresHebdo: number };
  annee: number;
  semaine: number;
  jours: DetailJourRecap[];
  totalMinutes: number;
  heuresSup: DetailHeuresSup;
  dureeHebdoReference: number;
  timezone: string;
  genereLe: Date;
  validePar: string;
  correctionsCount: number;
  horsLigneCount: number;
};

const LIBELLES_ANOMALIES: Record<string, string> = {
  OUBLI_SORTIE: "Oubli de sortie",
  DOUBLE_SCAN: "Double scan",
  HORS_PLAGE: "Pointage incohérent",
  REPOS_11H: "Repos quotidien < 11 h",
  REPOS_HEBDO: "Repos hebdomadaire < 35 h",
  PAUSE_MANQUANTE: "Pause manquante",
  AMPLITUDE: "Amplitude > 13 h",
  PIN_VERROUILLE: "PIN verrouillé",
  POINTAGE_HORS_LIGNE: "Pointage hors ligne",
};

// Helvetica (WinAnsi) ne couvre pas tous les caractères : on remplace ceux qui manquent.
function assainir(texte: string): string {
  return texte.replace(/œ/g, "oe").replace(/Œ/g, "OE").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/→/g, "->");
}

export async function genererPdfRecap(d: DonneesRecapPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Récapitulatif hebdomadaire ${d.annee}-S${d.semaine} — ${d.salarie.prenom} ${d.salarie.nom}`);
  doc.setAuthor(d.organisation.raisonSociale);
  doc.setProducer("Kipointe");
  doc.setCreationDate(d.genereLe);
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);

  const A4: [number, number] = [595.28, 841.89];
  const marge = 42;
  let page = doc.addPage(A4);
  let y = A4[1] - marge;

  const texte = (t: string, x: number, taille = 10, f: PDFFont = police, couleur = rgb(0.1, 0.1, 0.1)) => {
    page.drawText(assainir(t), { x, y, size: taille, font: f, color: couleur });
  };
  const ligne = (hauteur = 14) => {
    y -= hauteur;
    if (y < marge + 40) {
      page = doc.addPage(A4);
      y = A4[1] - marge;
    }
  };
  const trait = () => {
    page.drawLine({ start: { x: marge, y: y + 4 }, end: { x: A4[0] - marge, y: y + 4 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  };

  // En-tête
  texte("RÉCAPITULATIF HEBDOMADAIRE DU TEMPS DE TRAVAIL", marge, 14, gras);
  ligne(16);
  texte("Document établi en application de l'article D.3171-8 du Code du travail", marge, 9, police, rgb(0.35, 0.35, 0.35));
  ligne(22);

  texte(d.organisation.raisonSociale, marge, 11, gras);
  ligne();
  if (d.organisation.siret) {
    texte(`SIRET ${d.organisation.siret}`, marge, 9);
    ligne(12);
  }
  if (d.organisation.conventionCollective) {
    texte(`Convention collective : ${d.organisation.conventionCollective}`, marge, 9);
    ligne(12);
  }
  ligne(8);

  texte(`Salarié : ${d.salarie.prenom} ${d.salarie.nom}${d.salarie.matricule ? ` (matricule ${d.salarie.matricule})` : ""}`, marge, 11, gras);
  ligne();
  texte(`Durée contractuelle : ${formatDuree(d.salarie.contratHeuresHebdo)} / semaine`, marge, 9);
  ligne(12);
  const premier = d.jours[0]?.date ?? "";
  const dernier = d.jours[d.jours.length - 1]?.date ?? "";
  texte(`Semaine ISO ${d.annee}-S${String(d.semaine).padStart(2, "0")} : du ${formatDateFr(premier)} au ${formatDateFr(dernier)}`, marge, 10, gras);
  ligne(20);

  // Tableau des journées
  const colJour = marge;
  const colIntervalles = marge + 110;
  const colTotal = A4[0] - marge - 60;
  texte("Journée", colJour, 9, gras);
  texte("Entrées → sorties", colIntervalles, 9, gras);
  texte("Total", colTotal, 9, gras);
  ligne(6);
  trait();
  ligne(10);

  for (const j of d.jours) {
    const jour = `${nomJour(j.date)} ${formatDateFr(j.date)}`;
    texte(jour, colJour, 9);
    if (j.intervalles.length === 0) {
      texte("—", colIntervalles, 9, police, rgb(0.5, 0.5, 0.5));
    } else {
      const parts = j.intervalles.map((it) => {
        const debut = formatHeure(new Date(it.debut), d.timezone);
        const fin = it.fin ? formatHeure(new Date(it.fin), d.timezone) : "??:??";
        return `${debut} → ${fin}`;
      });
      texte(parts.join("   "), colIntervalles, 9);
    }
    texte(formatDuree(j.minutes), colTotal, 9, gras);
    ligne(12);
    if (j.anomalies.length > 0) {
      const libelles = j.anomalies.map((a) => LIBELLES_ANOMALIES[a] ?? a).join(", ");
      texte(`Alerte(s) : ${libelles}`, colIntervalles, 8, police, rgb(0.75, 0.3, 0.1));
      ligne(11);
    }
    if (j.amplitudeMinutes > 0) {
      texte(`Amplitude : ${formatDuree(j.amplitudeMinutes)}`, colIntervalles, 7.5, police, rgb(0.5, 0.5, 0.5));
      ligne(10);
    }
    ligne(4);
  }

  trait();
  ligne(14);
  texte("TOTAL HEBDOMADAIRE", colJour, 11, gras);
  texte(formatDuree(d.totalMinutes), colTotal, 11, gras);
  ligne(16);
  texte(`Durée de référence : ${formatDuree(d.dureeHebdoReference)}`, colJour, 9);
  ligne(12);
  const hs = d.heuresSup.filter((h) => h.minutes > 0);
  if (hs.length === 0) {
    texte("Heures supplémentaires : aucune", colJour, 9);
    ligne(12);
  } else {
    for (const h of hs) {
      texte(`Heures supplémentaires majorées à ${h.taux} % : ${formatDuree(h.minutes)}`, colJour, 9);
      ligne(12);
    }
  }
  ligne(8);
  if (d.correctionsCount > 0 || d.horsLigneCount > 0) {
    texte(
      `Traçabilité : ${d.correctionsCount} correction(s) tracée(s) avec motif, ${d.horsLigneCount} pointage(s) enregistré(s) hors ligne puis resynchronisé(s).`,
      colJour,
      8,
      police,
      rgb(0.35, 0.35, 0.35),
    );
    ligne(11);
  }

  // Pied de page
  const pied = `Validé par ${d.validePar} le ${formatDateFr(d.genereLe.toISOString().slice(0, 10))} — référence ${d.recapId} — archivé en mode gouvernance (Object Lock), empreinte SHA-256 conservée en base.`;
  page.drawText(assainir(pied), { x: marge, y: marge - 10, size: 7, font: police, color: rgb(0.4, 0.4, 0.4), maxWidth: A4[0] - 2 * marge, lineHeight: 9 });

  return doc.save();
}

