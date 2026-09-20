import { hash, verify } from "@node-rs/argon2";

/**
 * Paramètres Argon2id (recommandation OWASP : 19 MiB, 2 itérations, 1 thread).
 * L'algorithme par défaut de @node-rs/argon2 est Argon2id (les empreintes commencent par `$argon2id$`).
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hacherSecret(secret: string): Promise<string> {
  return hash(secret, OPTIONS);
}

export async function verifierSecret(hache: string, secret: string): Promise<boolean> {
  try {
    return await verify(hache, secret, OPTIONS);
  } catch {
    return false;
  }
}
