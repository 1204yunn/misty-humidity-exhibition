import { exhibitConfig } from './config.js';
import { compressPhoto } from '../board/upload-image.js';
import { isCloudinaryImageUrl } from '../board/submission-model.js';
const encode = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});
export function createExhibitPublisher({ config = exhibitConfig, compress = compressPhoto,
  getSession = async () => (await import('./session.js')).getExhibitSession(), fetcher = (...args) => fetch(...args) } = {}) {
  return async function publish(photo, { id, publicConsent }) {
    if (publicConsent !== true) throw new Error('尚未同意公開');
    if (!config.enabled || !config.endpoint) throw new Error('展場發布尚未啟用，請聯絡工作人員完成設定');
    const endpoint = new URL(config.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('展場發布網址設定無效');
    const session = await getSession();
    const prepared = await compress(photo.blob);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 65000);
    try {
      const response = await fetcher(endpoint.href, { method: 'POST', credentials: 'omit', redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.token },
        body: JSON.stringify({ requestId: id, publicConsent: true, imageBase64: await encode(prepared.blob) }), signal: controller.signal });
      const receipt = await response.json();
      if (!response.ok) throw new Error(receipt.error || '展場公開未完成（HTTP ' + response.status + '）');
      if (receipt.confirmed !== true || receipt.source !== 'exhibit' || receipt.moderationStatus !== 'approved'
        || receipt.isPublic !== true || !receipt.submissionId || !isCloudinaryImageUrl(receipt.imageUrl)) throw new Error('未收到有效的公開確認');
      return receipt;
    } catch(error) { if (error.name === 'AbortError') throw new Error('上傳逾時，照片已保留，可重試相同投稿'); throw error; }
    finally { clearTimeout(timer); }
  };
}
export const publishExhibit = createExhibitPublisher();