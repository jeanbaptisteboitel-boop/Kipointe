/**
 * Service de pointage badge + PIN (brief §3, §6) :
 *  - idempotence (rejeu de la file hors ligne) ;
 *  - rate limiting sur les échecs (10/min par terminal et par badge) ;
 *  - verrouillage après 5 PIN faux (15 min), chaque échec journalisé ;
 *  - type déduit côté serveur du dernier pointage ;
 *  - horodatage effectif : horloge serveur en ligne, horloge tablette + offset hors ligne.
 *
 * Les échecs métier sont RENVOYÉS (pas levés) pour que la transaction persiste
 * le journal des tentatives et le compteur d'échecs.
 */
import { and, count, desc, eq, gt, notInArray, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { anomalie, pointage, salarie, tentativePointage, terminal, type Salarie, type TypePointage } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { verifierSecret } from "@/lib/auth/password";
import type { ContexteTerminal } from "@/lib/auth/terminal";
import { chargerPointagesEffectifs } from "@/lib/calcul/effectifs";
import { calculerJournees, construireIntervalles, parametresDepuis } from "@/lib/calcul/semaine";
import { verificateurHorsLigne } from "@/lib/crypto";
import { bornesJour, dateJournee } from "@/lib/temps/journee";

export const MAX_ECHECS_PIN = 5;
export const DUREE_VERROUILLAGE_MS = 15 * 60_000;
export const RATE_LIMIT_PAR_MINUTE = 10;
/** Deux pointages à moins de 5 minutes (au-delà de l'anti-rebond) : anomalie DOUBLE_SCAN, à l'attention du gérant. */
export const FENETRE_DOUBLE_SCAN_MS = 5 * 60_000;
/** Un pointage hors ligne daté dans le futur de plus de 2 min est ramené à l'heure serveur. */
export const TOLERANCE_FUTUR_MS = 2 * 60_000;

export type DemandePointage = {
  badgeUuid: string;
  pin: string;
  idempotencyKey: string;
  horodatageTerminal: Date | null;
  offsetHorlogeMs: number | null;
  /** true : pointage rejoué depuis la file hors ligne (source KIOSQUE_HORS_LIGNE). */
  horsLigne: boolean;
};

export type CodeEchec = "BADGE_INCONNU" | "BADGE_VERROUILLE" | "PIN_INCORRECT" | "RATE_LIMIT" | "DOUBLON" | "DONNEES_INVALIDES";

export type EchecPointage = {
  ok: false;
  code: CodeEchec;
  status: number;
  message: string;
  detail?: Record<string, unknown>;
  prenom?: string;
};

export type SuccesPointage = {
  ok: true;
  statut: "OK" | "REJOUE";
  pointage: { id: string; type: TypePointage; horodatage: string; source: string };
  salarie: { id: string; prenom: string; badgeUuid: string; pinVersion: number };
  totalJourMinutes: number;
  /** Vérificateur pour le contrôle du PIN hors ligne (null lors d'un rejeu). */
  verificateurHorsLigne: string | null;
  /** Écart (ms) entre l'horloge serveur et l'horloge tablette corrigée, pour information. */
  deriveHorlogeMs: number | null;
};

export type ResultatPointage = SuccesPointage | EchecPointage;

export const TYPE_SUIVANT: Record<TypePointage, TypePointage> = {
  ENTREE: "SORTIE",
  SORTIE: "ENTREE",
  DEBUT_PAUSE: "FIN_PAUSE",
  FIN_PAUSE: "SORTIE",
};

const LIBELLES: Record<TypePointage, string> = {
  ENTREE: "Entrée",
  SORTIE: "Sortie",
  DEBUT_PAUSE: "Début de pause",
  FIN_PAUSE: "Fin de pause",
};

export function libelleType(t: TypePointage): string {
  return LIBELLES[t];
}

async function journaliser(
  tx: Tx,
  ctx: ContexteTerminal,
  badgeUuid: string,
  salarieId: string | null,
  resultat: "OK" | "BADGE_INCONNU" | "PIN_INCORRECT" | "VERROUILLE" | "RATE_LIMIT",
  maintenant: Date,
) {
  await tx.insert(tentativePointage).values({
    organisationId: ctx.organisation.id,
    terminalId: ctx.terminal.id,
    badgeUuid,
    salarieId,
    resultat,
    createdAt: maintenant,
  });
}

/** Nombre d'échecs récents (hors RATE_LIMIT) pour un terminal et pour un badge. */
async function echecsRecents(tx: Tx, ctx: ContexteTerminal, badgeUuid: string, maintenant: Date) {
  const depuis = new Date(maintenant.getTime() - 60_000);
  const [parTerminal] = await tx
    .select({ n: count() })
    .from(tentativePointage)
    .where(
      and(
        eq(tentativePointage.terminalId, ctx.terminal.id),
        gt(tentativePointage.createdAt, depuis),
        notInArray(tentativePointage.resultat, ["OK", "RATE_LIMIT"]),
      ),
    );
  const [parBadge] = await tx
    .select({ n: count() })
    .from(tentativePointage)
    .where(
      and(
        eq(tentativePointage.badgeUuid, badgeUuid),
        gt(tentativePointage.createdAt, depuis),
        notInArray(tentativePointage.resultat, ["OK", "RATE_LIMIT"]),
      ),
    );
  return { terminal: Number(parTerminal?.n ?? 0), badge: Number(parBadge?.n ?? 0) };
}

async function totalDuJour(tx: Tx, ctx: ContexteTerminal, s: Salarie, instant: Date, maintenant: Date): Promise<number> {
  const params = parametresDepuis(ctx.organisation, ctx.etablissement.timezone);
  const date = dateJournee(instant, params);
  const { debut, fin } = bornesJour(date, params);
  const pts = await chargerPointagesEffectifs(tx, ctx.organisation.id, s.id, new Date(debut.getTime() - 2 * 24 * 3600_000), fin);
  const { intervalles } = construireIntervalles(pts, params, maintenant);
  const journees = calculerJournees(intervalles, params);
  return journees.get(date)?.minutes ?? 0;
}

async function upsertAnomalie(
  tx: Tx,
  organisationId: string,
  salarieId: string,
  dateJour: string,
  type: "PIN_VERROUILLE" | "POINTAGE_HORS_LIGNE" | "DOUBLE_SCAN",
  evenement: Record<string, unknown>,
) {
  await tx
    .insert(anomalie)
    .values({ organisationId, salarieId, dateJour, type, detail: { evenements: [evenement] } })
    .onConflictDoUpdate({
      target: [anomalie.organisationId, anomalie.salarieId, anomalie.dateJour, anomalie.type],
      set: {
        detail: sql`jsonb_set(${anomalie.detail}, '{evenements}', coalesce(${anomalie.detail}->'evenements', '[]'::jsonb) || ${JSON.stringify(evenement)}::jsonb)`,
        statut: "OUVERTE",
      },
    });
}

/**
 * Enregistre un pointage dans la transaction `tx` (tenant déjà positionné).
 */
export async function enregistrerPointage(
  tx: Tx,
  ctx: ContexteTerminal,
  demande: DemandePointage,
  maintenant: Date = new Date(),
): Promise<ResultatPointage> {
  const org = ctx.organisation;
  const params = parametresDepuis(org, ctx.etablissement.timezone);

  // 1. Idempotence : la clé a déjà été consommée → on renvoie le résultat d'origine.
  const existant = await tx.query.pointage.findFirst({ where: eq(pointage.idempotencyKey, demande.idempotencyKey) });
  if (existant) {
    const s = await tx.query.salarie.findFirst({ where: eq(salarie.id, existant.salarieId) });
    return {
      ok: true,
      statut: "REJOUE",
      pointage: { id: existant.id, type: existant.type, horodatage: existant.horodatageEffectif.toISOString(), source: existant.source },
      salarie: { id: existant.salarieId, prenom: s?.prenom ?? "", badgeUuid: s?.badgeUuid ?? demande.badgeUuid, pinVersion: s?.pinVersion ?? 0 },
      totalJourMinutes: s ? await totalDuJour(tx, ctx, s, existant.horodatageEffectif, maintenant) : 0,
      verificateurHorsLigne: null,
      deriveHorlogeMs: null,
    };
  }

  // 2. Rate limiting sur les échecs récents.
  const echecs = await echecsRecents(tx, ctx, demande.badgeUuid, maintenant);
  if (echecs.terminal >= RATE_LIMIT_PAR_MINUTE || echecs.badge >= RATE_LIMIT_PAR_MINUTE) {
    await journaliser(tx, ctx, demande.badgeUuid, null, "RATE_LIMIT", maintenant);
    return { ok: false, code: "RATE_LIMIT", status: 429, message: "Trop de tentatives, réessayez dans une minute." };
  }

  // 3. Badge → salarié (verrouillage de la ligne : sérialise les pointages d'un même salarié).
  const [s] = await tx
    .select()
    .from(salarie)
    .where(and(eq(salarie.badgeUuid, demande.badgeUuid), eq(salarie.organisationId, org.id)))
    .for("update");
  if (!s || !s.actif) {
    await journaliser(tx, ctx, demande.badgeUuid, null, "BADGE_INCONNU", maintenant);
    return { ok: false, code: "BADGE_INCONNU", status: 404, message: "Badge inconnu ou désactivé." };
  }

  // 4. Verrouillage en cours ?
  if (s.pinVerrouilleJusqua && s.pinVerrouilleJusqua.getTime() > maintenant.getTime()) {
    await journaliser(tx, ctx, demande.badgeUuid, s.id, "VERROUILLE", maintenant);
    return {
      ok: false,
      code: "BADGE_VERROUILLE",
      status: 423,
      message: "Badge verrouillé : voir le gérant.",
      detail: { jusqua: s.pinVerrouilleJusqua.toISOString() },
      prenom: s.prenom,
    };
  }

  // 5. PIN.
  const pinOk = /^\d{4}$/.test(demande.pin) && (await verifierSecret(s.pinHash, demande.pin));
  if (!pinOk) {
    const nbEchecs = s.pinEchecs + 1;
    await journaliser(tx, ctx, demande.badgeUuid, s.id, "PIN_INCORRECT", maintenant);
    if (nbEchecs >= MAX_ECHECS_PIN) {
      const jusqua = new Date(maintenant.getTime() + DUREE_VERROUILLAGE_MS);
      await tx.update(salarie).set({ pinEchecs: 0, pinVerrouilleJusqua: jusqua }).where(eq(salarie.id, s.id));
      await upsertAnomalie(tx, org.id, s.id, dateJournee(maintenant, params), "PIN_VERROUILLE", {
        horodatage: maintenant.toISOString(),
        terminalId: ctx.terminal.id,
        jusqua: jusqua.toISOString(),
      });
      return {
        ok: false,
        code: "BADGE_VERROUILLE",
        status: 423,
        message: "5 codes erronés : badge verrouillé 15 minutes.",
        detail: { jusqua: jusqua.toISOString() },
        prenom: s.prenom,
      };
    }
    await tx.update(salarie).set({ pinEchecs: nbEchecs }).where(eq(salarie.id, s.id));
    return {
      ok: false,
      code: "PIN_INCORRECT",
      status: 401,
      message: "Code incorrect.",
      detail: { tentativesRestantes: MAX_ECHECS_PIN - nbEchecs },
      prenom: s.prenom,
    };
  }
  if (s.pinEchecs !== 0 || s.pinVerrouilleJusqua) {
    await tx.update(salarie).set({ pinEchecs: 0, pinVerrouilleJusqua: null }).where(eq(salarie.id, s.id));
  }
  await journaliser(tx, ctx, demande.badgeUuid, s.id, "OK", maintenant);

  // 6. Horodatage effectif.
  let effectif: Date;
  let deriveHorlogeMs: number | null = null;
  const evenementHorsLigne: Record<string, unknown> = {};
  if (demande.horsLigne) {
    if (!demande.horodatageTerminal) {
      return { ok: false, code: "DONNEES_INVALIDES", status: 400, message: "Horodatage terminal manquant pour un pointage hors ligne." };
    }
    effectif = new Date(demande.horodatageTerminal.getTime() + (demande.offsetHorlogeMs ?? 0));
    if (effectif.getTime() > maintenant.getTime() + TOLERANCE_FUTUR_MS) {
      evenementHorsLigne.horodatageFuturRamene = effectif.toISOString();
      effectif = maintenant;
    }
  } else {
    effectif = maintenant;
    if (demande.horodatageTerminal) {
      deriveHorlogeMs = maintenant.getTime() - (demande.horodatageTerminal.getTime() + (demande.offsetHorlogeMs ?? 0));
    }
  }

  // 7. Anti-rebond / double scan, sur la vue effective (corrections comprises).
  const recents = await chargerPointagesEffectifs(
    tx,
    org.id,
    s.id,
    new Date(effectif.getTime() - org.amplitudeMax * 60_000),
    new Date(effectif.getTime() + 24 * 3600_000),
  );
  const precedents = recents.filter((p) => p.horodatage.getTime() <= effectif.getTime());
  const dernier = precedents[precedents.length - 1];
  if (dernier && effectif.getTime() - dernier.horodatage.getTime() < org.antiDoublonSecondes * 1000) {
    return {
      ok: false,
      code: "DOUBLON",
      status: 409,
      message: `Déjà pointé (${libelleType(dernier.type)}) il y a quelques secondes.`,
      detail: { pointageId: dernier.id, type: dernier.type, horodatage: dernier.horodatage.toISOString() },
      prenom: s.prenom,
    };
  }

  // 8. Type déduit du dernier pointage dans la fenêtre d'amplitude maximale.
  const type: TypePointage = dernier ? TYPE_SUIVANT[dernier.type] : "ENTREE";

  // 9. Insertion (ON CONFLICT : course sur la clé d'idempotence).
  const inseres = await tx
    .insert(pointage)
    .values({
      organisationId: org.id,
      salarieId: s.id,
      etablissementId: ctx.etablissement.id,
      terminalId: ctx.terminal.id,
      horodatageServeur: maintenant,
      horodatageTerminal: demande.horodatageTerminal,
      offsetHorlogeMs: demande.offsetHorlogeMs,
      horodatageEffectif: effectif,
      type,
      source: demande.horsLigne ? "KIOSQUE_HORS_LIGNE" : "KIOSQUE",
      idempotencyKey: demande.idempotencyKey,
    })
    .onConflictDoNothing({ target: pointage.idempotencyKey })
    .returning();
  const insere = inseres[0];
  if (!insere) {
    return enregistrerPointage(tx, ctx, demande, maintenant); // la clé vient d'être consommée : rejeu
  }

  const dateJour = dateJournee(effectif, params);
  if (dernier && effectif.getTime() - dernier.horodatage.getTime() < FENETRE_DOUBLE_SCAN_MS) {
    await upsertAnomalie(tx, org.id, s.id, dateJour, "DOUBLE_SCAN", {
      pointages: [dernier.id, insere.id],
      ecartSecondes: Math.round((effectif.getTime() - dernier.horodatage.getTime()) / 1000),
    });
  }
  if (demande.horsLigne) {
    await upsertAnomalie(tx, org.id, s.id, dateJour, "POINTAGE_HORS_LIGNE", {
      pointageId: insere.id,
      horodatage: effectif.toISOString(),
      offsetHorlogeMs: demande.offsetHorlogeMs,
      ...evenementHorsLigne,
    });
  }

  await tx.update(terminal).set({ derniereSynchro: maintenant }).where(eq(terminal.id, ctx.terminal.id));

  return {
    ok: true,
    statut: "OK",
    pointage: { id: insere.id, type, horodatage: effectif.toISOString(), source: insere.source },
    salarie: { id: s.id, prenom: s.prenom, badgeUuid: s.badgeUuid, pinVersion: s.pinVersion },
    totalJourMinutes: await totalDuJour(tx, ctx, s, effectif, maintenant),
    verificateurHorsLigne: verificateurHorsLigne(ctx.token, s.badgeUuid, s.pinVersion, demande.pin),
    deriveHorlogeMs,
  };
}

/**
 * Rejoue un lot de pointages hors ligne : une transaction par élément (un échec n'annule pas les autres),
 * dans l'ordre chronologique de la tablette.
 */
export async function traiterLot(
  db: Db,
  ctx: ContexteTerminal,
  items: DemandePointage[],
  maintenant: Date = new Date(),
): Promise<(ResultatPointage & { idempotencyKey: string })[]> {
  const tri = [...items].sort(
    (a, b) => (a.horodatageTerminal?.getTime() ?? 0) - (b.horodatageTerminal?.getTime() ?? 0),
  );
  const resultats: (ResultatPointage & { idempotencyKey: string })[] = [];
  for (const item of tri) {
    const res = await withTenant(db, ctx.organisation.id, (tx) => enregistrerPointage(tx, ctx, { ...item, horsLigne: true }, maintenant));
    resultats.push({ ...res, idempotencyKey: item.idempotencyKey });
  }
  return resultats;
}

/** Dernier pointage effectif d'un salarié (pour l'affichage gérant). */
export async function dernierPointage(tx: Tx, organisationId: string, salarieId: string) {
  return tx.query.pointage.findFirst({
    where: and(eq(pointage.organisationId, organisationId), eq(pointage.salarieId, salarieId)),
    orderBy: [desc(pointage.horodatageEffectif)],
  });
}
