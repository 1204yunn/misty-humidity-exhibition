import { loadPhoto } from "../interactive/photo-store.js";
import { loadWork, loadDraft, saveWork, saveDraft } from "./work-store.js";
import { publicationAvailable, publishWork } from "./work-publisher.js";

const $ = id => document.getElementById(id);
const form = $("creation-form"), result = $("result");
const message = $("message"), story = $("story"), consent = $("public-consent");
const photo = $("photo-preview");
// Reuse the camera's unique ID for edits/retries instead of creating duplicate works.
const photoId = new URLSearchParams(location.search).get("photoId");
const segmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("zh-Hant", { granularity: "grapheme" }) : null;
const characters = text => segmenter
  ? Array.from(segmenter.segment(text), entry => entry.segment) : Array.from(text);
let photoURL = null, photoBlob = null, artworkURL = null, artworkBlob = null;
let savedWork = null, photoReady = false, submitting = false, downloading = false;
let draftQueue = Promise.resolve();

function editorStatus(text, error = false) {
  $("editor-status").textContent = text;
  $("editor-status").classList.toggle("status-error", error);
}
function updateValidity() {
  const count = characters(message.value).length, storyCount = characters(story.value).length;
  message.setCustomValidity(message.value.trim() ? "" : "請留下一句不全是空白的話。");
  $("character-count").textContent = `${count} / 12`;
  $("story-count").textContent = `${storyCount} / 80`;
  $("submit-button").disabled = submitting || !photoReady || !message.value.trim() || count > 12 || storyCount > 80;
  $("submit-button").textContent = submitting ? "正在讓濕意凝結……" : "讓濕意留下來";
}
function setSubmitting(busy) {
  submitting = busy;
  form.setAttribute("aria-busy", String(busy));
  for (const field of [message, story, consent, $("back-button")]) field.disabled = busy;
  updateValidity();
}
function draftSnapshot() {
  return { id: photoId, message: message.value, story: story.value,
    publicConsent: consent.checked, updatedAt: new Date().toISOString() };
}
function queueDraft() {
  if (!photoId || !photoReady) return Promise.resolve();
  const draft = draftSnapshot();
  // Serialize keystrokes so older writes cannot overwrite newer content.
  draftQueue = draftQueue.catch(() => {}).then(() => saveDraft(draft));
  return draftQueue;
}
function saveEditingDraft() {
  queueDraft().catch(() => {
    if (!submitting) editorStatus("草稿尚未儲存。內容仍在畫面上，請保留此頁，稍後再試。", true);
  });
}
function bindCounter(field, limit) {
  const change = event => {
    if (submitting) return;
    if (!event.isComposing) {
      field.value = characters(field.value.replace(/\r\n?/g, "\n")).slice(0, limit).join("");
      saveEditingDraft();
    }
    updateValidity();
  };
  field.addEventListener("input", change);
  field.addEventListener("compositionend", change);
}
bindCounter(message, 12);
bindCounter(story, 80);
consent.addEventListener("change", () => {
  saveEditingDraft();
  editorStatus(consent.checked && !publicationAvailable
    ? "目前尚無法公開投稿；提交後會保留本機作品，並讓你選擇修改或稍後重試。"
    : "完成後，這個片刻會留在此裝置。未勾選公開就不會上傳。");
});

function prepareDownload(work) {
  if (artworkURL) URL.revokeObjectURL(artworkURL);
  artworkBlob = work.artworkBlob;
  artworkURL = URL.createObjectURL(artworkBlob);
  $("artwork-preview").src = photoURL;
  $("artwork-message").textContent = work.message;
  $("artwork-story").textContent = work.story;
  $("artwork-story").hidden = work.story.length === 0;
  $("download-link").href = artworkURL;
  $("local-download-link").href = artworkURL;
  $("download-link").hidden = true;
  $("save-status").textContent = "";
  $("local-save-status").textContent = "";
}

function showCompleted(work) {
  prepareDownload(work);
  $("local-copy").hidden = true;
  $("completion-status").textContent = work.status === "submitted"
    ? "你的濕意已收到，等待公開"
    : work.status === "published" ? "投稿已通過公開審核，作品也已保存在此裝置。"
      : work.status === "rejected" ? "已收到投稿，但審核未通過。作品仍保存在此裝置。"
        : "本次版本已儲存在此裝置，未進行公開投稿。";
  form.hidden = true;
  result.hidden = false;
  $("back-label").textContent = "修改留言";
  $("back-button").setAttribute("aria-label", "返回修改主要留言與故事");
  $("result-title").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function initialize() {
  $("publication-notice").hidden = publicationAvailable;
  if (!photoId) {
    $("photo-status").textContent = "還沒有擦霧拍攝的照片，請返回互動頁，比出 YA 留下一個片刻。";
    updateValidity();
    return;
  }
  $("photo-status").textContent = "正在載入剛剛拍攝的照片…";
  const [camera, work, draft] = await Promise.allSettled([
    loadPhoto(photoId), loadWork(photoId), loadDraft(photoId),
  ]);
  savedWork = work.status === "fulfilled" ? work.value : null;
  const editingDraft = draft.status === "fulfilled" ? draft.value : null;
  const record = camera.status === "fulfilled" ? camera.value : null;
  photoBlob = record?.blob || savedWork?.photoBlob;
  try {
    if (!(photoBlob instanceof Blob) || !photoBlob.type.startsWith("image/")) throw new Error("Photo not found");
    photoURL = URL.createObjectURL(photoBlob);
    photo.src = photoURL;
    await photo.decode();
    $("photo-frame").style.aspectRatio = `${photo.naturalWidth} / ${photo.naturalHeight}`;
    photo.hidden = false;
    photoReady = true;
    $("photo-placeholder").hidden = true;
    $("photo-status").textContent = "已帶入剛剛拍攝的照片，保留完整比例。";
    const content = editingDraft || savedWork;
    message.value = characters(content?.message || "").slice(0, 12).join("");
    story.value = characters(content?.story || "").slice(0, 80).join("");
    consent.checked = content?.publicConsent === true;
    editorStatus("留下一句話，也可以說說它背後的故事。");
    if (!editingDraft && savedWork?.artworkBlob instanceof Blob && ["local", "submitted", "published", "rejected"].includes(savedWork.status)) {
      showCompleted(savedWork);
    } else if (savedWork?.status === "pending-public") {
      if (savedWork.artworkBlob instanceof Blob) { prepareDownload(savedWork); $("local-copy").hidden = false; }
      editorStatus("作品已保存在此裝置，但尚未公開。你可以保留內容稍後重試，或取消公開同意後儲存。", true);
    }
    if (work.status === "rejected" || draft.status === "rejected") {
      editorStatus("暫時無法讀取本機草稿。照片仍已帶入；儲存時會再試一次，請保留此頁。", true);
    }
  } catch {
    if (photoURL) URL.revokeObjectURL(photoURL);
    photoURL = null;
    photo.removeAttribute("src");
    photo.hidden = true;
    photoReady = false;
    $("photo-status").textContent = "找不到或無法讀取這張照片，請返回擦霧拍照。";
    editorStatus("照片未載入，請返回拍照後再留下故事。", true);
  }
  updateValidity();
}

function wrapText(context, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const character of characters(text)) {
    if (character === "\n") { lines.push(line); line = ""; continue; }
    if (line && context.measureText(line + character).width > maxWidth) { lines.push(line); line = ""; }
    line += character;
  }
  lines.push(line);
  return lines;
}
async function composeArtwork(content) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.font = '44px "Microsoft JhengHei", sans-serif';
  const messageLines = wrapText(context, content.message, 840);
  context.font = '36px "Microsoft JhengHei", sans-serif';
  const storyLines = content.story.length ? wrapText(context, content.story, 840) : [];
  const scale = Math.min(840 / photo.naturalWidth, 1125 / photo.naturalHeight);
  const width = photo.naturalWidth * scale, height = photo.naturalHeight * scale;
  const messageTop = 90 + height + 64;
  const storyTop = messageTop + messageLines.length * 64 + 36;
  canvas.height = Math.ceil((storyLines.length ? storyTop + storyLines.length * 56
    : messageTop + messageLines.length * 64) + 90);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(photo, (1080 - width) / 2, 90, width, height);
  context.fillStyle = "#1d2184";
  context.font = '44px "Microsoft JhengHei", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "top";
  messageLines.forEach((line, index) => context.fillText(line, 540, messageTop + index * 64));
  context.fillStyle = "#626270";
  context.font = '36px "Microsoft JhengHei", sans-serif';
  storyLines.forEach((line, index) => context.fillText(line, 540, storyTop + index * 56));
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("Export failed")), "image/png"));
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (submitting || !photoReady || !message.value.trim()
    || characters(message.value).length > 12 || characters(story.value).length > 80) return;
  const content = draftSnapshot();
  setSubmitting(true);
  $("local-copy").hidden = true;
  editorStatus("正在讓濕意凝結……");
  let locallySaved = false;
  let prepared = false;
  try {
    await queueDraft();
    const png = await composeArtwork(content);
    prepareDownload({ artworkBlob: png, message: content.message, story: content.story });
    prepared = true;
    const now = new Date().toISOString();
    const work = {
      id: photoId, schemaVersion: 1, source: "mobile", photoId, photoBlob,
      photoWidth: photo.naturalWidth, photoHeight: photo.naturalHeight,
      message: content.message, story: content.story, artworkBlob: png,
      publicConsent: content.publicConsent, visibility: "private",
      status: content.publicConsent ? "pending-public" : "local",
      createdAt: savedWork?.createdAt || now, updatedAt: now,
    };
    if (savedWork?.cloudState) work.cloudState = savedWork.cloudState;
    await saveWork(work, { complete: !content.publicConsent });
    savedWork = work;
    locallySaved = true;
    if (content.publicConsent) {
      if (!publicationAvailable) {
        $("local-copy").hidden = false;
        editorStatus("目前尚無法公開。作品已保存在此裝置；你可以稍後按「讓濕意留下來」重試，或取消公開同意後儲存。", true);
        return;
      }
      const receipt = await publishWork(work, { onCheckpoint: async cloudState => {
        work.cloudState = cloudState;
        await saveWork(work);
      } });
      if (receipt?.confirmed !== true || receipt.workId !== work.id) throw new Error("Publication not confirmed");
      work.visibility = "public";
      work.moderationStatus = receipt.moderationStatus || "pending";
      work.status = work.moderationStatus === "approved" ? "published"
        : work.moderationStatus === "rejected" ? "rejected" : "submitted";
      work.cloudReceipt = receipt;
      await saveWork(work, { complete: true });
    }
    showCompleted(work);
  } catch (error) {
    $("local-copy").hidden = !prepared;
    editorStatus(locallySaved
      ? `公開尚未完成，作品已保存在此裝置。${error?.message || "請檢查連線。"} 照片與文字都保留，可下載本機作品，或稍後再按「讓濕意留下來」重試。`
      : error?.name === "QuotaExceededError"
        ? "此瀏覽器的儲存空間不足。照片與文字仍在，請保留此頁，釋出空間後再按「讓濕意留下來」。"
        : "尚未成功儲存。照片與文字仍保留，請保留此頁，再按「讓濕意留下來」重試。", true);
  } finally { setSubmitting(false); }
});

$("back-button").addEventListener("click", async () => {
  if (submitting) return;
  if (!result.hidden) {
    result.hidden = true;
    form.hidden = false;
    $("back-label").textContent = "返回";
    $("back-button").setAttribute("aria-label", "返回擦霧拍照");
    editorStatus("可以修改主要留言與故事；完成後，再讓濕意留下來。");
    saveEditingDraft();
    message.focus();
    return;
  }
  try { await queueDraft(); location.assign("index.html"); }
  catch { editorStatus("草稿尚未儲存，請保留此頁並稍後再試，避免遺失內容。", true); }
});

// Uses the prepared local PNG only, including after a failed public submission.
// Downloading never calls either cloud service or resubmits the work.
function downloadStatus(text) {
  $(result.hidden ? "local-save-status" : "save-status").textContent = text;
}
async function downloadWork() {
  if (downloading || !artworkBlob || !artworkURL) return;
  downloading = true;
  $("save-button").disabled = true;
  try {
    const file = new File([artworkBlob], "有點濕濕的-我的作品.png", { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "有點濕濕的｜我的作品" });
        downloadStatus("已開啟手機分享選單，請依選單完成儲存。");
        return;
      } catch (error) {
        if (error.name === "AbortError") {
          downloadStatus("已取消儲存，你仍可再次下載這一刻。");
          return;
        }
      }
    }
    $("download-link").hidden = false;
    $("download-link").click();
    downloadStatus(result.hidden ? "已請求下載本機 PNG；投稿狀態不會改變。" : "已請求下載 PNG。若尚未下載，請點擊下方「下載作品 PNG」。");
  } catch {
    $("download-link").hidden = false;
    downloadStatus("無法開啟儲存選單，請使用 PNG 下載連結儲存。");
  } finally { downloading = false; $("save-button").disabled = false; }
}
$("save-button").addEventListener("click", downloadWork);
$("local-download-link").addEventListener("click", event => { event.preventDefault(); downloadWork(); });

window.addEventListener("pagehide", () => {
  if (photoURL) URL.revokeObjectURL(photoURL);
  if (artworkURL) URL.revokeObjectURL(artworkURL);
});
window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
updateValidity();
initialize().catch(() => editorStatus("暫時無法載入作品，請保留此頁並重新整理再試。", true));
