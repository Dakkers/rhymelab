# Sandbox flows

A flow is a scripted scenario that runs through the real API: real login, signed
cookies, validation, and Postgres. Setup MAY use SQL when no route exists (for
example, creating a second user). Every assertion goes through HTTP.

```bash
./rhymelab-sandbox flow list                 # names, summaries, possible outcomes
./rhymelab-sandbox flow edit-entry --explain # the hops, without running them
./rhymelab-sandbox flow login --password nope --expect rejected
```

## Reading the result

Every run prints its outcome and a timed hop trace:

```
flow create-entry: created (as expected)
  POST   /auth/login                                    → 200  33ms
  POST   /entries                                       → 201  21ms
  GET    /entries/d7d313cc-…                            → 200  4ms
  total 128ms
```

Each flow lists its possible outcomes, happy path first. `--expect <outcome>`
makes the exit code the assertion: `0` on a match, `1` otherwise. An outcome the
flow can never report exits `2` before anything runs. When a flow hits a status
its scenario doesn't allow, the outcome is `error`, the message names the hop,
and the run exits `1`. With `--json`, the hops are in `hops[]` either way.

## Chaining and custom cases

`create-entry` and `browse` record the entry they touched. `edit-entry` and
`delete-entry` target that entry by default (`--last`), or `--id <uuid>`:

```bash
./rhymelab-sandbox flow create-entry --title "Mine" --body 'a\nb\n\nc' --expect created
./rhymelab-sandbox flow edit-entry --structure verse,chorus --expect updated
./rhymelab-sandbox flow delete-entry --expect deleted
```

`--body` turns `\n` into newlines. `--body-file` reads a file. A blank line
separates sections.

## Adversarial flows

- `forged-session`: no cookie, an unsigned cookie, and a tampered signature MUST
  all get 401.
- `foreign-entry`: another user's entry MUST be 404 for read, write, and
  delete, and the row MUST be untouched.
- `login --password <wrong>`: MUST be `rejected`, with no session.

## Adding a flow

Add a `Flow` to `FLOWS` in `tools/sandbox/flows.mts`: its outcomes (happy path
first), the flags it reads (`uses`, which must also be registered in
`FLOW_OPTIONS`), `explain` lines, and `run`. Use the `ApiClient` you're given so
every request shows up in the trace. Then add the flow, with its `--expect`, to
`tools/sandbox/e2e.mts` so CI runs it.
