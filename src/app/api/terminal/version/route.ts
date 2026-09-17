import { json, route } from "@/lib/http";

/** GET /api/terminal/version → version d'APK attendue (vérifiée par le wrapper au démarrage). */
export const GET = route(async () => {
  return json({
    version: process.env.KIOSQUE_APK_VERSION ?? "1.0.0",
    url_apk: process.env.KIOSQUE_APK_URL ?? null,
  });
});
