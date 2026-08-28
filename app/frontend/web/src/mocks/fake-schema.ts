/**
 * A deterministic, schema-valid stand-in for any zod schema — the mock router's
 * fallback for contract procedures we haven't hand-written yet (see `./router`).
 *
 * `zod-schema-faker` gives us a value that satisfies the schema; we then nudge it
 * toward the *emptiest still-valid* shape so a stub reads as an obvious
 * placeholder rather than plausible data: optionals drop to `undefined`,
 * nullables to `null`, booleans to `false`, and collections / strings to empty
 * where the schema allows. Every reduction is checked with `safeParse` (and each
 * rebuilt container is re-validated), so a `.min(1)` array or a required field
 * keeps its faked value and the return is *always* schema-valid. That keeps this
 * honest across zod versions: the only structural thing it reads is `.def` (to
 * recurse into objects / arrays / unions), never zod's deeper internals.
 *
 * This is a trimmed cousin of a fuller `fakeSchema` utility — pared to the cases
 * an oRPC output schema actually takes.
 */
import { faker } from "@faker-js/faker";
import { fake, seed as seedFaker, setFaker } from "zod-schema-faker/v4";
import type { z } from "zod";

setFaker(faker);

/** Build the emptiest schema-valid value for `schema`, seeded so it's stable. */
export function fakeSchema<T extends z.ZodType>(schema: T, seed = 1): z.infer<T> {
  seedFaker(seed);
  return minimize(schema, fake(schema)) as z.infer<T>;
}

/**
 * Reduce `value` (already valid for `schema`) toward the emptiest valid shape.
 * Best-effort: any reduction that wouldn't validate is skipped, and a container
 * whose minimized rebuild fails falls back to the original faked value — so the
 * return can never be invalid.
 */
function minimize(schema: z.ZodType, value: unknown): unknown {
  if (accepts(schema, undefined)) return undefined;
  if (accepts(schema, null)) return null;

  const def = defOf(schema);

  if (def.type === "boolean" && accepts(schema, false)) return false;

  if (def.type === "object" && def.shape && typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [key, fieldSchema] of Object.entries(def.shape)) {
      out[key] = minimize(fieldSchema, out[key]);
    }
    return accepts(schema, out) ? out : value;
  }

  if (def.type === "array") {
    return accepts(schema, []) ? [] : value;
  }

  if (def.type === "union" && Array.isArray(def.options)) {
    // Recurse into whichever member already accepts the faked value.
    const option = def.options.find((member) => accepts(member, value));
    return option ? minimize(option, value) : value;
  }

  if (typeof value === "string" && accepts(schema, "")) return "";

  return value;
}

function accepts(schema: z.ZodType, value: unknown): boolean {
  return schema.safeParse(value).success;
}

function defOf(schema: z.ZodType): Def {
  return (schema as unknown as { def?: Def }).def ?? {};
}

/** The structural slice of zod's definition we read to recurse into containers. */
interface Def {
  type?: string;
  shape?: Record<string, z.ZodType>;
  options?: z.ZodType[];
}
