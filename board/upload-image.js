export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_EDGE = 1280;

export async function compressPhoto(blob) {
  if (!(blob instanceof Blob) || !["image/jpeg", "image/png", "image/webp"].includes(blob.type)
    || blob.size === 0 || blob.size > 20 * 1024 * 1024) {
    throw new Error("只接受 20 MB 以下的 JPEG、PNG 或 WebP 照片。");
  }
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value);
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(blob.type === "image/jpeg" ? jpeg : blob.type === "image/png" ? png : webp)) {
    throw new Error("照片格式與內容不符，請重新拍照。");
  }
  const image = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    if (!image.width || !image.height || image.width * image.height > 32000000) throw new Error("照片尺寸過大，請重新拍照。");
    const scale = Math.min(1, MAX_UPLOAD_EDGE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("無法處理照片。");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    // Re-encoding raster pixels drops the source EXIF/GPS/XMP rather than sending
    // the original file or original metadata. No aspect-ratio crop is applied.
    const compressed = await new Promise((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error("無法壓縮照片。")), "image/jpeg", .85));
    if (compressed.type !== "image/jpeg" || compressed.size > MAX_UPLOAD_BYTES) throw new Error("壓縮後照片仍超過 2 MB，請重新拍照。");
    return { blob: compressed, width, height };
  } finally { image.close(); }
}

export async function sha256(value) {
  const bytes = value instanceof Blob ? await value.arrayBuffer() : new TextEncoder().encode(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    byte => byte.toString(16).padStart(2, "0")).join("");
}
