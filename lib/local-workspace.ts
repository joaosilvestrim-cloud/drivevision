import type { Source, SavedDashboard } from "./analytics";
export type Workspace = {
  version: 1;
  sources: Source[];
  dashboards: SavedDashboard[];
};
const EMPTY: Workspace = { version: 1, sources: [], dashboards: [] };
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("drivedata-assist", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("workspace");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () =>
      reject(new Error("Feche outras abas da plataforma e tente novamente."));
  });
}
export async function loadWorkspace(): Promise<Workspace> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const req = db
        .transaction("workspace", "readonly")
        .objectStore("workspace")
        .get("v1");
      req.onsuccess = () => {
        const data = req.result;
        if (
          data &&
          (data.version !== 1 ||
            !Array.isArray(data.sources) ||
            !Array.isArray(data.dashboards))
        ) {
          reject(new Error("O workspace salvo não pôde ser reconhecido."));
          return;
        }
        resolve(data || EMPTY);
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function saveWorkspace(data: Workspace) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("workspace", "readwrite");
      tx.objectStore("workspace").put(data, "v1");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || new Error("Não foi possível salvar."));
    });
  } finally {
    db.close();
  }
}
