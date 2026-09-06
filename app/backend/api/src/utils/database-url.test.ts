import { describe, expect, it } from "vitest";
import { withUtcTimeZone } from "../database-url";

/**
 * Pure URL string handling, so it belongs in the fast suite — none of this can
 * fail because of Postgres. That the CLI *honours* the resulting parameter is a
 * separate claim, and one only a real database can settle; it lives in the
 * integration suite.
 */
describe("withUtcTimeZone", () => {
  const BASE = "postgresql://user:pw@host:5433/db";

  it("appends the option to a URL that has no query string", () => {
    expect(withUtcTimeZone(BASE)).toBe(`${BASE}?options=-c%20TimeZone%3DUTC`);
  });

  it("preserves an existing query string, appending with & rather than ?", () => {
    expect(withUtcTimeZone(`${BASE}?sslmode=require`)).toBe(
      `${BASE}?sslmode=require&options=-c%20TimeZone%3DUTC`,
    );
  });

  it("encodes the space as %20, not +", () => {
    const result = withUtcTimeZone(BASE) ?? "";
    expect(result).toContain("%20");
    expect(result).not.toContain("+");
  });

  it("round-trips back to the literal libpq option string", () => {
    expect(new URL(withUtcTimeZone(BASE) ?? "").searchParams.get("options")).toBe(
      "-c TimeZone=UTC",
    );
  });

  it("leaves a caller-supplied `options` alone rather than merging or clobbering", () => {
    const explicit = `${BASE}?options=-c%20statement_timeout%3D5000`;
    expect(withUtcTimeZone(explicit)).toBe(explicit);
  });

  it("passes an absent or empty URL straight through", () => {
    expect(withUtcTimeZone(undefined)).toBeUndefined();
    expect(withUtcTimeZone("")).toBe("");
  });

  it("passes an unparseable URL through untouched", () => {
    expect(withUtcTimeZone("not-a-url")).toBe("not-a-url");
  });
});
