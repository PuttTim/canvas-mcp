import type { Feature, SafetyConfig } from "../context.ts";
import { type CanvasUserId, isCanvasUserId } from "./canvas-id.ts";

/** OAuth scopes this server issues. `canvas:read` is always granted. */
export const SCOPES = {
  read: "canvas:read",
  write: "canvas:write",
  destructive: "canvas:destructive",
  submit: "canvas:submit",
} as const;
export const ALL_SCOPES: readonly string[] = Object.values(SCOPES);
export type CanvasScope = (typeof SCOPES)[keyof typeof SCOPES];

/** Exhaustive mapping: new feature gates must declare their OAuth scope. */
export const FEATURE_SCOPES: Readonly<Record<Feature, CanvasScope>> = {
  submit: SCOPES.submit,
};

/** Props stored (encrypted by the provider) with every grant and access token. */
export interface GrantProps {
  v: 1;
  baseUrl: string;
  /** Canvas token sealed with PROPS_KEY (see auth/crypto.ts). */
  sealedToken: string;
  /** Non-reversible fingerprint of the Canvas token; keys the throttle Durable Object. */
  tokenId: string;
  userId: CanvasUserId;
  name: string;
  scopes: string[];
}

export function isGrantProps(x: unknown): x is GrantProps {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return (
    p.v === 1 &&
    typeof p.baseUrl === "string" &&
    typeof p.sealedToken === "string" &&
    typeof p.tokenId === "string" &&
    isCanvasUserId(p.userId) &&
    typeof p.name === "string" &&
    Array.isArray(p.scopes)
  );
}

export function safetyFromScopes(scopes: readonly string[]): SafetyConfig {
  const features = new Set<Feature>();
  for (const feature of Object.keys(FEATURE_SCOPES) as Feature[]) {
    if (scopes.includes(FEATURE_SCOPES[feature])) features.add(feature);
  }
  return {
    readOnly: !scopes.includes(SCOPES.write),
    allowDestructive: scopes.includes(SCOPES.destructive),
    features,
  };
}
