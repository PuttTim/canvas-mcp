import type { CanvasClient, PaginateOptions } from "../client.ts";
import type { QueryObject } from "../params.ts";
import type { Profile, User } from "../types.gen.ts";

export const users = {
  self: (c: CanvasClient) => c.get<User>(`/api/v1/users/self`),
  profile: (c: CanvasClient, userId: number | "self" = "self") =>
    c.get<Profile>(`/api/v1/users/${userId}/profile`),
  get: (c: CanvasClient, userId: number | "self", query?: QueryObject) =>
    c.get<User>(`/api/v1/users/${userId}`, { query }),

  todo: (c: CanvasClient, query?: QueryObject, p?: PaginateOptions) =>
    c.collect<Record<string, unknown>>(`/api/v1/users/self/todo`, query, p),
  todoCount: (c: CanvasClient, query?: QueryObject) =>
    c.get<{ needs_grading_count: number; assignments_needing_submitting: number }>(
      `/api/v1/users/self/todo_item_count`,
      { query },
    ),
  upcomingEvents: (c: CanvasClient) =>
    c.get<Record<string, unknown>[]>(`/api/v1/users/self/upcoming_events`),
  missingSubmissions: (c: CanvasClient, query?: QueryObject, p?: PaginateOptions) =>
    c.collect<Record<string, unknown>>(`/api/v1/users/self/missing_submissions`, query, p),
  activityStream: (c: CanvasClient, query?: QueryObject, p?: PaginateOptions) =>
    c.collect<Record<string, unknown>>(`/api/v1/users/self/activity_stream`, query, p),
  activityStreamSummary: (c: CanvasClient) =>
    c.get<
      Array<{ type: string; unread_count: number; count: number; notification_category?: string }>
    >(`/api/v1/users/self/activity_stream/summary`),
  hideStreamItem: (c: CanvasClient, id: number) =>
    c.delete<{ hidden: boolean }>(`/api/v1/users/self/activity_stream/${id}`),
  hideAllStreamItems: (c: CanvasClient) =>
    c.delete<{ hidden: boolean }>(`/api/v1/users/self/activity_stream`),
};
