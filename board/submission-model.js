import { cloudConfig } from "./cloud-config.js";

const segmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("zh-Hant", { granularity: "grapheme" }) : null;
export const countCharacters = text => segmenter
  ? Array.from(segmenter.segment(text)).length : Array.from(text).length;

export function validateTexts(shortMessage, story) {
  if (typeof shortMessage !== "string" || !shortMessage.trim() || countCharacters(shortMessage) > 12
    || typeof story !== "string" || countCharacters(story) > 80) throw new Error("留言最多 12 字、故事最多 80 字，主要留言不可全是空白。");
}

export function isCloudinaryImageUrl(value, cloudName = cloudConfig.cloudName) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com" && !url.port
      && !url.username && !url.password && !url.search && !url.hash
      && url.pathname.startsWith(`/${cloudName}/image/upload/`)
      && /\.(jpe?g|png|webp)$/i.test(url.pathname);
  } catch { return false; }
}

export function isApprovedSubmission(data) {
  try {
    if (data.source === 'exhibit' && data.schemaVersion === 2) {
      if (typeof data.shortMessage !== 'string' || countCharacters(data.shortMessage) > 12
        || typeof data.story !== 'string' || countCharacters(data.story) > 80) return false;
    } else validateTexts(data.shortMessage, data.story);
    return data.isPublic === true && data.moderationStatus === "approved"
      && isCloudinaryImageUrl(data.imageUrl);
  } catch { return false; }
}

export function sameSubmission(data, expected) {
  return data.uid === expected.uid && data.contentHash === expected.contentHash
    && data.imageHash === expected.imageHash && data.imageUrl === expected.imageUrl
    && data.shortMessage === expected.shortMessage && data.story === expected.story
    && data.isPublic === true && ["pending", "approved", "rejected"].includes(data.moderationStatus);
}

// Legacy mobile records keep schema v1 and do not add fields forbidden by current rules.
export const submissionSource = data => data?.source === 'exhibit' ? 'exhibit' : 'mobile';
