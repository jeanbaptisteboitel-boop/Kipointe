/**
 * POINTEUSE — enregistrement des badgeages reçus par le protocole ADMS.
 *
 * Chaque ligne ATTLOG devient une ligne `badgeage` (clé d'idempotence organisation + PIN +
 * horodatage local : l'appareil renvoie volontiers les mêmes lignes) et, si le PIN correspond au
 * numéro de pointeuse d'un salarié, un pointage sur sa semaine (source 'pointeuse').
 *
 * Atomicité : pour un PIN rattaché, la ligne brute et la semaine sont écrites dans LA MÊME
 * transaction (semaine verrouillée, ligne brute insérée « ON CONFLICT DO NOTHING », semaine
 * écrite seulement si la ligne était nouvelle). Une panne annule les deux : l'appareil, qui n'a
 * pas reçu « OK », renvoie.
 *
 * PIN sans salarié : ligne gardée en 'NON_RATTACHE' (liste visible par l'administrateur) ;
 * `retraiterNonRattaches` la reporte une fois le numéro renseigné sur une fiche.
 */
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { badgeage, organisation, pointeuse, salarie } from "@/db/schema";
import { withBypass, withTenant } from "@/db/tenant";
import { appliquerPointage, resoudreTypeAuto, type ResultatPointage, type TypePointage } from "@/lib/pointage/paires";
import { ecrireSemaine, lireSemaineVerrouillee } from "@/lib/pointage/semaine";
import { horsBornes, normaliserPin, typeDepuisStatut, type LigneAttlog } from "@/lib/pointeuse/adms";
import { instantDepuisLocal } from "@/lib/temps/zone";

export interface PointeuseConnue {
  id: string;
  organisationId: string;
  numeroSerie: string;
  actif: boolean;
  modeStatut: string;
  stampAttlog: string | null;
  derniereConnexion: Date | null;
  dernierPointage: Date | null;
  fuseau: string;
  organisationActive: boolean;
}

/** Appareil enregistré pour ce numéro de série (normalisé), ou null. Hors cloisonnement : l'organisation n'est pas encore connue. */
export async function trouverPointeuse(db: Db, numeroSerie: string): Promise<PointeuseConnue | null> {
  return withBypass(db, async (tx) => {
    const rows = await tx
      .select({
        id: pointeuse.id,
        organisationId: pointeuse.organisationId,
        numeroSerie: pointeuse.numeroSerie,
        actif: pointeuse.actif,
        modeStatut: pointeuse.modeStatut,
        stampAttlog: pointeuse.stampAttlog,
        derniereConnexion: pointeuse.derniereConnexion,
        dernierPointage: pointeuse.dernierPointage,
        fuseau: organisation.timezone,
        organisationActive: organisation.actif,
      })
      .from(pointeuse)
      .innerJoin(organisation, eq(pointeuse.organisationId, organisation.id))
      .where(eq(pointeuse.numeroSerie, numeroSerie))
      .limit(1);
    return rows[0] ?? null;
  });
}

/** Délai sous lequel le dernier contact n'est pas réécrit (limite les écritures des interrogations régulières). */
const DELAI_NOTE_CONTACT_MS = 60_000;

/** Note le contact de l'appareil (au plus une écriture par minute, sauf données à écrire). */
export async function noterContact(db: Db, p: PointeuseConnue, maintenant: Date, extra: { stampAttlog?: string; dernierPointage?: Date } = {}): Promise<void> {
  const recent = p.derniereConnexion && maintenant.getTime() - p.derniereConnexion.getTime() < DELAI_NOTE_CONTACT_MS;
  if (recent && !Object.keys(extra).length) return;
  await withTenant(db, p.organisationId, (tx) =>
    tx
      .update(pointeuse)
      .set({ derniereConnexion: maintenant, ...extra })
      .where(eq(pointeuse.id, p.id)),
  );
}

/** Salariés de l'organisation par numéro de pointeuse. Deux fiches avec le même numéro : la fiche active et non sortie l'emporte. */
export async function salariesParPin(tx: Tx, organisationId: string, aujourdhui?: string): Promise<Map<string, string>> {
  const fiches = await tx
    .select({ id: salarie.id, pointeuseRef: salarie.pointeuseRef, actif: salarie.actif, dateSortie: salarie.dateSortie })
    .from(salarie)
    .where(and(eq(salarie.organisationId, organisationId), isNotNull(salarie.pointeuseRef)));
  const parPin = new Map<string, { id: string; present: boolean }>();
  for (const f of fiches) {
    const pin = normaliserPin(f.pointeuseRef);
    if (!pin) continue;
    const present = f.actif && (!f.dateSortie || !aujourdhui || f.dateSortie >= aujourdhui);
    const avant = parPin.get(pin);
    if (!avant || (present && !avant.present)) parPin.set(pin, { id: f.id, present });
  }
  return new Map([...parPin].map(([k, v]) => [k, v.id]));
}

type EtatTraite = "TRAITE" | "IGNORE";

/** Calcul (pur) d'un badgeage sur la semaine lue. */
function calculer(jours: unknown, l: { date: string; heure: string; statut: number | null }, mode: string): { r: ResultatPointage | null; etat: EtatTraite; typeApplique: string } {
  let type: TypePointage | "auto" | null = typeDepuisStatut(l.statut, mode);
  if (type === "auto") type = resoudreTypeAuto(jours, l.date, l.heure);
  if (!type) return { r: null, etat: "IGNORE", typeApplique: "double_badge" };
  const r = appliquerPointage(jours, l.date, l.heure, type);
  return { r, etat: r.deja ? "IGNORE" : "TRAITE", typeApplique: type };
}

export interface BilanEnvoi {
  recues: number;
  traitees: number;
  ignorees: number;
  nonRattachees: number;
  doublons: number;
  horsBornes: number;
  /** false : budget de temps épuisé, l'appareil doit renvoyer (les lignes faites seront des doublons). */
  complet: boolean;
}

/** Enregistre les lignes ATTLOG d'un envoi d'un appareil AUTORISÉ. */
export async function enregistrerLignesAttlog(db: Db, p: { pointeuse: PointeuseConnue; lignes: LigneAttlog[]; maintenant: Date; budgetMs?: number }): Promise<BilanEnvoi> {
  const { pointeuse: app, maintenant } = p;
  const organisationId = app.organisationId;
  const debut = Date.now();
  const bilan: BilanEnvoi = { recues: p.lignes.length, traitees: 0, ignorees: 0, nonRattachees: 0, doublons: 0, horsBornes: 0, complet: true };

  const vues = new Set<string>();
  const valides: LigneAttlog[] = [];
  for (const l of p.lignes) {
    if (horsBornes(l.date, maintenant, app.fuseau)) {
      bilan.horsBornes++;
      continue;
    }
    const cle = `${l.pin}|${l.horodatageLocal}`;
    if (vues.has(cle)) {
      bilan.doublons++;
      continue;
    }
    vues.add(cle);
    valides.push(l);
  }
  if (!valides.length) return bilan;

  const brute = (l: LigneAttlog) => ({
    organisationId,
    pointeuseId: app.id,
    pin: l.pin,
    horodatageLocal: l.horodatageLocal,
    jour: l.date,
    statutAppareil: l.statut,
    verification: l.verification,
  });

  // Déjà reçues, PIN connus, lignes orphelines : une transaction.
  const { nouvelles, parPin } = await withTenant(db, organisationId, async (tx) => {
    const deja = new Set<string>();
    const horodatages = [...new Set(valides.map((l) => l.horodatageLocal))];
    for (let i = 0; i < horodatages.length; i += 500) {
      const existants = await tx
        .select({ pin: badgeage.pin, horodatageLocal: badgeage.horodatageLocal })
        .from(badgeage)
        .where(and(eq(badgeage.organisationId, organisationId), inArray(badgeage.horodatageLocal, horodatages.slice(i, i + 500))));
      for (const e of existants) deja.add(`${e.pin}|${e.horodatageLocal}`);
    }
    const nouvelles = valides
      .filter((l) => {
        if (!deja.has(`${l.pin}|${l.horodatageLocal}`)) return true;
        bilan.doublons++;
        return false;
      })
      .sort((a, b) => a.horodatageLocal.localeCompare(b.horodatageLocal));
    const parPin = await salariesParPin(tx, organisationId);
    const orphelines = nouvelles.filter((l) => !parPin.has(l.pin));
    if (orphelines.length) {
      const creees = await tx
        .insert(badgeage)
        .values(orphelines.map((l) => ({ ...brute(l), etat: "NON_RATTACHE" as const })))
        .onConflictDoNothing()
        .returning({ id: badgeage.id });
      bilan.nonRattachees += creees.length;
      bilan.doublons += orphelines.length - creees.length;
    }
    return { nouvelles, parPin };
  });

  for (const l of nouvelles) {
    const salarieId = parPin.get(l.pin);
    if (!salarieId) continue;
    if (p.budgetMs != null && Date.now() - debut > p.budgetMs) {
      bilan.complet = false;
      break;
    }
    const etat = await withTenant(db, organisationId, async (tx) => {
      const s = await lireSemaineVerrouillee(tx, salarieId, l.date);
      const c = calculer(s.semaine?.jours, l, app.modeStatut);
      const creees = await tx
        .insert(badgeage)
        .values({ ...brute(l), etat: c.etat, typeApplique: c.typeApplique, salarieId, traiteLe: maintenant })
        .onConflictDoNothing()
        .returning({ id: badgeage.id });
      if (!creees.length) return "DOUBLON" as const;
      if (c.r) await ecrireSemaine(tx, organisationId, salarieId, s, c.r);
      return c.etat;
    });
    if (etat === "DOUBLON") bilan.doublons++;
    else if (etat === "TRAITE") bilan.traitees++;
    else bilan.ignorees++;
  }
  return bilan;
}

/** Instant le plus récent d'une liste de lignes (pour « dernier badgeage »). */
export function dernierInstant(lignes: LigneAttlog[], fuseau: string): Date | null {
  let max: Date | null = null;
  for (const l of lignes) {
    const d = instantDepuisLocal(l.horodatageLocal, fuseau);
    if (d && (!max || d > max)) max = d;
  }
  return max;
}

/**
 * Reporte sur les semaines les badgeages NON_RATTACHÉS dont le PIN correspond désormais à un
 * salarié, dans l'ordre chronologique. Une ligne déjà reprise entre-temps n'est pas reportée
 * deux fois : son état est changé sous condition avant que la semaine ne soit écrite.
 */
export async function retraiterNonRattaches(tx: Tx, organisationId: string, p: { pin?: string; maintenant?: Date } = {}): Promise<{ traitees: number; ignorees: number; restantes: number }> {
  const maintenant = p.maintenant ?? new Date();
  const parPin = await salariesParPin(tx, organisationId);
  const filtres = [eq(badgeage.organisationId, organisationId), eq(badgeage.etat, "NON_RATTACHE")];
  if (p.pin) filtres.push(eq(badgeage.pin, normaliserPin(p.pin)));
  const lignes = await tx
    .select()
    .from(badgeage)
    .where(and(...filtres))
    .orderBy(asc(badgeage.horodatageLocal))
    .limit(2000);
  const appareils = await tx.select({ id: pointeuse.id, modeStatut: pointeuse.modeStatut }).from(pointeuse).where(eq(pointeuse.organisationId, organisationId));
  const modes = new Map(appareils.map((a) => [a.id, a.modeStatut]));

  const bilan = { traitees: 0, ignorees: 0, restantes: 0 };
  for (const l of lignes) {
    const salarieId = parPin.get(normaliserPin(l.pin));
    if (!salarieId) {
      bilan.restantes++;
      continue;
    }
    const [date, hms] = l.horodatageLocal.split(" ") as [string, string];
    const s = await lireSemaineVerrouillee(tx, salarieId, date);
    const c = calculer(s.semaine?.jours, { date, heure: hms.slice(0, 5), statut: l.statutAppareil }, modes.get(l.pointeuseId) ?? "AUTO");
    const maj = await tx
      .update(badgeage)
      .set({ etat: c.etat, typeApplique: c.typeApplique, salarieId, traiteLe: maintenant })
      .where(and(eq(badgeage.id, l.id), eq(badgeage.etat, "NON_RATTACHE")))
      .returning({ id: badgeage.id });
    if (!maj.length) continue;
    if (c.r) await ecrireSemaine(tx, organisationId, salarieId, s, c.r);
    if (c.etat === "TRAITE") bilan.traitees++;
    else bilan.ignorees++;
  }
  return bilan;
}
