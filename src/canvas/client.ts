import { CanvasError, extractErrorMessages } from "./errors.ts";
import { type PageLinks, parseLinkHeader } from "./pagination.ts";
import { type QueryObject, withQuery } from "./params.ts";
import { MemoryThrottleStore, type ThrottleStore } from "./throttle.ts";

export type TokenSource = string | (() => Promise<string> | string);

export interface CanvasClientOptions {
  /** e.g. https://school.instructure.com (no trailing slash, no /api). */
  baseUrl: string;
  token: TokenSource;
  fetch?: typeof fetch;
  throttle?: ThrottleStore;
  /** Retries for rate-limit and 5xx responses. Default 3. */
  maxRetries?: number;
  /** Base backoff in ms (doubles per attempt, plus jitter). Default 500. */
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: string;
}

export interface RequestOptions {
  query?: QueryObject | undefined;
  /** JSON body. Canvas accepts JSON for all write endpoints. */
  body?: unknown;
  /** Raw body (multipart form data for uploads). Takes precedence over `body`. */
  rawBody?: BodyInit | undefined;
  headers?: Record<string, string> | undefined;
  signal?: AbortSignal | undefined;
}

export interface CanvasResponse<T> {
  data: T;
  status: number;
  links: PageLinks;
  cost: number | undefined;
  remaining: number | undefined;
  requestId: string | undefined;
}

export interface PaginateOptions {
  /** Some Canvas lists use an object envelope, e.g. { grading_periods: [...] }. */
  listKey?: string;
  /** Items per page (Canvas caps around 100). Default 50. */
  perPage?: number;
  /** Hard cap on pages fetched. Default 1. */
  maxPages?: number;
  /** Resume from an absolute `next` URL returned earlier. */
  pageUrl?: string | undefined;
  signal?: AbortSignal | undefined;
}

export interface Page<T> {
  items: T[];
  nextPageUrl: string | null;
  pagesFetched: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function numberHeader(h: Headers, name: string): number | undefined {
  const v = h.get(name);
  if (v === null) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

export class CanvasClient {
  readonly baseUrl: string;
  private readonly origin: string;
  private readonly token: TokenSource;
  private readonly fetchImpl: typeof fetch;
  private readonly throttle: ThrottleStore;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly userAgent: string;

  constructor(opts: CanvasClientOptions) {
    const url = new URL(opts.baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error(`Canvas base URL must use https: ${opts.baseUrl}`);
    }
    this.origin = url.origin;
    this.baseUrl = url.origin;
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.throttle = opts.throttle ?? new MemoryThrottleStore();
    this.maxRetries = opts.maxRetries ?? 3;
    this.backoffMs = opts.backoffMs ?? 500;
    this.sleep = opts.sleep ?? defaultSleep;
    this.userAgent = opts.userAgent ?? "canvas-mcp";
  }

  private async resolveToken(): Promise<string> {
    return typeof this.token === "string" ? this.token : await this.token();
  }

  /** Resolve a path or absolute URL against this instance, refusing other origins. */
  resolveUrl(pathOrUrl: string): string {
    const url = new URL(pathOrUrl, this.origin);
    if (url.origin !== this.origin) {
      throw new Error(`Refusing to send Canvas credentials to ${url.origin}`);
    }
    return url.toString();
  }

  get<T>(path: string, opts: RequestOptions = {}) {
    return this.request<T>("GET", path, opts);
  }
  post<T>(path: string, opts: RequestOptions = {}) {
    return this.request<T>("POST", path, opts);
  }
  put<T>(path: string, opts: RequestOptions = {}) {
    return this.request<T>("PUT", path, opts);
  }
  delete<T>(path: string, opts: RequestOptions = {}) {
    return this.request<T>("DELETE", path, opts);
  }

  async request<T>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<CanvasResponse<T>> {
    const url = this.resolveUrl(withQuery(path, opts.query));
    const token = await this.resolveToken();
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "user-agent": this.userAgent,
      ...opts.headers,
    };
    let body: BodyInit | undefined = opts.rawBody;
    if (body === undefined && opts.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    let attempt = 0;
    for (;;) {
      await this.throttle.acquire();
      let res: Response;
      try {
        const init: RequestInit = {
          method,
          headers,
          signal: opts.signal ?? null,
          redirect: "manual",
        };
        if (body !== undefined) init.body = body;
        res = await this.fetchImpl(url, init);
      } catch (err) {
        await this.throttle.release({});
        if (
          (method === "GET" || method === "HEAD") &&
          attempt < this.maxRetries &&
          !opts.signal?.aborted
        ) {
          await this.backoff(attempt++);
          continue;
        }
        throw new CanvasError({
          status: 0,
          messages: [`network error: ${(err as Error).message}`],
          path,
        });
      }

      const cost = numberHeader(res.headers, "x-request-cost");
      const remaining = numberHeader(res.headers, "x-rate-limit-remaining");
      const requestId = res.headers.get("x-request-context-id") ?? undefined;
      await this.throttle.release({ remaining, cost });

      const text = await res.text();
      let parsed: unknown;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      }

      if (res.ok) {
        return {
          data: parsed as T,
          status: res.status,
          links: parseLinkHeader(res.headers.get("link")),
          cost,
          remaining,
          requestId,
        };
      }

      const rateLimited =
        res.status === 429 ||
        (res.status === 403 && typeof parsed === "string" && /rate limit exceeded/i.test(parsed)) ||
        (res.status === 403 && remaining !== undefined && remaining <= 0);
      const retryable =
        rateLimited || res.status === 502 || res.status === 503 || res.status === 504;
      if (retryable && (method === "GET" || method === "HEAD") && attempt < this.maxRetries) {
        const retryAfter = numberHeader(res.headers, "retry-after");
        await this.backoff(attempt++, retryAfter ? retryAfter * 1000 : undefined);
        continue;
      }
      throw new CanvasError({
        status: res.status,
        messages: extractErrorMessages(parsed),
        path,
        requestId,
        rateLimited,
      });
    }
  }

  private async backoff(attempt: number, minMs?: number): Promise<void> {
    const base = this.backoffMs * 2 ** attempt;
    const jitter = Math.random() * base * 0.25;
    await this.sleep(Math.max(minMs ?? 0, base + jitter));
  }

  /** Iterate pages of a list endpoint following `Link: rel="next"`. */
  async *pages<T>(
    path: string,
    query?: QueryObject,
    opts: PaginateOptions = {},
  ): AsyncGenerator<CanvasResponse<T[]>> {
    const perPage = opts.perPage ?? 50;
    const maxPages = Math.max(1, opts.maxPages ?? 1);
    let url: string | undefined = opts.pageUrl ?? withQuery(path, { ...query, per_page: perPage });
    let fetched = 0;
    while (url && fetched < maxPages) {
      const res: CanvasResponse<T[] | Record<string, T[]>> = await this.request<
        T[] | Record<string, T[]>
      >("GET", url, { signal: opts.signal });
      const data = opts.listKey && !Array.isArray(res.data) ? res.data[opts.listKey] : res.data;
      if (!Array.isArray(data)) throw new Error("Canvas returned an unexpected list response.");
      fetched++;
      yield { ...res, data };
      url = res.links.next;
    }
  }

  /** Collect up to `maxPages` pages into one array, returning a resume cursor. */
  async collect<T>(
    path: string,
    query?: QueryObject,
    opts: PaginateOptions = {},
  ): Promise<Page<T>> {
    const items: T[] = [];
    let nextPageUrl: string | null = null;
    let pagesFetched = 0;
    for await (const page of this.pages<T>(path, query, opts)) {
      pagesFetched++;
      if (Array.isArray(page.data)) items.push(...page.data);
      nextPageUrl = page.links.next ?? null;
    }
    return { items, nextPageUrl, pagesFetched };
  }
}
