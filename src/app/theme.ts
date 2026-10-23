/** Puts `.dark` on <html> for "dark", or for "system" while the OS is dark (and follows it); returns the unsubscribe. */
export function applyTheme(theme: string): () => void {
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const set = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme !== "light" && dark.matches));
  set();
  if (theme === "light" || theme === "dark") return () => {};
  dark.addEventListener("change", set);
  return () => dark.removeEventListener("change", set);
}
