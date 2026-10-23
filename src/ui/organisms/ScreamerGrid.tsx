import { useTranslation } from "react-i18next";
import { thumbUrl } from "../../lib/api";
import { formatSeconds, showDurationMs } from "../../lib/duration";
import type { ScreamSet, Screamer } from "../../lib/types";
import { Thumb } from "../atoms/Thumb";

/** The library as cards in two columns: still with the show length on it, name, «видео · в 2 наборах». Stills only, never live video. */
export function ScreamerGrid({ screamers, sets, dataPath, onOpen }: {
  screamers: Screamer[];
  sets: ScreamSet[];
  dataPath: string;
  onOpen: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  if (!screamers.length) return <p className="rounded-3xl bg-surface px-3 py-5 text-center text-[15px] text-ink-2">{t("screamers.empty")}</p>;
  return (
    <div className="grid grid-cols-2 gap-2">
      {screamers.map((s) => {
        const ms = showDurationMs(s);
        const inSets = sets.filter((x) => x.items.some((i) => i.screamerId === s.id)).length;
        return (
          <button
            key={s.id} type="button" onClick={() => onOpen(s.id)}
            className="min-w-0 rounded-[20px] bg-surface p-1.5 text-left transition-colors duration-200 ease-k hover:bg-surface-2"
          >
            <span className="relative block">
              <Thumb src={thumbUrl(dataPath, s.thumb)} kind={s.media.kind} className="h-[78px] w-full rounded-[15px]" />
              {ms != null && (
                <span className="absolute right-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-[#f7f1e8] tabular-nums">
                  {t("units.seconds", { value: formatSeconds(ms, i18n.language) })}
                </span>
              )}
            </span>
            <span className="block px-2 pt-1.5 pb-1">
              <span className="block truncate font-medium">{s.name}</span>
              <span className="block truncate text-[13px] text-ink-2 tabular-nums">
                {t(`kinds.${s.media.kind}`)} · {inSets ? t("screamers.inSets", { count: inSets }) : t("screamers.nowhere")}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
