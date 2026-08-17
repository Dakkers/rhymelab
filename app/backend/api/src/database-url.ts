/**
 * The libpq startup options every connection to this database should carry.
 * Mirrors what `db.ts` passes to the pool — see there for why UTC is pinned at
 * the session level at all.
 */
const UTC_OPTIONS = "-c TimeZone=UTC";

/**
 * Returns `url` with `options=-c TimeZone=UTC` appended as a query parameter.
 *
 * For connections that can't be handed a `pg` pool config — chiefly the Prisma
 * CLI, which builds its own connection from `DATABASE_URL` and so never goes
 * through `db.ts`. Without this, a migration reaching for a bare `now()` would
 * inherit whatever zone the host defaults to.
 *
 * Applied here rather than written into the committed `.env` on purpose: in
 * every environment that matters the URL is handed to us by the platform
 * (Render, or a preview branch), so a literal in a file we control would only
 * ever fix local dev.
 *
 * An `options` the caller already set is left alone — an operator passing their
 * own startup options is being deliberate, and silently merging or overwriting
 * them would be worse than not pinning the zone. A blank/absent URL is returned
 * untouched, so a missing `DATABASE_URL` still surfaces as its own error rather
 * than as a URL parse failure here.
 */
export function withUtcTimeZone(url: string | undefined): string | undefined {
  if (!url) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL we can reason about. Hand it back and let whoever consumes it
    // report the problem in its own terms.
    return url;
  }

  if (parsed.searchParams.has("options")) return url;

  // Built by hand rather than via `searchParams.set`, which encodes a space as
  // `+`. Both parsers on the other side of this (`pg` and Prisma's Rust
  // connector) agree on `%20`; only one of them agrees on `+`.
  const separator = parsed.search ? "&" : "?";
  return `${url}${separator}options=${encodeURIComponent(UTC_OPTIONS)}`;
}
