"use client";

import { usePathname } from "next/navigation";
import { Onglet } from "@/components/ui";

const ONGLETS: [string, string][] = [
  ["/gerant", "Semaine"],
  ["/gerant/salaries", "Salariés"],
  ["/gerant/anomalies", "Anomalies"],
  ["/gerant/recaps", "Récaps"],
  ["/gerant/terminaux", "Terminaux"],
  ["/gerant/parametres", "Paramètres"],
  ["/gerant/conformite", "Conformité"],
  ["/gerant/journal", "Journal"],
];

export function NavigationGerant() {
  const chemin = usePathname();
  return (
    <nav aria-label="Espace gérant" className="flex gap-6 overflow-x-auto">
      {ONGLETS.map(([href, libelle]) => (
        <Onglet key={href} href={href} actif={href === "/gerant" ? chemin === "/gerant" : chemin.startsWith(href)}>
          {libelle}
        </Onglet>
      ))}
    </nav>
  );
}
