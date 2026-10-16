import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { conflict, notFound, validationError } from "@/lib/api/errors";
import type { Pagination } from "@/lib/api/validation";
import { uuidSchema } from "@/lib/api/validation";
import { APP_ROLES, toAppRole, toDbRole } from "@/lib/auth/roles";
import type { AppUser } from "@/lib/auth/session";
import { orNullIfMissing, pageMeta } from "@/lib/db/query";
import { optionalText, requireChanges } from "@/lib/school/validation";
import { Constants } from "@/lib/supabase/database.types";
import type { Database } from "@/lib/supabase/database.types";
import * as repo from "@/lib/notices/repository";
import type { AudienceInput, Notice, NoticeWithAudiences } from "@/lib/notices/repository";

/**
 * Notices: announcements addressed to roles and/or classes.
 *
 * Lifecycle (database-enforced, migration 12):
 *   draft → published → archived, or draft → archived. Archived is final.
 *   Only drafts can be edited or re-targeted; publishing needs at least one
 *   audience and stamps publishedAt with the database clock. To correct a
 *   published notice, archive it and publish a new one.
 *
 * Audiences: a role (`{ role: "STUDENT" }` → every active user with that role)
 * or a class (`{ classId }` → students enrolled in it and teachers who teach
 * it, including its class teacher). A notice is visible to the union of its
 * audiences. Duplicates are rejected; overlapping audiences (e.g. STUDENT
 * plus one class) are allowed.
 *
 * Permissions (route guard + RLS):
 *   - Admins: create, edit, target, publish, archive; read every notice in
 *     any state, with its audiences.
 *   - Teachers/students: read only published notices addressed to them,
 *     without audience details. Drafts, archived notices and notices for
 *     other audiences are 404 — by list or by id.
 * Status values are the database enum: draft, published, archived.
 * Notices are not deleted through the API. No delivery (email/SMS/push).
 */

type Client = SupabaseClient<Database>;

export const MAX_AUDIENCES = 50;

const audienceSchema = z.union([
  z.strictObject({ role: z.enum(APP_ROLES) }),
  z.strictObject({ classId: uuidSchema }),
]);

const audiencesSchema = z
  .array(audienceSchema)
  .max(MAX_AUDIENCES)
  .superRefine((audiences, ctx) => {
    const seen = new Set<string>();
    audiences.forEach((audience, index) => {
      const key = "role" in audience ? `role:${audience.role}` : `class:${audience.classId}`;
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: [index], message: "Duplicate audience." });
      seen.add(key);
    });
  });

const title = z.string().trim().min(1).max(200);
const body = z.string().trim().min(1).max(10_000);

export const createNoticeSchema = z.strictObject({
  title,
  body,
  category: optionalText(50),
  audiences: audiencesSchema.default([]),
});

export const updateNoticeSchema = z.strictObject({ title: title.optional(), body: body.optional(), category: optionalText(50) });

export const setAudiencesSchema = z.strictObject({ audiences: audiencesSchema });

export const listNoticesQuerySchema = z.object({ status: z.enum(Constants.public.Enums.noticeStatus).optional() });

type Audience = z.output<typeof audienceSchema>;

/** API shape: roles in uppercase like everywhere else in the API. */
function present(notice: Notice | NoticeWithAudiences) {
  if (!("audiences" in notice)) return notice;
  return {
    ...notice,
    audiences: [...notice.audiences]
      .map((a) => ({ id: a.id, role: a.audienceRole ? toAppRole(a.audienceRole) : null, classId: a.classId }))
      .sort((a, b) => `${a.role ?? ""}${a.classId ?? ""}`.localeCompare(`${b.role ?? ""}${b.classId ?? ""}`)),
  };
}

/** Class audiences must reference existing classes (422 on the exact entry). */
async function toAudienceRows(client: Client, audiences: Audience[]): Promise<AudienceInput[]> {
  const classIds = audiences.flatMap((a) => ("classId" in a ? [a.classId] : []));
  const existing = await repo.existingClassIds(client, classIds);
  const issues = audiences.flatMap((a, index) =>
    "classId" in a && !existing.has(a.classId) ? [{ path: `audiences.${index}.classId`, message: "Class not found." }] : [],
  );
  if (issues.length > 0) throw validationError(issues);
  return audiences.map((a) => ("role" in a ? { audienceRole: toDbRole(a.role) } : { classId: a.classId }));
}

const isAdmin = (viewer: AppUser) => viewer.role === "ADMIN";

export async function listNotices(client: Client, pagination: Pagination, filters: repo.NoticeFilters, viewer: AppUser) {
  const { items, total } = await repo.listNotices(client, pagination, filters, isAdmin(viewer));
  return { items: items.map(present), pagination: pageMeta(pagination, total) };
}

export async function getNotice(client: Client, id: string, viewer: AppUser) {
  return present(await repo.findNotice(client, id, isAdmin(viewer)));
}

const adminView = async (client: Client, id: string) => present(await repo.findNotice(client, id, true));

export async function createNotice(client: Client, input: z.output<typeof createNoticeSchema>) {
  const audiences = await toAudienceRows(client, input.audiences);
  const id = await repo.createNotice(client, { title: input.title, body: input.body, category: input.category ?? null, audiences });
  return adminView(client, id);
}

/** Explains why a conditional change matched nothing: 404 if gone, else the state conflict. */
async function stateConflict(client: Client, id: string, message: string): Promise<never> {
  const current = await orNullIfMissing(repo.findNotice(client, id, false));
  if (!current) throw notFound("Notice not found.");
  throw conflict(message);
}

export async function updateNotice(client: Client, id: string, input: z.output<typeof updateNoticeSchema>) {
  const changes = requireChanges(input);
  const updated = await repo.updateNoticeIfStatus(client, id, ["draft"], changes);
  if (!updated) await stateConflict(client, id, "Only draft notices can be edited.");
  return adminView(client, id);
}

export async function setAudiences(client: Client, id: string, input: z.output<typeof setAudiencesSchema>) {
  const audiences = await toAudienceRows(client, input.audiences);
  await repo.setNoticeAudiences(client, id, audiences);
  return adminView(client, id);
}

export async function publishNotice(client: Client, id: string) {
  await repo.publishNotice(client, id);
  return adminView(client, id);
}

export async function archiveNotice(client: Client, id: string) {
  const updated = await repo.updateNoticeIfStatus(client, id, ["draft", "published"], { status: "archived" });
  if (!updated) await stateConflict(client, id, "The notice is already archived.");
  return adminView(client, id);
}
