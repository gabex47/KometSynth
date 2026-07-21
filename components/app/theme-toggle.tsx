"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, resolvedTheme, storedTheme, type ThemePreference } from "@/lib/client/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>("dark");

  useEffect(() => {
    const saved = storedTheme();
    setTheme(saved);
    applyTheme(saved);
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const updateSystem = () => {
      if (storedTheme() === "system") applyTheme("system");
    };
    media.addEventListener("change", updateSystem);
    return () => media.removeEventListener("change", updateSystem);
  }, []);

  const isLight = typeof window !== "undefined" && resolvedTheme(theme) === "light";
  function toggle() {
    const next = isLight ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
  }
  return <button className="theme-toggle" onClick={toggle} aria-label={`Switch to ${isLight ? "dark" : "light"} mode`} title={`Switch to ${isLight ? "dark" : "light"} mode`}>{isLight ? <Moon size={16} /> : <Sun size={16} />}</button>;
}
