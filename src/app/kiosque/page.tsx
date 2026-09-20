import type { Metadata } from "next";
import { Kiosque } from "./Kiosque";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Pointage", robots: { index: false } };

export default function PageKiosque() {
  return <Kiosque />;
}
