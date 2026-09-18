/**
 * Récapitulatif hebdomadaire du temps de travail (article D.3171-8 du Code du travail).
 *
 * A4 portrait, noir et blanc, imprimable tel quel : filets noirs, aucun aplat de couleur,
 * chiffres tabulaires, une seule page par salarié et par semaine. C'est la pièce que
 * l'inspection du travail demandera — elle doit se lire sans l'application.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { DetailHeuresSup, DetailJourRecap } from "@/db/schema";
import { formatDateFr, formatDuree, formatHeure, nomJour } from "@/lib/temps/journee";

export type DonneesRecapPdf = {
  recapId: string;
  reference: string;
  organisation: { raisonSociale: string; siret: string | null; conventionCollective: string | null; adresse: string | null };
  salarie: { nom: string; prenom: string; matricule: string | null; contratHeuresHebdo: number };
  annee: number;
  semaine: number;
  jours: DetailJourRecap[];
  /** Notes par jour : oubli de sortie corrigé, pointage hors ligne, correction motivée. */
  notes: Record<string, string[]>;
  totalMinutes: number;
  heuresSup: DetailHeuresSup;
  dureeHebdoReference: number;
  timezone: string;
  genereLe: Date;
  validePar: string;
  correctionsCount: number;
  horsLigneCount: number;
  annulesCount: number;
  anomaliesCount: number;
};

const A4: [number, number] = [595.28, 841.89];
const MARGE = 46;
const LARGEUR = A4[0] - 2 * MARGE;
const NOIR = rgb(0, 0, 0);
const BLANC = rgb(1, 1, 1);
const GRIS = rgb(0.949, 0.949, 0.949);

/** Helvetica est en WinAnsi : on remplace les caractères qu'elle ne couvre pas. */
function assainir(t: string): string {
  return t
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, "->")
    .replace(/ /g, " ")
    .replace(/ /g, " ");
}

type Polices = { normal: PDFFont; gras: PDFFont; italique: PDFFont };

class Feuille {
  y: number;
  constructor(
    readonly page: PDFPage,
    readonly p: Polices,
  ) {
    this.y = A4[1] - MARGE;
  }

  texte(t: string, x: number, taille: number, police: PDFFont, couleur = NOIR, y = this.y) {
    this.page.drawText(assainir(t), { x, y, size: taille, font: police, color: couleur });
  }

  texteDroite(t: string, xDroite: number, taille: number, police: PDFFont, couleur = NOIR, y = this.y) {
    const largeur = police.widthOfTextAtSize(assainir(t), taille);
    this.texte(t, xDroite - largeur, taille, police, couleur, y);
  }

  filet(y: number, epaisseur = 1, x1 = MARGE, x2 = A4[0] - MARGE) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: epaisseur, color: NOIR });
  }

  rectangle(x: number, y: number, largeur: number, hauteur: number, couleur = GRIS) {
    this.page.drawRectangle({ x, y, width: largeur, height: hauteur, color: couleur });
  }

  /** Découpe un texte pour qu'il tienne dans `largeur`, et renvoie les lignes. */
  lignes(t: string, largeur: number, taille: number, police: PDFFont): string[] {
    const mots = assainir(t).split(/\s+/);
    const out: string[] = [];
    let courante = "";
    for (const mot of mots) {
      const essai = courante ? `${courante} ${mot}` : mot;
      if (police.widthOfTextAtSize(essai, taille) > largeur && courante) {
        out.push(courante);
        courante = mot;
      } else {
        courante = essai;
      }
    }
    if (courante) out.push(courante);
    return out;
  }
}

export async function genererPdfRecap(d: DonneesRecapPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Récapitulatif hebdomadaire ${d.annee}-S${String(d.semaine).padStart(2, "0")} — ${d.salarie.prenom} ${d.salarie.nom}`);
  doc.setAuthor(d.organisation.raisonSociale);
  doc.setSubject("Récapitulatif hebdomadaire du temps de travail (article D.3171-8 du Code du travail)");
  doc.setProducer("Kipointe — édité par OMNIUP");
  doc.setCreator("Kipointe");
  doc.setCreationDate(d.genereLe);

  const p: Polices = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    gras: await doc.embedFont(StandardFonts.HelveticaBold),
    italique: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const f = new Feuille(doc.addPage(A4), p);

  // ─── En-tête ───
  f.y -= 14;
  f.texte("Récapitulatif hebdomadaire", MARGE, 16, p.gras);
  f.texteDroite("Kipointe", A4[0] - MARGE, 12, p.gras);
  f.y -= 19;
  f.texte("du temps de travail", MARGE, 16, p.gras);
  f.texteDroite("Édité par OMNIUP", A4[0] - MARGE, 8.5, p.normal);
  f.y -= 15;
  f.texte("Établi en application de l'article D.3171-8 du Code du travail.", MARGE, 9, p.normal);
  f.y -= 10;
  f.filet(f.y, 2);

  // ─── Employeur / salarié ───
  f.y -= 20;
  const colonne = (LARGEUR - 30) / 2;
  const xDroite = MARGE + colonne + 30;
  const enTeteColonne = (titre: string, x: number) => {
    f.texte(titre.toUpperCase(), x, 8, p.gras);
    f.filet(f.y - 4, 1, x, x + colonne);
  };
  enTeteColonne("Employeur", MARGE);
  enTeteColonne("Salarié", xDroite);

  const blocGauche: [string, number, PDFFont][] = [
    [d.organisation.raisonSociale, 11, p.gras],
    ...(d.organisation.adresse ? ([[d.organisation.adresse, 10, p.normal]] as [string, number, PDFFont][]) : []),
    ...(d.organisation.siret ? ([[`SIRET ${d.organisation.siret}`, 10, p.normal]] as [string, number, PDFFont][]) : []),
    ...(d.organisation.conventionCollective ? ([[d.organisation.conventionCollective, 10, p.normal]] as [string, number, PDFFont][]) : []),
  ];
  const premier = d.jours[0]?.date ?? "";
  const dernier = d.jours[d.jours.length - 1]?.date ?? "";
  const blocDroite: [string, number, PDFFont][] = [
    [`${d.salarie.prenom} ${d.salarie.nom.toUpperCase()}`, 11, p.gras],
    ...(d.salarie.matricule ? ([[`Matricule ${d.salarie.matricule}`, 10, p.normal]] as [string, number, PDFFont][]) : []),
    [`Durée contractuelle ${formatDuree(d.salarie.contratHeuresHebdo)} / semaine`, 10, p.normal],
    [`Semaine ${d.semaine} de ${d.annee} — du lundi ${formatDateFr(premier)} au dimanche ${formatDateFr(dernier)}`, 10, p.normal],
  ];

  const yDebutBlocs = f.y - 16;
  let yG = yDebutBlocs;
  for (const [t, taille, police] of blocGauche) {
    for (const ligne of f.lignes(t, colonne, taille, police)) {
      f.texte(ligne, MARGE, taille, police, NOIR, yG);
      yG -= taille + 3;
    }
  }
  let yD = yDebutBlocs;
  for (const [t, taille, police] of blocDroite) {
    for (const ligne of f.lignes(t, colonne, taille, police)) {
      f.texte(ligne, xDroite, taille, police, NOIR, yD);
      yD -= taille + 3;
    }
  }
  f.y = Math.min(yG, yD) - 14;

  // ─── Tableau des journées ───
  const xJour = MARGE;
  const larJour = 92;
  const larDuree = 66;
  const xIntervalles = xJour + larJour;
  const xDureeFin = A4[0] - MARGE - 8;
  const larIntervalles = LARGEUR - larJour - larDuree - 16;
  const hautEnTete = 18;

  f.rectangle(MARGE, f.y - hautEnTete + 4, LARGEUR, hautEnTete, NOIR);
  f.texte("JOUR", xJour + 8, 8, p.gras, BLANC, f.y - 9);
  f.texte("ENTRÉES ET SORTIES", xIntervalles + 8, 8, p.gras, BLANC, f.y - 9);
  f.texteDroite("DURÉE", xDureeFin, 8, p.gras, BLANC, f.y - 9);
  f.y -= hautEnTete + 4;

  for (const j of d.jours) {
    const notes = d.notes[j.date] ?? [];
    const intervalles =
      j.intervalles.length === 0
        ? "Repos"
        : j.intervalles
            .map((it) => `${formatHeure(new Date(it.debut), d.timezone)} -> ${it.fin ? formatHeure(new Date(it.fin), d.timezone) : "??:??"}`)
            .join("   ·   ");
    const lignesIntervalles = f.lignes(intervalles, larIntervalles, 10, p.normal);
    const lignesNotes = notes.flatMap((n) => f.lignes(n, larIntervalles, 8, p.italique));
    const hauteur = Math.max(20, 8 + lignesIntervalles.length * 12 + lignesNotes.length * 10 + 6);

    f.filet(f.y + 4);
    let yLigne = f.y - 9;
    f.texte(`${nomJour(j.date, true)} ${formatDateFr(j.date)}`, xJour + 8, 10, p.gras, NOIR, yLigne);
    for (const ligne of lignesIntervalles) {
      f.texte(ligne, xIntervalles + 8, 10, p.normal, NOIR, yLigne);
      yLigne -= 12;
    }
    for (const note of lignesNotes) {
      f.texte(note, xIntervalles + 8, 8, p.italique, NOIR, yLigne + 2);
      yLigne -= 10;
    }
    f.texteDroite(j.minutes > 0 ? formatDuree(j.minutes) : "—", xDureeFin, 10, j.minutes > 0 ? p.gras : p.normal, NOIR, f.y - 9);
    f.y -= hauteur;
  }

  // Total hebdomadaire
  const hautTotal = 24;
  f.filet(f.y + 4, 2);
  f.rectangle(MARGE, f.y - hautTotal + 4, LARGEUR, hautTotal, GRIS);
  f.texte("Total", xJour + 8, 12, p.gras, NOIR, f.y - 12);
  f.texte("Durée totale du travail effectif sur la semaine", xIntervalles + 8, 9, p.normal, NOIR, f.y - 11);
  f.texteDroite(formatDuree(d.totalMinutes), xDureeFin, 13, p.gras, NOIR, f.y - 13);
  f.y -= hautTotal + 4;
  f.filet(f.y + 4);
  // Encadrement du tableau
  f.page.drawLine({ start: { x: MARGE, y: f.y + 4 }, end: { x: MARGE, y: f.y + 4 }, thickness: 1, color: NOIR });

  // ─── Décompte et traçabilité ───
  f.y -= 24;
  enTeteColonne("Décompte", MARGE);
  enTeteColonne("Traçabilité", xDroite);
  f.y -= 16;

  let yDecompte = f.y;
  const ligneDecompte = (libelle: string, valeur: string, fort = false) => {
    f.texte(libelle, MARGE, 10, fort ? p.gras : p.normal, NOIR, yDecompte);
    f.texteDroite(valeur, MARGE + colonne, 10, p.gras, NOIR, yDecompte);
    yDecompte -= 15;
  };
  ligneDecompte("Durée de référence", formatDuree(d.dureeHebdoReference));
  const majorees = d.heuresSup.filter((h) => h.minutes > 0);
  if (majorees.length === 0) {
    ligneDecompte("Heures supplémentaires", "aucune");
  } else {
    for (const h of majorees) ligneDecompte(`Heures supplémentaires à ${h.taux} %`, formatDuree(h.minutes));
  }
  yDecompte -= 3;
  f.filet(yDecompte + 10, 1, MARGE, MARGE + colonne);
  ligneDecompte("Total majoré", formatDuree(majorees.reduce((s, h) => s + h.minutes, 0)), true);

  const tracabilite = [
    `${d.correctionsCount} correction${d.correctionsCount > 1 ? "s" : ""} manuelle${d.correctionsCount > 1 ? "s" : ""}, tracée${d.correctionsCount > 1 ? "s" : ""} au journal des accès avec auteur, horodatage et motif.`,
    `${d.horsLigneCount} pointage${d.horsLigneCount > 1 ? "s" : ""} enregistré${d.horsLigneCount > 1 ? "s" : ""} hors ligne, horodaté${d.horsLigneCount > 1 ? "s" : ""} par le terminal puis resynchronisé${d.horsLigneCount > 1 ? "s" : ""}.`,
    `${d.annulesCount} pointage${d.annulesCount > 1 ? "s" : ""} annulé${d.annulesCount > 1 ? "s" : ""}.`,
    `${d.anomaliesCount} anomalie${d.anomaliesCount > 1 ? "s" : ""} relevée${d.anomaliesCount > 1 ? "s" : ""} sur la semaine.`,
  ];
  let yTrace = f.y;
  for (const t of tracabilite) {
    for (const ligne of f.lignes(t, colonne, 9, p.normal)) {
      f.texte(ligne, xDroite, 9, p.normal, NOIR, yTrace);
      yTrace -= 12;
    }
    yTrace -= 2;
  }
  f.y = Math.min(yDecompte, yTrace) - 18;

  // ─── Visas ───
  enTeteColonne("Visa de l'employeur", MARGE);
  enTeteColonne("Validation dans Kipointe", xDroite);
  f.y -= 16;
  f.filet(f.y - 34, 1, MARGE, MARGE + colonne);
  f.texte("Nom, qualité, date et signature", MARGE, 8, p.normal, NOIR, f.y - 46);
  f.texte(`Validé et archivé le ${formatDateFr(d.genereLe.toISOString().slice(0, 10))} à ${formatHeure(d.genereLe, d.timezone)}`, xDroite, 9, p.normal, NOIR, f.y);
  f.texte(`par ${d.validePar}`, xDroite, 9, p.normal, NOIR, f.y - 13);

  // ─── Pied de page ───
  const yPied = MARGE + 44;
  f.filet(yPied + 10);
  f.texte(`Référence ${d.reference} · page 1 / 1`, MARGE, 8, p.normal, NOIR, yPied);
  f.texteDroite("Document conservé 5 ans · Kipointe, édité par OMNIUP", A4[0] - MARGE, 8, p.normal, NOIR, yPied);
  f.texte(
    "Empreinte SHA-256 calculée sur ce fichier lors de l'archivage et conservée dans Kipointe ; l'archive est verrouillée en mode gouvernance.",
    MARGE,
    8,
    p.normal,
    NOIR,
    yPied - 12,
  );
  f.texte("Toute modification postérieure à la validation invalide cette empreinte et génère une nouvelle version numérotée.", MARGE, 8, p.normal, NOIR, yPied - 23);

  return doc.save();
}
