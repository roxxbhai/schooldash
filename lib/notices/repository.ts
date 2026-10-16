import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorContext } from "@/lib/api/db-errors";
import type { Pagination } from "@/lib/api/validation";
import { many, maybeOne, one, page, rpcResult } from "@/lib/db/query";
import type { Database, Enums, Tables, TablesUpdate } from "@/lib/supabase/database.types";

/**
 * Supabase queries for notices and their audiences. Runs as the caller:
 * admins see every notice; teachers and students only published notices
 * addressed to their role or to a class they are enrolled in / teach (RLS,
 * `app.canViewNotice`). Writes are admin-only (RLS); multi-row changes go
 * through the atomic RPCs of migration 12.
 */

type Client = SupabaseClient<Database>;
export type Notice = Tables<"notices">;
export type NoticeAudience = Tables<"noticeAudiences">;
export type NoticeStatus = Enums<"noticeStatus">;
export type NoticeWithAudiences = Notice & { audiences: Pick<NoticeAudience, "id" | "audienceRole" | "classId">[] };

const COLUMNS = "id, title, body, category, status, publishedAt, createdByUserId, createdAt, updatedAt";
const WITH_AUDIENCES = `${COLUMNS}, audiences:noticeAudiences(id, audienceRole, classId)`;

/** Audience rows as the RPCs expect them. */
export type AudienceInput = { audienceRole: Enums<"userRole"> } | { classId: string };

export const noticeErrors: DbErrorContext = {
  notFoundMessage: "Notice not found.",
  constraints: {
    noticesTitleNotBlank: { message: "title must not be blank.", field: "title" },
    noticesStatusTransition: { message: "The notice is not in a state that allows this change." },
    noticesPublishRequiresAudience: { message: "Add at least one audience before publishing." },
    noticesContentLocked: { message: "Only draft notices can be edited." },
    noticesPublishedAtLocked: { message: "publishedAt is set only when publishing." },
    noticeAudiencesNoticeNotDraft: { message: "Audiences can change only while the notice is a draft." },
    noticeAudiencesNoticeRoleKey: { message: "The same audience is listed twice." },
    noticeAudiencesNoticeClassKey: { message: "The same audience is listed twice." },
    noticeAudiences_classId_fkey: { message: "Class not found.", field: "audiences" },
    noticeAudiencesExactlyOneTarget: { message: "Each audience must be either a role or a class.", field: "audiences" },
  },
};

export interface NoticeFilters {
  status?: NoticeStatus;
}

export function listNotices(client: Client, pagination: Pagination, filters: NoticeFilters, withAudiences: boolean) {
  let query = client.from("notices").select(withAudiences ? WITH_AUDIENCES : COLUMNS, { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  return page<Notice | NoticeWithAudiences>(
    "notices.list",
    query
      .order("publishedAt", { ascending: false, nullsFirst: false })
      .order("createdAt", { ascending: false })
      .order("id")
      .range(pagination.from, pagination.to) as never,
    noticeErrors,
  );
}

export function findNotice(client: Client, id: string, withAudiences: boolean) {
  return one<Notice | NoticeWithAudiences>(
    "notices.get",
    client.from("notices").select(withAudiences ? WITH_AUDIENCES : COLUMNS).eq("id", id).maybeSingle() as never,
    noticeErrors,
  );
}

/** Inserts the notice (as a draft, created by the caller) and its audiences in one transaction. */
export function createNotice(
  client: Client,
  values: { title: string; body: string; category: string | null; audiences: AudienceInput[] },
) {
  return rpcResult<string>(
    "notices.create",
    client.rpc("createNotice", { ...values, category: values.category as string }),
    noticeErrors,
  );
}

/** Replaces the audience set of a draft notice in one transaction. */
export async function setNoticeAudiences(client: Client, noticeId: string, audiences: AudienceInput[]): Promise<void> {
  await rpcResult("notices.setAudiences", client.rpc("setNoticeAudiences", { noticeId, audiences }), noticeErrors);
}

export async function publishNotice(client: Client, noticeId: string): Promise<void> {
  await rpcResult("notices.publish", client.rpc("publishNotice", { noticeId }), noticeErrors);
}

/**
 * Updates only if the notice is currently in one of `fromStatuses`.
 * Returns null when nothing matched (missing, hidden, or in another state).
 */
export function updateNoticeIfStatus(client: Client, id: string, fromStatuses: NoticeStatus[], values: TablesUpdate<"notices">) {
  return maybeOne<Notice>(
    "notices.update",
    client.from("notices").update(values).eq("id", id).in("status", fromStatuses).select(COLUMNS).maybeSingle(),
    noticeErrors,
  );
}

/** Which of the given class ids exist (visible to the caller). */
export async function existingClassIds(client: Client, classIds: string[]): Promise<Set<string>> {
  if (classIds.length === 0) return new Set();
  const rows = await many<{ id: string }>("classes.exist", client.from("classes").select("id").in("id", classIds), noticeErrors);
  return new Set(rows.map((row) => row.id));
}
