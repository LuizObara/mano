import { useEffect, useState } from "react";

/** Preferências deste aparelho (localStorage). Falhar em ler ou gravar nunca quebra o visor. */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? initial : (JSON.parse(v) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* armazenamento bloqueado: segue só na memória */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export type Theme = "light" | "dark";

const THEME_COLOR: Record<Theme, string> = { light: "#f5eddc", dark: "#1a140f" };

/** Tema claro/escuro. O index.html aplica o salvo antes de o React carregar, para não piscar. */
export function useTheme() {
  const [theme, setTheme] = useStored<Theme>(
    "mano.theme",
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  }, [theme]);
  return [theme, () => setTheme(theme === "dark" ? "light" : "dark")] as const;
}
