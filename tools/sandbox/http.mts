/**
 * A minimal client for the API's REST routes that records every request as a
 * timed hop, and the session login built on it.
 */
export interface Hop {
  method: string;
  path: string;
  status: number;
  ms: number;
}

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  setCookie: string[];
}

export const SESSION_COOKIE = "rhymelab_session";

export class ApiClient {
  readonly base: string;
  readonly trace: Hop[] = [];
  cookie: string | undefined;

  constructor(base: string, cookie?: string) {
    this.base = base;
    this.cookie = cookie;
  }

  /** Send one request. Never throws on an HTTP error status; check `status`. */
  async request<T = unknown>(
    method: string,
    path: string,
    { body, headers = {} }: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse<T>> {
    const started = performance.now();
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    this.trace.push({
      method,
      path,
      status: res.status,
      ms: Math.round(performance.now() - started),
    });
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {}
    return { status: res.status, body: parsed as T, setCookie: res.headers.getSetCookie() };
  }

  /**
   * Log in through the real `auth/login` route. On success the session cookie
   * is kept for later requests.
   *
   * @return Whether the password was accepted.
   */
  async login(password: string): Promise<boolean> {
    const res = await this.request<{ ok?: boolean }>("POST", "/auth/login", { body: { password } });
    const cookie = res.setCookie
      .map((header) => header.split(";")[0] ?? "")
      .find((pair) => pair.startsWith(`${SESSION_COOKIE}=`));
    if (res.status !== 200 || res.body?.ok !== true || !cookie) return false;
    this.cookie = cookie;
    return true;
  }

  /** Whether the API considers the current cookie a valid session. */
  async authed(): Promise<boolean> {
    const res = await this.request<{ authed?: boolean }>("GET", "/auth/me");
    return res.status === 200 && res.body?.authed === true;
  }
}
