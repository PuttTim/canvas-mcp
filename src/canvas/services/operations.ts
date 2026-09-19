import type { CanvasClient } from "../client.ts";
import { type QueryObject, withQuery } from "../params.ts";

export interface Operation {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
}

/** Declarative service routes are checked against the committed Canvas spec in CI. */
export function endpoint(method: Operation["method"], path: string): Operation {
  return { method, path };
}

export function operationPath(operation: Operation, args: Record<string, unknown>): string {
  return operation.path.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = args[key];
    if (typeof value !== "string" && typeof value !== "number") {
      throw new Error(`Missing path parameter: ${key}`);
    }
    if (value === "." || value === "..") throw new Error(`Invalid path parameter: ${key}`);
    return encodeURIComponent(String(value));
  });
}

export interface RequestPreview {
  method: Operation["method"];
  url: string;
  body?: unknown;
}

export function previewRequest(
  canvas: CanvasClient,
  operation: Operation,
  path: string,
  query?: QueryObject,
  body?: unknown,
): RequestPreview {
  return {
    method: operation.method,
    url: canvas.resolveUrl(withQuery(path, query)),
    ...(body === undefined ? {} : { body: JSON.parse(JSON.stringify(body)) }),
  };
}
