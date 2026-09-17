import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Kipointe", template: "%s · Kipointe" },
  description: "Pointage du temps de travail par badge QR + PIN sur tablette murale",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg" },
  applicationName: "Kipointe",
};

export const viewport: Viewport = {
  themeColor: "#0b1f3a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
