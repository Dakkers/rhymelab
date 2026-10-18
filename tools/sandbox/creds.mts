/**
 * Planted credentials. The session comes from the real login route, so agents
 * authenticate exactly like the web app does.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Identity } from "./identity.mts";
import { apiUrl, sandboxPassword, webUrl, type Ports } from "./env.mts";
import { ApiClient } from "./http.mts";
import { SandboxError } from "./proc.mts";

export interface Credentials {
  webUrl: string;
  apiUrl: string;
  password: string;
  cookie: string;
  createdAt: string;
}

/**
 * Log in against the running API and write the session to the credentials file.
 *
 * @throws {SandboxError} When the login is refused or the session doesn't verify.
 */
export async function plantCredentials(id: Identity, ports: Ports): Promise<Credentials> {
  const password = sandboxPassword(id);
  const client = new ApiClient(apiUrl(ports));
  if (!(await client.login(password)) || !client.cookie || !(await client.authed())) {
    throw new SandboxError("The API refused the sandbox password.", {
      fix: "Something exported APP_PASSWORD over the committed default; unset it and run `up` again.",
    });
  }
  const creds: Credentials = {
    webUrl: webUrl(ports),
    apiUrl: apiUrl(ports),
    password,
    cookie: client.cookie,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(id.credentialsFile, `${JSON.stringify(creds, null, 2)}\n`);
  return creds;
}

/** The planted credentials, or null when none are planted. */
export function readCredentials(id: Identity): Credentials | null {
  try {
    return JSON.parse(readFileSync(id.credentialsFile, "utf8")) as Credentials;
  } catch {
    return null;
  }
}

/** Copy-pasteable requests that exercise the planted session. */
export function curlExamples(creds: Credentials): string[] {
  return [
    `curl -s -b '${creds.cookie}' ${creds.apiUrl}/entries`,
    `curl -s -b '${creds.cookie}' ${creds.apiUrl}/auth/me`,
    `curl -s -c cookies.txt -H 'content-type: application/json' -d '{"password":"${creds.password}"}' ${creds.apiUrl}/auth/login`,
  ];
}
