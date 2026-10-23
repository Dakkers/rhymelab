/**
 * Flows: scripted end-to-end scenarios through the real API routes, with real
 * login, cookies, validation, and database. Setup MAY go through SQL when the
 * API has no route for it; every assertion goes through HTTP.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Identity } from "./identity.mts";
import { ApiClient, SESSION_COOKIE } from "./http.mts";
import type { PgBackend } from "./postgres.mts";
import { SandboxError } from "./proc.mts";
import { writeLastEntryId } from "./state.mts";

export interface FlowCtx {
  id: Identity;
  pg: PgBackend;
  apiBase: string;
  password: string;
  values: Record<string, string | boolean | undefined>;
  lastEntryId: string | null;
}

export interface FlowOutcome {
  outcome: string;
  data: Record<string, unknown>;
}

export interface Flow {
  name: string;
  summary: string;
  /** Every outcome the flow can report; the first is the happy path. */
  outcomes: string[];
  /** Flow-specific options, by flag name. */
  uses: string[];
  explain: string[];
  run(ctx: FlowCtx, client: ApiClient): Promise<FlowOutcome>;
}

interface EntryDetail {
  id: string;
  title: string;
  body: string;
  sections: { type: string; lines: { text: string; rhyme: { letter: string } | null }[] }[];
}

const DEFAULT_BODY = [
  "The flow walks in through the front door,",
  "Logs in the way it did before,",
  "",
  "Writes a verse and reads it back,",
  "Then leaves the database intact.",
].join("\n");

export const FLOWS: Flow[] = [
  {
    name: "login",
    summary: "Log in with a password and confirm the session",
    outcomes: ["ok", "rejected"],
    uses: ["password"],
    explain: [
      "POST /auth/login with --password (default: the sandbox password)",
      "GET /auth/me with the returned cookie",
      "ok = accepted and the session verifies; rejected = refused and no session",
    ],
    async run(ctx, client) {
      const password = stringOpt(ctx, "password") ?? ctx.password;
      const accepted = await client.login(password);
      const authed = await client.authed();
      if (accepted !== authed) {
        throw new SandboxError(`login returned ok=${accepted} but auth/me says authed=${authed}`);
      }
      return { outcome: accepted ? "ok" : "rejected", data: { authed } };
    },
  },
  {
    name: "forged-session",
    summary: "Hit a protected route with no, unsigned, and tampered cookies",
    outcomes: ["unauthorized", "authorized"],
    uses: [],
    explain: [
      "POST /auth/login to obtain a genuine signed cookie",
      "GET /entries with no cookie, an unsigned cookie, and the genuine cookie with a flipped signature byte",
      "unauthorized = all three get 401; authorized = any of them got through",
    ],
    async run(ctx, client) {
      await client.login(ctx.password);
      const genuine = client.cookie ?? "";
      const flipped = genuine.slice(0, -1) + (genuine.endsWith("A") ? "B" : "A");
      const attempts = { none: undefined, unsigned: `${SESSION_COOKIE}=authed`, tampered: flipped };
      const statuses: Record<string, number> = {};
      for (const [label, cookie] of Object.entries(attempts)) {
        client.cookie = cookie;
        statuses[label] = (await client.request("GET", "/entries")).status;
      }
      const leaked = Object.values(statuses).some((status) => status < 400);
      return { outcome: leaked ? "authorized" : "unauthorized", data: { statuses } };
    },
  },
  {
    name: "browse",
    summary: "List the library and open one entry's render-ready sections",
    outcomes: ["ok", "empty", "not-found"],
    uses: ["title"],
    explain: [
      "POST /auth/login",
      "GET /entries",
      "GET /entries/{id} for --title (default: the first entry)",
      "ok = sections are non-empty and at least one line carries a rhyme letter",
    ],
    async run(ctx, client) {
      await requireLogin(ctx, client);
      const list = await client.request<{ id: string; title: string }[]>("GET", "/entries");
      expectStatus(list.status, 200, "GET /entries");
      const title = stringOpt(ctx, "title");
      const pick = title ? list.body.find((e) => e.title === title) : list.body[0];
      if (!pick)
        return { outcome: title ? "not-found" : "empty", data: { entries: list.body.length } };
      const detail = await client.request<EntryDetail>("GET", `/entries/${pick.id}`);
      expectStatus(detail.status, 200, "GET /entries/{id}");
      const lines = detail.body.sections.flatMap((s) => s.lines);
      const lettered = lines.filter((line) => line.rhyme?.letter).length;
      if (detail.body.sections.length === 0 || lettered === 0) {
        throw new SandboxError(
          `"${pick.title}" rendered ${detail.body.sections.length} sections, ${lettered} lettered lines`,
        );
      }
      writeLastEntryId(ctx.id, pick.id);
      return {
        outcome: "ok",
        data: {
          entries: list.body.length,
          entryId: pick.id,
          title: pick.title,
          sections: detail.body.sections.map((s) => s.type),
          letters: lines.map((line) => line.rhyme?.letter ?? null),
        },
      };
    },
  },
  {
    name: "create-entry",
    summary: "Create an entry and read it back",
    outcomes: ["created", "invalid"],
    uses: ["title", "kind", "body", "body-file", "author"],
    explain: [
      "POST /auth/login",
      "POST /entries with --title, --kind (poem|song), --body or --body-file, --author",
      "GET /entries/{id}",
      "created = 201 and the read-back body has the same section count; invalid = 400",
      "Records the entry for --last",
    ],
    async run(ctx, client) {
      await requireLogin(ctx, client);
      const body = bodyOpt(ctx) ?? DEFAULT_BODY;
      const kind = stringOpt(ctx, "kind") ?? "poem";
      const author = stringOpt(ctx, "author");
      const input = {
        kind,
        title: stringOpt(ctx, "title") ?? `Flow entry ${new Date().toISOString()}`,
        body,
        authors: author ? [author] : [],
        ...(kind === "song" ? { artists: [] } : {}),
      };
      const created = await client.request<EntryDetail>("POST", "/entries", { body: input });
      if (created.status === 400) return { outcome: "invalid", data: { error: created.body } };
      expectStatus(created.status, 201, "POST /entries");
      const read = await client.request<EntryDetail>("GET", `/entries/${created.body.id}`);
      expectStatus(read.status, 200, "GET /entries/{id}");
      const expectedSections = body.trim().split(/\n\s*\n/).length;
      if (read.body.sections.length !== expectedSections) {
        throw new SandboxError(
          `expected ${expectedSections} sections, read back ${read.body.sections.length}`,
        );
      }
      writeLastEntryId(ctx.id, created.body.id);
      return {
        outcome: "created",
        data: {
          entryId: created.body.id,
          title: read.body.title,
          sections: read.body.sections.length,
        },
      };
    },
  },
  {
    name: "edit-entry",
    summary: "Rewrite an entry's body and relabel its sections",
    outcomes: ["updated", "not-found", "invalid"],
    uses: ["id", "last", "body", "body-file", "structure"],
    explain: [
      "POST /auth/login",
      "PUT /entries/{id}/body with --body/--body-file (default: the current body plus one line)",
      "PUT /entries/{id}/structure with --structure a,b,c (default: chorus for every section)",
      "GET /entries/{id}",
      "updated = both writes land; not-found = 404; invalid = 400",
      "Targets --id, or --last (the default)",
    ],
    async run(ctx, client) {
      await requireLogin(ctx, client);
      const entryId = targetEntry(ctx);
      const before = await client.request<EntryDetail>("GET", `/entries/${entryId}`);
      if (before.status === 404) return { outcome: "not-found", data: { entryId } };
      expectStatus(before.status, 200, "GET /entries/{id}");
      const body = bodyOpt(ctx) ?? `${before.body.body}\nAnd one more line the flow appended.`;
      const putBody = await client.request("PUT", `/entries/${entryId}/body`, { body: { body } });
      if (putBody.status === 400) return { outcome: "invalid", data: { error: putBody.body } };
      if (putBody.status === 404) return { outcome: "not-found", data: { entryId } };
      expectStatus(putBody.status, 204, "PUT /entries/{id}/body");
      const sectionCount = body.trim().split(/\n\s*\n/).length;
      const structure =
        stringOpt(ctx, "structure")
          ?.split(",")
          .map((s) => s.trim()) ?? Array.from({ length: sectionCount }, () => "chorus");
      const putStructure = await client.request("PUT", `/entries/${entryId}/structure`, {
        body: { structure },
      });
      if (putStructure.status === 400)
        return { outcome: "invalid", data: { error: putStructure.body } };
      expectStatus(putStructure.status, 204, "PUT /entries/{id}/structure");
      const after = await client.request<EntryDetail>("GET", `/entries/${entryId}`);
      expectStatus(after.status, 200, "GET /entries/{id}");
      const types = after.body.sections.map((s) => s.type);
      if (types.join() !== structure.slice(0, types.length).join()) {
        throw new SandboxError(
          `structure read back as ${types.join(",")}, wrote ${structure.join(",")}`,
        );
      }
      writeLastEntryId(ctx.id, entryId);
      return { outcome: "updated", data: { entryId, structure: types } };
    },
  },
  {
    name: "delete-entry",
    summary: "Delete an entry and confirm it's gone",
    outcomes: ["deleted", "not-found"],
    uses: ["id", "last"],
    explain: [
      "POST /auth/login",
      "DELETE /entries/{id}",
      "GET /entries/{id}",
      "deleted = 204 then 404; not-found = the DELETE got 404",
      "Targets --id, or --last (the default)",
    ],
    async run(ctx, client) {
      await requireLogin(ctx, client);
      const entryId = targetEntry(ctx);
      const deleted = await client.request("DELETE", `/entries/${entryId}`);
      if (deleted.status === 404) return { outcome: "not-found", data: { entryId } };
      expectStatus(deleted.status, 204, "DELETE /entries/{id}");
      const read = await client.request("GET", `/entries/${entryId}`);
      expectStatus(read.status, 404, "GET /entries/{id} after delete");
      writeLastEntryId(ctx.id, null);
      return { outcome: "deleted", data: { entryId } };
    },
  },
  {
    name: "foreign-entry",
    summary: "Try to read, edit, and delete another user's entry",
    outcomes: ["not-found", "leaked"],
    uses: [],
    explain: [
      "SQL setup: insert a second user and an entry they own",
      "POST /auth/login as the sandbox user",
      "GET, PUT body, and DELETE that entry through the API",
      "not-found = all three get 404 and the row is untouched; leaked = any got through",
      "SQL teardown removes the second user",
    ],
    async run(ctx, client) {
      const userId = randomUUID();
      const entryId = randomUUID();
      const setup = ctx.pg.sql(
        ctx.id.db,
        `INSERT INTO users (id, email, display_name, password_hash) VALUES ('${userId}', 'foreign-${userId}@rhymelab.test', 'Foreign', '-');
         INSERT INTO lyric_entries (id, kind, title, body, user_id) VALUES ('${entryId}', 'poem', 'Not yours', 'private line', '${userId}');`,
      );
      if (!setup.ok) throw new SandboxError(`setup failed: ${setup.stderr}`);
      try {
        await requireLogin(ctx, client);
        const statuses = {
          get: (await client.request("GET", `/entries/${entryId}`)).status,
          put: (
            await client.request("PUT", `/entries/${entryId}/body`, { body: { body: "pwned" } })
          ).status,
          delete: (await client.request("DELETE", `/entries/${entryId}`)).status,
        };
        const row = ctx.pg.sql(
          ctx.id.db,
          `SELECT body FROM lyric_entries WHERE id = '${entryId}' AND deleted_at IS NULL`,
        ).stdout;
        const leaked = Object.values(statuses).some((s) => s !== 404) || row !== "private line";
        return {
          outcome: leaked ? "leaked" : "not-found",
          data: { statuses, rowIntact: row === "private line" },
        };
      } finally {
        ctx.pg.sql(ctx.id.db, `DELETE FROM users WHERE id = '${userId}'`);
      }
    },
  },
  {
    name: "lifecycle",
    summary: "create-entry → edit-entry → delete-entry in one run",
    outcomes: ["ok", "failed"],
    uses: [],
    explain: [
      "Runs create-entry, edit-entry --last, delete-entry --last",
      "ok = created, updated, deleted",
    ],
    async run(ctx, client) {
      const steps: Record<string, string> = {};
      let lastEntryId = ctx.lastEntryId;
      for (const name of ["create-entry", "edit-entry", "delete-entry"]) {
        const flow = FLOWS.find((f) => f.name === name);
        if (!flow) throw new SandboxError(`missing flow ${name}`);
        const { outcome, data } = await flow.run({ ...ctx, lastEntryId, values: {} }, client);
        steps[name] = outcome;
        if (typeof data.entryId === "string") lastEntryId = data.entryId;
      }
      const ok =
        steps["create-entry"] === "created" &&
        steps["edit-entry"] === "updated" &&
        steps["delete-entry"] === "deleted";
      return { outcome: ok ? "ok" : "failed", data: { steps } };
    },
  },
];

/** Every flag any flow reads. The `flow` command registers exactly these. */
export const FLOW_OPTIONS: Record<string, { type: "string" | "boolean"; description: string }> = {
  password: { type: "string", description: "login: password to try" },
  title: { type: "string", description: "browse/create-entry: entry title" },
  kind: { type: "string", description: "create-entry: poem | song" },
  body: { type: "string", description: "create/edit-entry: entry text (\\n for newlines)" },
  "body-file": { type: "string", description: "create/edit-entry: read the text from a file" },
  author: { type: "string", description: "create-entry: one author" },
  structure: { type: "string", description: "edit-entry: comma-separated section types" },
  id: { type: "string", description: "edit/delete-entry: target entry id" },
  last: {
    type: "boolean",
    description: "edit/delete-entry: target the last flow's entry (default)",
  },
};

async function requireLogin(ctx: FlowCtx, client: ApiClient): Promise<void> {
  if (!(await client.login(ctx.password))) {
    throw new SandboxError("the sandbox password was refused", {
      fix: "./rhymelab-sandbox doctor",
    });
  }
}

function targetEntry(ctx: FlowCtx): string {
  const entryId = stringOpt(ctx, "id") ?? ctx.lastEntryId;
  if (!entryId) {
    throw new SandboxError("no target entry: pass --id, or run create-entry or browse first", {
      exitCode: 2,
    });
  }
  return entryId;
}

function stringOpt(ctx: FlowCtx, name: string): string | undefined {
  const value = ctx.values[name];
  return typeof value === "string" ? value : undefined;
}

function bodyOpt(ctx: FlowCtx): string | undefined {
  const file = stringOpt(ctx, "body-file");
  if (file) return readFileSync(file, "utf8");
  return stringOpt(ctx, "body")?.replaceAll("\\n", "\n");
}

function expectStatus(actual: number, expected: number, what: string): void {
  if (actual !== expected)
    throw new SandboxError(`${what} returned ${actual}, expected ${expected}`);
}
