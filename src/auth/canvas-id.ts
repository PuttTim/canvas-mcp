/** Canvas can serialize its 64-bit IDs as decimal strings. Never coerce those to numbers. */
export type CanvasUserId = number | string;

export function isCanvasUserId(value: unknown): value is CanvasUserId {
  return typeof value === "number"
    ? Number.isSafeInteger(value) && value > 0
    : typeof value === "string" && /^[1-9]\d*$/.test(value);
}
