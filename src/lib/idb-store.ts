// Search results are too large for localStorage's quota, so they're kept in IndexedDB.
const DB_NAME = 'road-to-bis';
const STORE = 'kv';

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const transact = async <T,>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
};

export const idbGet = <T,>(key: string) => transact<T | undefined>('readonly', (s) => s.get(key));
export const idbSet = (key: string, value: unknown) => transact('readwrite', (s) => s.put(value, key));
