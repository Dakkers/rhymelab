/**
 * Tiny presentational helpers.
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
