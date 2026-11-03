import { getFirebaseClient } from "./firebase-client.js";
import { cloudConfig } from "./cloud-config.js";
import { isApprovedSubmission } from "./submission-model.js";

// Read-only wall: never writes testMessages or bypasses submission moderation.
const status = document.getElementById("sync-status");
const seen = new Map();
let unsubscribe;
let usingIndexFallback = false;
try {
  if (new URLSearchParams(location.search).has("demo")) throw new Error("示範模式不連線 Firebase");
  status.textContent = "正在確認 Firebase 登入…";
  const { db, firestore } = await getFirebaseClient();
  status.textContent = "Firebase 已登入，正在查詢 stories…";
  console.info("[留言牆] Firebase 已登入；查詢 stories：isPublic=true、moderationStatus=approved、limit=50");
  const { collection, query, where, orderBy, limit, onSnapshot } = firestore;
  const approvedQuery = query(collection(db, cloudConfig.collection),
    where("isPublic", "==", true), where("moderationStatus", "==", "approved"),
    orderBy("createdAt", "desc"), limit(50));
  const receiveSnapshot = snapshot => {
    if (snapshot.metadata.fromCache) {
      // An old offline cache is not evidence that an approval is still valid.
      window.mistyBoard.clearPublic(); seen.clear();
      status.textContent = "正在等待伺服器確認已審核投稿…";
      return;
    }
    const allowed = snapshot.docs.filter(item => isApprovedSubmission({ ...item.data(), story: typeof item.data().story === "string" ? item.data().story : "" }));
    console.info("[留言牆] 伺服器查詢筆數", snapshot.size, "符合顯示格式", allowed.length);
    for (const item of snapshot.docs) {
      if (!isApprovedSubmission({ ...item.data(), story: typeof item.data().story === "string" ? item.data().story : "" })) console.warn("[留言牆] 投稿顯示格式不符：請確認 shortMessage、story 與 Cloudinary imageUrl", item.id);
    }
    const ids = new Set(allowed.map(item => item.id));
    for (const id of seen.keys()) {
      if (!ids.has(id)) { window.mistyBoard.remove(id); seen.delete(id); }
    }
    const seconds = item => item.data().createdAt?.toMillis?.() ?? 0;
    const ordered = [...allowed].sort((a, b) => seconds(a) - seconds(b) || a.id.localeCompare(b.id));
    for (const item of ordered) {
      const data = item.data();
      const signature = JSON.stringify([data.imageUrl, data.shortMessage, data.story]);
      if (seen.get(item.id) === signature) continue;
      if (seen.has(item.id)) window.mistyBoard.remove(item.id);
      if (window.mistyBoard.receive(data, item.id)) seen.set(item.id, signature);
    }
    status.textContent = `Firebase 已連線，${allowed.length} 筆已審核公開投稿（查詢 ${snapshot.size ?? snapshot.docs.length} 筆）`
      + (usingIndexFallback ? "；暫用無排序索引查詢，本機排序最多 50 筆。" : "");
  };
  const receiveError = error => {
    window.mistyBoard.clearPublic(); seen.clear();
    if (error.code === "failed-precondition" && !usingIndexFallback) {
      usingIndexFallback = true;
      console.warn("[留言牆] 排序索引未就緒，改用相同公開審核條件查詢；最多 50 筆，不保證全庫最新 50 筆。", error.message);
      status.textContent = "排序索引未就緒，正在改用核准公開查詢…";
      const fallbackQuery = query(collection(db, cloudConfig.collection),
        where("isPublic", "==", true), where("moderationStatus", "==", "approved"), limit(50));
      unsubscribe = onSnapshot(fallbackQuery, { includeMetadataChanges: true }, receiveSnapshot, receiveError);
      return;
    }
    status.textContent = error.code === "failed-precondition"
      ? "留言牆尚缺查詢索引，請展方依設定說明完成。"
      : `無法讀取已審核投稿：${error.code || "連線失敗"}`;
    const debug = document.getElementById("sync-debug");
    if (debug) debug.textContent = error.message;
    console.error("留言牆同步未完成", error.code, error.message);
  };
  unsubscribe = onSnapshot(approvedQuery, { includeMetadataChanges: true }, receiveSnapshot, receiveError);
} catch (error) {
  window.mistyBoard.clearPublic();
  status.textContent = `留言牆尚未連線：${error.code || error.message}`;
  console.error("[留言牆] 登入或初始化失敗", error.code, error.message);
}
window.addEventListener("pagehide", () => unsubscribe?.(), { once: true });
window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
