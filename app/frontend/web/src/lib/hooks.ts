import { useEffect, useState } from "react";

/** True only after the first client render — use to gate SSR-unsafe output. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
