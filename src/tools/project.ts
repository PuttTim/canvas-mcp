import { NodeHtmlMarkdown } from "node-html-markdown";

const nhm = new NodeHtmlMarkdown({ bulletMarker: "-", useInlineLinks: true });

/** Convert Canvas HTML bodies to Markdown for compact, readable tool output. */
export function htmlToMarkdown(html: string | null | undefined): string | null {
  if (!html) return null;
  try {
    return nhm.translate(html).trim();
  } catch {
    return html.replace(/<[^>]+>/g, "").trim();
  }
}

/** Keep only the listed keys (when present) from a Canvas object. */
export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (k in obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}
