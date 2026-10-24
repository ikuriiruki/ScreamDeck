import { useEffect, useRef } from "react";
import type { Show, Status } from "../lib/types";
import { guessTag, planPlayback, type Tag } from "./playback";

type El = HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
type Prepared = { showId: number; els: El[]; video?: HTMLVideoElement; audio?: HTMLAudioElement; visual: El };


// mode=pc: files via the asset protocol and events via Tauri (imported only here, OBS has no runtime).
// mode=obs: files and SSE from the local server; volume already decided by the server.
export function Player({ mode, audio }: { mode: "pc" | "obs"; audio: boolean }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const soundOn = mode === "obs" || audio;
    let dataPath = "";
    let src = (file: string) => `/media/${encodeURIComponent(file)}`;
    let ack = (_showId: number) => {};
    const cache = new Map<string, El>();
    let cur: Prepared | null = null;
    const cleanups: Array<() => void> = [];

    const tagOf = (el: El): Tag => (el instanceof HTMLVideoElement ? "video" : el instanceof HTMLAudioElement ? "audio" : "img");
    const make = (file: string, tag: Tag): El => {
      const el = tag === "video" ? document.createElement("video") : tag === "audio" ? new Audio() : new Image();
      if (el instanceof HTMLVideoElement) el.playsInline = true;
      if (!(el instanceof HTMLImageElement)) el.preload = "auto";
      el.src = src(file);
      return el;
    };
    const unload = (el: El) => {
      if (el instanceof HTMLImageElement) return el.removeAttribute("src");
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
    const ready = (el: El) =>
      new Promise<void>((done) => {
        if (el instanceof HTMLImageElement) return void el.decode().then(done, done);
        // a preloaded element may have settled before we got here: events would never fire
        if (el.readyState >= 4 || el.error) return done();
        el.addEventListener("canplaythrough", () => done(), { once: true });
        el.addEventListener("error", () => done(), { once: true });
      });
    const take = (file: string, tag: Tag) => {
      let el = cache.get(file);
      cache.delete(file);
      if (el && tagOf(el) !== tag) {
        unload(el);
        el = undefined;
      }
      return el ?? make(file, tag);
    };

    const end = () => {
      if (!cur) return;
      cur.els.forEach((el) => {
        el.remove();
        unload(el);
      });
      cur = null;
    };

    const prepare = (show: Show) => {
      end();
      const { screamer: s, showId } = show;
      const plan = planPlayback(s, show.durationMs);
      const visual = take(s.media.file, s.media.kind === "video" ? "video" : "img");
      visual.style.cssText = `position:fixed;inset:0;width:100%;height:100%;object-fit:${s.fit};opacity:${s.opacity / 100};visibility:hidden;background:transparent`;
      const p: Prepared = { showId, els: [visual], visual };
      if (visual instanceof HTMLVideoElement) {
        p.video = visual;
        visual.muted = !soundOn || plan.videoMuted;
        visual.volume = plan.volume;
        visual.addEventListener("ended", () => {
          if (!plan.loopVideo) return;
          visual.muted = true;
          visual.currentTime = 0;
          void visual.play().catch(() => {});
        });
      }
      if (plan.audioFile) {
        p.audio = take(plan.audioFile, "audio") as HTMLAudioElement;
        p.audio.volume = plan.volume;
        p.audio.muted = !soundOn;
        p.els.push(p.audio);
      }
      cur = p;
      root.current?.append(visual);
      void Promise.all(p.els.map(ready)).then(() => ack(showId));
    };

    const play = (showId: number) => {
      if (cur?.showId !== showId) return;
      cur.visual.style.visibility = "visible";
      for (const m of [cur.video, cur.audio]) void m?.play().catch(() => {});
    };

    const preload = (files: string[]) => {
      for (const [file, el] of cache)
        if (!files.includes(file)) {
          unload(el);
          cache.delete(file);
        }
      for (const file of files) if (!cache.has(file)) cache.set(file, make(file, guessTag(file)));
    };

    const onEnd = (showId: number) => cur?.showId === showId && end();

    let stopped = false;
    void (async () => {
      if (mode === "obs") {
        const es = new EventSource("/api/events");
        const on = <T,>(name: string, f: (d: T) => void) => es.addEventListener(name, (e) => f(JSON.parse((e as MessageEvent).data)));
        on<Show>("prepare", prepare);
        on<{ showId: number }>("play", (d) => play(d.showId));
        on<{ showId: number }>("end", (d) => onEnd(d.showId));
        on<{ files: string[] }>("preload", (d) => preload(d.files));
        cleanups.push(() => es.close());
        return;
      }
      const [{ listen }, { invoke, convertFileSrc }] = await Promise.all([import("@tauri-apps/api/event"), import("@tauri-apps/api/core")]);
      const setPath = (p: string) => (dataPath = p);
      src = (file) => convertFileSrc(`${dataPath}/media/${file}`);
      ack = (showId) => void invoke("player_ready", { showId });
      setPath((await invoke<Status>("get_status")).dataPath);
      const subs = await Promise.all([
        listen<{ dataPath: string }>("app://status", (e) => setPath(e.payload.dataPath)),
        listen<Show>("player://prepare", (e) => prepare(e.payload)),
        listen<{ showId: number }>("player://play", (e) => play(e.payload.showId)),
        listen<{ showId: number }>("player://end", (e) => onEnd(e.payload.showId)),
        listen<{ files: string[] }>("player://preload", (e) => preload(e.payload.files)),
      ]);
      if (stopped) return subs.forEach((u) => u());
      cleanups.push(...subs);
      // the window opens after the core's first preload event went out: catch up now that we listen
      const status = await invoke<Status>("get_status");
      setPath(status.dataPath);
      if (!stopped) preload(status.preloadFiles);
    })();

    return () => {
      stopped = true;
      cleanups.forEach((c) => c());
      end();
      cache.forEach(unload);
    };
  }, [mode, audio]);

  return <div ref={root} />;
}
