/**
 * Tiny presentational helpers. `since` reads the wall clock, so callers that
 * render it during SSR should gate it behind a mount check to avoid a hydration
 * mismatch (see `useMounted`).
 */

export function since(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

/**
 * Render a credit list (`author` / `artist`) as prose: "A", "A & B", "A, B, & C"
 * — serial comma from three names on, none for a pair. Empty in, empty out:
 * callers filter blanks out of the line they're building.
 */
export function names(list: readonly string[]): string {
  if (list.length < 2) return list[0] ?? "";
  const last = list[list.length - 1];
  const rest = list.slice(0, -1);
  return `${rest.join(", ")}${rest.length > 1 ? "," : ""} & ${last}`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
