import { z } from "zod";
import type { Page } from "../canvas/client.ts";

/** Shared pagination inputs for list tools. */
export const paginationInput = {
  page_url: z
    .string()
    .url()
    .optional()
    .describe(
      "Resume from a `next_page_url` returned by a previous call. Overrides other filters.",
    ),
  per_page: z.number().int().min(1).max(100).default(25).describe("Items per page (max 100)."),
  max_pages: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(1)
    .describe("How many pages to fetch in one call."),
};
export type PaginationArgs = { page_url?: string | undefined; per_page: number; max_pages: number };

export function paginateOpts(args: PaginationArgs) {
  return { perPage: args.per_page, maxPages: args.max_pages, pageUrl: args.page_url };
}

export interface ListResult<T> {
  items: T[];
  count: number;
  next_page_url: string | null;
}

export function listResult<T, U>(page: Page<T>, project: (item: T) => U, noun: string) {
  const items = page.items.map(project);
  const structured: ListResult<U> = { items, count: items.length, next_page_url: page.nextPageUrl };
  const more = page.nextPageUrl ? " More available: pass next_page_url as page_url." : "";
  return {
    structured,
    text: `${items.length} ${noun}${items.length === 1 ? "" : "s"} returned.${more}`,
  };
}

export const verboseInput = z
  .boolean()
  .default(false)
  .describe("Return the full Canvas object instead of a trimmed projection.");

export const courseIdInput = z.number().int().positive().describe("Canvas course id.");
