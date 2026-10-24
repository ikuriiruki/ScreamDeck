import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { stop, useLibrary, useSettings, useStatus } from "../lib/api";
import { ScreamerEdit } from "../pages/ScreamerEdit";
import { Screamers } from "../pages/Screamers";
import { SetDetail } from "../pages/SetDetail";
import { Sets, type Notify } from "../pages/Sets";
import { Settings } from "../pages/Settings";
import { BottomNav, Button, TabScreen, Toasts, type Tab, type Toast } from "../ui";
import i18n, { languageOf } from "./i18n";
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
          {screen.tab === "settings" && settings && library && status && (
            <Settings settings={settings} status={status} library={library} language={language} notify={notify} />
          )}
        </TabScreen>
      )}
      <Toasts items={toasts} onDismiss={(id) => setToasts((ts) => ts.filter((x) => x.id !== id))} dismissLabel={t("dismiss")} />
    </>
  );
}
