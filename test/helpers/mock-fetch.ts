/**
 * Tiny scripted fetch for unit tests: match on method + path (+ optional
 * query), respond with JSON/text and headers. Records every call.
 */
export interface MockRoute {
  method?: string;
  /** Path (with or without query) or absolute URL. Compared against the request URL's path (+search when given). */
  path: string;
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
  /** Called instead of static response. */
  handler?: (req: Request, url: URL) => Response | Promise<Response>;
  /** Only match N times (default: unlimited). */
  times?: number;
}

export interface RecordedCall {
  method: string;
  url: URL;
  headers: Headers;
  body: string | null;
}

export function mockFetch(routes: MockRoute[]) {
  const calls: RecordedCall[] = [];
  const remaining = routes.map((r) => r.times ?? Number.POSITIVE_INFINITY);
  const fetchImpl: typeof fetch = async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const body = req.method === "GET" || req.method === "HEAD" ? null : await req.text();
    calls.push({ method: req.method, url, headers: req.headers, body });
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i];
      if (!r) continue;
      if ((r.method ?? "GET").toUpperCase() !== req.method) continue;
      const target = r.path.startsWith("http") ? new URL(r.path) : new URL(r.path, url.origin);
      const wantSearch = target.search !== "";
      if (target.pathname !== url.pathname) continue;
      if (wantSearch && target.search !== url.search) continue;
      if ((remaining[i] ?? 0) <= 0) continue;
      remaining[i] = (remaining[i] ?? 0) - 1;
      if (r.handler) return r.handler(req, url);
      const headers = new Headers(r.headers ?? {});
      if (r.json !== undefined && !headers.has("content-type"))
        headers.set("content-type", "application/json");
      const payload = r.json !== undefined ? JSON.stringify(r.json) : (r.text ?? "");
      return new Response(payload, { status: r.status ?? 200, headers });
    }
    return new Response(
      JSON.stringify({
        errors: [{ message: `unmatched ${req.method} ${url.pathname}${url.search}` }],
      }),
      {
        status: 599,
        headers: { "content-type": "application/json" },
      },
    );
  };
  return { fetch: fetchImpl, calls };
}
