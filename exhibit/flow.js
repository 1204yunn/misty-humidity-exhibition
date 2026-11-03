import { saveWork, loadWork } from '../board/work-store.js';
import { publishExhibit } from './publisher.js';
import { exhibitConfig } from './config.js';
import { createPublisher } from '../board/work-publisher.js';
const publishPending = createPublisher({ exhibit: true });
const pendingKey = 'misty-exhibit-pending-v1';
export async function publishExhibitPhoto(photo, { id, publicConsent }) {
  if (!id || publicConsent !== true) throw new Error('必須先確認照片公開同意');
  const prior = await loadWork(id);
  const work = { ...prior, id, photoId: id, schemaVersion: 2, source: 'exhibit',
    photoBlob: photo.blob, artworkBlob: photo.blob, photoWidth: photo.width, photoHeight: photo.height,
    message: '', story: '', publicConsent: true, visibility: 'public', status: 'pending-exhibit',
    createdAt: prior?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  await saveWork(work);
  localStorage.setItem(pendingKey, id);
  // A confirmed retry is also verified by the server's idempotent receipt.
  let receipt;
  if (exhibitConfig.enabled) receipt = await publishExhibit(photo, { id, publicConsent });
  else {
    if (!exhibitConfig.pendingEnabled) throw new Error('展場上傳尚未啟用：請先確認 Firestore 展場 pending Rules，或設定授權發布後端');
    receipt = await publishPending(work, { onCheckpoint: async state => { work.cloudState=state; await saveWork(work); } });
  }
  if (!['pending', 'approved'].includes(receipt.moderationStatus)) throw new Error('Submission was not accepted; contact staff');
  work.status = 'published'; work.moderationStatus = receipt.moderationStatus; work.cloudReceipt = receipt;
  work.updatedAt = new Date().toISOString();
  await saveWork(work, { complete: true });
  if (localStorage.getItem(pendingKey) === id) localStorage.removeItem(pendingKey);
  return receipt;
}
export async function restoreExhibitPhoto() {
  const id = localStorage.getItem(pendingKey);
  if (!id) return null;
  const work = await loadWork(id);
  if (!work || work.source !== 'exhibit' || work.status === 'published') { localStorage.removeItem(pendingKey); return null; }
  return { id, photo: { blob: work.photoBlob, width: work.photoWidth, height: work.photoHeight } };
}
export function discardExhibitDraft(id) {
  if (localStorage.getItem(pendingKey) === id) localStorage.removeItem(pendingKey);
  // Retaking never deletes an uploaded image or an existing archived record.
}