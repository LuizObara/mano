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
