"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "re-shortlist";
const EVENT = "re-shortlist-change";

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Saved homes, stored in this browser and shared between pages. */
export function useShortlist() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(read());
    const on = () => setIds(read());
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    const cur = read();
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    setIds(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { ids, has: (id: string) => ids.includes(id), toggle };
}
