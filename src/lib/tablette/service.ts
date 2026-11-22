/**
 * TABLETTE — enregistrement, activation et pointages.
 *
 * Une tablette est reliée une fois, par un code d'activation remis par l'administrateur ; elle
 * garde ensuite un jeton dans un cookie. Deux façons de pointer :
 *   - CODE : le salarié tape son code personnel sur la tablette ;
 *   - QR   : il lit avec son téléphone le QR code tournant de la tablette, puis pointe depuis son
 *            espace salarié — le QR code prouve qu'il est devant la tablette.
 *
 * Le sens (arrivée / départ) alterne : premier pointage du jour = arrivée, le suivant = départ.
 * Deux pointages à moins de deux minutes d'écart : le second est ignoré (double pointage).
 */
import { and, desc, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { organisation, pointageTablette, salarie, tablette } from "@/db/schema";
import { withBypass, withTenant } from "@/db/tenant";
import { ErreurMetier } from "@/lib/actions";
import { hacherTokenSession, tokenAleatoire } from "@/lib/crypto";
import { SOURCE_TABLETTE, appliquerPointage, resoudreTypeAuto } from "@/lib/pointage/paires";
import { ecrireSemaine, lireSemaineVerrouillee } from "@/lib/pointage/semaine";
import {
  DUREE_ACTIVATION_MS,
  DUREE_BLOCAGE_MS,
  ESSAIS_AVANT_BLOCAGE,
  codeActivationAleatoire,
  codeAleatoire,
  hacherActivation,
  hacherCode,
  lireJetonQr,
  normaliserActivation,
  normaliserCode,
  verifierJetonQr,
} from "@/lib/tablette/jeton";
import { horodatageLocal } from "@/lib/temps/zone";

export const COOKIE_TABLETTE = "kipointe_tablette";

export type ModePointage = "CODE" | "QR";
export type SensPointage = "arrivee" | "depart" | "double_badge";

export interface TabletteConnue {
  id: string;
  organisationId: string;
  nom: string;
  actif: boolean;
  secretQr: string;
  echecs: number;
  bloqueeJusqua: Date | null;
  dernierContact: Date | null;
  entreprise: string;
  fuseau: string;
  organisationActive: boolean;
  modeCode: boolean;
  modeQr: boolean;
}

const colonnes = {
  id: tablette.id,
  organisationId: tablette.organisationId,
  nom: tablette.nom,
  actif: tablette.actif,
  secretQr: tablette.secretQr,
  echecs: tablette.echecs,
  bloqueeJusqua: tablette.bloqueeJusqua,
  dernierContact: tablette.dernierContact,
  entreprise: organisation.raisonSociale,
  fuseau: organisation.timezone,
  organisationActive: organisation.actif,
  modeCode: organisation.tabletteCode,
  modeQr: organisation.tabletteQr,
};

// ─── Enregistrement et activation ───

/** Nouveau code d'activation (valable 24 h). L'ancien jeton de la tablette, s'il existe, cesse de valoir. */
async function poserActivation(tx: Tx, tabletteId: string, maintenant: Date): Promise<string> {
  const code = codeActivationAleatoire();
  await tx
    .update(tablette)
    .set({ activationHash: hacherActivation(code), activationExpire: new Date(maintenant.getTime() + DUREE_ACTIVATION_MS), jetonHash: null, echecs: 0, bloqueeJusqua: null })
    .where(eq(tablette.id, tabletteId));
  return code;
}

export async function creerTablette(tx: Tx, organisationId: string, nom: string, maintenant = new Date()): Promise<{ id: string; codeActivation: string }> {
  const propre = nom.trim().slice(0, 80);
  if (!propre) throw new ErreurMetier("Donnez un nom à la tablette (par exemple : Entrée atelier).");
  const [creee] = await tx.insert(tablette).values({ organisationId, nom: propre, secretQr: tokenAleatoire() }).returning({ id: tablette.id });
  return { id: creee!.id, codeActivation: await poserActivation(tx, creee!.id, maintenant) };
}

export async function renouvelerActivation(tx: Tx, tabletteId: string, maintenant = new Date()): Promise<string> {
  const [t] = await tx.select({ id: tablette.id }).from(tablette).where(eq(tablette.id, tabletteId));
  if (!t) throw new ErreurMetier("Tablette introuvable.");
  return poserActivation(tx, t.id, maintenant);
}

/** Relie la tablette qui présente ce code : rend le jeton à poser en cookie, ou null. */
export async function activerTablette(db: Db, codeSaisi: unknown, maintenant = new Date()): Promise<string | null> {
  const code = normaliserActivation(codeSaisi);
  if (!code) return null;
  return withBypass(db, async (tx) => {
    const jeton = tokenAleatoire();
    const maj = await tx
      .update(tablette)
      .set({ jetonHash: hacherTokenSession(jeton), activationHash: null, activationExpire: null, dernierContact: maintenant })
      .where(and(eq(tablette.activationHash, hacherActivation(code)), gt(tablette.activationExpire, maintenant), eq(tablette.actif, true)))
      .returning({ id: tablette.id });
    return maj.length ? jeton : null;
  });
}

/** Tablette qui présente ce jeton, ou null. Hors cloisonnement : l'organisation n'est pas encore connue. */
export async function trouverTablette(db: Db, jeton: string | undefined | null): Promise<TabletteConnue | null> {
  if (!jeton) return null;
  return withBypass(db, async (tx) => {
    const [t] = await tx
      .select(colonnes)
      .from(tablette)
      .innerJoin(organisation, eq(tablette.organisationId, organisation.id))
      .where(eq(tablette.jetonHash, hacherTokenSession(jeton)))
      .limit(1);
    return t && t.actif && t.organisationActive ? t : null;
  });
}

/** Note le contact de la tablette, au plus une écriture par minute. */
export async function noterContactTablette(db: Db, t: TabletteConnue, maintenant: Date): Promise<void> {
  if (t.dernierContact && maintenant.getTime() - t.dernierContact.getTime() < 60_000) return;
  await withTenant(db, t.organisationId, (tx) => tx.update(tablette).set({ dernierContact: maintenant }).where(eq(tablette.id, t.id)));
}

// ─── Code personnel ───

/** Tire un code personnel libre dans l'organisation et le pose sur la fiche. Rend le code, à remettre au salarié. */
export async function definirCodeSalarie(tx: Tx, organisationId: string, salarieId: string): Promise<string> {
  const [fiche] = await tx.select({ id: salarie.id }).from(salarie).where(eq(salarie.id, salarieId));
  if (!fiche) throw new ErreurMetier("Salarié introuvable.");
  const pris = new Set(
    (await tx.select({ h: salarie.codePointageHash }).from(salarie).where(and(eq(salarie.organisationId, organisationId), isNotNull(salarie.codePointageHash), ne(salarie.id, salarieId)))).map((r) => r.h),
  );
  // Quatre chiffres tant que moins d'un code sur dix est pris, cinq au-delà.
  const chiffres = pris.size < 1000 ? 4 : 5;
  for (let i = 0; i < 200; i++) {
    const code = codeAleatoire(chiffres);
    const h = hacherCode(organisationId, code);
    if (pris.has(h)) continue;
    await tx.update(salarie).set({ codePointageHash: h }).where(eq(salarie.id, salarieId));
    return code;
  }
  throw new ErreurMetier("Aucun code libre : réessayez.");
}

export async function retirerCodeSalarie(tx: Tx, salarieId: string): Promise<void> {
  await tx.update(salarie).set({ codePointageHash: null }).where(eq(salarie.id, salarieId));
}

// ─── Pointage ───

export interface PointageFait {
  salarieId: string;
  prenom: string;
  sens: SensPointage;
  heure: string;
}

/** DANS une transaction de l'organisation : pointe pour ce salarié à l'instant donné et journalise. */
export async function pointerSalarie(
  tx: Tx,
  p: { organisationId: string; tabletteId: string; salarieId: string; mode: ModePointage; fuseau: string; maintenant: Date },
): Promise<{ sens: SensPointage; heure: string }> {
  const { date, heure } = horodatageLocal(p.maintenant, p.fuseau);
  const s = await lireSemaineVerrouillee(tx, p.salarieId, date);
  const type = resoudreTypeAuto(s.semaine?.jours, date, heure);
  let sens: SensPointage = "double_badge";
  if (type) {
    const r = appliquerPointage(s.semaine?.jours, date, heure, type, SOURCE_TABLETTE);
    if (!r.deja) {
      await ecrireSemaine(tx, p.organisationId, p.salarieId, s, r);
      sens = type === "arrivee" ? "arrivee" : "depart";
    }
  }
  await tx.insert(pointageTablette).values({ organisationId: p.organisationId, tabletteId: p.tabletteId, salarieId: p.salarieId, mode: p.mode, instant: p.maintenant, jour: date, heure, typeApplique: sens });
  return { sens, heure };
}

function enPoste(f: { actif: boolean; dateSortie: string | null }, jour: string): boolean {
  return f.actif && (!f.dateSortie || f.dateSortie >= jour);
}

export type ResultatCode = ({ ok: true } & PointageFait) | { ok: false; raison: "MODE_FERME" | "CODE_INCONNU" | "BLOQUEE"; attenteSecondes?: number };

/** Pointage par code tapé sur la tablette. Cinq codes faux de suite bloquent le clavier une minute. */
export async function pointerParCode(db: Db, t: TabletteConnue, codeSaisi: unknown, maintenant = new Date()): Promise<ResultatCode> {
  if (!t.modeCode) return { ok: false, raison: "MODE_FERME" };
  return withTenant(db, t.organisationId, async (tx) => {
    // Verrou sur la tablette : le compteur d'essais ne peut pas être contourné par des envois simultanés.
    const [etat] = await tx.select({ echecs: tablette.echecs, bloqueeJusqua: tablette.bloqueeJusqua }).from(tablette).where(eq(tablette.id, t.id)).for("update");
    if (!etat) return { ok: false, raison: "CODE_INCONNU" } as const;
    if (etat.bloqueeJusqua && etat.bloqueeJusqua > maintenant) {
      return { ok: false, raison: "BLOQUEE", attenteSecondes: Math.ceil((etat.bloqueeJusqua.getTime() - maintenant.getTime()) / 1000) } as const;
    }
    const code = normaliserCode(codeSaisi);
    const [fiche] = code
      ? await tx
          .select({ id: salarie.id, prenom: salarie.prenom, actif: salarie.actif, dateSortie: salarie.dateSortie })
          .from(salarie)
          .where(and(eq(salarie.organisationId, t.organisationId), eq(salarie.codePointageHash, hacherCode(t.organisationId, code))))
      : [];
    if (!fiche || !enPoste(fiche, horodatageLocal(maintenant, t.fuseau).date)) {
      const echecs = etat.echecs + 1;
      const bloque = echecs >= ESSAIS_AVANT_BLOCAGE;
      await tx
        .update(tablette)
        .set({ echecs: bloque ? 0 : echecs, bloqueeJusqua: bloque ? new Date(maintenant.getTime() + DUREE_BLOCAGE_MS) : null, dernierContact: maintenant })
        .where(eq(tablette.id, t.id));
      return bloque ? ({ ok: false, raison: "BLOQUEE", attenteSecondes: DUREE_BLOCAGE_MS / 1000 } as const) : ({ ok: false, raison: "CODE_INCONNU" } as const);
    }
    const r = await pointerSalarie(tx, { organisationId: t.organisationId, tabletteId: t.id, salarieId: fiche.id, mode: "CODE", fuseau: t.fuseau, maintenant });
    await tx.update(tablette).set({ echecs: 0, bloqueeJusqua: null, dernierContact: maintenant }).where(eq(tablette.id, t.id));
    return { ok: true, salarieId: fiche.id, prenom: fiche.prenom, ...r } as const;
  });
}

export type ResultatQr = ({ ok: true; tablette: string } & PointageFait) | { ok: false; raison: "QR_INVALIDE" | "QR_EXPIRE" | "MODE_FERME" | "AUTRE_ENTREPRISE" | "SALARIE_SORTI" };

/** Pointage du salarié connecté sur son téléphone, sur présentation du jeton lu dans le QR code. */
export async function pointerParQr(db: Db, p: { jeton: unknown; organisationId: string; salarieId: string }, maintenant = new Date()): Promise<ResultatQr> {
  const j = lireJetonQr(p.jeton);
  if (!j) return { ok: false, raison: "QR_INVALIDE" };
  return withTenant(db, p.organisationId, async (tx) => {
    // Cloisonnement : la tablette d'un autre client est invisible ici.
    const [t] = await tx
      .select(colonnes)
      .from(tablette)
      .innerJoin(organisation, eq(tablette.organisationId, organisation.id))
      .where(eq(tablette.id, j.tabletteId));
    if (!t) return { ok: false, raison: "AUTRE_ENTREPRISE" } as const;
    if (!t.actif) return { ok: false, raison: "QR_INVALIDE" } as const;
    const verdict = verifierJetonQr(j, t.secretQr, maintenant);
    if (verdict === "FAUX") return { ok: false, raison: "QR_INVALIDE" } as const;
    if (verdict === "EXPIRE") return { ok: false, raison: "QR_EXPIRE" } as const;
    if (!t.modeQr) return { ok: false, raison: "MODE_FERME" } as const;
    const [fiche] = await tx.select({ id: salarie.id, prenom: salarie.prenom, actif: salarie.actif, dateSortie: salarie.dateSortie }).from(salarie).where(eq(salarie.id, p.salarieId));
    if (!fiche || !enPoste(fiche, horodatageLocal(maintenant, t.fuseau).date)) return { ok: false, raison: "SALARIE_SORTI" } as const;
    const r = await pointerSalarie(tx, { organisationId: t.organisationId, tabletteId: t.id, salarieId: fiche.id, mode: "QR", fuseau: t.fuseau, maintenant });
    return { ok: true, tablette: t.nom, salarieId: fiche.id, prenom: fiche.prenom, ...r } as const;
  });
}

/** Dernier pointage fait sur la tablette : elle l'affiche, y compris quand il vient d'un téléphone. */
export async function dernierPointage(db: Db, t: TabletteConnue): Promise<({ id: string; mode: string } & Omit<PointageFait, "salarieId">) | null> {
  return withTenant(db, t.organisationId, async (tx) => {
    const [d] = await tx
      .select({ id: pointageTablette.id, mode: pointageTablette.mode, prenom: salarie.prenom, sens: pointageTablette.typeApplique, heure: pointageTablette.heure })
      .from(pointageTablette)
      .innerJoin(salarie, eq(pointageTablette.salarieId, salarie.id))
      .where(and(eq(pointageTablette.tabletteId, t.id), gt(pointageTablette.instant, sql`now() - interval '1 minute'`)))
      .orderBy(desc(pointageTablette.instant))
      .limit(1);
    return d ? { ...d, sens: d.sens as SensPointage } : null;
  });
}
