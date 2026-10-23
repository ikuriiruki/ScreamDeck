import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { stop, updateSettings, useSettings } from "../lib/api";
import type { Settings } from "../lib/types";
import { BottomNav, Button, Segmented, SubScreen, TabScreen, type Tab } from "../ui";
import i18n, { languageOf, type Language } from "./i18n";
import { applyTheme } from "./theme";

type Screen = { tab: Tab; sub?: { kind: "set" | "screamer"; id: string | null } };

export default function App() {
  const { t } = useTranslation();
  const settings = useSettings();
  const [screen, setScreen] = useState<Screen>({ tab: "sets" });

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
      {screen.sub ? (
        <SubScreen title="" onBack={() => setScreen({ tab: screen.tab })}>{null}</SubScreen>
      ) : (
        <TabScreen
          title="ScreamDeck"
          action={<Button variant="accent" icon="stop" onClick={() => void stop()}>{t("stop")}</Button>}
          nav={<BottomNav active={screen.tab} onChange={(tab) => setScreen({ tab })} />}
        >
          {screen.tab === "settings" && settings && <LookSettings settings={settings} language={language} />}
        </TabScreen>
      )}
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
