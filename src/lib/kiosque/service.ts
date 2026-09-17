/**
 * Cœur du kiosque : pointage en ligne avec bascule automatique sur la file hors ligne,
 * resynchronisation (retour réseau + toutes les 60 s, retry exponentiel), heartbeat toutes
 * les 5 min (offset d'horloge, liste des salariés).
 */
import { api, ErreurReseau } from "./api";
import { estEnLigne, natif } from "./natif";
import { ecrireMeta, idb, lireMeta } from "./stockage";
import {
  TYPE_SUIVANT,
  type ConfigTerminal,
  type DernierPointageCache,
  type ElementFile,
  type EtatReseau,
  type ResultatLocal,
  type SalarieCache,
  type TypePointage,
  type VerificateurCache,
} from "./types";
import { calculerVerificateur } from "./verif";

const INTERVALLE_SYNCHRO_MS = 60_000;
const INTERVALLE_HEARTBEAT_MS = 5 * 60_000;
const MAX_ECHECS_LOCAUX = 5;
const VERROU_LOCAL_MS = 15 * 60_000;
const AMPLITUDE_MAX_MS = 13 * 3600_000;

type EchecsLocaux = { n: number; jusqua: number | null };

export class ServiceKiosque {
  private offsetMs = 0;
  private derniereSynchro: string | null = null;
  private synchroEnCours = false;
  private backoffMs = 2000;
  private timers: number[] = [];
  private enAttente = 0;
  private versionApp: string | null = null;
  private cacheSalariesRempli = false;

  constructor(
    private readonly config: ConfigTerminal,
    private readonly onEtat: (etat: EtatReseau) => void,
  ) {
    try {
      this.versionApp = natif()?.getAppVersion() ?? null;
    } catch {
      this.versionApp = null;
    }
  }

  async demarrer(): Promise<void> {
    this.offsetMs = (await lireMeta<number>("offset_ms")) ?? 0;
    this.derniereSynchro = (await lireMeta<string>("derniere_synchro")) ?? null;
    this.enAttente = await idb.compter("file");
    this.cacheSalariesRempli = (await idb.compter("salaries")) > 0;
    this.publier();

    window.addEventListener("online", this.surRetourReseau);
    this.timers.push(window.setInterval(() => void this.synchroniser(), INTERVALLE_SYNCHRO_MS));
    this.timers.push(window.setInterval(() => void this.heartbeat(), INTERVALLE_HEARTBEAT_MS));
    void this.heartbeat().then(() => this.synchroniser());
  }

  arreter(): void {
    window.removeEventListener("online", this.surRetourReseau);
    for (const t of this.timers) window.clearInterval(t);
    this.timers = [];
  }

  private surRetourReseau = () => {
    this.backoffMs = 2000;
    void this.heartbeat().then(() => this.synchroniser());
  };

  etat(): EtatReseau {
    return { enLigne: estEnLigne(), enAttente: this.enAttente, derniereSynchro: this.derniereSynchro, offsetMs: this.offsetMs, synchroEnCours: this.synchroEnCours };
  }

  private publier() {
    this.onEtat(this.etat());
  }

  /** Heure réelle estimée (horloge tablette corrigée de l'offset). */
  maintenantCorrige(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  async heartbeat(): Promise<void> {
    if (!estEnLigne()) return;
    try {
      const t0 = Date.now();
      const { status, corps } = await api.heartbeat(this.config.token, this.versionApp);
      const t1 = Date.now();
      if (status === 401) {
        window.dispatchEvent(new CustomEvent("kipointe:desappaire"));
        return;
      }
      if (status !== 200 || !corps.horloge_serveur) return;
      const serveur = Date.parse(corps.horloge_serveur);
      this.offsetMs = Math.round(serveur - (t0 + (t1 - t0) / 2));
      await ecrireMeta("offset_ms", this.offsetMs);
      await this.rafraichirSalaries();
      this.publier();
    } catch {
      /* hors ligne : on garde le dernier offset connu */
    }
  }

  private async rafraichirSalaries(): Promise<void> {
    const { status, corps } = await api.salaries(this.config.token);
    if (status !== 200 || !corps.salaries) return;
    const anciens = await idb.tout<SalarieCache>("salaries");
    const nouveaux = new Map(corps.salaries.map((s) => [s.badge_uuid, s]));
    for (const a of anciens) {
      const n = nouveaux.get(a.badge_uuid);
      if (!n) {
        await idb.supprimer("salaries", a.badge_uuid);
        await idb.supprimer("verificateurs", a.badge_uuid);
      } else if (n.pin_version !== a.pin_version) {
        await idb.supprimer("verificateurs", a.badge_uuid);
      }
    }
    for (const s of corps.salaries) await idb.mettre("salaries", s);
    this.cacheSalariesRempli = corps.salaries.length > 0;
  }

  async resoudreBadge(badgeUuid: string): Promise<{ prenom: string | null; inconnu: boolean }> {
    const s = await idb.lire<SalarieCache>("salaries", badgeUuid);
    if (s) return { prenom: s.prenom, inconnu: false };
    // Cache rempli et badge absent : inconnu (ou régénéré depuis la dernière synchro).
    return { prenom: null, inconnu: this.cacheSalariesRempli && !estEnLigne() };
  }

  private async memoriserDernier(badgeUuid: string, type: TypePointage, horodatage: Date) {
    await idb.mettre<DernierPointageCache>("derniers", { badge_uuid: badgeUuid, type, horodatage: horodatage.toISOString() });
  }

  private async typeEstime(badgeUuid: string, horodatage: Date): Promise<TypePointage> {
    const d = await idb.lire<DernierPointageCache>("derniers", badgeUuid);
    if (!d) return "ENTREE";
    const ecart = horodatage.getTime() - Date.parse(d.horodatage);
    return ecart >= 0 && ecart < AMPLITUDE_MAX_MS ? TYPE_SUIVANT[d.type] : "ENTREE";
  }

  async pointer(badgeUuid: string, pin: string, prenom: string | null): Promise<ResultatLocal> {
    const maintenant = new Date();
    const item: ElementFile = {
      idempotency_key: crypto.randomUUID(),
      badge_uuid: badgeUuid,
      pin,
      horodatage_terminal: maintenant.toISOString(),
      offset_horloge_ms: this.offsetMs,
      prenom,
      type_estime: null,
      cree_le: maintenant.toISOString(),
      tentatives: 0,
    };

    if (estEnLigne()) {
      try {
        const { corps } = await api.pointer(this.config.token, item);
        if (corps.statut === "OK" || corps.statut === "REJOUE") {
          await this.surSucces(corps);
          await this.resetEchecsLocaux(badgeUuid);
          return { ok: true, type: corps.pointage.type, horodatage: new Date(corps.pointage.horodatage), totalJourMinutes: corps.total_jour_minutes, horsLigne: false, prenom: corps.salarie.prenom };
        }
        if (corps.statut === "ERREUR") {
          return { ok: false, code: corps.erreur.code, message: corps.erreur.message, detail: corps.erreur.detail, conserverBadge: corps.erreur.code === "PIN_INCORRECT" };
        }
        return { ok: false, code: "REPONSE_INATTENDUE", message: "Réponse inattendue du serveur.", conserverBadge: false };
      } catch (err) {
        if (!(err instanceof ErreurReseau)) throw err;
        // réseau tombé pendant la requête : on bascule hors ligne
      }
    }

    // ─── Hors ligne ───
    const verrou = await this.echecsLocaux(badgeUuid);
    if (verrou.jusqua && verrou.jusqua > Date.now()) {
      return { ok: false, code: "BADGE_VERROUILLE", message: "Badge verrouillé : voir le gérant.", conserverBadge: false };
    }
    const v = await idb.lire<VerificateurCache>("verificateurs", badgeUuid);
    const s = await idb.lire<SalarieCache>("salaries", badgeUuid);
    if (v && s && v.pin_version === s.pin_version) {
      const calcule = await calculerVerificateur(this.config.token, badgeUuid, s.pin_version, pin);
      if (calcule !== v.verificateur) {
        const n = verrou.n + 1;
        if (n >= MAX_ECHECS_LOCAUX) {
          await ecrireMeta<EchecsLocaux>(`echecs:${badgeUuid}`, { n: 0, jusqua: Date.now() + VERROU_LOCAL_MS });
          return { ok: false, code: "BADGE_VERROUILLE", message: "5 codes erronés : badge verrouillé 15 minutes.", conserverBadge: false };
        }
        await ecrireMeta<EchecsLocaux>(`echecs:${badgeUuid}`, { n, jusqua: null });
        return { ok: false, code: "PIN_INCORRECT", message: "Code incorrect.", detail: { tentativesRestantes: MAX_ECHECS_LOCAUX - n }, conserverBadge: true };
      }
      await this.resetEchecsLocaux(badgeUuid);
    }
    const horodatageReel = new Date(maintenant.getTime() + this.offsetMs);
    item.type_estime = await this.typeEstime(badgeUuid, horodatageReel);
    await idb.mettre("file", item);
    await this.memoriserDernier(badgeUuid, item.type_estime, horodatageReel);
    this.enAttente = await idb.compter("file");
    this.publier();
    return { ok: true, type: item.type_estime, horodatage: horodatageReel, totalJourMinutes: null, horsLigne: true, prenom: prenom ?? s?.prenom ?? null };
  }

  private async surSucces(corps: Extract<Awaited<ReturnType<typeof api.pointer>>["corps"], { statut: "OK" | "REJOUE" }>) {
    if (corps.verificateur_hors_ligne) {
      await idb.mettre<VerificateurCache>("verificateurs", { badge_uuid: corps.salarie.badge_uuid, pin_version: corps.salarie.pin_version, verificateur: corps.verificateur_hors_ligne });
    }
    await idb.mettre<SalarieCache>("salaries", { badge_uuid: corps.salarie.badge_uuid, prenom: corps.salarie.prenom, pin_version: corps.salarie.pin_version });
    this.cacheSalariesRempli = true;
    await this.memoriserDernier(corps.salarie.badge_uuid, corps.pointage.type, new Date(corps.pointage.horodatage));
  }

  private async echecsLocaux(badgeUuid: string): Promise<EchecsLocaux> {
    return (await lireMeta<EchecsLocaux>(`echecs:${badgeUuid}`)) ?? { n: 0, jusqua: null };
  }

  private async resetEchecsLocaux(badgeUuid: string) {
    await ecrireMeta<EchecsLocaux>(`echecs:${badgeUuid}`, { n: 0, jusqua: null });
  }

  /** Rejoue la file hors ligne. Retourne le nombre d'éléments restant en attente. */
  async synchroniser(): Promise<number> {
    if (this.synchroEnCours) return this.enAttente;
    const file = (await idb.tout<ElementFile>("file")).sort((a, b) => a.horodatage_terminal.localeCompare(b.horodatage_terminal));
    this.enAttente = file.length;
    if (file.length === 0 || !estEnLigne()) {
      this.publier();
      return file.length;
    }
    this.synchroEnCours = true;
    this.publier();
    try {
      for (let i = 0; i < file.length; i += 100) {
        const lot = file.slice(i, i + 100);
        const { status, corps } = await api.lot(this.config.token, lot, this.versionApp);
        if (status === 401) {
          window.dispatchEvent(new CustomEvent("kipointe:desappaire"));
          break;
        }
        if (status !== 200 || !corps.resultats) throw new ErreurReseau(`HTTP ${status}`);
        for (const r of corps.resultats) {
          if (r.statut === "ERREUR") {
            console.warn("[kiosque] pointage hors ligne rejeté par le serveur", r.idempotency_key, r.erreur);
          } else {
            await this.surSucces(r);
          }
          await idb.supprimer("file", r.idempotency_key);
        }
      }
      this.backoffMs = 2000;
      this.derniereSynchro = new Date().toISOString();
      await ecrireMeta("derniere_synchro", this.derniereSynchro);
    } catch (err) {
      if (!(err instanceof ErreurReseau)) console.error("[kiosque] synchronisation", err);
      const delai = this.backoffMs;
      this.backoffMs = Math.min(this.backoffMs * 2, 60_000);
      window.setTimeout(() => void this.synchroniser(), delai);
    } finally {
      this.synchroEnCours = false;
      this.enAttente = await idb.compter("file");
      this.publier();
    }
    return this.enAttente;
  }
}
