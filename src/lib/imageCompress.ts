// Resizes + re-encodes an image file as JPEG before upload, to cut storage
// use for photographed documents (phone camera JPEGs commonly run 2-8MB;
// this typically brings them down to a few hundred KB). Non-image files
// (PDF) pass through untouched — canvas re-encoding doesn't apply to them.
export async function compressImage(file: File, maxDim = 1600, quality = 0.75): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const bitmap = await createImageBitmap(file);
  const scale  = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width  = Math.round(bitmap.width  * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  // Fall back to the original if encoding failed, or if it didn't actually
  // shrink the file (can happen on already-small/simple images) — never
  // ship a "compressed" file that's bigger than what the user picked.
  if (!blob || blob.size >= file.size) return file;

  const name = file.name.replace(/\.\w+$/, '.jpg');
  return new File([blob], name, { type: 'image/jpeg' });
}
