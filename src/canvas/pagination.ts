/**
 * Canvas paginates with RFC 5988 `Link` headers:
 *   <https://host/api/v1/courses?page=2&per_page=10>; rel="next", <...>; rel="last"
 * Only `rel` values that apply are present (`last` may be omitted when the
 * total is expensive to compute).
 */
export interface PageLinks {
  current?: string;
  next?: string;
  prev?: string;
  first?: string;
  last?: string;
}

export function parseLinkHeader(header: string | null | undefined): PageLinks {
  const links: PageLinks = {};
  if (!header) return links;
  for (const part of header.split(",")) {
    const m = /<([^>]+)>\s*;\s*(.*)/.exec(part.trim());
    if (!m) continue;
    const url = m[1];
    const relMatch = /rel="?([a-z]+)"?/i.exec(m[2] ?? "");
    const rel = relMatch?.[1]?.toLowerCase();
    if (!url || !rel) continue;
    if (
      rel === "current" ||
      rel === "next" ||
      rel === "prev" ||
      rel === "first" ||
      rel === "last"
    ) {
      links[rel] = url;
    }
  }
  return links;
}
