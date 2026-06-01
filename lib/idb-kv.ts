// ────────────────────────────────────────────────────────────────────────────
// MINIMAL INDEXEDDB KEY/VALUE WRAPPER
//
// Why this exists (not an external dep):
//   • localStorage has a hard ~5MB quota per origin. Our mockup history (base64
//     mockup JPEGs) blows past that and writes silently fail, which is the
//     root cause of the "history disappears" bug.
//   • IndexedDB has no practical limit on modern browsers (~50MB minimum
//     before prompts, often hundreds of MB or unlimited).
//
// Public API: idbGet / idbSet / idbDel — all promise-based.
// All operations are no-ops on the server (typeof indexedDB === "undefined").
// ────────────────────────────────────────────────────────────────────────────

const DB_NAME = "novaprintlab";
const STORE = "kv";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB not available"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        // Reset so a future call can retry after recovery
        dbPromise = null;
        reject(req.error);
      };
      req.onblocked = () => {
        dbPromise = null;
        reject(new Error("IndexedDB upgrade blocked"));
      };
    });
  }
  return dbPromise;
}

export async function idbGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[idb] get failed:", err);
    return null;
  }
}

export async function idbSet(key: string, value: unknown): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch (err) {
    console.warn("[idb] set failed:", err);
    return false;
  }
}

export async function idbDel(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[idb] del failed:", err);
  }
}
