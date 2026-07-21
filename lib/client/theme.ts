export type ThemePreference = "dark" | "light" | "system";

export function resolvedTheme(preference: ThemePreference) {
  return preference === "system"
    ? window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
    : preference;
}

export function applyTheme(preference: ThemePreference) {
  localStorage.setItem("synthnet-theme", preference);
  document.documentElement.dataset.theme = resolvedTheme(preference);
}

export function storedTheme(): ThemePreference {
  const value = localStorage.getItem("synthnet-theme");
  return value === "light" || value === "system" ? value : "dark";
}
