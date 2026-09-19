import { normalizeCanvasUrl } from "../auth/canvas-url.ts";
import type { CanvasClient } from "./client.ts";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function decodeUpload(base64: string): Uint8Array<ArrayBuffer> {
  if (
    base64.length > 4 * Math.ceil(MAX_UPLOAD_BYTES / 3) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
  ) {
    throw new Error("Provide valid base64 for a file of at most 5 MiB.");
  }
  const binary = atob(base64);
  if (binary.length > MAX_UPLOAD_BYTES) throw new Error("File exceeds the 5 MiB upload limit.");
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

interface UploadTicket {
  upload_url: string;
  upload_params: Record<string, string>;
}

/** Three-step upload. The signed storage request must never carry the Canvas token. */
export async function uploadFile(
  canvas: CanvasClient,
  path: string,
  bytes: Uint8Array<ArrayBuffer>,
  metadata: { name: string; content_type: string; parent_folder_id?: number | undefined },
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<unknown> {
  const ticket = (
    await canvas.post<UploadTicket>(path, {
      body: { ...metadata, size: bytes.byteLength, on_duplicate: "rename" },
    })
  ).data;
  if (
    !ticket ||
    typeof ticket.upload_url !== "string" ||
    !ticket.upload_params ||
    typeof ticket.upload_params !== "object" ||
    Array.isArray(ticket.upload_params)
  )
    throw new Error("Canvas did not return an upload ticket.");
  // Validate public HTTPS origin while retaining the signed path and query.
  normalizeCanvasUrl(ticket.upload_url);
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.upload_params)) {
    if (key === "file" || typeof value !== "string")
      throw new Error("Invalid Canvas upload parameters.");
    form.append(key, value);
  }
  form.append("file", new Blob([bytes], { type: metadata.content_type }), metadata.name);
  const response = await fetchImpl(ticket.upload_url, {
    method: "POST",
    body: form,
    redirect: "manual",
  });
  const location = response.headers.get("location");
  if ((response.status >= 300 && response.status < 400) || (response.status === 201 && location)) {
    if (!location) throw new Error("Upload response is missing its confirmation location.");
    // Completion is authenticated, so it must resolve back to this exact Canvas origin.
    const confirmUrl = canvas.resolveUrl(new URL(location, ticket.upload_url).href);
    await response.body?.cancel();
    return (await canvas.get<unknown>(confirmUrl)).data;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `File storage upload failed (HTTP ${response.status}); check your files before retrying.`,
    );
  }
  const file = (await response.json()) as Record<string, unknown>;
  if (!file?.id)
    throw new Error("Upload finished without a confirmed file ID; check Canvas before retrying.");
  return file;
}
