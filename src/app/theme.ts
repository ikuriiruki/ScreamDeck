import { getCurrentWindow } from "@tauri-apps/api/window";

/** Puts `.dark` on <html> for "dark", or for "system" while the OS is dark (and follows it); returns the unsubscribe.
 *  The title bar follows too (null = the system's). */
export function applyTheme(theme: string): () => void {
  const fixed = theme === "light" || theme === "dark" ? theme : null;
  getCurrentWindow().setTheme(fixed).catch((e) => console.error("setTheme:", e));
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const set = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme !== "light" && dark.matches));
  set();
  if (fixed) return () => {};
  dark.addEventListener("change", set);
  return () => dark.removeEventListener("change", set);
}
