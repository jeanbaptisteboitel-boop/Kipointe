/**
 * /iclock/* — réception des badgeages de la POINTEUSE du client (protocole ADMS / iClock des
 * appareils NGTeco et ZKTeco). Le chemin est figé par le micrologiciel. Réponses en TEXTE BRUT.
 *
 *   GET  cdata?SN=…&options=all   → configuration (texteHandshake)
 *   POST cdata?SN=…&table=ATTLOG  → badgeages enregistrés, « OK: <n> »
 *   POST cdata?SN=…&table=<autre> → « OK » (rien n'est lu)
 *   GET  getrequest?SN=…          → « OK » (aucune commande à l'appareil)
 *   POST devicecmd?SN=…           → « OK »
 *
 * Contrôle d'accès : LISTE BLANCHE des numéros de série, tenue par chaque client. Les appareils
 * ne savent ni s'authentifier ni porter un secret : le numéro de série est le seul contrôle
 * (limite documentée dans docs/POINTEUSE.md). Numéro inconnu, appareil désactivé ou client
 * suspendu : RIEN n'est enregistré, l'envoi est refusé temporairement (503) pour que l'appareil
 * garde ses badgeages et les renvoie une fois enregistré.
 *
 * Corps plafonné (413), débit limité par numéro de série et par adresse (429).
 */
import { getDb } from "@/db";
import { LimiteurDebit, TAILLE_MAX_CORPS_ADMS, masquerNumeroSerie, normaliserNumeroSerie, parserAttlog, routeAdms, texteHandshake } from "@/lib/pointeuse/adms";
import { dernierInstant, enregistrerLignesAttlog, noterContact, trouverPointeuse, type PointeuseConnue } from "@/lib/pointeuse/enregistrement";
import { FUSEAU_DEFAUT } from "@/lib/temps/zone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Temps de traitement d'un envoi avant de rendre la main. */
const BUDGET_TRAITEMENT_MS = 40_000;

const limiteParSN = new LimiteurDebit(120, 60_000);
const limiteParAdresse = new LimiteurDebit(300, 60_000);
/** Un journal « SN inconnu » par numéro et par heure au plus. */
const journalInconnus = new LimiteurDebit(1, 3_600_000, 500);

function repondre(statut: number, texte: string): Response {
  return new Response(texte, { status: statut, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Corps brut en texte ; 'trop' au-delà de `max` octets. */
async function lireCorps(req: Request, max: number): Promise<string | "trop"> {
  const annonce = Number(req.headers.get("content-length"));
  if (Number.isFinite(annonce) && annonce > max) return "trop";
  const octets = new Uint8Array(await req.arrayBuffer());
  return octets.length > max ? "trop" : new TextDecoder().decode(octets);
}

function adresse(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "inconnue";
}

async function traiter(req: Request, ctx: { params: Promise<{ chemin: string[] }> }): Promise<Response> {
  const { chemin } = await ctx.params;
  const route = routeAdms(chemin);
  const url = new URL(req.url);
  const sn = normaliserNumeroSerie(url.searchParams.get("SN") ?? url.searchParams.get("sn"));
  if (!sn) return repondre(400, "ERROR");

  const maintenant = new Date();
  if (!limiteParAdresse.autoriser(adresse(req), maintenant.getTime()) || !limiteParSN.autoriser(sn, maintenant.getTime())) {
    return repondre(429, "ERROR");
  }

  const db = getDb();
  let pointeuse: PointeuseConnue | null;
  try {
    pointeuse = await trouverPointeuse(db, sn);
  } catch (e) {
    console.error("[pointeuse] lecture de l'appareil : échec", e);
    return repondre(500, "ERROR");
  }
  const autorise = !!pointeuse && pointeuse.actif && pointeuse.organisationActive;
  if (!autorise && journalInconnus.autoriser(sn, maintenant.getTime())) {
    console.warn(`[pointeuse] numéro de série inconnu ou inactif (${masquerNumeroSerie(sn)}) : rien n'est enregistré`);
  }

  try {
    if (route === "cdata" && req.method === "GET") {
      if (autorise) await noterContact(db, pointeuse!, maintenant);
      return repondre(200, texteHandshake({ numeroSerie: sn, stampAttlog: autorise ? pointeuse!.stampAttlog : null, maintenant, fuseau: pointeuse?.fuseau ?? FUSEAU_DEFAUT }));
    }

    if (route === "cdata" && req.method === "POST") {
      const table = (url.searchParams.get("table") ?? "").toUpperCase();
      const corps = await lireCorps(req, TAILLE_MAX_CORPS_ADMS);
      if (corps === "trop") return repondre(413, "ERROR");
      if (table !== "ATTLOG") {
        if (autorise) await noterContact(db, pointeuse!, maintenant);
        return repondre(200, "OK");
      }
      // Appareil pas (encore) autorisé : refus temporaire, il GARDE ses badgeages et les renverra.
      if (!autorise) return repondre(503, "ERROR");

      const { lignes } = parserAttlog(corps);
      const bilan = await enregistrerLignesAttlog(db, { pointeuse: pointeuse!, lignes, maintenant, budgetMs: BUDGET_TRAITEMENT_MS });
      const stamp = (url.searchParams.get("Stamp") ?? url.searchParams.get("stamp") ?? "").trim();
      const extra: { stampAttlog?: string; dernierPointage?: Date } = {};
      if (bilan.complet && /^\d{1,20}$/.test(stamp)) extra.stampAttlog = stamp;
      const dernier = dernierInstant(lignes, pointeuse!.fuseau);
      if (dernier && (!pointeuse!.dernierPointage || dernier > pointeuse!.dernierPointage)) extra.dernierPointage = dernier;
      await noterContact(db, pointeuse!, maintenant, extra);
      if (!bilan.complet) return repondre(503, "ERROR");
      return repondre(200, `OK: ${lignes.length}`);
    }

    if (req.method === "POST" && (await lireCorps(req, TAILLE_MAX_CORPS_ADMS)) === "trop") return repondre(413, "ERROR");
    if (autorise) await noterContact(db, pointeuse!, maintenant);
    return repondre(200, "OK");
  } catch (e) {
    console.error("[pointeuse] enregistrement : échec", e);
    return repondre(500, "ERROR");
  }
}

export const GET = traiter;
export const POST = traiter;
