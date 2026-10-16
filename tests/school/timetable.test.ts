import { beforeEach, describe, expect, it, vi } from "vitest";

// Timetable service unit tests: repositories mocked. No Supabase.
vi.mock("@/lib/auth/repository", () => ({ teacherHasAssignment: vi.fn() }));
vi.mock("@/lib/classes/repository", () => ({ findClass: vi.fn() }));
vi.mock("@/lib/subjects/repository", () => ({ findSubject: vi.fn() }));
vi.mock("@/lib/teachers/service", () => ({ assertActiveTeacher: vi.fn() }));
vi.mock("@/lib/timetable/repository", async (original) => ({
  timetableErrors: (await original<typeof import("@/lib/timetable/repository")>()).timetableErrors,
  insertTimetableEntry: vi.fn(async (_c: unknown, values: unknown) => values),
  updateTimetableEntry: vi.fn(async (_c: unknown, _id: string, values: unknown) => values),
  findTimetableEntry: vi.fn(),
  listTimetableEntries: vi.fn(async () => ({ items: [], total: 0 })),
  deleteTimetableEntry: vi.fn(),
}));

import { ApiError } from "@/lib/api/errors";
import { mapDbError } from "@/lib/api/db-errors";
import { teacherHasAssignment } from "@/lib/auth/repository";
import { findClass } from "@/lib/classes/repository";
import { findSubject } from "@/lib/subjects/repository";
import { assertActiveTeacher } from "@/lib/teachers/service";
import * as repo from "@/lib/timetable/repository";
import { timetableErrors } from "@/lib/timetable/repository";
import {
  createTimetableEntry,
  createTimetableEntrySchema,
  listTimetableQuerySchema,
  updateTimetableEntry,
  updateTimetableEntrySchema,
} from "@/lib/timetable/service";

const client = {} as never;
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CLASS = ID(1);
const SUBJECT = ID(2);
const TEACHER = ID(3);
const valid = { classId: CLASS, subjectId: SUBJECT, teacherId: TEACHER, dayOfWeek: 1, startTime: "09:00", endTime: "09:45" };
const CURRENT = { id: ID(9), classId: CLASS, subjectId: SUBJECT, teacherId: TEACHER, dayOfWeek: 1, startTime: "09:00:00", endTime: "09:45:00", room: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findClass).mockResolvedValue({ id: CLASS } as never);
  vi.mocked(findSubject).mockResolvedValue({ id: SUBJECT } as never);
  vi.mocked(teacherHasAssignment).mockResolvedValue(true);
  vi.mocked(repo.findTimetableEntry).mockResolvedValue(CURRENT as never);
});

describe("input validation", () => {
  it("normalises HH:MM to HH:MM:SS and accepts HH:MM:SS", () => {
    const parsed = createTimetableEntrySchema.parse({ ...valid, endTime: "09:45:30" });
    expect([parsed.startTime, parsed.endTime]).toEqual(["09:00:00", "09:45:30"]);
  });

  it.each([
    ["end before start", { startTime: "10:00", endTime: "09:00" }, "endTime"],
    ["end equal to start", { startTime: "10:00", endTime: "10:00" }, "endTime"],
    ["a 12-hour time", { startTime: "9:00 AM" }, "startTime"],
    ["hour 24", { endTime: "24:00" }, "endTime"],
    ["day 0", { dayOfWeek: 0 }, "dayOfWeek"],
    ["day 8", { dayOfWeek: 8 }, "dayOfWeek"],
    ["a missing subject", { subjectId: undefined }, "subjectId"],
    ["a client-supplied academicYearId", { academicYearId: ID(7) }, ""],
  ])("rejects %s", (_label, override, path) => {
    const result = createTimetableEntrySchema.safeParse({ ...valid, ...override });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join(".") === path)).toBe(true);
  });

  it("allows an unstaffed period (no teacher)", () => {
    expect(createTimetableEntrySchema.safeParse({ ...valid, teacherId: null }).success).toBe(true);
    expect(createTimetableEntrySchema.safeParse({ ...valid, teacherId: undefined }).success).toBe(true);
  });

  it("parses the day filter from the query string", () => {
    expect(listTimetableQuerySchema.parse({ dayOfWeek: "3" }).dayOfWeek).toBe(3);
    expect(listTimetableQuerySchema.safeParse({ dayOfWeek: "9" }).success).toBe(false);
  });
});

describe("creating", () => {
  it("checks class, subject, active teacher and exact assignment, then inserts", async () => {
    await createTimetableEntry(client, createTimetableEntrySchema.parse(valid));
    expect(assertActiveTeacher).toHaveBeenCalledWith(client, TEACHER);
    expect(teacherHasAssignment).toHaveBeenCalledWith(client, { teacherId: TEACHER, classId: CLASS, subjectId: SUBJECT });
    expect(repo.insertTimetableEntry).toHaveBeenCalledWith(client, expect.objectContaining({ startTime: "09:00:00", endTime: "09:45:00", teacherId: TEACHER }));
  });

  it("an unstaffed period skips the teacher checks", async () => {
    await createTimetableEntry(client, createTimetableEntrySchema.parse({ ...valid, teacherId: null }));
    expect(assertActiveTeacher).not.toHaveBeenCalled();
    expect(repo.insertTimetableEntry).toHaveBeenCalledWith(client, expect.objectContaining({ teacherId: null }));
  });

  it("rejects a teacher who is not assigned to that class AND subject (422 on teacherId)", async () => {
    vi.mocked(teacherHasAssignment).mockResolvedValue(false);
    await expect(createTimetableEntry(client, createTimetableEntrySchema.parse(valid))).rejects.toMatchObject({
      status: 422,
      details: [{ path: "teacherId" }],
    });
    expect(repo.insertTimetableEntry).not.toHaveBeenCalled();
  });

  it.each([
    ["class", () => vi.mocked(findClass).mockRejectedValue(new ApiError(404, "NOT_FOUND", "x")), "classId"],
    ["subject", () => vi.mocked(findSubject).mockRejectedValue(new ApiError(404, "NOT_FOUND", "x")), "subjectId"],
  ])("reports a missing %s as 422", async (_label, arrange, path) => {
    arrange();
    await expect(createTimetableEntry(client, createTimetableEntrySchema.parse(valid))).rejects.toMatchObject({
      status: 422,
      details: [{ path }],
    });
  });
});

describe("updating validates the resulting complete entry", () => {
  it("rejects a new endTime that falls before the stored startTime", async () => {
    await expect(updateTimetableEntry(client, CURRENT.id, updateTimetableEntrySchema.parse({ endTime: "08:30" }))).rejects.toMatchObject({
      status: 422,
      details: [{ path: "endTime" }],
    });
    expect(repo.updateTimetableEntry).not.toHaveBeenCalled();
  });

  it("re-checks the teacher's assignment when only the subject changes", async () => {
    vi.mocked(teacherHasAssignment).mockResolvedValue(false);
    await expect(updateTimetableEntry(client, CURRENT.id, { subjectId: ID(5) })).rejects.toMatchObject({ status: 422, details: [{ path: "teacherId" }] });
    expect(teacherHasAssignment).toHaveBeenCalledWith(client, { teacherId: TEACHER, classId: CLASS, subjectId: ID(5) });
  });

  it("does not re-check staffing for a time-only change, and sends only the changed fields", async () => {
    await updateTimetableEntry(client, CURRENT.id, updateTimetableEntrySchema.parse({ startTime: "09:10", endTime: "10:00" }));
    expect(teacherHasAssignment).not.toHaveBeenCalled();
    expect(repo.updateTimetableEntry).toHaveBeenCalledWith(client, CURRENT.id, { startTime: "09:10:00", endTime: "10:00:00" });
  });

  it("can unstaff a period", async () => {
    await updateTimetableEntry(client, CURRENT.id, { teacherId: null });
    expect(assertActiveTeacher).not.toHaveBeenCalled();
    expect(repo.updateTimetableEntry).toHaveBeenCalledWith(client, CURRENT.id, { teacherId: null });
  });

  it("rejects an empty update", async () => {
    await expect(updateTimetableEntry(client, CURRENT.id, {})).rejects.toMatchObject({ status: 422 });
  });
});

describe("database conflicts map to safe 409s", () => {
  it.each([
    ["timetableEntriesClassNoOverlap", "23P01", "The class already has a period that overlaps this time."],
    ["timetableEntriesTeacherNoOverlap", "23P01", "The teacher already has a period that overlaps this time."],
    ["timetableEntriesClassSlotKey", "23505", "The class already has a period that overlaps this time."],
  ])("%s", (constraint, code, message) => {
    const error = mapDbError({ code, message: `conflicting key value violates exclusion constraint "${constraint}"` }, "x", timetableErrors);
    expect(error).toMatchObject({ status: 409, message });
  });

  it("a teacher without the matching assignment (composite FK) is a 422 on teacherId", () => {
    const error = mapDbError(
      { code: "23503", message: 'insert or update on table "timetableEntries" violates foreign key constraint "timetableEntriesAssignmentFkey"' },
      "x",
      timetableErrors,
    );
    expect(error).toMatchObject({ status: 422, details: [{ path: "teacherId" }] });
  });
});
