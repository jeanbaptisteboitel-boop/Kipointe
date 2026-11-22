import { cookies } from "next/headers";
import { getDb } from "@/db";
import { COOKIE_TABLETTE, trouverTablette } from "@/lib/tablette/service";
import { ActivationTablette, EcranTablette } from "./EcranTablette";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pointage", robots: { index: false } };

/** Écran affiché en permanence sur la tablette de pointage. */
export default async function PageTablette() {
  const t = await trouverTablette(getDb(), (await cookies()).get(COOKIE_TABLETTE)?.value);
  return t ? <EcranTablette /> : <ActivationTablette />;
}
