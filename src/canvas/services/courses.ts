import type { CanvasClient, PaginateOptions } from "../client.ts";
import type { QueryObject } from "../params.ts";
import type { Course, CourseNickname, CourseProgress, Favorite, Tab } from "../types.gen.ts";

export const courses = {
  list: (c: CanvasClient, query?: QueryObject, p?: PaginateOptions) =>
    c.collect<Course>(`/api/v1/courses`, query, p),
  get: (c: CanvasClient, id: number, query?: QueryObject) =>
    c.get<Course>(`/api/v1/courses/${id}`, { query }),
  tabs: (c: CanvasClient, courseId: number, query?: QueryObject) =>
    c.get<Tab[]>(`/api/v1/courses/${courseId}/tabs`, { query }),
  progress: (c: CanvasClient, courseId: number, userId: number | "self" = "self") =>
    c.get<CourseProgress>(`/api/v1/courses/${courseId}/users/${userId}/progress`),

  favorites: (c: CanvasClient, p?: PaginateOptions) =>
    c.collect<Course>(`/api/v1/users/self/favorites/courses`, undefined, p),
  addFavorite: (c: CanvasClient, id: number) =>
    c.post<Favorite>(`/api/v1/users/self/favorites/courses/${id}`),
  removeFavorite: (c: CanvasClient, id: number) =>
    c.delete<Favorite>(`/api/v1/users/self/favorites/courses/${id}`),

  nicknames: (c: CanvasClient) => c.get<CourseNickname[]>(`/api/v1/users/self/course_nicknames`),
  setNickname: (c: CanvasClient, courseId: number, nickname: string) =>
    c.put<CourseNickname>(`/api/v1/users/self/course_nicknames/${courseId}`, {
      query: { nickname },
    }),
  removeNickname: (c: CanvasClient, courseId: number) =>
    c.delete<CourseNickname>(`/api/v1/users/self/course_nicknames/${courseId}`),
};
