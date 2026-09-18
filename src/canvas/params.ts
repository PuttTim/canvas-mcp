/**
 * Rails-style query encoding used by Canvas:
 *   { include: ["a", "b"] }        → include[]=a&include[]=b
 *   { assignment: { name: "x" } }  → assignment[name]=x
 *   { per_page: 50, flag: true }   → per_page=50&flag=true
 * `undefined` and `null` values are skipped.
 */
export type QueryValue = string | number | boolean | null | undefined | QueryValue[] | QueryObject;
export interface QueryObject {
  [key: string]: QueryValue;
}

export function encodeQuery(query: QueryObject | undefined): URLSearchParams {
  const params = new URLSearchParams();
  if (!query) return params;
  const add = (key: string, value: QueryValue) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      for (const v of value) add(`${key}[]`, v);
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) add(`${key}[${k}]`, v);
      return;
    }
    params.append(key, String(value));
  };
  for (const [k, v] of Object.entries(query)) add(k, v);
  return params;
}

/** Append query params to a path or absolute URL, preserving any existing params. */
export function withQuery(urlOrPath: string, query: QueryObject | undefined): string {
  const encoded = encodeQuery(query);
  if ([...encoded.keys()].length === 0) return urlOrPath;
  const sep = urlOrPath.includes("?") ? "&" : "?";
  return `${urlOrPath}${sep}${encoded.toString()}`;
}
