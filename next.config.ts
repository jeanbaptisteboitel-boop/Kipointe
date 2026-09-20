import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Modules natifs / lourds à laisser hors du bundle serveur (Turbopack)
  serverExternalPackages: ["@node-rs/argon2", "@neondatabase/serverless", "pg", "ws", "pdf-lib"],
  async headers() {
    return [
      {
        // Le Service Worker doit pouvoir contrôler toute l'origine et ne jamais être mis en cache longtemps
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
