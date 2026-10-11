'use client';

import { useState, type RefObject } from 'react';
import { Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Snapshots the rendered report into a multi-page A4 PDF and opens the phone's
 * share sheet with it (WhatsApp, mail, …). A wa.me link can't carry a file, so
 * the system share sheet is the only no-setup route. Browsers without file
 * sharing (most desktops) download the PDF instead.
 *
 * The image-based snapshot keeps Hebrew/RTL text and theme colours exactly as
 * rendered. Libraries load only on click.
 */
const PDF_WIDTH = 800;

export function SharePdfButton({
  targetRef,
  fileName,
  title,
}: {
  targetRef: RefObject<HTMLElement | null>;
  fileName: string;
  title: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // iOS only opens the share sheet within a short window after a tap, and
  // building the PDF can take longer. If it refuses, keep the file and let the
  // next tap share it straight away.
  const [pending, setPending] = useState<File | null>(null);

  async function share(file: File) {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
    } else {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }

  async function buildPdf(node: HTMLElement): Promise<File> {
    const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
    // Lay the report out at a fixed width while capturing, so wide parts (the
    // category table scrolls sideways on a phone) appear whole in the PDF.
    const prevWidth = node.style.width;
    if (node.offsetWidth < PDF_WIDTH) node.style.width = `${PDF_WIDTH}px`;
    try {
      const canvas = await toCanvas(node, {
        pixelRatio: 2,
        // Page margin in the PDF (the on-screen report is flush with the layout).
        style: { padding: '24px', boxSizing: 'border-box', width: `${node.offsetWidth + 48}px` },
        width: node.offsetWidth + 48,
        height: node.offsetHeight + 48,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        // Leave interactive controls (buttons, pickers) out of the PDF.
        filter: (n) => !(n instanceof HTMLElement && n.dataset.pdfHide !== undefined),
      });
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const sliceH = Math.floor((canvas.width * pageH) / pageW);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      const ctx = slice.getContext('2d')!;
      for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
        const h = Math.min(sliceH, canvas.height - y);
        slice.height = h;
        ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (page > 0) pdf.addPage();
        pdf.addImage(
          slice.toDataURL('image/jpeg', 0.9),
          'JPEG',
          0,
          0,
          pageW,
          (h * pageW) / canvas.width
        );
      }
      return new File([pdf.output('blob')], fileName, { type: 'application/pdf' });
    } finally {
      node.style.width = prevWidth;
    }
  }

  async function handleClick() {
    const node = targetRef.current;
    if (!node) return;
    setBusy(true);
    setError(null);
    let file = pending;
    try {
      file ??= await buildPdf(node);
      setPending(null);
      await share(file);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' && file) setPending(file);
      // Closing the share sheet rejects with AbortError — not a failure.
      else if (name !== 'AbortError') setError("Couldn't create the PDF. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={handleClick} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Share2 className="mr-1.5 h-4 w-4" />
        )}
        {pending ? 'Tap to share' : 'Share PDF'}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
