import { getDb, type Tx } from "@/db";
import { withTenant } from "@/db/tenant";
import { exigerConnecteApi, exigerGerantApi, type UtilisateurConnecte } from "@/lib/auth/session";

/** Route admin : utilisateur GERANT authentifié + transaction limitée à son organisation. */
export async function avecGerant<T>(fn: (tx: Tx, u: UtilisateurConnecte) => Promise<T>): Promise<T> {
  const u = await exigerGerantApi();
  return withTenant(getDb(), u.organisationId, (tx) => fn(tx, u));
}

/** Route salarié/gérant : utilisateur authentifié + transaction limitée à son organisation. */
export async function avecConnecte<T>(fn: (tx: Tx, u: UtilisateurConnecte) => Promise<T>): Promise<T> {
  const u = await exigerConnecteApi();
  return withTenant(getDb(), u.organisationId, (tx) => fn(tx, u));
}

export async function paramId(ctx: { params: Promise<{ id: string }> }): Promise<string> {
  const { id } = await ctx.params;
  return id;
}
