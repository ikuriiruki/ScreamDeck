import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { stop, updateSettings, useLibrary, useSettings, useStatus } from "../lib/api";
import type { Settings } from "../lib/types";
import { ScreamerEdit } from "../pages/ScreamerEdit";
import { Screamers } from "../pages/Screamers";
import { SetDetail } from "../pages/SetDetail";
import { Sets, type Notify } from "../pages/Sets";
import { BottomNav, Button, Segmented, TabScreen, Toasts, type Tab, type Toast } from "../ui";
import i18n, { languageOf, type Language } from "./i18n";
import { applyTheme } from "./theme";

type Screen = { tab: Tab; sub?: { kind: "set" | "screamer"; id: string | null } };

export default function App() {
  const { t } = useTranslation();
  const settings = useSettings();
  const library = useLibrary();
  const status = useStatus();
  const [screen, setScreen] = useState<Screen>({ tab: "sets" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify: Notify = useCallback((message, tone) => setToasts((ts) => [...ts, { id: crypto.randomUUID(), message, tone }]), []);

  const theme = settings?.theme ?? "system";
  useEffect(() => applyTheme(theme), [theme]);
  const language = languageOf(settings);
  useEffect(() => {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [language]);

  return (
    <>
      <div className="backdrop-k" />
      {screen.sub?.kind === "set" && screen.sub.id ? (
        library && status && <SetDetail id={screen.sub.id} library={library} status={status} notify={notify} onBack={() => setScreen({ tab: screen.tab })} />
      ) : screen.sub?.kind === "screamer" ? (
        library && status && <ScreamerEdit id={screen.sub.id} library={library} status={status} notify={notify} onBack={() => setScreen({ tab: screen.tab })} />
      ) : (
        <TabScreen
          title="ScreamDeck"
          action={<Button variant="accent" icon="stop" onClick={() => void stop()}>{t("stop")}</Button>}
          nav={<BottomNav active={screen.tab} onChange={(tab) => setScreen({ tab })} />}
        >
          {screen.tab === "sets" && library && status && (
            <Sets library={library} status={status} notify={notify} onOpen={(id) => setScreen({ tab: "sets", sub: { kind: "set", id } })} />
          )}
          {screen.tab === "screamers" && library && status && (
            <Screamers library={library} status={status} notify={notify} onOpen={(id) => setScreen({ tab: "screamers", sub: { kind: "screamer", id } })} />
          )}
          {screen.tab === "settings" && settings && <LookSettings settings={settings} language={language} />}
        </TabScreen>
      )}
      <Toasts items={toasts} onDismiss={(id) => setToasts((ts) => ts.filter((x) => x.id !== id))} dismissLabel={t("dismiss")} />
    </>
  );
}

// Placeholder until the settings screen: just language and theme.
function LookSettings({ settings, language }: { settings: Settings; language: Language }) {
  const { t } = useTranslation();
  const save = (patch: Partial<Settings>) => void updateSettings({ ...settings, ...patch });
  return (
    <div className="flex flex-col gap-0.5 rounded-3xl bg-surface p-1.5">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex-1 font-medium">{t("settings.language")}</span>
        <Segmented
          soft className="w-[150px]" label={t("settings.language")} value={language} onChange={(language) => save({ language })}
          options={[{ value: "ru", label: "RU" }, { value: "en", label: "EN" }]}
        />
      </div>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex-1 font-medium">{t("settings.theme.label")}</span>
        <Segmented
          soft className="w-[150px]" label={t("settings.theme.label")} value={settings.theme} onChange={(theme) => save({ theme })}
          options={[
            { value: "light", label: t("settings.theme.light"), icon: "sun" },
            { value: "dark", label: t("settings.theme.dark"), icon: "moon" },
            { value: "system", label: t("settings.theme.system"), icon: "monitor" },
          ]}
        />
      </div>
    </div>
  );
}
