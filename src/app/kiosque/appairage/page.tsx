import type { Metadata } from "next";
import { Appairage } from "./Appairage";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Appairage de la tablette", robots: { index: false } };

export default function PageAppairage() {
  return <Appairage />;
}
