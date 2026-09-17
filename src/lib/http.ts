import { NextResponse } from "next/server";
import type { ZodType } from "zod";

/** Erreur HTTP applicative : convertie en réponse JSON `{ erreur: { code, detail } }`. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly detail?: unknown,
  ) {
    super(code);
  }
}

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function reponseErreur(status: number, code: string, detail?: unknown): NextResponse {
  return NextResponse.json({ erreur: { code, detail: detail ?? null } }, { status });
}

/** Lit et valide le corps JSON d'une requête. */
export async function lireJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let brut: unknown;
  try {
    brut = await req.json();
  } catch {
    throw new HttpError(400, "JSON_INVALIDE");
  }
  const res = schema.safeParse(brut);
  if (!res.success) {
    throw new HttpError(400, "DONNEES_INVALIDES", res.error.issues);
  }
  return res.data;
}

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response>;

/** Enveloppe un handler de route : les HttpError deviennent des réponses propres, le reste un 500 journalisé. */
export function route<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return reponseErreur(err.status, err.code, err.detail);
      }
      console.error("[api] erreur inattendue", err);
      return reponseErreur(500, "ERREUR_INTERNE");
    }
  };
}

export function extraireBearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}
