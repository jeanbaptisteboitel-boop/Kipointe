import type { MetadataRoute } from "next";

/** Kipointe s'installe sur l'écran d'accueil du téléphone (iPhone et Android) et s'ouvre comme une application. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kipointe",
    short_name: "Kipointe",
    description: "Mes heures, mes congés, mes pointages.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7fa",
    theme_color: "#0E2E6B",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
