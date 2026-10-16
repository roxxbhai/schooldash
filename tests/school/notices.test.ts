import { beforeEach, describe, expect, it, vi } from "vitest";

// Notices service unit tests: repository mocked. No Supabase.
vi.mock("@/lib/notices/repository", async (original) => ({
  noticeErrors: (await original<typeof import("@/lib/notices/repository")>()).noticeErrors,
  listNotices: vi.fn(async () => ({ items: [], total: 0 })),
  findNotice: vi.fn(),
  createNotice: vi.fn(async () => NOTICE_ID),
  setNoticeAudiences: vi.fn(),
  publishNotice: vi.fn(),
  updateNoticeIfStatus: vi.fn(),
  existingClassIds: vi.fn(async (_c: unknown, ids: string[]) => new Set(ids)),
}));

import { ApiError } from "@/lib/api/errors";
import { mapDbError } from "@/lib/api/db-errors";
import type { AppUser } from "@/lib/auth/session";
import * as repo from "@/lib/notices/repository";
import {
  archiveNotice,
  createNotice,
  createNoticeSchema,
  getNotice,
  listNotices,
  listNoticesQuerySchema,
  setAudiences,
  setAudiencesSchema,
  updateNotice,
  updateNoticeSchema,
} from "@/lib/notices/service";
import { toPagination } from "@/lib/api/validation";

const client = {} as never;
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOTICE_ID = ID(1);
const CLASS_A = ID(2);
const admin: AppUser = { id: ID(10), authUserId: "a", role: "ADMIN", isActive: true };
const student: AppUser = { id: ID(11), authUserId: "b", role: "STUDENT", isActive: true };
const ROW = { id: NOTICE_ID, title: "T", body: "B", category: null, status: "draft", publishedAt: null, createdByUserId: admin.id };
const WITH_AUDIENCES = { ...ROW, audiences: [{ id: ID(21), audienceRole: null, classId: CLASS_A }, { id: ID(20), audienceRole: "student", classId: null }] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findNotice).mockResolvedValue(WITH_AUDIENCES as never);
});

describe("input validation", () => {
  const valid = { title: "Sports day", body: "Friday", audiences: [{ role: "STUDENT" }, { classId: CLASS_A }] };

  it("accepts role and class audiences; audiences default to none", () => {
    expect(createNoticeSchema.safeParse(valid).success).toBe(true);
    expect(createNoticeSchema.parse({ title: "x", body: "y" }).audiences).toEqual([]);
  });

  it.each([
    ["a blank title", { title: "   " }],
    ["a missing body", { body: undefined }],
    ["a client-supplied status", { status: "published" }],
    ["a client-supplied publishedAt", { publishedAt: "2026-01-01T00:00:00Z" }],
    ["a client-supplied createdByUserId", { createdByUserId: ID(9) }],
    ["an unknown role", { audiences: [{ role: "PARENT" }] }],
    ["an audience with both role and class", { audiences: [{ role: "STUDENT", classId: CLASS_A }] }],
    ["an empty audience object", { audiences: [{}] }],
    ["a malformed classId", { audiences: [{ classId: "x" }] }],
    ["a duplicate role", { audiences: [{ role: "TEACHER" }, { role: "TEACHER" }] }],
    ["a duplicate class", { audiences: [{ classId: CLASS_A }, { classId: CLASS_A }] }],
  ])("rejects %s", (_label, override) => {
    expect(createNoticeSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it("edits cannot change status or audiences through PATCH", () => {
    expect(updateNoticeSchema.safeParse({ status: "published" }).success).toBe(false);
    expect(updateNoticeSchema.safeParse({ audiences: [] }).success).toBe(false);
  });

  it("an empty audience set is allowed for a draft", () => {
    expect(setAudiencesSchema.safeParse({ audiences: [] }).success).toBe(true);
  });

  it("status filter uses the database values", () => {
    expect(listNoticesQuerySchema.safeParse({ status: "archived" }).success).toBe(true);
    expect(listNoticesQuerySchema.safeParse({ status: "ARCHIVED" }).success).toBe(false);
  });
});

describe("creating and targeting", () => {
  it("sends one atomic create with database role values, then returns the admin view", async () => {
    const result = await createNotice(client, createNoticeSchema.parse({ title: "T", body: "B", audiences: [{ role: "STUDENT" }, { classId: CLASS_A }] }));
    expect(repo.createNotice).toHaveBeenCalledWith(client, {
      title: "T", body: "B", category: null, audiences: [{ audienceRole: "student" }, { classId: CLASS_A }],
    });
    expect(result).toMatchObject({ id: NOTICE_ID, audiences: [{ role: null, classId: CLASS_A }, { role: "STUDENT", classId: null }] });
  });

  it("rejects an unknown class (422 on the exact audience) and writes nothing", async () => {
    vi.mocked(repo.existingClassIds).mockResolvedValueOnce(new Set());
    await expect(createNotice(client, createNoticeSchema.parse({ title: "T", body: "B", audiences: [{ role: "TEACHER" }, { classId: CLASS_A }] }))).rejects.toMatchObject({
      status: 422,
      details: [{ path: "audiences.1.classId" }],
    });
    expect(repo.createNotice).not.toHaveBeenCalled();
  });

  it("replaces audiences through the atomic RPC", async () => {
    await setAudiences(client, NOTICE_ID, { audiences: [{ role: "TEACHER" }] });
    expect(repo.setNoticeAudiences).toHaveBeenCalledWith(client, NOTICE_ID, [{ audienceRole: "teacher" }]);
  });
});

describe("state rules", () => {
  it("edits apply only to drafts; a non-draft is a 409, a missing notice a 404", async () => {
    vi.mocked(repo.updateNoticeIfStatus).mockResolvedValue(null);
    await expect(updateNotice(client, NOTICE_ID, { title: "x" })).rejects.toMatchObject({ status: 409, message: "Only draft notices can be edited." });
    expect(repo.updateNoticeIfStatus).toHaveBeenCalledWith(client, NOTICE_ID, ["draft"], { title: "x" });
    vi.mocked(repo.findNotice).mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "x"));
    await expect(updateNotice(client, NOTICE_ID, { title: "x" })).rejects.toMatchObject({ status: 404 });
  });

  it("REGRESSION: an outage while explaining a failed change is a 503, not a misleading 404", async () => {
    vi.mocked(repo.updateNoticeIfStatus).mockResolvedValue(null);
    vi.mocked(repo.findNotice).mockRejectedValueOnce(new ApiError(503, "SERVICE_UNAVAILABLE", "x"));
    await expect(updateNotice(client, NOTICE_ID, { title: "x" })).rejects.toMatchObject({ status: 503 });
  });

  it("archiving is allowed from draft or published; archiving twice is a 409", async () => {
    vi.mocked(repo.updateNoticeIfStatus).mockResolvedValueOnce(ROW as never);
    await archiveNotice(client, NOTICE_ID);
    expect(repo.updateNoticeIfStatus).toHaveBeenCalledWith(client, NOTICE_ID, ["draft", "published"], { status: "archived" });
    vi.mocked(repo.updateNoticeIfStatus).mockResolvedValueOnce(null);
    await expect(archiveNotice(client, NOTICE_ID)).rejects.toMatchObject({ status: 409 });
  });

  it.each([
    ["noticesStatusTransition", "The notice is not in a state that allows this change."],
    ["noticesPublishRequiresAudience", "Add at least one audience before publishing."],
    ["noticeAudiencesNoticeNotDraft", "Audiences can change only while the notice is a draft."],
    ["noticesContentLocked", "Only draft notices can be edited."],
  ])("database state rule %s maps to a 409 with a safe message", (constraint, message) => {
    const error = mapDbError({ code: "55000", message: `x (constraint "${constraint}")` }, "x", repo.noticeErrors);
    expect(error).toMatchObject({ status: 409, message });
  });
});

describe("reading", () => {
  it("admins get audiences; other roles never do", async () => {
    expect(await getNotice(client, NOTICE_ID, admin)).toHaveProperty("audiences");
    expect(repo.findNotice).toHaveBeenLastCalledWith(client, NOTICE_ID, true);
    vi.mocked(repo.findNotice).mockResolvedValueOnce(ROW as never);
    expect(await getNotice(client, NOTICE_ID, student)).not.toHaveProperty("audiences");
    expect(repo.findNotice).toHaveBeenLastCalledWith(client, NOTICE_ID, false);
    await listNotices(client, toPagination({ page: 1, limit: 20 }), {}, student);
    expect(repo.listNotices).toHaveBeenLastCalledWith(client, expect.anything(), {}, false);
  });
});
