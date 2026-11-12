"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "re-theme";
const EVENT = "re-theme-change";

export function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: theme }));
}

/** Current Morning (light) / Night (dark) theme, kept in sync across components. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>("dark");
  useEffect(() => {
    set(readTheme());
    const on = (e: Event) => set((e as CustomEvent<Theme>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [theme, setTheme];
}
