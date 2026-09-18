import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { IconePower } from "@/components/icones";
import { exigerGerant } from "@/lib/auth/session";
import { formatDateFr } from "@/lib/temps/journee";
import { chargerOrganisation, chargerSalarie } from "@/lib/ui/data";
import { BoutonImprimer } from "./BoutonImprimer";

export const metadata = { title: "Badge à imprimer" };

/** Carte 85 × 54 mm = 321 × 204 px à 96 ppp. */
function CarteBadge({ svg, organisation, prenom, nom, matricule }: { svg: string; organisation: string; prenom: string; nom: string; matricule: string | null }) {
  return (
    <div
      className="flex items-center gap-4 bg-white p-4"
      style={{ width: 321, height: 204, border: "1px dashed var(--faint)", borderRadius: 12, breakInside: "avoid" }}
    >
      <span
        role="img"
        aria-label={`QR code du badge de ${prenom} ${nom}`}
        className="block flex-none"
        style={{ width: 132, height: 132 }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="flex min-w-0 flex-col">
        <div className="mono" style={{ fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)" }}>
          {organisation}
        </div>
        <div className="mt-1.5 truncate" style={{ fontFamily: "var(--font-manrope)", fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>
          {prenom}
        </div>
        <div className="titre truncate" style={{ fontSize: 23, lineHeight: 1.05, color: "var(--ink)" }}>
          {nom.toUpperCase()}
        </div>
        {matricule && (
          <div className="mono tabnum mt-[7px]" style={{ fontSize: 11, color: "var(--ink)" }}>
            {matricule}
          </div>
        )}
        <div className="mt-3 flex items-center gap-1.5">
          <span className="grid place-items-center rounded-full" style={{ width: 14, height: 14, background: "var(--cyan)" }}>
            <IconePower size={8} stroke="#fff" strokeWidth={3.4} />
          </span>
          <span className="mono" style={{ fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>
            Badge de pointage · Kipointe
          </span>
        </div>
      </div>
    </div>
  );
}

export default async function PageBadge({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigerGerant();
  const { id } = await params;
  const [s, { org }] = await Promise.all([chargerSalarie(u, id), chargerOrganisation(u)]);
  if (!s) notFound();

  const svg = await QRCode.toString(`BADGE:${s.badgeUuid}`, { type: "svg", margin: 2, errorCorrectionLevel: "M", width: 132 });
  const aujourdhui = formatDateFr(new Date().toISOString().slice(0, 10));

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titre text-[28px]">Badge imprimable</h1>
          <p className="mt-2 max-w-[62ch] text-sm" style={{ color: "var(--muted)", lineHeight: 1.55 }}>
            Gabarit A4 portrait, deux exemplaires au format carte 85 × 54 mm. Impression noir et blanc acceptée : le QR reste lisible. À plastifier ou glisser dans un porte-badge.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <BoutonImprimer />
          <Link href={`/gerant/salaries/${s.id}`} className="btn-secondary btn-sm">
            Retour à la fiche
          </Link>
        </div>
      </div>

      <div className="flex justify-center py-3.5">
        <div
          className="page-a4 flex flex-col gap-[34px] bg-white"
          style={{ width: 794, minHeight: 1123, padding: "56px 60px", boxShadow: "0 8px 32px rgba(2,10,36,0.16)" }}
        >
          <div className="flex items-baseline justify-between pb-3.5" style={{ borderBottom: "1px solid var(--line-portal)" }}>
            <span className="titre" style={{ fontSize: 13 }}>
              Kipointe — badges de pointage
            </span>
            <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>
              {org.raisonSociale} · {aujourdhui}
            </span>
          </div>

          <div className="flex flex-col items-center gap-[26px]">
            <CarteBadge svg={svg} organisation={org.raisonSociale} prenom={s.prenom} nom={s.nom} matricule={s.matricule} />
            <CarteBadge svg={svg} organisation={org.raisonSociale} prenom={s.prenom} nom={s.nom} matricule={s.matricule} />
          </div>

          <div className="mt-auto pt-5" style={{ borderTop: "1px solid var(--line-portal)", fontSize: 10, color: "var(--muted)", lineHeight: 1.6 }}>
            Découper sur les traits pointillés. Le QR code ne contient qu'un identifiant technique opaque — aucune donnée personnelle, aucun nom. En cas de perte, régénérer le
            badge depuis la fiche salarié : l'ancien est immédiatement révoqué.
          </div>
        </div>
      </div>
    </div>
  );
}
