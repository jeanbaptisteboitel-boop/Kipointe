import { supprimerSession } from "@/lib/auth/session";
import { route } from "@/lib/http";

export const runtime = "nodejs";

/** POST /api/auth/deconnexion → supprime la session et le cookie. */
export const POST = route(async () => {
  await supprimerSession();
  return new Response(null, { status: 204 });
});
