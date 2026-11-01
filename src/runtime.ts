import type { OperationMeta } from "./meta.js";

export const DEFAULT_BASE_URL = "https://api.advernue.com";

export interface ClientOptions {
  /** Bearer API key. Falls back to the ADVERNUE_API_KEY environment variable. */
  apiKey?: string;
  /** Falls back to ADVERNUE_BASE_URL, then https://api.advernue.com. */
  baseUrl?: string;
  /** Custom fetch (tests, proxies). Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Retries after the first attempt on 429/5xx. Default 2. */
  maxRetries?: number;
  /** Base backoff in ms (doubles per attempt, with jitter). Default 300. */
  retryBaseMs?: number;
  /** Per-request timeout in ms. Default 60000. */
  timeoutMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}
export interface WriteOptions extends RequestOptions {
  /** Idempotency-Key header. Generated automatically when omitted. */
  idempotencyKey?: string;
}
export interface DryRunOptions extends WriteOptions {
  /** Send `?dry_run=true`: validate and preview only, nothing is sent to the platform. */
  dryRun?: boolean;
}

export type CallOptions = DryRunOptions;
export type Call = (meta: OperationMeta, params?: object, body?: unknown, opts?: CallOptions) => Promise<unknown>;

/** Thrown for every non-2xx response, built from the `{error:{code,message,details}}` envelope. */
export class AdvernueError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly body: unknown;
  constructor(status: number, code: string, message: string, details?: unknown, body?: unknown) {
    super(message);
    this.name = "AdvernueError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.body = body;
  }
}

const env = (k: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k] || undefined;

function buildUrl(base: string, meta: OperationMeta, params: Record<string, unknown>, dryRun: boolean): string {
  const path = meta.path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name];
    if (v === undefined || v === null) throw new TypeError(`${meta.id}: missing path parameter "${name}"`);
    return encodeURIComponent(String(v));
  });
  const qs = new URLSearchParams();
  for (const q of meta.query) {
    const v = params[q.name];
    if (v === undefined || v === null) continue;
    for (const item of Array.isArray(v) ? v : [v]) qs.append(q.name, String(item));
  }
  if (dryRun) qs.set("dry_run", "true");
  const s = qs.toString();
  return base.replace(/\/+$/, "") + path + (s ? "?" + s : "");
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json")) return res.json();
  if (ct.startsWith("text/") || ct.includes("javascript")) return res.text();
  return res.arrayBuffer();
}

export function createCall(options: ClientOptions = {}): Call {
  const doFetch = options.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const maxRetries = options.maxRetries ?? 2;
  const retryBaseMs = options.retryBaseMs ?? 300;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  return async (meta, params = {}, body, opts = {}) => {
    const apiKey = options.apiKey ?? env("ADVERNUE_API_KEY");
    if (meta.auth && !apiKey) {
      throw new Error("Missing API key: pass { apiKey } or set ADVERNUE_API_KEY");
    }
    const base = options.baseUrl ?? env("ADVERNUE_BASE_URL") ?? DEFAULT_BASE_URL;
    const dryRun = meta.dryRun && opts.dryRun === true;
    const url = buildUrl(base, meta, params as Record<string, unknown>, dryRun);

    const headers: Record<string, string> = { accept: "application/json, */*", ...opts.headers };
    if (meta.auth && apiKey) headers.authorization = `Bearer ${apiKey}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    let idempotencyKey: string | undefined;
    if (meta.idempotent && meta.method !== "GET") {
      idempotencyKey = opts.idempotencyKey ?? globalThis.crypto.randomUUID();
      headers["idempotency-key"] = idempotencyKey;
    }
    // GETs are safe to retry; writes only when the server can dedupe them.
    const retryable = meta.method === "GET" || idempotencyKey !== undefined;

    for (let attempt = 0; ; attempt++) {
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 60_000);
      const res = await doFetch(url, {
        method: meta.method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
      });
      if (res.ok) return parseBody(res);

      if (retryable && attempt < maxRetries && (res.status === 429 || res.status >= 500)) {
        const ra = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 30_000) : retryBaseMs * 2 ** attempt * (0.5 + Math.random() / 2);
        void res.body?.cancel().catch(() => {});
        await sleep(wait);
        continue;
      }
      let parsed: unknown;
      try {
        parsed = await parseBody(res);
      } catch {
        parsed = undefined;
      }
      const e = (parsed as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
      throw new AdvernueError(
        res.status,
        e?.code ?? `http_${res.status}`,
        e?.message ?? (res.statusText || `HTTP ${res.status}`),
        e?.details,
        parsed,
      );
    }
  };
}
