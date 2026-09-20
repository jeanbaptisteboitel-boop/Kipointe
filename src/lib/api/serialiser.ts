import type { Anomalie, Etablissement, RecapHebdo, Salarie, Terminal } from "@/db/schema";
import type { PointageEffectif } from "@/lib/calcul/effectifs";

/** Jamais de `pinHash` ni de secret dans les réponses API. */
export function salarieVersApi(s: Salarie, maintenant = new Date()) {
  return {
    id: s.id,
    nom: s.nom,
    prenom: s.prenom,
    matricule: s.matricule,
    email: s.email,
    etablissement_id: s.etablissementDefautId,
    badge_uuid: s.badgeUuid,
    badge_contenu: `BADGE:${s.badgeUuid}`,
    pin_version: s.pinVersion,
    pin_echecs: s.pinEchecs,
    verrouille_jusqua: s.pinVerrouilleJusqua && s.pinVerrouilleJusqua > maintenant ? s.pinVerrouilleJusqua.toISOString() : null,
    contrat_heures_hebdo: s.contratHeuresHebdo,
    date_entree: s.dateEntree,
    date_sortie: s.dateSortie,
    actif: s.actif,
    created_at: s.createdAt.toISOString(),
  };
}

export function terminalVersApi(t: Terminal) {
  return {
    id: t.id,
    libelle: t.libelle,
    etablissement_id: t.etablissementId,
    appaire: !!t.tokenHash,
    appaire_le: t.appaireLe?.toISOString() ?? null,
    code_appairage_en_cours: !!t.codeAppairageHash && !!t.codeAppairageExpireLe && t.codeAppairageExpireLe > new Date(),
    code_appairage_expire_le: t.codeAppairageExpireLe?.toISOString() ?? null,
    derniere_synchro: t.derniereSynchro?.toISOString() ?? null,
    version_app: t.versionApp,
    identifiant_materiel: t.identifiantMateriel,
    actif: t.actif,
  };
}

export function etablissementVersApi(e: Etablissement) {
  return { id: e.id, libelle: e.libelle, adresse: e.adresse, timezone: e.timezone, actif: e.actif };
}

export function recapVersApi(r: RecapHebdo) {
  return {
    id: r.id,
    salarie_id: r.salarieId,
    annee: r.annee,
    semaine_iso: r.semaineIso,
    total_minutes: r.totalMinutes,
    heures_sup_25: r.heuresSup25,
    heures_sup_50: r.heuresSup50,
    heures_sup_detail: r.heuresSupDetail,
    detail_jours: r.detailJours,
    valide_le: r.valideLe?.toISOString() ?? null,
    valide_par_id: r.valideParId,
    hash_sha256: r.hashSha256,
    pdf_disponible: !!r.pdfObjectKey,
  };
}

export function anomalieVersApi(a: Anomalie & { salarie?: { nom: string; prenom: string } | null }) {
  return {
    id: a.id,
    salarie_id: a.salarieId,
    salarie: a.salarie ? { nom: a.salarie.nom, prenom: a.salarie.prenom } : null,
    date_jour: a.dateJour,
    type: a.type,
    statut: a.statut,
    detail: a.detail,
    created_at: a.createdAt.toISOString(),
  };
}

export function pointageEffectifVersApi(p: PointageEffectif) {
  return {
    id: p.id,
    salarie_id: p.salarieId,
    horodatage: p.horodatage.toISOString(),
    type: p.type,
    source: p.source,
    corrige: p.corrige,
    motif: p.motif,
    original: { horodatage: p.original.horodatage.toISOString(), type: p.original.type },
  };
}
