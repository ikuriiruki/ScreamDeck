import type { MediaKind } from "./types";

const THUMB_W = 320;
const THUMB_H = 200;

function once(el: EventTarget, ok: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (e: Event) => {
      el.removeEventListener(ok, done);
      el.removeEventListener("error", done);
      if (e.type === "error") reject(new Error(`can't load ${(el as HTMLMediaElement).src}`));
      else resolve();
    };
    el.addEventListener(ok, done);
    el.addEventListener("error", done);
  });
}

// crossOrigin: the asset protocol is another origin, and a tainted canvas can't be read back into a thumbnail
async function loadMedia<T extends HTMLMediaElement>(el: T, url: string): Promise<T> {
  el.crossOrigin = "anonymous";
  el.preload = "metadata";
  el.src = url;
  await once(el, "loadedmetadata");
  // files recorded in a browser (MediaRecorder webm) report Infinity until the end is sought
  if (!Number.isFinite(el.duration)) {
    el.currentTime = Number.MAX_SAFE_INTEGER;
    await once(el, "durationchange");
  }
  return el;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  return img;
}

const release = (el: HTMLMediaElement) => {
  el.removeAttribute("src");
  el.load();
};

export async function measureMedia(url: string, kind: MediaKind): Promise<{ durationMs: number | null; width: number; height: number }> {
  if (kind !== "video") {
    const img = await loadImage(url);
    return { durationMs: null, width: img.naturalWidth, height: img.naturalHeight };
  }
  const v = await loadMedia(document.createElement("video"), url);
  const r = { durationMs: Math.round(v.duration * 1000), width: v.videoWidth, height: v.videoHeight };
  release(v);
  return r;
}

export async function measureAudio(url: string): Promise<number> {
  const a = await loadMedia(new Audio(), url);
  const ms = Math.round(a.duration * 1000);
  release(a);
  return ms;
}

/** Frame at 0.5 s of a video, the (first frame of the) picture otherwise; covers 320×200, JPEG 0.8. */
export async function makeThumbnail(url: string, kind: MediaKind): Promise<Uint8Array> {
  let source: HTMLVideoElement | HTMLImageElement;
  let w: number;
  let h: number;
  if (kind === "video") {
    const v = await loadMedia(document.createElement("video"), url);
    v.muted = true;
    v.preload = "auto";
    v.currentTime = Math.min(0.5, v.duration / 2);
    await once(v, "seeked");
    [source, w, h] = [v, v.videoWidth, v.videoHeight];
  } else {
    const img = await loadImage(url);
    [source, w, h] = [img, img.naturalWidth, img.naturalHeight];
  }
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const scale = Math.max(THUMB_W / w, THUMB_H / h);
  canvas.getContext("2d")!.drawImage(source, (THUMB_W - w * scale) / 2, (THUMB_H - h * scale) / 2, w * scale, h * scale);
  if (source instanceof HTMLVideoElement) release(source);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  if (!blob) throw new Error("thumbnail encoding failed");
  return new Uint8Array(await blob.arrayBuffer());
}
