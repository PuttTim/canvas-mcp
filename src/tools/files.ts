import { z } from "zod";
import { operationPath, previewRequest } from "../canvas/services/operations.ts";
import { files, submissions } from "../canvas/services/student.ts";
import { decodeUpload, MAX_UPLOAD_BYTES, uploadFile } from "../canvas/upload.ts";
import { paginationInput, verboseInput } from "./common.ts";
import { defineTool } from "./registry.ts";
import { assignment, dryRunInput, id, projection, requestTool, text } from "./request.ts";

const fileFields = [
  "id",
  "display_name",
  "filename",
  "size",
  "content-type",
  "url",
  "folder_id",
  "created_at",
  "updated_at",
  "modified_at",
  "locked",
  "locked_for_user",
  "lock_explanation",
  "hidden",
  "hidden_for_user",
  "thumbnail_url",
];
const folderFields = [
  "id",
  "name",
  "full_name",
  "parent_folder_id",
  "context_type",
  "context_id",
  "files_count",
  "folders_count",
  "files_url",
  "folders_url",
  "locked_for_user",
  "hidden",
];
const uploadInput = {
  name: text.max(255),
  content_type: text.default("application/octet-stream"),
  content_base64: z
    .string()
    .max(4 * Math.ceil(MAX_UPLOAD_BYTES / 3))
    .describe(
      "Base64 file bytes (up to 5 MiB); local filesystem paths are not accessible to the hosted server.",
    ),
  dry_run: dryRunInput,
  verbose: verboseInput,
};

export const fileTools = [
  requestTool({
    name: "canvas_files_folders_list",
    toolset: "files",
    description: "List folders in your own files area, or in a course when course_id is supplied.",
    input: z.object({ course_id: id.optional(), ...paginationInput, verbose: verboseInput }),
    operation: (a) => (a.course_id ? files.courseFolders : files.userFolders),
    list: true,
    fields: folderFields,
  }),
  requestTool({
    name: "canvas_files_folder_get",
    toolset: "files",
    description: "Read folder metadata and child listing URLs.",
    input: z.object({ folder_id: id, verbose: verboseInput }),
    operation: files.folder,
    fields: folderFields,
  }),
  requestTool({
    name: "canvas_files_files_list",
    toolset: "files",
    description:
      "List files in your own files area, a course, or one folder. Specify at most one of course_id/folder_id.",
    input: z
      .object({
        course_id: id.optional(),
        folder_id: id.optional(),
        search_term: z.string().optional(),
        content_types: z.array(z.string()).optional(),
        ...paginationInput,
        verbose: verboseInput,
      })
      .refine((a) => !(a.course_id && a.folder_id), "Choose course_id or folder_id."),
    operation: (a) =>
      a.course_id ? files.courseFiles : a.folder_id ? files.folderFiles : files.userFiles,
    list: true,
    fields: fileFields,
    query: (a) => ({ search_term: a.search_term, content_types: a.content_types }),
  }),
  requestTool({
    name: "canvas_files_file_get",
    toolset: "files",
    description: "Read metadata for a file you can access.",
    input: z.object({ file_id: id, verbose: verboseInput }),
    operation: files.file,
    fields: fileFields,
  }),
  requestTool({
    name: "canvas_files_download_url",
    toolset: "files",
    description:
      "Get Canvas's download URL for an accessible file; the server does not download its contents. URLs may expire.",
    input: z.object({ file_id: id }),
    operation: files.file,
    fields: [
      "id",
      "display_name",
      "url",
      "size",
      "content-type",
      "locked_for_user",
      "lock_explanation",
    ],
  }),
  requestTool({
    name: "canvas_files_quota",
    toolset: "files",
    description: "Read storage quota and usage for your own files.",
    input: z.object({}),
    operation: files.quota,
  }),
  requestTool({
    name: "canvas_files_folder_create",
    toolset: "files",
    kind: "write",
    description: "Create a folder in your personal files area.",
    input: z.object({ name: text, parent_folder_id: id.optional(), dry_run: dryRunInput }),
    operation: files.createFolder,
    fields: folderFields,
    body: (a) => ({ name: a.name, parent_folder_id: a.parent_folder_id }),
  }),
  requestTool({
    name: "canvas_files_file_update",
    toolset: "files",
    kind: "write",
    idempotent: true,
    description: "Rename or move a file you own. Duplicate names are renamed, never overwritten.",
    input: z
      .object({
        file_id: id,
        name: text.optional(),
        parent_folder_id: id.optional(),
        dry_run: dryRunInput,
      })
      .refine(
        (a) => a.name !== undefined || a.parent_folder_id !== undefined,
        "Provide name or parent_folder_id.",
      ),
    operation: files.update,
    fields: fileFields,
    body: (a) => ({ name: a.name, parent_folder_id: a.parent_folder_id, on_duplicate: "rename" }),
  }),
  requestTool({
    name: "canvas_files_file_copy",
    toolset: "files",
    kind: "write",
    description: "Copy an accessible file into a writable folder. Duplicate filenames are renamed.",
    input: z.object({ folder_id: id, source_file_id: id, dry_run: dryRunInput }),
    operation: files.copy,
    fields: fileFields,
    body: (a) => ({ source_file_id: a.source_file_id, on_duplicate: "rename" }),
  }),
  requestTool({
    name: "canvas_files_file_delete",
    toolset: "files",
    kind: "irreversible",
    idempotent: true,
    description: "Delete a file you own.",
    input: z.object({ file_id: id, dry_run: dryRunInput }),
    operation: files.delete,
  }),
  requestTool({
    name: "canvas_files_folder_delete",
    toolset: "files",
    kind: "irreversible",
    idempotent: true,
    description: "Delete a folder you own. force=true also deletes its contents.",
    input: z.object({ folder_id: id, force: z.boolean().default(false), dry_run: dryRunInput }),
    operation: files.deleteFolder,
    query: (a) => ({ force: a.force }),
  }),
  ...(["files", "submissions"] as const).map((toolset) =>
    defineTool({
      name: toolset === "files" ? "canvas_files_upload" : "canvas_submissions_upload_file",
      toolset,
      kind: "write",
      description:
        "Upload up to 5 MiB using Canvas's three-step upload flow. Files with duplicate names are renamed. This uploads bytes only; use submissions_submit with the returned file ID to submit academic work. dry_run previews the initial request and file digest without requesting an upload ticket.",
      input: z.object({
        ...uploadInput,
        ...(toolset === "submissions" ? assignment : { parent_folder_id: id.optional() }),
      }),
      handler: async (a, ctx) => {
        const operation = toolset === "files" ? files.upload : submissions.upload;
        const path = operationPath(operation, a);
        const bytes = decodeUpload(a.content_base64);
        const metadata = {
          name: a.name,
          content_type: a.content_type,
          ...("parent_folder_id" in a
            ? { parent_folder_id: a.parent_folder_id as number | undefined }
            : {}),
        };
        if (a.dry_run) {
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          return {
            structured: {
              dry_run: true,
              request: previewRequest(ctx.canvas, operation, path, undefined, {
                ...metadata,
                size: bytes.byteLength,
                on_duplicate: "rename",
              }),
              file: {
                name: a.name,
                size: bytes.byteLength,
                sha256: Array.from(new Uint8Array(digest), (b) =>
                  b.toString(16).padStart(2, "0"),
                ).join(""),
              },
              follow_up:
                "Multipart POST to Canvas-provided upload_url without bearer, then same-origin authenticated confirmation GET.",
            },
            text: "Dry run: no upload ticket requested and no bytes sent.",
          };
        }
        return {
          structured: projection(
            await uploadFile(ctx.canvas, path, bytes, metadata),
            fileFields,
            a.verbose,
          ),
          text: "File uploaded. This did not submit an assignment.",
        };
      },
    }),
  ),
];
