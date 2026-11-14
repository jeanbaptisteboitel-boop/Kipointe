/**
 * Envoi par E-MAIL des notifications (facultatif).
 *
 * Service d'envoi : Resend (API HTTP), configuré par RESEND_API_KEY et EMAIL_EXPEDITEUR. Sans
 * ces variables, rien n'est envoyé et les notifications restent consultables dans les portails.
 * Destinataires : l'adresse du salarié (fiche, sinon son compte) ; pour une notification
 * d'administrateur, les comptes ADMIN actifs de l'organisation.
 */
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { notification, organisation, salarie, utilisateur } from "@/db/schema";
import { withTenant } from "@/db/tenant";

export function emailConfigure(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_EXPEDITEUR;
}

function echapper(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function envoyer(a: string[], sujet: string, texte: string, lien: string | null): Promise<boolean> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const url = lien && base ? `${base}${lien}` : null;
  const html = `<p>${echapper(texte)}</p>${url ? `<p><a href="${url}">Ouvrir dans Kipointe</a></p>` : ""}<p style="color:#5c6b86;font-size:12px">Message automatique de Kipointe — ne pas répondre.</p>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_EXPEDITEUR, to: a, subject: sujet, html, text: url ? `${texte}\n\n${url}` : texte }),
    });
    if (!r.ok) console.error(`[email] refus du service d'envoi (${r.status})`);
    return r.ok;
  } catch (e) {
    console.error("[email] envoi impossible", e);
    return false;
  }
}

/** Envoie les notifications récentes pas encore parties par e-mail. Sans service configuré : ne fait rien. */
export async function envoyerEmailsEnAttente(db: Db, organisationId: string, maintenant: Date = new Date()): Promise<number> {
  if (!emailConfigure()) return 0;
  const aEnvoyer = await withTenant(db, organisationId, async (tx) => {
    const [org] = await tx.select().from(organisation).where(eq(organisation.id, organisationId));
    if (!org?.notificationsEmail) return [];
    const notifs = await tx
      .select()
      .from(notification)
      .where(and(eq(notification.organisationId, organisationId), isNull(notification.emailEnvoyeLe), gt(notification.createdAt, new Date(maintenant.getTime() - 2 * 86_400_000))))
      .orderBy(asc(notification.createdAt))
      .limit(50);
    if (!notifs.length) return [];
    const admins = (await tx.select({ email: utilisateur.email }).from(utilisateur).where(and(eq(utilisateur.organisationId, organisationId), eq(utilisateur.role, "ADMIN"), eq(utilisateur.actif, true)))).map((u) => u.email);
    const ids = [...new Set(notifs.map((n) => n.destinataireSalarieId).filter((x): x is string => !!x))];
    const fiches = ids.length ? await tx.select({ id: salarie.id, email: salarie.email }).from(salarie).where(inArray(salarie.id, ids)) : [];
    const comptes = ids.length ? await tx.select({ salarieId: utilisateur.salarieId, email: utilisateur.email }).from(utilisateur).where(and(inArray(utilisateur.salarieId, ids), eq(utilisateur.actif, true))) : [];
    const emailSalarie = new Map<string, string>();
    for (const c of comptes) if (c.salarieId) emailSalarie.set(c.salarieId, c.email);
    for (const f of fiches) if (f.email) emailSalarie.set(f.id, f.email);
    return notifs.map((n) => ({ n, a: n.destinataireSalarieId ? [emailSalarie.get(n.destinataireSalarieId)].filter((x): x is string => !!x) : admins }));
  });

  let envoyes = 0;
  const traites: string[] = [];
  for (const { n, a } of aEnvoyer) {
    // Sans adresse connue, la notification est marquée traitée : elle reste visible dans le portail.
    if (!a.length || (await envoyer(a, `Kipointe — ${n.titre}`, n.message, n.lien))) {
      traites.push(n.id);
      if (a.length) envoyes++;
    }
  }
  if (traites.length) {
    await withTenant(db, organisationId, (tx) => tx.update(notification).set({ emailEnvoyeLe: maintenant }).where(inArray(notification.id, traites)));
  }
  return envoyes;
}
