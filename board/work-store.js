// Separate from the camera database, so photo handoff and existing pages are unchanged.
export const WORK_DB = "MistyHumidityWorks";

function openWorks() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WORK_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("works", { keyPath: "id" });
      request.result.createObjectStore("drafts", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("請關閉此作品的其他分頁，再試一次。"));
  });
}

async function transact(stores, mode, action) {
  const db = await openWorks();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, mode);
    let request;
    transaction.oncomplete = () => { db.close(); resolve(request?.result); };
    transaction.onabort = transaction.onerror = () => {
      db.close(); reject(transaction.error || new Error("無法儲存至此瀏覽器。"));
    };
    try { request = action(transaction); }
    catch (error) { transaction.abort(); reject(error); }
  });
}

export const loadWork = id => transact(["works"], "readonly", t => t.objectStore("works").get(id));
export const loadDraft = id => transact(["drafts"], "readonly", t => t.objectStore("drafts").get(id));
export const saveDraft = draft => transact(["drafts"], "readwrite", t => t.objectStore("drafts").put(draft));

export function saveWork(work, { complete = false } = {}) {
  // Commit the photo, both texts and PNG together. Reuse the camera's unique ID
  // on retries/edits; downloading never calls this function.
  return transact(["works", "drafts"], "readwrite", transaction => {
    const request = transaction.objectStore("works").put(work);
    if (complete) transaction.objectStore("drafts").delete(work.id);
    return request;
  });
}
