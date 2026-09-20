import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

/**
 * Deux familles, conformément au design system OMNIUP :
 *  - Manrope pour les titres et tout le kiosque ;
 *  - JetBrains Mono pour les kickers, matricules et empreintes.
 * Elles sont auto-hébergées par next/font : la tablette démarre sans réseau.
 */
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Kipointe", template: "%s · Kipointe" },
  description: "Pointage du temps de travail par badge QR et code PIN, sur tablette murale. Édité par OMNIUP.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon.svg" },
  applicationName: "Kipointe",
};

export const viewport: Viewport = {
  themeColor: "#0B1F3A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${manrope.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
