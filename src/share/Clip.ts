/**
 * Records the live WebGL canvas into a short video with MediaRecorder. The caller drives the
 * replay (positions, camera, render) through `tick`; this module only owns the recorder.
 */
export interface ClipOptions {
  canvas: HTMLCanvasElement;
  /** Clip length in seconds of wall-clock time. */
  seconds: number;
  /** Called every frame with elapsed seconds; should update the scene and render it. */
  tick: (t: number) => void;
  fps?: number;
}

export function clipSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof (HTMLCanvasElement.prototype as { captureStream?: unknown }).captureStream === 'function'
  );
}

/** Preferred container per browser: mp4 where supported (Safari), otherwise webm. */
export function pickMime(): string | null {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const c of candidates) if (MediaRecorder.isTypeSupported(c)) return c;
  return null;
}

export function recordClip(o: ClipOptions): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!clipSupported()) return reject(new Error('MediaRecorder unsupported'));
    const mime = pickMime();
    if (!mime) return reject(new Error('no supported video type'));
    const fps = o.fps ?? 30;
    const stream = o.canvas.captureStream(fps);
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 6_000_000,
    });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onerror = () => reject(new Error('recorder error'));
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: mime.split(';')[0] }));
    };
    const start = performance.now();
    let raf = 0;
    const frame = () => {
      const t = (performance.now() - start) / 1000;
      if (t >= o.seconds) {
        rec.stop();
        return;
      }
      try {
        o.tick(t);
      } catch (e) {
        cancelAnimationFrame(raf);
        rec.stop();
        reject(e);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    rec.start(250);
    raf = requestAnimationFrame(frame);
  });
}

export async function shareClip(
  blob: Blob,
  text: string,
  url: string,
): Promise<'shared' | 'downloaded' | 'failed'> {
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([blob], `bike-rider-clip.${ext}`, { type: blob.type });
  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, url });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'failed';
  }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
