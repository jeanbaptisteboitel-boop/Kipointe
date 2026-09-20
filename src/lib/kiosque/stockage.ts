/**
 * Persistance locale du kiosque : IndexedDB (file hors ligne, caches) et localStorage (config terminal).
 */
import type { ConfigTerminal } from "./types";

const NOM_DB = "kipointe";
const VERSION_DB = 1;
export const CLE_CONFIG = "kipointe.terminal";

export type NomStore = "file" | "salaries" | "verificateurs" | "derniers" | "meta";
const STORES: Record<NomStore, string> = {
  file: "idempotency_key",
  salaries: "badge_uuid",
  verificateurs: "badge_uuid",
  derniers: "badge_uuid",
  meta: "cle",
};

let dbPromesse: Promise<IDBDatabase> | null = null;

export function ouvrirDb(): Promise<IDBDatabase> {
  if (dbPromesse) return dbPromesse;
  dbPromesse = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOM_DB, VERSION_DB);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [nom, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(nom)) db.createObjectStore(nom, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromesse;
}

function requete<T>(store: NomStore, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return ouvrirDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const r = fn(tx.objectStore(store));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

export const idb = {
  mettre: <T>(store: NomStore, valeur: T) => requete(store, "readwrite", (s) => s.put(valeur)),
  lire: <T>(store: NomStore, cle: IDBValidKey) => requete<T | undefined>(store, "readonly", (s) => s.get(cle) as IDBRequest<T | undefined>),
  tout: <T>(store: NomStore) => requete<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>),
  compter: (store: NomStore) => requete<number>(store, "readonly", (s) => s.count()),
  supprimer: (store: NomStore, cle: IDBValidKey) => requete(store, "readwrite", (s) => s.delete(cle)),
  vider: (store: NomStore) => requete(store, "readwrite", (s) => s.clear()),
};

export async function lireMeta<T>(cle: string): Promise<T | undefined> {
  const r = await idb.lire<{ cle: string; valeur: T }>("meta", cle);
  return r?.valeur;
}

export function ecrireMeta<T>(cle: string, valeur: T): Promise<unknown> {
  return idb.mettre("meta", { cle, valeur });
}

export function lireConfig(): ConfigTerminal | null {
  try {
    const brut = localStorage.getItem(CLE_CONFIG);
    return brut ? (JSON.parse(brut) as ConfigTerminal) : null;
  } catch {
    return null;
  }
}

export function ecrireConfig(config: ConfigTerminal | null): void {
  if (config) localStorage.setItem(CLE_CONFIG, JSON.stringify(config));
  else localStorage.removeItem(CLE_CONFIG);
}

/** Efface toutes les données locales (désappairage). */
export async function toutEffacer(): Promise<void> {
  ecrireConfig(null);
  for (const store of Object.keys(STORES) as NomStore[]) await idb.vider(store);
}
