/**
 * Turns a picked photo into a small JPEG data URL: centre-cropped to the given
 * aspect ratio and scaled so its long side is at most `max` pixels. Phones
 * produce 4000px+ photos; storing those as-is would fill storage in a few uploads.
 */
export async function prepareImage(file: File, { aspect, max = 1400, quality = 0.8 }: { aspect?: number; max?: number; quality?: number } = {}): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not_image');
  const bitmap = await load(file);
  const w0 = bitmap.width;
  const h0 = bitmap.height;
  let sw = w0;
  let sh = h0;
  if (aspect) {
    if (w0 / h0 > aspect) sw = Math.round(h0 * aspect);
    else sh = Math.round(w0 / aspect);
  }
  const scale = Math.min(1, max / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (w0 - sw) / 2, (h0 - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  if ('close' in bitmap) bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}

async function load(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* older engines: fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Opens the system file picker for one or more images. */
export function pickImages(multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}
