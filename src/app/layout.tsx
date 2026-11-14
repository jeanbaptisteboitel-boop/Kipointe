import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

/**
 * Deux familles, conformément au design system OMNIUP :
 *  - Manrope pour les titres et le texte ;
 *  - JetBrains Mono pour les kickers, matricules et numéros de série.
 * Elles sont auto-hébergées par next/font.
 */
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Kipointe", template: "%s · Kipointe" },
  description: "Suivi du temps de travail relié à la pointeuse de l'entreprise : pointages, plannings, congés et compteur d'heures. Édité par OMNIUP.",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon.svg" },
  applicationName: "Kipointe",
};

export const viewport: Viewport = {
  themeColor: "#0E2E6B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${manrope.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
