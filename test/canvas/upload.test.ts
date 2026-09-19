import { describe, expect, it, vi } from "vitest";
import { CanvasClient } from "../../src/canvas/client.ts";
import { NoopThrottleStore } from "../../src/canvas/throttle.ts";
import { decodeUpload, MAX_UPLOAD_BYTES, uploadFile } from "../../src/canvas/upload.ts";
import { mockFetch } from "../helpers/mock-fetch.ts";

const base = "https://school.instructure.com";
const metadata = { name: "hello.txt", content_type: "text/plain" };
function setup(
  uploadUrl = "https://storage.example/upload",
  location = `${base}/api/v1/files/7/create_success?uuid=signed`,
) {
  const mock = mockFetch([
    {
      method: "POST",
      path: "/api/v1/users/self/files",
      json: { upload_url: uploadUrl, upload_params: { key: "a", policy: "b" } },
    },
    {
      path: "/api/v1/files/7/create_success?uuid=signed",
      json: { id: 7, display_name: "hello.txt" },
    },
  ]);
  const canvas = new CanvasClient({
    baseUrl: base,
    token: "secret",
    fetch: mock.fetch,
    throttle: new NoopThrottleStore(),
    maxRetries: 0,
  });
  const storage = vi.fn<typeof fetch>(async (_input, init) => {
    expect(init?.redirect).toBe("manual");
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    const data = init?.body as FormData;
    expect([...data.keys()]).toEqual(["key", "policy", "file"]);
    return new Response(null, { status: 303, headers: { location } });
  });
  return { canvas, mock, storage };
}

describe("Canvas uploads", () => {
  it("confirms a redirected upload with a same-origin authenticated GET", async () => {
    const { canvas, mock, storage } = setup();
    const result = await uploadFile(
      canvas,
      "/api/v1/users/self/files",
      decodeUpload("aGVsbG8="),
      metadata,
      storage,
    );
    expect(result).toMatchObject({ id: 7 });
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[1]?.headers.get("authorization")).toBe("Bearer secret");
  });
  it("rejects foreign confirmation URLs without leaking the bearer", async () => {
    const { canvas, mock, storage } = setup(
      "https://storage.example/upload",
      "https://evil.example/collect",
    );
    await expect(
      uploadFile(canvas, "/api/v1/users/self/files", decodeUpload("aA=="), metadata, storage),
    ).rejects.toThrow(/Refusing/);
    expect(mock.calls).toHaveLength(1);
  });
  it.each([
    "http://storage.example/upload",
    "https://127.0.0.1/upload",
    "https://host.internal/upload",
    "https://user:pass@storage.example/upload",
  ])("rejects unsafe storage URL %s", async (url) => {
    const { canvas, storage } = setup(url);
    await expect(
      uploadFile(canvas, "/api/v1/users/self/files", decodeUpload("aA=="), metadata, storage),
    ).rejects.toThrow();
    expect(storage).not.toHaveBeenCalled();
  });
  it("rejects malformed/oversized base64 before any request", () => {
    expect(() => decodeUpload("%%%")).toThrow(/base64/);
    expect(() => decodeUpload("a".repeat(4 * Math.ceil(MAX_UPLOAD_BYTES / 3) + 4))).toThrow(
      /5 MiB/,
    );
    expect(decodeUpload("").byteLength).toBe(0);
  });
  it("does not retry a failed storage POST", async () => {
    const { canvas } = setup();
    const storage = vi.fn<typeof fetch>(async () => new Response("error", { status: 503 }));
    await expect(
      uploadFile(canvas, "/api/v1/users/self/files", decodeUpload("aA=="), metadata, storage),
    ).rejects.toThrow(/503/);
    expect(storage).toHaveBeenCalledTimes(1);
  });
});
