import { convertFileSrc } from '@tauri-apps/api/core';

export function toAssetSrc(path?: string): string {
  if (!path) return '';
  if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('asset:')) {
    return path;
  }
  return convertFileSrc(path);
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
