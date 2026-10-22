import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';

// First-page thumbnail of a PDF at a (signed) URL, for the Jubah document
// gallery — nearly every Konvo Slip is a PDF, which otherwise showed only
// as an icon. pdf.js loads lazily (only when a gallery shows a PDF) and
// each thumbnail renders only once it scrolls into view.

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export function PdfThumb({ url, getUrl }: { url?: string | null; getUrl?: () => Promise<string | null> }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const src = url ?? (getUrl ? await getUrl() : null);
        if (!src) throw new Error('no url');
        const pdfjs = await loadPdfjs();
        // isEvalSupported:false — the app's CSP has no 'unsafe-eval'.
        const doc = await pdfjs.getDocument({ url: src, isEvalSupported: false }).promise;
        const page = await doc.getPage(1);
        const canvas = canvasRef.current;
        const box = boxRef.current;
        if (cancelled || !canvas || !box) return;
        const base = page.getViewport({ scale: 1 });
        const scale = (box.clientWidth * Math.min(window.devicePixelRatio || 1, 2)) / base.width;
        const viewport = page.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        void doc.destroy();
        if (!cancelled) setState('done');
      } catch (err) {
        console.error('[GERAK] PDF thumbnail failed:', err);
        if (!cancelled) setState('failed');
      }
    })();
    return () => { cancelled = true; };
  }, [visible, url, getUrl]);

  return (
    <div ref={boxRef} className="w-full h-full flex items-start justify-center overflow-hidden bg-white">
      <canvas ref={canvasRef} className={`w-full h-auto ${state === 'done' ? 'block' : 'hidden'}`} />
      {state !== 'done' && (
        <span className="self-center flex flex-col items-center gap-1 text-slate-400">
          {state === 'idle'
            ? <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
            : <FileText className="w-8 h-8" />}
          <span className="text-[10px] font-semibold">{state === 'idle' ? 'Loading…' : 'PDF · tap to open'}</span>
        </span>
      )}
    </div>
  );
}
