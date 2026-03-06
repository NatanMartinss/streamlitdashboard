"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<string>(() => {
    if (typeof window === "undefined") return "light";
    return localStorage.getItem("theme") || "light";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const isDark = theme === "dark";

  return (
    <button
      aria-label="Alternar tema"
      onClick={toggle}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 ring-1 ring-white/15 transition"
    >
      {isDark ? (
        <Sun size={16} className="text-white" />
      ) : (
        <Moon size={16} className="text-white" />
      )}
      <span className="text-xs text-white/80">{isDark ? "Claro" : "Escuro"}</span>
    </button>
  );
}