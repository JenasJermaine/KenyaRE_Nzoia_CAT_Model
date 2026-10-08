import type { IngestImage } from "./types";

export const MAX_PHOTOS = 4;
/** Long side in pixels: enough to read walls, roof and steps, small enough for free-tier request limits. */
const MAX_SIDE_PX = 1024;
const JPEG_QUALITY = 0.82;

export interface PhotoItem extends IngestImage {
  id: string;
  /** data: URL of the resized image, for thumbnails. */
  url: string;
  width: number;
  height: number;
  kb: number;
}

/**
 * Resizes and re-encodes a photo in the browser. Drawing to a canvas drops EXIF metadata (GPS position,
 * camera, owner), so nothing beyond the pixels leaves the machine.
 */
export async function preparePhoto(file: File): Promise<PhotoItem> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error(`"${file.name}" is not a photo (use JPEG, PNG or WebP).`);
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`"${file.name}" could not be opened in this browser — convert it to JPEG and retry.`);
  });
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot resize images.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const data = url.slice(url.indexOf(",") + 1);
  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    mimeType: "image/jpeg",
    data,
    url,
    width,
    height,
    kb: Math.round((data.length * 3) / 4 / 1024),
  };
}
