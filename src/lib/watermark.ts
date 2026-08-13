import type { PDFPage } from 'pdf-lib';

const WATERMARK_TEXT = 'FOR GERAK DRIVER VERIFICATION USE ONLY';
const WATERMARK_ANGLE_DEG = 26;
const WATERMARK_Y_FRACS = [0.15, 0.45, 0.75];

// Screenshots of documents often include a large white browser/camera canvas.
// Trim only near-white/transparent pixels connected to the outside edge so
// the actual document is centred when opened, without cutting into its pale
// printed background.
function contentBounds(bitmap: ImageBitmap) {
  const probe = document.createElement('canvas');
  probe.width = bitmap.width;
  probe.height = bitmap.height;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const isContent = (x: number, y: number) => {
    const i = (y * bitmap.width + x) * 4;
    return data[i + 3] > 12 && (data[i] < 246 || data[i + 1] < 246 || data[i + 2] < 246);
  };
  let left = 0, right = bitmap.width - 1, top = 0, bottom = bitmap.height - 1;
  const rowHasContent = (y: number) => {
    for (let x = 0; x < bitmap.width; x += 2) if (isContent(x, y)) return true;
    return false;
  };
  const colHasContent = (x: number) => {
    for (let y = 0; y < bitmap.height; y += 2) if (isContent(x, y)) return true;
    return false;
  };
  while (top < bottom && !rowHasContent(top)) top++;
  while (bottom > top && !rowHasContent(bottom)) bottom--;
  while (left < right && !colHasContent(left)) left++;
  while (right > left && !colHasContent(right)) right--;
  const pad = Math.max(4, Math.round(Math.min(bitmap.width, bitmap.height) * 0.01));
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  right = Math.min(bitmap.width - 1, right + pad); bottom = Math.min(bitmap.height - 1, bottom + pad);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

async function stampPdf(file: File, text: string): Promise<File> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes);
  const wmFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const wmColor = rgb(0.12, 0.12, 0.12);

  const stampPage = (page: PDFPage) => {
    const { width, height } = page.getSize();
    const baseSize    = 20;
    const rawWidth    = wmFont.widthOfTextAtSize(text, baseSize);
    const targetWidth = width * 0.85;
    const fontSize    = Math.max(8, Math.min(40, baseSize * (targetWidth / rawWidth)));
    WATERMARK_Y_FRACS.forEach(yFrac => {
      const textWidth = wmFont.widthOfTextAtSize(text, fontSize);
      page.drawText(text, {
        x: (width - textWidth) / 2,
        y: height * yFrac,
        size: fontSize,
        font: wmFont,
        color: wmColor,
        opacity: 0.4,
        rotate: degrees(WATERMARK_ANGLE_DEG),
      });
    });
  };

  doc.getPages().forEach(stampPage);
  const outBytes = await doc.save();
  return new File([outBytes.buffer as ArrayBuffer], file.name, { type: 'application/pdf' });
}

async function stampImage(file: File, text: string): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const bounds = contentBounds(bitmap);
  // Cap resolution like Jubah's compressImage does — re-encoding at full
  // original resolution can produce a LARGER file than the input (e.g. a
  // phone photo saved at a lower JPEG quality than ours), enough to exceed
  // the storage bucket's size limit even though the original upload fit.
  const maxDim = 1600;
  const scale  = Math.min(1, maxDim / Math.max(bounds.width, bounds.height));
  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(bounds.width * scale);
  canvas.height = Math.round(bounds.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height);

  const baseSize    = 20;
  ctx.font = `bold ${baseSize}px sans-serif`;
  const rawWidth    = ctx.measureText(text).width;
  const targetWidth = canvas.width * 0.85;
  const fontSize    = Math.max(8, Math.min(120, baseSize * (targetWidth / rawWidth)));
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(31, 31, 31, 0.4)';

  WATERMARK_Y_FRACS.forEach(yFrac => {
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height * yFrac);
    ctx.rotate(-WATERMARK_ANGLE_DEG * Math.PI / 180);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  });

  const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) return file;
  const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], newName, { type: 'image/jpeg' });
}

// Stamps a repeated diagonal watermark onto a driver document before upload
// (deters a leaked/screenshotted document from being reused elsewhere).
// Handles both a raw image and a PDF, since driver IC/license uploads accept
// either — unlike Jubah's flow, which always merges into one combined PDF.
export async function stampWatermark(file: File, text: string = WATERMARK_TEXT): Promise<File> {
  if (file.type === 'application/pdf') return stampPdf(file, text);
  if (file.type.startsWith('image/')) return stampImage(file, text);
  return file;
}
