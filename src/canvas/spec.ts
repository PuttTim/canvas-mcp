import endpointsJson from "../../spec/endpoints.json";
import overridesJson from "../../spec/overrides.json";

export interface SpecParam {
  name: string;
  in: string;
  type: string;
  required: boolean;
  description?: string;
  enum?: string[];
}

export interface SpecEndpoint {
  method: string;
  path: string;
  nickname: string;
  resource: string;
  summary: string;
  description?: string;
  params: SpecParam[];
  returns?: string;
}

const rawEndpoints = [...endpointsJson, ...overridesJson] as Array<
  Partial<SpecEndpoint> & Pick<SpecEndpoint, "method" | "path">
>;

/** Overrides are allowed to be intentionally minimal; normalise them for runtime consumers. */
export const specEndpoints: SpecEndpoint[] = rawEndpoints.map((endpoint) => ({
  method: endpoint.method,
  path: endpoint.path,
  nickname: endpoint.nickname ?? `${endpoint.method.toLowerCase()}_${endpoint.path}`,
  resource: endpoint.resource ?? "overrides",
  summary: endpoint.summary ?? "Locally documented Canvas endpoint override",
  params: endpoint.params ?? [],
  ...(endpoint.description === undefined ? {} : { description: endpoint.description }),
  ...(endpoint.returns === undefined ? {} : { returns: endpoint.returns }),
}));

function pathSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

export function matchesSpecPath(template: string, path: string): boolean {
  const expected = pathSegments(template);
  const actual = pathSegments(path);
  if (expected.length !== actual.length) return false;
  return expected.every((segment, index) => {
    const value = actual[index];
    if (value === undefined) return false;
    return segment.startsWith("{") || segment === value;
  });
}

export function findSpecEndpoint(method: string, path: string): SpecEndpoint | undefined {
  return specEndpoints.find(
    (endpoint) => endpoint.method === method && matchesSpecPath(endpoint.path, path),
  );
}
