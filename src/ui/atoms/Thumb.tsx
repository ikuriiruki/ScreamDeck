import type { MediaKind } from "../../lib/types";
import { Icon } from "./Icon";

/** Preview still of a screamer; size comes from `className` (a list-row chip by default). Without a still: the kind's icon. */
export function Thumb({ src, kind, className = "h-8 w-11 rounded-[9px]" }: { src: string | null; kind: MediaKind; className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden bg-surface-2 text-ink-3 ${className}`}>
      {src ? <img src={src} alt="" draggable={false} className="size-full object-cover" /> : <Icon name={kind === "video" ? "video" : "image"} size={16} />}
    </span>
  );
}
