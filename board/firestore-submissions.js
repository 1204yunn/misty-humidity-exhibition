import { cloudConfig } from "./cloud-config.js";
import { sameSubmission } from "./submission-model.js";

export async function readSubmission(session, submissionId) {
  const { doc, getDocFromServer } = session.firestore;
  const snapshot = await getDocFromServer(doc(session.db, cloudConfig.collection, submissionId));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function commitPending(session, submissionId, data) {
  const { doc, runTransaction, serverTimestamp, getDocFromServer } = session.firestore;
  const reference = doc(session.db, cloudConfig.collection, submissionId);
  await runTransaction(session.db, async transaction => {
    const current = await transaction.get(reference);
    if (current.exists()) {
      if (!sameSubmission(current.data(), data)) throw new Error("既有投稿內容不同，無法覆寫。");
      return; // Ambiguous previous commit: do not create a second document or reset moderation.
    }
    transaction.set(reference, { ...data, moderationStatus: "pending", createdAt: serverTimestamp() });
  });
  // A cached/offline queued write is not a successful receipt.
  const confirmed = await getDocFromServer(reference);
  if (!confirmed.exists() || !sameSubmission(confirmed.data(), data)
    || !confirmed.data().createdAt) throw new Error("尚未收到投稿儲存確認。");
  return confirmed.data();
}
