"use client";

import { useCallback, useEffect, useState } from "react";
import { THEME_KEY as KEY } from "@/components/themeScript";

// Tema: "light" | "dark" | "system". Pilihan disimpan di localStorage dan dipasang sebagai
// data-theme di <html>. "system" = tanpa atribut, CSS mengikuti prefers-color-scheme.

function readStored() {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function apply(theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState("system");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setThemeState(readStored());
    setSystemDark(systemPrefersDark());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    // Sinkron kalau tema diganti di tab lain.
    const onStorage = (e) => {
      if (e.key !== KEY) return;
      const next = readStored();
      setThemeState(next);
      apply(next);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = useCallback((next) => {
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Storage diblokir (mis. mode privat): tema tetap berlaku untuk sesi ini.
    }
    setThemeState(next);
    apply(next);
  }, []);

  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  return { theme, resolved, setTheme };
}
