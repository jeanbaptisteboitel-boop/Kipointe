import Link from "next/link";
import { marquerNotificationsLues } from "@/app/actions/compte";
import { BoutonAction } from "@/components/client";
import { IconeAlerte, IconeHorloge, IconeInfo } from "@/components/icones";
import type { Notification, TypeNotification } from "@/db/schema";
import { frDateHeure } from "@/lib/temps/zone";

const ALERTES: TypeNotification[] = ["HEURES_MANQUANTES", "ABSENCE_A_JUSTIFIER", "POINTAGE_INCOMPLET", "POINTEUSE_SILENCIEUSE", "MODIF_DEMANDEE", "BADGE_NON_RATTACHE"];

function Icone({ type }: { type: TypeNotification }) {
  if (ALERTES.includes(type)) return <IconeAlerte size={17} />;
  if (type === "SEMAINE_A_VALIDER" || type === "CONGE_DEMANDE" || type === "JUSTIFICATIF_DEPOSE") return <IconeHorloge size={17} />;
  return <IconeInfo size={17} />;
}

export function ListeNotifications({ notifications, pourAdmins, fuseau, compact = false }: { notifications: Notification[]; pourAdmins: boolean; fuseau: string; compact?: boolean }) {
  const nonLues = notifications.filter((n) => !n.luLe).length;
  if (!notifications.length)
    return (
      <p className="py-4 text-sm" style={{ color: "var(--muted)" }}>
        Aucune notification.
      </p>
    );
  return (
    <div>
      {!compact && nonLues > 0 && (
        <div className="mb-3 flex justify-end">
          <BoutonAction action={marquerNotificationsLues.bind(null, pourAdmins)}>Tout marquer comme lu</BoutonAction>
        </div>
      )}
      <ul className="flex flex-col">
        {notifications.map((n) => (
          <li key={n.id} className="flex gap-3 py-3" style={{ borderTop: "1px solid var(--line-portal)" }}>
            <span className="mt-0.5" style={{ color: ALERTES.includes(n.type) ? "var(--warn-ink)" : "var(--info-ink)" }}>
              <Icone type={n.type} />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className={n.luLe ? "font-semibold" : "font-extrabold"}>
                  {n.titre}
                  {!n.luLe && (
                    <span className="pastille pastille-info ml-2 py-0.5 text-[10px]" aria-label="non lue">
                      nouveau
                    </span>
                  )}
                </span>
                <span className="text-[12px]" style={{ color: "var(--faint)" }}>
                  {frDateHeure(n.createdAt, fuseau)}
                </span>
              </div>
              <p className="mt-0.5" style={{ color: "var(--muted)" }}>
                {n.message}
              </p>
              {n.lien && (
                <Link href={n.lien} className="mt-1 inline-block text-[13px] font-semibold underline" style={{ color: "var(--navy)" }}>
                  Ouvrir
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
