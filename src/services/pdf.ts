import { convertFileSrc } from '@tauri-apps/api/core';

function normalizeLocalPath(raw?: string): string {
  const value = (raw || '').trim();
  if (!value) return '';

  if (value.startsWith('file://')) {
    try {
      const url = new URL(value);
      return decodeURIComponent(url.pathname || '');
    } catch {
      return value.replace(/^file:\/\//, '');
    }
  }

  if (value.includes('%')) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return value;
}

export function toAssetSrc(path?: string): string {
  if (!path) return '';
  const normalized = normalizeLocalPath(path);
  if (normalized.startsWith('data:') || normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('asset:')) {
    return normalized;
  }
  return convertFileSrc(normalized);
}

export function toPdfSrc(path: string): string {
  return toAssetSrc(path);
}

export async function createThumbnailDataUrl(path: string): Promise<string | null> {
  try {
    const { pdfjs } = await import('react-pdf');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const src = toPdfSrc(path);
    const loadingTask = pdfjs.getDocument({
      url: src,
      disableStream: true,
      disableAutoFetch: true,
      stopAtErrors: true,
    });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.9 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvas, canvasContext: context, viewport } as never).promise;
    return canvas.toDataURL('image/png', 0.82);
  } catch (error) {
    console.error('createThumbnailDataUrl failed', path, error);
    return null;
  }
}
