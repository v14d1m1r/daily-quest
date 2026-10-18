import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
type Theme = "light" | "dark";
const key = "daily-quest-theme";
function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(key);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const sync = () =>
      setTheme(savedTheme() ?? (media.matches ? "dark" : "light"));
    const storage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) sync();
    };
    media.addEventListener("change", sync);
    window.addEventListener("storage", storage);
    sync();
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", storage);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#151c20" : "#f6f7f9");
  }, [theme]);
  const label = theme === "dark" ? "Uključi svetlu temu" : "Uključi tamnu temu";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        try {
          localStorage.setItem(key, next);
        } catch {
          /* Theme still works when storage is unavailable. */
        }
        setTheme(next);
      }}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      <span>{theme === "dark" ? "Svetla tema" : "Tamna tema"}</span>
    </button>
  );
}
