/**
 * Authentification des tablettes : token porteur remis à l'appairage, stocké haché (SHA-256).
 */
import { eq } from "drizzle-orm";
import { getDb, type Tx } from "@/db";
import { terminal, type Etablissement, type Organisation, type Terminal } from "@/db/schema";
import { setBypass, setTenant } from "@/db/tenant";
import { sha256Hex } from "@/lib/crypto";
import { extraireBearer, HttpError } from "@/lib/http";

export type ContexteTerminal = {
  terminal: Terminal;
  organisation: Organisation;
  etablissement: Etablissement;
  /** Token brut de la requête : sert à dériver le vérificateur hors ligne, jamais stocké. */
  token: string;
};

export async function resoudreTerminal(tx: Tx, token: string): Promise<ContexteTerminal | null> {
  const t = await tx.query.terminal.findFirst({
    where: eq(terminal.tokenHash, sha256Hex(token)),
    with: { organisation: true, etablissement: true },
  });
  if (!t || !t.actif) return null;
  const { organisation, etablissement, ...reste } = t;
  return { terminal: reste, organisation, etablissement, token };
}

/**
 * Ouvre une transaction : résolution du terminal (sans filtre tenant), puis restriction
 * à son organisation avant d'exécuter `fn`.
 */
export async function avecTerminal<T>(req: Request, fn: (tx: Tx, ctx: ContexteTerminal) => Promise<T>): Promise<T> {
  const token = extraireBearer(req);
  if (!token) throw new HttpError(401, "TOKEN_TERMINAL_MANQUANT");
  return getDb().transaction(async (tx) => {
    await setBypass(tx);
    const ctx = await resoudreTerminal(tx, token);
    if (!ctx) throw new HttpError(401, "TERMINAL_INCONNU");
    await setTenant(tx, ctx.organisation.id);
    return fn(tx, ctx);
  });
}

/** Variante sans transaction métier : renvoie seulement le contexte (le handler ouvre ses propres transactions). */
export async function contexteTerminal(req: Request): Promise<ContexteTerminal> {
  const token = extraireBearer(req);
  if (!token) throw new HttpError(401, "TOKEN_TERMINAL_MANQUANT");
  const ctx = await getDb().transaction(async (tx) => {
    await setBypass(tx);
    return resoudreTerminal(tx, token);
  });
  if (!ctx) throw new HttpError(401, "TERMINAL_INCONNU");
  return ctx;
}
