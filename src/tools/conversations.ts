import { z } from "zod";
import { conversations } from "../canvas/services/student.ts";
import { paginationInput, verboseInput } from "./common.ts";
import { dryRunInput, id, requestTool, text } from "./request.ts";

const conversation = { conversation_id: id };
const fields = [
  "id",
  "subject",
  "workflow_state",
  "last_message",
  "last_message_at",
  "last_authored_message",
  "last_authored_message_at",
  "message_count",
  "subscribed",
  "starred",
  "properties",
  "audience",
  "participants",
  "messages",
  "context_name",
  "context_code",
  "visible",
];
export const conversationTools = [
  requestTool({
    name: "canvas_conversations_list",
    toolset: "conversations",
    description:
      "List your Canvas inbox conversations. Filter by unread, starred, archived or sent.",
    input: z.object({
      scope: z.enum(["unread", "starred", "archived", "sent"]).optional(),
      filter: z.array(z.string()).optional(),
      filter_mode: z.enum(["and", "or"]).optional(),
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: conversations.list,
    list: true,
    fields,
    query: (a) => ({ scope: a.scope, filter: a.filter, filter_mode: a.filter_mode }),
  }),
  requestTool({
    name: "canvas_conversations_get",
    toolset: "conversations",
    description: "Read a conversation and its messages without marking it as read.",
    input: z.object({ ...conversation, verbose: verboseInput }),
    operation: conversations.get,
    fields,
    query: () => ({ auto_mark_as_read: false }),
  }),
  requestTool({
    name: "canvas_conversations_unread_count",
    toolset: "conversations",
    description: "Get your unread conversation count.",
    input: z.object({}),
    operation: conversations.unread,
  }),
  requestTool({
    name: "canvas_conversations_find_recipients",
    toolset: "conversations",
    description: "Find users you can message, optionally restricted to a course or group.",
    input: z.object({
      search: text,
      context: z
        .string()
        .regex(/^(course|group)_\d+$/)
        .optional(),
      ...paginationInput,
      verbose: verboseInput,
    }),
    operation: conversations.recipients,
    list: true,
    fields: ["id", "name", "full_name", "common_courses", "common_groups", "avatar_url"],
    query: (a) => ({ search: a.search, context: a.context, type: "user" }),
  }),
  requestTool({
    name: "canvas_conversations_create",
    toolset: "conversations",
    kind: "write",
    description:
      "Send a new Canvas inbox message to explicit user IDs. Use find_recipients first and dry_run to review recipients and text.",
    input: z.object({
      recipients: z.array(id).min(1).max(100),
      subject: text,
      body: text,
      group_conversation: z.boolean().default(false),
      attachment_ids: z.array(id).optional(),
      dry_run: dryRunInput,
    }),
    operation: conversations.create,
    fields,
    body: (a) => ({
      recipients: a.recipients,
      subject: a.subject,
      body: a.body,
      group_conversation: a.group_conversation,
      attachment_ids: a.attachment_ids,
    }),
  }),
  requestTool({
    name: "canvas_conversations_reply",
    toolset: "conversations",
    kind: "write",
    description: "Send a reply to an existing Canvas inbox conversation.",
    input: z.object({
      ...conversation,
      body: text,
      attachment_ids: z.array(id).optional(),
      dry_run: dryRunInput,
    }),
    operation: conversations.reply,
    fields,
    body: (a) => ({ body: a.body, attachment_ids: a.attachment_ids }),
  }),
  ...(
    [
      ["mark_read", { workflow_state: "read" }],
      ["mark_unread", { workflow_state: "unread" }],
      ["star", { starred: true }],
      ["unstar", { starred: false }],
      ["archive", { workflow_state: "archived" }],
      ["unarchive", { workflow_state: "read" }],
    ] as const
  ).map(([verb, changes]) =>
    requestTool({
      name: `canvas_conversations_${verb}`,
      toolset: "conversations",
      kind: "write",
      idempotent: true,
      description: `${verb.replaceAll("_", " ")} a conversation on your account.`,
      input: z.object({ ...conversation, dry_run: dryRunInput }),
      operation: conversations.update,
      fields,
      body: () => ({ conversation: changes }),
    }),
  ),
  requestTool({
    name: "canvas_conversations_delete",
    toolset: "conversations",
    kind: "irreversible",
    idempotent: true,
    description: "Delete a conversation from your inbox.",
    input: z.object({ ...conversation, dry_run: dryRunInput }),
    operation: conversations.delete,
  }),
  requestTool({
    name: "canvas_conversations_delete_message",
    toolset: "conversations",
    kind: "irreversible",
    idempotent: true,
    description: "Remove selected messages from a conversation in your inbox.",
    input: z.object({ ...conversation, message_ids: z.array(id).min(1), dry_run: dryRunInput }),
    operation: conversations.deleteMessage,
    body: (a) => ({ remove: a.message_ids }),
  }),
];
