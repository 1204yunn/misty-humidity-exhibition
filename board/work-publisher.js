import { cloudConfig } from "./cloud-config.js";
import { validateTexts, isCloudinaryImageUrl } from "./submission-model.js";
import { compressPhoto, sha256, MAX_UPLOAD_BYTES } from "./upload-image.js";

export const publicationAvailable = cloudConfig.controlledTestEnabled
  && cloudConfig.firestoreRulesReviewed && cloudConfig.testerUids.length > 0;

function bounded(promise, milliseconds = 45000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("公開連線逾時，請保留內容並稍後重試。")), milliseconds);
  })]).finally(() => clearTimeout(timer));
}

function validAsset(asset, expectedId, config, prepared) {
  return asset && asset.publicId === expectedId && isCloudinaryImageUrl(asset.imageUrl, config.cloudName)
    && new RegExp(`/${expectedId}\\.jpe?g$`).test(new URL(asset.imageUrl).pathname)
    && asset.width === prepared.width && asset.height === prepared.height
    && Number.isInteger(asset.bytes) && asset.bytes > 0 && asset.bytes <= MAX_UPLOAD_BYTES;
}

async function uploadImage(prepared, publicId, config, fetcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const body = new FormData();
    body.append("file", prepared.blob, "moment.jpg");
    body.append("upload_preset", config.uploadPreset);
    // Unsigned overwrites are always false. A deterministic ID avoids new assets
    // after lost responses; preset must allow explicit public IDs during testing.
    body.append("public_id", publicId);
    const response = await fetcher(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
      method: "POST", body, signal: controller.signal, credentials: "omit", redirect: "error",
    });
    if (!response.ok) throw new Error(`照片上傳未完成（HTTP ${response.status}），請稍後重試。`);
    const data = await response.json();
    let asset = { imageUrl: data.secure_url, publicId: data.public_id,
      width: data.width, height: data.height, bytes: data.bytes };
    if (data.existing === true && (!validAsset(asset, publicId, config, prepared)
      || data.resource_type !== "image" || !["jpg", "jpeg"].includes(data.format))) {
      // A duplicate response may contain only existing:true. Verify the exact
      // deterministic delivery image instead of pretending an upload succeeded.
      const imageUrl = `https://res.cloudinary.com/${config.cloudName}/image/upload/${publicId}.jpg`;
      const delivery = await fetcher(imageUrl, { signal: controller.signal, credentials: "omit", redirect: "error" });
      if (!delivery.ok || !delivery.headers.get("content-type")?.startsWith("image/jpeg")) throw new Error("無法確認先前上傳的照片，請保留作品並聯絡展方。");
      const blob = await delivery.blob();
      if (blob.size > MAX_UPLOAD_BYTES) throw new Error("先前照片超過上傳限制。");
      const image = await createImageBitmap(blob);
      asset = { imageUrl, publicId, width: image.width, height: image.height, bytes: blob.size };
      image.close();
    } else if (data.resource_type !== "image" || !["jpg", "jpeg"].includes(data.format)) {
      throw new Error("上傳服務沒有回傳有效的 JPEG 照片。");
    }
    if (!validAsset(asset, publicId, config, prepared)) throw new Error("上傳照片的網址或尺寸未通過檢查，尚未提交作品。");
    return asset;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("照片上傳逾時，請保留內容並重試。");
    throw error;
  } finally { clearTimeout(timer); }
}

const defaults = {
  async getSession() { return (await import("./firebase-client.js")).getFirebaseClient(); },
  async read(session, id) { return (await import("./firestore-submissions.js")).readSubmission(session, id); },
  async commit(session, id, data) { return (await import("./firestore-submissions.js")).commitPending(session, id, data); },
  compress: compressPhoto, hash: sha256,
  fetcher: (...args) => fetch(...args),
};

// Dependency injection is only for offline tests; production uses the config and
// the real Cloudinary endpoint/Firebase adapter above, never another image service.
export function createPublisher({ config = cloudConfig, exhibit = false, ...overrides } = {}) {
  const deps = { ...defaults, ...overrides };
  return async function publish(work, { onCheckpoint = async () => {} } = {}) {
    if (work.publicConsent !== true) throw new Error("未同意公開，作品只可留在此裝置。");
    if (!config.controlledTestEnabled || !config.firestoreRulesReviewed || !config.testerUids.length) {
      throw new Error("目前尚無法公開，請展方先確認受控測試設定。");
    }
    if (exhibit) {
      if (work.source !== 'exhibit' || work.message !== '' || work.story !== '') throw new Error('Invalid exhibit text');
    } else validateTexts(work.message, work.story);
    // The proposed Firestore rules use conservative Unicode scalar limits.
    // Private drafts keep grapheme counting; a signed backend is needed if the
    // deployed rule must support 12 arbitrarily long combined emoji as 12 units.
    if (Array.from(work.message).length > 12 || Array.from(work.story).length > 80) {
      throw new Error("公開投稿含較多組合符號，請縮短留言或故事；原內容仍會保留。");
    }
    const session = await bounded(deps.getSession());
    const uid = session.user?.uid;
    if (!session.user?.isAnonymous || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)
      || !config.testerUids.includes(uid)) throw new Error("此裝置尚未取得受控測試的投稿許可。");
    const prepared = await deps.compress(work.photoBlob);
    const imageHash = await deps.hash(work.photoBlob);
    const contentHash = await deps.hash(JSON.stringify({ workId: work.id, imageHash,
      shortMessage: work.message, story: work.story, ...(exhibit ? { source: 'exhibit' } : {}) }));
    const submissionId = `${uid}_${contentHash}`;
    const publicId = `misty_${uid}_${imageHash}`;
    const receipt = data => ({ confirmed: true, workId: work.id, submissionId, uid,
      imageUrl: data.imageUrl, moderationStatus: data.moderationStatus, isPublic: data.isPublic });
    const matches = data => (!exhibit || (data?.source === 'exhibit' && data.schemaVersion === 2)) && data?.uid === uid && data.contentHash === contentHash
      && data.imageHash === imageHash && data.imagePublicId === publicId
      && data.shortMessage === work.message && data.story === work.story
      && data.isPublic === true && ["pending", "approved", "rejected"].includes(data.moderationStatus)
      && isCloudinaryImageUrl(data.imageUrl, config.cloudName)
      && new RegExp(`/${publicId}\\.jpe?g$`).test(new URL(data.imageUrl).pathname)
      && !!data.createdAt;
    // Read the server before uploading. Permission/auth failures stop here, so
    // denied read access does not leave a new Cloudinary asset behind.
    const existing = await bounded(deps.read(session, submissionId));
    if (existing) {
      if (!matches(existing)) throw new Error("既有投稿內容與此作品不同，無法覆寫。");
      return receipt(existing);
    }
    let asset = work.cloudState?.uid === uid && work.cloudState?.imageHash === imageHash
      ? work.cloudState.asset : null;
    if (!validAsset(asset, publicId, config, prepared)) asset = await uploadImage(prepared, publicId, config, deps.fetcher);
    const cloudState = { uid, imageHash, submissionId, asset };
    // Persist upload checkpoint BEFORE Firestore; retry can reuse this photo even
    // when the Firestore write or the final receipt fails, including after reload.
    await onCheckpoint(cloudState);
    const data = {
      uid, contentHash, imageHash, imagePublicId: publicId,
      imageUrl: asset.imageUrl, imageWidth: asset.width, imageHeight: asset.height,
      shortMessage: work.message, story: work.story, isPublic: true,
      moderationStatus: "pending", schemaVersion: exhibit ? 2 : 1,
      ...(exhibit ? { source: 'exhibit' } : {}),
    };
    const confirmed = await bounded(deps.commit(session, submissionId, data));
    if (!matches(confirmed)) throw new Error("尚未收到有效的投稿儲存確認，請保留作品並重試。");
    return receipt(confirmed);
  };
}

export const publishWork = createPublisher();
