import {audioActions,audioBucket,readAudioUploadRequest,runAssignmentAudio} from './assignment-audio.ts';
import {financeActions,runFinanceCommand,runFinanceRead} from './finance-command.ts';
import {staffGuardianCommand,staffGuardianActions} from './staff-guardian-command.ts';
import {dispatchGuardianNotification,sendParentTelegram,sendParentSms} from './guardian-delivery.ts';
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as nodemailer from "https://esm.sh/nodemailer@7.0.6?target=denonext";
import { placementBand } from "../_shared/academy-scoring.ts";
import { callOpenRouterJsonWithStatus, type AIStatus } from "../_shared/ielts-ai.ts";
import { signStorageRef, uploadFileToS3 } from "../_shared/media-storage.ts";
import {
  gradeAcademyRubric,
  gradeAcademyQuiz,
  validateAcademyQuizQuestion,
  type AcademyQuizQuestionType,
} from "../_shared/academy-curriculum.ts";
import {
  finishAcademyTeacherLesson,
  loadAcademyTeacherDay,
  recordAcademyTeacherAttendance,
  startAcademyTeacherLesson,
  type AcademyTeacherFlowAccess,
} from "../_shared/academy-teacher-flow.ts";
import * as academyAccessPolicy from "./access.ts";
import {validateAcademyMutationBranches} from "./mutation-branches.ts";
import {resolveAcademyContactSaveTarget,academyContactSavePayload,ContactSaveTargetError} from "./contact-save.ts";
import {readAcademyScopedDirectory,ScopedDirectoryError} from "./scoped-directory.ts";
import {runAcademyStaffCommand,readAcademyStaffDirectory,staffAccessActions,StaffAccessError} from "./staff-access.ts";
import {runStaffInvitation,acceptStaffAccess,readStaffInvitations,StaffInvitationError} from "./staff-invitations.ts";
import {runLearnerInvitation,inspectLearnerInvitation,acceptLearnerInvitation,readLearnerInvitations,LearnerInvitationError} from "./learner-invitations.ts";
import {legacyImportCommand,LegacyImportCommandError} from "./legacy-import-command.ts";
import {legacyStaffCommand,LegacyStaffImportError} from "./legacy-staff-import.ts";
import {readGuardianPortal,readGuardianRequests,readLegacyGuardianPortal,readLegacyGuardianRequests,claimGuardianFromTelegram,writeGuardianPortal,guardianWriteActions,readGuardianHistory,GuardianPortalError} from "./guardian-portal.ts";
import {academyAuthorityIdentityMatches,academyGrantAuthorityEntry} from "./capability-scope.ts";
import {canUseLegacyImport,allowedLegacyImportTypes,permittedLegacyImportHistory,normalizedLegacyImportMapped,legacyImportAmount,legacyImportRowNumber,LegacyImportInputError} from "./legacy-import-policy.ts";
import { assessmentActions, handleAssessmentService } from "./assessment-services.ts";
import { readAcademyRoomTimetable, readAcademyRoomBranches, RoomTimetableError } from "./room-timetable.ts";
import { generateAcademyTimetable, publicTimetableRun, TimetableGenerationError } from "./timetable-generation.ts";
import {studentImportActions,readStudentImportRequest,handleStudentImportService,StudentImportServiceError} from "./student-import-service.ts";

type Json = Record<string, unknown>;
type SupabaseClientLike = ReturnType<typeof createClient<any>>;

type AcademyAccessSource = "tenant" | "staff" | "center" | "grant";
type AcademyScope = "academy" | "assigned_branches" | "assigned_classrooms";

type AcademyAccessPermissions = {
  viewAcademy: boolean;
  manageAcademy: boolean;
  manageStaff: boolean;
  manageFinance: boolean;
  viewFinance: boolean;
  collectFinance: boolean;
  adjustFinance: boolean;
  refundFinance: boolean;
  discountFinance: boolean;
  reconcileFinance: boolean;
  manageCashier: boolean;
  viewEconomics: boolean;
  viewPayroll: boolean;
  calculatePayroll: boolean;
  approvePayroll: boolean;
  payPayroll: boolean;
  manageOffers: boolean;
  manageBranding: boolean;
  manageAutomation: boolean;
  viewAutomation: boolean;
  viewBranches: boolean;
  manageBranches: boolean;
  viewAdmissions: boolean;
  manageAdmissions: boolean;
  assignAdmissions: boolean;
  exportAdmissions: boolean;
  manageTrialFeedback: boolean;
  viewContacts: boolean;
  manageContacts: boolean;
  viewClassrooms: boolean;
  manageClassrooms: boolean;
  manageRoster: boolean;
  manageMessages: boolean;
  manageAnnouncements: boolean;
  sendGlobalAnnouncements: boolean;
  manageAlerts: boolean;
  resolveAlerts: boolean;
  viewEducationOS: boolean;
  resolveActionItems: boolean;
  manageAssignments: boolean;
  gradeSubmissions: boolean;
  markAttendance: boolean;
  manageSchedule: boolean;
  manageAcademicOperations: boolean;
  viewRoomTimetable: boolean;
  manageGuardians: boolean;
  communicateGuardians: boolean;
  manageRetention: boolean;
  viewBusinessIntelligence: boolean;
  viewAcademicReports: boolean;
  viewOperationalReports: boolean;
  viewFinancialReports: boolean;
  viewStaffPerformance: boolean;
  viewRisk: boolean;
  manageImports: boolean;
  importStudents: boolean;
  manageLocalization: boolean;
  useAcademyAI: boolean;
  manageResources: boolean;
  viewReports: boolean;
  issueCertificates: boolean;
  dispatchNotifications: boolean;
  viewNotifications: boolean;
  viewReferrals: boolean;
  viewAudit: boolean;
};

type MembershipRow = academyAccessPolicy.MembershipRow;

type StudioBody = {
  action?: string;
  academy_id?: string;
  id?: string;
  slug?: string;
  url?: string;
  classroom_id?: string;
  resource_id?: string | null;
  conversation_id?: string;
  role?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  telegram_id?: string;
  status?: string;
  metadata?: Json;
  user_id?: string;
  name?: string;
  title?: string;
  description?: string;
  content?: string;
  date?: string;
  type?: string;
  sort_order?: number | string;
  is_published?: boolean;
  completed?: boolean;
  is_active?: boolean;
  expires_at?: string | null;
  starts_at?: string | null;
  price_amount?: number;
  currency?: string;
  duration_days?: number | null;
  contact_id?: string;
  grant_type?: string;
  resource_type?: string;
  capability_key?: string | null;
  quantity?: number | null;
  offer_id?: string;
  provider?: string;
  provider_transaction_id?: string;
  severity?: string;
  landing?: Json;
  // LMS + loops fields
  assignment_id?: string;
  assignment_type?: string;
  submission_id?: string;
  session_id?: string;
  score?: number;
  max_score?: number;
  score_weight?: number;
  notes?: string;
  due_at?: string | null;
  experience_url?: string | null;
  submission_content?: string | null;
  submission_url?: string | null;
  file?: File | null;
  records?: Array<Record<string, unknown>>;
  contacts?: Array<Record<string, unknown>>;
  session_date?: string;
  score_weights?: Json;
  // schedule
  day_of_week?: number | string;
  start_time?: string;
  end_time?: string | null;
  timezone?: string;
  label?: string | null;
  // certificate / parent report
  exam_type?: string;
  overall_score?: number;
  overall_band?: number;
  candidate_name?: string;
  center_name?: string;
  expires_in_days?: number;
  // engagement / operations / acquisition
  payment_id?: string;
  channel?: string;
  message?: string;
  staff_user_id?: string;
  staff_email?: string;
  staff_role?: string;
  classroom_ids?: string[];
  level?: string;
  referral_code?: string;
  diagnostic_score?: number;
  dedupe_key?: string;
  resolution_note?: string;
  lifecycle_stage?: string;
  rule_key?: string;
  threshold?: number;
  // curriculum and native assessment
  course_id?: string;
  module_id?: string;
  lesson_id?: string;
  quiz_id?: string;
  question_id?: string;
  attempt_id?: string;
  code?: string;
  summary?: string;
  lesson_content?: unknown;
  estimated_minutes?: number;
  available_from?: string | null;
  ends_at?: string | null;
  completion_rule?: Json;
  unlock_rule?: Json;
  passing_score?: number;
  attempts_allowed?: number;
  time_limit_seconds?: number | null;
  shuffle_questions?: boolean;
  show_answers_after?: boolean;
  question_type?: AcademyQuizQuestionType;
  prompt?: string;
  options?: unknown[];
  correct_answer?: unknown;
  points?: number;
  explanation?: string | null;
  answers?: Record<string, unknown>;
  time_spent_seconds?: number;
  feedback?: string;
  membership_status?: string;
  [key: string]: unknown;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const getOptionalEnv = (key: string): string | null => {
  const value = Deno.env.get(key)?.trim();
  return value ? value : null;
};

const getBearerToken = (req: Request): string | null => {
  const auth = req.headers.get("Authorization") ?? "";
  const authToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : auth.trim();
  const xUserJwt = req.headers.get("x-user-jwt") ?? "";
  if (authToken && !authToken.startsWith("sb_")) return authToken;
  if (xUserJwt.trim()) return xUserJwt.trim();
  if (authToken) return authToken;
  return null;
};

const normalizeText = (value: unknown, maxLen = 300): string => String(value ?? "").trim().slice(0, maxLen);

const normalizeEmail = (value: unknown): string => normalizeText(value, 320).toLowerCase();

const normalizeAcademyPhone = (value: unknown): string => {
  const digits = normalizeText(value, 80).replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith("998")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("0998")) return `+${digits.slice(-12)}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  return `+${digits}`;
};

const slugify = (value: unknown, fallback = "academy"): string => {
  const raw = String(value ?? "").toLowerCase();
  const slug = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  if (slug) return slug;
  return fallback;
};

const toIntOrNull = (value: unknown): number | null => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.floor(num);
};

const positiveIntOrNull = (value: unknown): number | null => {
  const num = toIntOrNull(value);
  if (num === null || num <= 0) return null;
  return num;
};

const isJsonObject = (value: unknown): value is Json =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toJsonObject = (value: unknown): Json => (isJsonObject(value) ? value : {});

const AUTOMATION_ACTION_TYPES = new Set([
  "create_task", "notify_staff", "notify_guardian", "send_telegram", "send_email",
  "create_alert", "assign_employee", "add_tag", "enqueue_review",
]);
const AUTOMATION_REVIEW_ACTION_TYPES = new Set(["send_telegram", "send_email", "assign_employee"]);

const automationPathValue = (input: unknown, pathRaw: unknown): unknown => {
  const path = normalizeText(pathRaw, 160);
  if (!/^[a-zA-Z0-9_.-]+$/.test(path) || path.split(".").some((part) => ["__proto__", "prototype", "constructor"].includes(part))) return undefined;
  return path.split(".").reduce<unknown>((value, part) => isJsonObject(value) ? value[part] : undefined, input);
};

const evaluateAutomationCondition = (treeRaw: unknown, input: Json): { matched: boolean; evidence: Json } => {
  const evaluate = (nodeRaw: unknown): boolean => {
    const node = toJsonObject(nodeRaw);
    if (Array.isArray(node.all)) return node.all.every(evaluate);
    if (Array.isArray(node.any)) return node.any.some(evaluate);
    if (node.not !== undefined) return !evaluate(node.not);
    const field = normalizeText(node.field, 160);
    const operator = normalizeText(node.operator, 40).toLowerCase() || "eq";
    const actual = automationPathValue(input, field);
    const expected = node.value;
    if (operator === "exists") return actual !== undefined && actual !== null && actual !== "";
    if (operator === "not_exists") return actual === undefined || actual === null || actual === "";
    if (operator === "eq") return String(actual ?? "") === String(expected ?? "");
    if (operator === "neq") return String(actual ?? "") !== String(expected ?? "");
    if (operator === "contains") return Array.isArray(actual) ? actual.map(String).includes(String(expected)) : String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    if (operator === "in") return Array.isArray(expected) && expected.map(String).includes(String(actual ?? ""));
    const actualNumber = Number(actual);
    const expectedNumber = Number(expected);
    if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
    if (operator === "gt") return actualNumber > expectedNumber;
    if (operator === "gte") return actualNumber >= expectedNumber;
    if (operator === "lt") return actualNumber < expectedNumber;
    if (operator === "lte") return actualNumber <= expectedNumber;
    return false;
  };
  const matched = evaluate(treeRaw);
  return { matched, evidence: { evaluated_at: new Date().toISOString(), condition_tree: treeRaw, matched } };
};

const validateAutomationDefinition = (conditionTree: unknown, actionsRaw: unknown, safeguardMode: string): string | null => {
  if (!isJsonObject(conditionTree)) return "condition_tree must be an object";
  if (!Array.isArray(actionsRaw) || actionsRaw.length === 0 || actionsRaw.length > 20) return "actions must contain between 1 and 20 items";
  for (const actionRaw of actionsRaw) {
    const action = toJsonObject(actionRaw);
    const type = normalizeText(action.type, 40).toLowerCase();
    if (!AUTOMATION_ACTION_TYPES.has(type)) return `Unsupported automation action: ${type || "missing"}`;
    if (AUTOMATION_REVIEW_ACTION_TYPES.has(type) && safeguardMode !== "human_review_required") {
      return `${type} requires human_review_required safeguards`;
    }
  }
  return null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => normalizeText(item, 64)).filter((item) => item.length > 0)));
};

const ACADEMY_FILE_MAX_BYTES = 50 * 1024 * 1024;
const ACADEMY_SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;
const ACADEMY_ALLOWED_FILE_PREFIXES = ["application/", "audio/", "image/", "text/", "video/"];

const sanitizeFilename = (nameRaw: unknown): string =>
  normalizeText(nameRaw, 180)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140) || "file";

const formDataToStudioBody = (form: FormData): StudioBody => {
  const body: StudioBody = {};
  for (const [key, value] of form.entries()) {
    if (value instanceof File) {
      body[key] = value;
      continue;
    }
    const text = String(value);
    if (["metadata", "records", "contacts"].includes(key)) {
      try {
        body[key] = JSON.parse(text);
      } catch {
        body[key] = text;
      }
      continue;
    }
    if (["is_published", "completed", "is_active", "shuffle_questions", "show_answers_after"].includes(key)) {
      body[key] = text === "true";
      continue;
    }
    if (["price_amount", "duration_days", "score", "max_score", "score_weight", "day_of_week", "threshold", "sort_order", "estimated_minutes", "passing_score", "attempts_allowed", "time_limit_seconds", "points", "time_spent_seconds"].includes(key)) {
      const num = Number(text);
      body[key] = Number.isFinite(num) ? num : text;
      continue;
    }
    body[key] = text;
  }
  return body;
};

export const validateAcademyUploadFile = (file: File): string | null => {
  if (file.size <= 0) return "Uploaded file is empty";
  if (file.size > ACADEMY_FILE_MAX_BYTES) return "File exceeds 50 MiB limit";
  const contentType = file.type || "application/octet-stream";
  if (!ACADEMY_ALLOWED_FILE_PREFIXES.some((prefix) => contentType.startsWith(prefix))) {
    return "File type is not allowed";
  }
  return null;
};

const uploadAcademyFile = async (
  purpose: "resource" | "submission",
  academyId: string,
  classroomId: string,
  actorUserId: string,
  file: File,
): Promise<Json> => {
  const validationError = validateAcademyUploadFile(file);
  if (validationError) throw new Error(validationError);

  const safeName = sanitizeFilename(file.name || "file");
  const extension = safeName.includes(".") ? safeName.split(".").pop() : "";
  const path = `academy/${academyId}/classrooms/${classroomId}/${purpose}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
  const contentType = file.type || "application/octet-stream";
  const stored = await uploadFileToS3(path, file, contentType, {
    route: `academy.${purpose}.upload`,
    userId: actorUserId,
  });

  return {
    provider: "s3",
    bucket: stored.bucket,
    path: stored.path,
    filename: safeName,
    mime_type: contentType,
    size_bytes: file.size,
    uploaded_at: new Date().toISOString(),
  };
};

const storagePlaceholderUrl = (storage: Json): string => {
  const bucket = normalizeText(storage.bucket, 180);
  const path = normalizeText(storage.path, 1200);
  return bucket && path ? `storage://${bucket}/${path}` : "storage://academy-file";
};

const attachSignedStorageUrl = async (
  sb: SupabaseClientLike,
  row: Record<string, unknown>,
  actorUserId: string | null,
): Promise<Record<string, unknown>> => {
  const metadata = toJsonObject(row.metadata);
  const storage = isJsonObject(metadata.storage) ? metadata.storage : null;
  if (!storage) return row;
  const signedUrl = await signStorageRef(sb, storage, ACADEMY_SIGNED_URL_TTL_SECONDS, {
    route: "academy.storage.sign",
    userId: actorUserId,
  });
  if (!signedUrl) return row;
  return {
    ...row,
    url: signedUrl,
    signed_url: signedUrl,
    metadata: {
      ...metadata,
      storage_signed_url_expires_in: ACADEMY_SIGNED_URL_TTL_SECONDS,
    },
  };
};

const logAcademyAuditEvent = async (
  sb: SupabaseClientLike,
  args: {
    academyId: string;
    actorUserId?: string | null;
    actorRole?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    contactId?: string | null;
    classroomId?: string | null;
    status?: "ok" | "warning" | "error";
    metadata?: Json;
  },
): Promise<void> => {
  try {
    const { error } = await sb.from("academy_audit_events").insert({
      academy_id: args.academyId,
      actor_user_id: args.actorUserId ?? null,
      actor_role: args.actorRole ?? null,
      action: args.action,
      target_type: args.targetType,
      target_id: args.targetId ?? null,
      contact_id: args.contactId ?? null,
      classroom_id: args.classroomId ?? null,
      status: args.status ?? "ok",
      metadata: args.metadata ?? {},
    });
    if (error) {
      console.warn("[academy] audit insert failed", {
        action: args.action,
        academy_id: args.academyId,
        detail: error.message,
      });
    }
  } catch (err) {
    console.warn("[academy] audit insert exception", {
      action: args.action,
      academy_id: args.academyId,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
};

const weakAreaLabel = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (isJsonObject(value)) {
    return normalizeText(
      value.label ?? value.name ?? value.skill ?? value.area,
      180,
    );
  }
  return "";
};

const relatedClassroom = (row: Record<string, unknown>): Record<string, unknown> | null => {
  const raw = row.academy_classrooms;
  if (Array.isArray(raw)) return (raw[0] ?? null) as Record<string, unknown> | null;
  return isJsonObject(raw) ? raw : null;
};

const normalizeAcademyRole = academyAccessPolicy.normalizeAcademyRole;
const academyRoleRank = academyAccessPolicy.academyRoleRank;
const isAcademyManagerRole = academyAccessPolicy.isAcademyManagerRole;
const academyAccessScope = academyAccessPolicy.academyAccessScope;
const academyAccessClassroomIds = academyAccessPolicy.academyAccessClassroomIds;
const academyAccessBranchIds = academyAccessPolicy.academyAccessBranchIds;
export const buildAcademyPermissions = academyAccessPolicy.buildAcademyPermissions;
const academyAccessProfile = academyAccessPolicy.academyAccessProfile;
const academyAccessHas = academyAccessPolicy.academyAccessHas;
const academyRoleGrantToMembership = academyAccessPolicy.academyRoleGrantToMembership;
const academyRoleGrantCanAccess = academyAccessPolicy.academyRoleGrantCanAccess;
const normalizeAcademyRoleGrantStatus = academyAccessPolicy.normalizeAcademyRoleGrantStatus;
const requireAcademyPermission = academyAccessPolicy.requireAcademyPermission;

const resolveAcademyAccess = (memberships: MembershipRow[], academyId: string): MembershipRow | null =>
  memberships.find((m) => m.tenant_id === academyId && String(m.status ?? "active") === "active") ?? null;

const requireAcademyAccess = (memberships: MembershipRow[], academyId: string): MembershipRow => {
  const found = resolveAcademyAccess(memberships, academyId);
  if (!found) throw new Error("Forbidden");
  return found;
};

const accessCanUseClassroom = (access: MembershipRow, classroomIdRaw: unknown): boolean => {
  const classroomId = normalizeText(classroomIdRaw, 64);
  if (!classroomId) return false;
  const scopedIds = academyAccessClassroomIds(access);
  return scopedIds === null || scopedIds.includes(classroomId);
};

const loadValidAcademyClassroomIds = async (
  sb: SupabaseClientLike,
  academyId: string,
  classroomIds: string[],
): Promise<Set<string>> => {
  const uniqueIds = Array.from(new Set(classroomIds.map((id) => normalizeText(id, 64)).filter(Boolean)));
  if (uniqueIds.length === 0) return new Set();
  const { data, error } = await sb
    .from("academy_classrooms")
    .select("id")
    .eq("academy_id", academyId)
    .in("id", uniqueIds)
    .limit(uniqueIds.length);
  if (error) throw new Error(`Failed to validate classrooms: ${error.message}`);
  return new Set(((data ?? []) as Array<{ id: string | null }>).map((row) => String(row.id ?? "")).filter(Boolean));
};

const mergeAccessRows = (rows: MembershipRow[]): MembershipRow[] => {
  const byAcademy = new Map<string, MembershipRow>();
  for (const row of rows) {
    const tenantId = normalizeText(row.tenant_id, 64);
    if (!tenantId) continue;
    const normalizedRow: MembershipRow = {
      ...row,
      tenant_id: tenantId,
      role: normalizeAcademyRole(row.role),
      status: String(row.status ?? "active"),
      classroom_ids: toStringArray(row.classroom_ids),
      branch_ids: toStringArray(row.branch_ids),
      authority_entries: row.authority_entries ?? [{...row, authority_entries: undefined}],
    };
    const existing = byAcademy.get(tenantId);
    if (!existing) {
      byAcademy.set(tenantId, normalizedRow);
      continue;
    }

    const classroomIds = Array.from(new Set([...(existing.classroom_ids ?? []), ...(normalizedRow.classroom_ids ?? [])]));
    const branchIds = Array.from(new Set([...(existing.branch_ids ?? []), ...(normalizedRow.branch_ids ?? [])]));
    const keepNew = academyRoleRank(normalizedRow.role) > academyRoleRank(existing.role);
    byAcademy.set(tenantId, {
      ...(keepNew ? normalizedRow : existing),
      classroom_ids: classroomIds,
      branch_ids: branchIds,
      center_tenant_id: normalizedRow.center_tenant_id ?? existing.center_tenant_id ?? null,
      authority_entries: [...(existing.authority_entries ?? []), ...(normalizedRow.authority_entries ?? [])],
    });
  }
  return Array.from(byAcademy.values()).sort((a, b) => academyRoleRank(b.role) - academyRoleRank(a.role));
};

const relationMissing = (error: unknown): boolean => {
  const err = error as { code?: string; message?: string; details?: string } | null;
  const text = `${err?.code ?? ""} ${err?.message ?? ""} ${err?.details ?? ""}`.toLowerCase();
  return text.includes("42p01") || text.includes("does not exist") || text.includes("schema cache");
};

const STAFF_GRANT_ROLES = ["admin", "center_admin", "branch_manager", "manager", "counselor", "receptionist", "salesperson", "cashier", "accountant", "payroll_officer", "parent_liaison", "teacher", "assistant"];
const GRANT_STATUSES = ["invited", "active", "suspended", "revoked", "expired"];

const staffGrantScopeForRole = (role: string): "academy" | "branches" | "classrooms" => {
  const normalized = normalizeAcademyRole(role);
  if (["teacher", "assistant"].includes(normalized)) return "classrooms";
  if (["branch_manager", "receptionist", "salesperson", "cashier", "parent_liaison"].includes(normalized)) return "branches";
  return "academy";
};

const executeAcademyAutomation = async (
  sb: SupabaseClientLike,
  academyId: string,
  actorUserId: string | null,
  version: Record<string, unknown>,
  execution: Record<string, unknown>,
): Promise<{ execution: Record<string, unknown>; effects: Array<Record<string, unknown>> }> => {
  const executionId = String(execution.id ?? "");
  const branchId = normalizeText(execution.branch_id ?? version.branch_id, 64) || null;
  const input = toJsonObject(execution.input_snapshot);
  const condition = evaluateAutomationCondition(version.condition_tree, input);
  if (!condition.matched) {
    const { data, error } = await sb.from("academy_automation_executions").update({
      status: "skipped", condition_matched: false, condition_evidence: condition.evidence,
      output_summary: { reason: "conditions_not_met" }, finished_at: new Date().toISOString(),
    }).eq("academy_id", academyId).eq("id", executionId).select("*").single();
    if (error) throw new Error(`Failed to skip automation: ${error.message}`);
    return { execution: data as Record<string, unknown>, effects: [] };
  }

  const { error: runningError } = await sb.from("academy_automation_executions").update({
    status: "running", condition_matched: true, condition_evidence: condition.evidence,
    started_at: execution.started_at ?? new Date().toISOString(), reviewed_by: execution.reviewed_by ?? null,
  }).eq("academy_id", academyId).eq("id", executionId);
  if (runningError) throw new Error(`Failed to start automation: ${runningError.message}`);

  const actions = Array.isArray(version.actions) ? version.actions : [];
  const effects: Array<Record<string, unknown>> = [];
  let succeeded = 0;
  let failed = 0;
  for (let index = 0; index < actions.length; index += 1) {
    const action = toJsonObject(actions[index]);
    const actionType = normalizeText(action.type, 40).toLowerCase();
    const payload = toJsonObject(action.payload);
    const effectKey = `${execution.idempotency_key}:effect:${index}`;
    const { data: existingEffect } = await sb.from("academy_automation_effects").select("*")
      .eq("academy_id", academyId).eq("idempotency_key", effectKey).maybeSingle();
    if (existingEffect?.status === "succeeded") {
      effects.push(existingEffect as Record<string, unknown>);
      succeeded += 1;
      continue;
    }
    const { data: effect, error: effectError } = await sb.from("academy_automation_effects").upsert({
      academy_id: academyId, execution_id: executionId, branch_id: branchId, action_index: index,
      action_type: actionType, status: "pending", payload_snapshot: payload, idempotency_key: effectKey,
    }, { onConflict: "academy_id,execution_id,action_index" }).select("*").single();
    if (effectError || !effect?.id) throw new Error(`Failed to record automation effect: ${effectError?.message ?? "unknown"}`);
    try {
      let target: Record<string, unknown> | null = null;
      const contactId = normalizeText(payload.contact_id ?? input.contact_id ?? (execution.subject_type === "contact" ? execution.subject_id : null), 64) || null;
      const classroomId = normalizeText(payload.classroom_id ?? input.classroom_id, 64) || null;
      if (actionType === "create_task" || actionType === "enqueue_review") {
        const { data, error } = await sb.from("academy_action_items").upsert({
          academy_id: academyId, branch_id: branchId, contact_id: contactId, classroom_id: classroomId,
          dedupe_key: effectKey, source_type: "automation", category: normalizeText(payload.category, 40) || "operations",
          priority: normalizeText(payload.priority, 20) || "medium", title: normalizeText(payload.title, 220) || "Automation follow-up",
          description: normalizeText(payload.description, 2000), recommended_action: normalizeText(payload.recommended_action, 1000) || null,
          due_at: normalizeText(payload.due_at, 80) || null, created_by: actorUserId,
          metadata: { automation_execution_id: executionId, action_type: actionType },
        }, { onConflict: "academy_id,dedupe_key" }).select("id").single();
        if (error) throw error; target = data;
      } else if (actionType === "create_alert") {
        const { data, error } = await sb.from("academy_alerts").insert({
          academy_id: academyId, contact_id: contactId, type: normalizeText(payload.alert_type, 80) || "automation",
          severity: normalizeText(payload.severity, 20) || "medium", message: normalizeText(payload.message, 2000) || "Automation alert",
          metadata: { automation_execution_id: executionId, branch_id: branchId },
        }).select("id").single();
        if (error) throw error; target = data;
      } else if (["notify_staff", "notify_guardian", "send_telegram", "send_email"].includes(actionType)) {
        const channel = actionType === "send_telegram" ? "telegram" : actionType === "send_email" ? "email" : normalizeText(payload.channel, 20) || "inapp";
        const { data, error } = await sb.from("academy_notifications").insert({
          academy_id: academyId, contact_id: contactId, channel, type: "automation",
          title: normalizeText(payload.title, 220) || "Schood update", body: normalizeText(payload.body ?? payload.message, 4000) || "A follow-up is ready.",
          target: normalizeText(payload.target, 320) || null, status: "queued", scheduled_at: new Date().toISOString(),
          metadata: { automation_execution_id: executionId, branch_id: branchId, intended_audience: actionType === "notify_guardian" ? "guardian" : "staff" },
        }).select("id").single();
        if (error) throw error; target = data;
      } else if (actionType === "assign_employee") {
        const assigneeUserId = normalizeText(payload.user_id, 64);
        if (!assigneeUserId || execution.subject_type !== "lead" || !execution.subject_id) throw new Error("assign_employee requires a lead subject and staff user_id");
        const { data: staff } = await sb.from("academy_staff").select("user_id").eq("academy_id", academyId).eq("user_id", assigneeUserId).eq("is_active", true).maybeSingle();
        if (!staff?.user_id) throw new Error("Assigned employee is not active in this academy");
        const { data, error } = await sb.from("academy_leads").update({ assigned_user_id: assigneeUserId, updated_by: actorUserId })
          .eq("academy_id", academyId).eq("id", String(execution.subject_id)).select("id").single();
        if (error) throw error; target = data;
      } else if (actionType === "add_tag") {
        const tag = normalizeText(payload.tag, 80);
        const subjectType = String(execution.subject_type ?? "");
        const table = subjectType === "lead" ? "academy_leads" : subjectType === "contact" ? "academy_contacts" : "";
        if (!tag || !table || !execution.subject_id) throw new Error("add_tag requires a lead or contact subject and tag");
        const { data: subject, error: subjectError } = await sb.from(table).select("id,metadata").eq("academy_id",academyId).eq("id",String(execution.subject_id)).single();
        if (subjectError) throw subjectError;
        const metadata = toJsonObject(subject.metadata); const tags = Array.from(new Set([...toStringArray(metadata.tags), tag]));
        const { data, error } = await sb.from(table).update({ metadata: { ...metadata, tags } }).eq("academy_id",academyId).eq("id",String(execution.subject_id)).select("id").single();
        if (error) throw error; target = data;
      } else {
        throw new Error(`Unsupported automation action: ${actionType}`);
      }
      const { data: completed, error: completeError } = await sb.from("academy_automation_effects").update({
        status: "succeeded", result_snapshot: { target }, external_reference: target?.id ? String(target.id) : null,
        attempted_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      }).eq("academy_id",academyId).eq("id",effect.id).select("*").single();
      if (completeError) throw completeError;
      effects.push(completed as Record<string, unknown>); succeeded += 1;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const { data: failedEffect } = await sb.from("academy_automation_effects").update({
        status: "failed", error_code: "effect_failed", error_detail: detail.slice(0, 2000), attempted_at: new Date().toISOString(),
      }).eq("academy_id",academyId).eq("id",effect.id).select("*").single();
      if (failedEffect) effects.push(failedEffect as Record<string, unknown>); failed += 1;
    }
  }
  const status = failed === 0 ? "succeeded" : succeeded === 0 ? "failed" : "partially_succeeded";
  const { data: completedExecution, error: completionError } = await sb.from("academy_automation_executions").update({
    status, output_summary: { total: actions.length, succeeded, failed }, error_code: failed ? "one_or_more_effects_failed" : null,
    finished_at: new Date().toISOString(),
  }).eq("academy_id",academyId).eq("id",executionId).select("*").single();
  if (completionError) throw new Error(`Failed to complete automation: ${completionError.message}`);
  await logAcademyAuditEvent(sb, { academyId, actorUserId, action: "automation.executed", targetType: "academy_automation_execution", targetId: executionId, status: failed ? "warning" : "ok", metadata: { succeeded, failed } });
  return { execution: completedExecution as Record<string, unknown>, effects };
};

const runAcademyAutomationEvents = async (
  sb: SupabaseClientLike,
  limit = 100,
): Promise<Record<string, unknown>> => {
  const { data: pendingEvents, error: pendingError } = await sb
    .from("domain_event_outbox")
    .select("id,event_type,aggregate_type,aggregate_id,user_id,payload,status,attempts,occurred_at")
    .in("status", ["pending", "failed"])
    .contains("payload", { academy_automation_event: true })
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 200)));
  if (pendingError) throw new Error(`Failed to load Academy automation events: ${pendingError.message}`);

  let delivered = 0;
  let failed = 0;
  let skipped = 0;
  let executions = 0;
  let reviews = 0;
  for (const event of (pendingEvents ?? []) as Array<Record<string, unknown>>) {
    const eventId = String(event.id ?? "");
    const attempts = Number(event.attempts ?? 0) + 1;
    const { data: claimed, error: claimError } = await sb
      .from("domain_event_outbox")
      .update({ status: "processing", attempts, last_error: null })
      .eq("id", eventId)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(`Failed to claim Academy event: ${claimError.message}`);
    if (!claimed?.id) { skipped += 1; continue; }

    try {
      const payload = toJsonObject(event.payload);
      const evidence = toJsonObject(payload.evidence);
      const academyId = normalizeText(payload.academy_id, 64);
      const triggerKey = normalizeText(event.event_type, 100).toLowerCase();
      const branchId = normalizeText(payload.branch_id, 64) || null;
      if (!academyId || !triggerKey) throw new Error("Academy automation event is missing academy_id or event_type");
      const { data: versions, error: versionsError } = await sb
        .from("academy_automation_rule_versions")
        .select("*")
        .eq("academy_id", academyId)
        .eq("trigger_key", triggerKey)
        .eq("status", "active")
        .limit(200);
      if (versionsError) throw new Error(`Failed to load active automation versions: ${versionsError.message}`);
      const applicable = ((versions ?? []) as Array<Record<string, unknown>>).filter((version) => {
        const versionBranch = normalizeText(version.branch_id, 64) || null;
        return versionBranch === null || versionBranch === branchId;
      });

      for (const version of applicable) {
        const actorUserId = normalizeText(event.user_id ?? version.created_by, 64) || null;
        const leadId = normalizeText(payload.lead_id, 64) || null;
        const contactId = normalizeText(payload.contact_id, 64) || null;
        const classroomId = normalizeText(payload.classroom_id, 64) || null;
        const subjectType = leadId ? "lead" : contactId ? "contact" : classroomId ? "classroom" : String(event.aggregate_type ?? "academy_lifecycle");
        const subjectId = leadId || contactId || classroomId || normalizeText(event.aggregate_id, 64) || null;
        const idempotencyKey = `academy-event:${eventId}:rule-version:${String(version.id)}`;
        const inputSnapshot = { ...payload, ...evidence, event_type: triggerKey, occurred_at: event.occurred_at };
        const { data: execution, error: beginError } = await sb.rpc("academy_begin_automation_execution", {
          p_academy_id: academyId,
          p_rule_version_id: version.id,
          p_actor_id: actorUserId,
          p_payload: { source_event_id: eventId, trigger_key: triggerKey, subject_type: subjectType, subject_id: subjectId, input_snapshot: inputSnapshot },
          p_idempotency_key: idempotencyKey,
        });
        if (beginError || !execution?.id) throw new Error(`Failed to begin Academy automation: ${beginError?.message ?? "unknown"}`);
        if (execution.status === "awaiting_review") {
          const actions = Array.isArray(version.actions) ? version.actions : [];
          for (let index = 0; index < actions.length; index += 1) {
            const action = toJsonObject(actions[index]);
            const { error: effectError } = await sb.from("academy_automation_effects").upsert({
              academy_id: academyId, execution_id: execution.id, branch_id: version.branch_id ?? null,
              action_index: index, action_type: normalizeText(action.type, 40).toLowerCase(), status: "awaiting_review",
              payload_snapshot: toJsonObject(action.payload), idempotency_key: `${idempotencyKey}:effect:${index}`,
            }, { onConflict: "academy_id,execution_id,action_index" });
            if (effectError) throw new Error(`Failed to stage safeguarded automation effect: ${effectError.message}`);
          }
          reviews += 1;
          await logAcademyAuditEvent(sb, { academyId, actorUserId, action: "automation.review_requested", targetType: "academy_automation_execution", targetId: String(execution.id), metadata: { source_event_id: eventId, trigger_key: triggerKey } });
        } else {
          await executeAcademyAutomation(sb, academyId, actorUserId, version, execution as Record<string, unknown>);
          executions += 1;
        }
      }
      const { error: deliveredError } = await sb.from("domain_event_outbox").update({ status: "delivered", last_error: null }).eq("id", eventId);
      if (deliveredError) throw deliveredError;
      delivered += 1;
    } catch (error) {
      failed += 1;
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 600);
      await sb.from("domain_event_outbox").update({ status: "failed", last_error: message }).eq("id", eventId);
    }
  }
  return { cycle: "automation_events", scanned: (pendingEvents ?? []).length, delivered, failed, skipped, executions, reviews };
};

const formatRoleGrantAsStaff = (grant: Record<string, unknown>): Record<string, unknown> => {
  const role = normalizeAcademyRole(grant.role);
  const scopeType = String(grant.scope_type ?? staffGrantScopeForRole(role));
  const scopeIds = toStringArray(grant.scope_ids);
  return {
    id: String(grant.id ?? ""),
    grant_id: grant.id ? String(grant.id) : null,
    academy_id: String(grant.academy_id ?? ""),
    user_id: grant.user_id ? String(grant.user_id) : null,
    email: String(grant.email ?? ""),
    display_name: grant.display_name ? String(grant.display_name) : null,
    role,
    classroom_ids: scopeType === "classrooms" ? scopeIds : [],
    branch_ids: scopeType === "branches" ? scopeIds : [],
    scope_type: scopeType,
    scope_ids: scopeIds,
    status: String(grant.status ?? "invited"),
    is_active: String(grant.status ?? "invited") === "active",
    source: "grant",
    starts_at: grant.starts_at ? String(grant.starts_at) : null,
    expires_at: grant.expires_at ? String(grant.expires_at) : null,
    accepted_at: grant.accepted_at ? String(grant.accepted_at) : null,
    revoked_at: grant.revoked_at ? String(grant.revoked_at) : null,
    last_used_at: grant.last_used_at ? String(grant.last_used_at) : null,
    created_at: String(grant.created_at ?? ""),
    updated_at: grant.updated_at ? String(grant.updated_at) : null,
  };
};

const insertRoleGrantAudit = async (
  sb: SupabaseClientLike,
  payload: Record<string, unknown>,
): Promise<void> => {
  const { error } = await sb.from("academy_access_audit_logs").insert(payload);
  if (error && !relationMissing(error)) console.warn("academy access audit failed", error.message);
};

const loadScopedContactIds = async (
  sb: SupabaseClientLike,
  academyId: string,
  classroomIds: string[] | null,
): Promise<Set<string> | null> => {
  if (classroomIds === null) return null;
  if (classroomIds.length === 0) return new Set();
  const { data, error } = await sb
    .from("academy_classroom_memberships")
    .select("contact_id")
    .eq("academy_id", academyId)
    .in("classroom_id", classroomIds)
    .limit(10000);
  if (error) throw new Error(`Failed to load classroom contact scope: ${error.message}`);
  return new Set(
    ((data ?? []) as Array<{ contact_id: string | null }>)
      .map((row) => (row.contact_id ? String(row.contact_id) : ""))
      .filter((id) => id.length > 0),
  );
};

const ensureContactInAccessScope = async (
  sb: SupabaseClientLike,
  academyId: string,
  access: MembershipRow,
  contactIdRaw: unknown,
): Promise<string> => {
  const contactId = normalizeText(contactIdRaw, 64);
  if (!contactId) throw new Error("contact_id is required");
  const scopedIds = academyAccessClassroomIds(access);
  if (scopedIds === null) return contactId;
  const contactIds = await loadScopedContactIds(sb, academyId, scopedIds);
  if (!contactIds?.has(contactId)) throw new Error("Forbidden");
  return contactId;
};

type ClassroomChatViewer = {
  type: "teacher" | "student";
  role: string;
  contact_id: string | null;
  display_name: string;
  can_manage_resources: boolean;
};

type ClassroomChatContext = {
  academy_id: string;
  classroom_id: string;
  classroom: Record<string, unknown>;
  classroom_memberships: Array<Record<string, unknown>>;
  contacts_by_id: Map<string, Record<string, unknown>>;
  viewer: ClassroomChatViewer;
  teacher_access: MembershipRow | null;
};

type ClassroomResourceKind = "video" | "book" | "asset" | "link" | "assignment" | "mock" | "practice" | "playbook";

const CLASSROOM_RESOURCE_KINDS: ClassroomResourceKind[] = [
  "video",
  "book",
  "asset",
  "link",
  "assignment",
  "mock",
  "practice",
  "playbook",
];

const contactDisplayName = (contact: Record<string, unknown> | null | undefined): string => {
  if (!contact) return "";
  const firstName = normalizeText(contact.first_name, 120);
  const lastName = normalizeText(contact.last_name, 120);
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;
  const email = normalizeEmail(contact.email);
  if (email) return email;
  return "";
};

const fallbackDisplayName = (email: string | null, fallback: string): string => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return fallback;
  const localPart = normalizedEmail.split("@")[0]?.trim();
  return localPart || fallback;
};

const STUDENT_CONTACT_STATUSES = ["active", "trial", "paused"];
const STUDENT_CONTACT_SELECT =
  "id, academy_id, user_id, primary_branch_id, first_name, last_name, email, phone, telegram_id, status, metadata, created_at, updated_at";

const loadStudentContacts = async (
  sb: SupabaseClientLike,
  userId: string,
  _userEmail: string | null,
): Promise<Array<Record<string, unknown>>> => {
  const {data,error}=await sb.rpc('academy_student_contacts_command',{p_actor_id:userId});
  if(error||!data||data.actor_id!==userId||!Array.isArray(data.contacts))throw new Error('Current student account links could not be confirmed');
  return data.contacts as Array<Record<string,unknown>>;
};

const isAcademyTenantRow = (tenant: Record<string, unknown> | null | undefined): boolean => {
  const tenantType = String(tenant?.type ?? "").toLowerCase();
  const metadata = toJsonObject(tenant?.metadata);
  return (
    tenantType === "team" ||
    String(metadata.service_family ?? "").toLowerCase() === "academy" ||
    metadata.academy_service === true ||
    metadata.center_owned === true
  );
};

const loadMemberships = async (
  sb: SupabaseClientLike,
  userId: string,
  userEmail: string | null = null,
): Promise<MembershipRow[]> => {
  const { data, error } = await sb
    .from("tenant_memberships")
    .select("tenant_id, role, status, tenants ( id, type, metadata )")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error("Failed to load academy memberships");

  const membershipRows = (data ?? []) as unknown as Array<
    MembershipRow & { tenants?: Record<string, unknown> | Record<string, unknown>[] | null }
  >;

  const centerCandidateIds = Array.from(
    new Set(
      membershipRows
        .filter((row) => ["owner", "admin"].includes(normalizeAcademyRole(row.role)))
        .map((row) => String(row.tenant_id ?? ""))
        .filter((id) => id.length > 0),
    ),
  );
  const centerTenantIds = new Set<string>();

  if (centerCandidateIds.length > 0) {
    const { data: centerProfiles, error: centerError } = await sb
      .from("partner_center_profiles")
      .select("tenant_id,status")
      .in("tenant_id", centerCandidateIds);
    if (centerError) throw new Error(`Failed to load education center profiles: ${centerError.message}`);

    for (const center of (centerProfiles ?? []) as Array<{ tenant_id: string | null; status: string | null }>) {
      if (center.status !== "active") continue;
      const centerTenantId = normalizeText(center.tenant_id, 64);
      if (centerTenantId) centerTenantIds.add(centerTenantId);
    }
  }

  const accessRows: MembershipRow[] = [];

  for (const row of membershipRows) {
    const tenant = Array.isArray((row as any).tenants) ? (row as any).tenants[0] : (row as any).tenants;
    if (!isAcademyTenantRow(tenant)) continue;
    accessRows.push({
      tenant_id: String(row.tenant_id ?? ""),
      role: normalizeAcademyRole(row.role),
      status: String(row.status ?? "active"),
      source: "tenant",
      classroom_ids: [],
      branch_ids: [],
    });
  }

  if (centerTenantIds.size > 0) {
    for (const centerTenantId of centerTenantIds) {
      const { data: childAcademies, error: childError } = await sb
        .from("tenants")
        .select("id")
        .contains("metadata", { parent_center_id: centerTenantId, service_family: "academy" })
        .limit(500);
      if (childError) throw new Error(`Failed to load center academies: ${childError.message}`);
      for (const academy of (childAcademies ?? []) as Array<{ id: string | null }>) {
        const academyId = academy.id ? String(academy.id) : "";
        if (!academyId) continue;
        accessRows.push({
          tenant_id: academyId,
          role: "center_admin",
          status: "active",
          source: "center",
          center_tenant_id: centerTenantId,
          classroom_ids: [],
          branch_ids: [],
        });
      }
    }
  }

  const normalizedEmail = normalizeEmail(userEmail);
  const nowIso = new Date().toISOString();
  const principal = {userId,email:normalizedEmail || null,emailVerified:Boolean(normalizedEmail)};
  const grantRowsById = new Map<string, Record<string, unknown>>();
  const usedGrantIds: string[] = [];

  const collectGrantRows = (rows: Array<Record<string, unknown>>): void => {
    for (const row of rows) {
      const id = String(row.id ?? crypto.randomUUID());
      grantRowsById.set(id, row);
    }
  };

  const grantSelect =
    "id, academy_id, user_id, email, display_name, role, scope_type, scope_ids, status, starts_at, expires_at, accepted_at, revoked_at, last_used_at, created_at, updated_at";
  let grantsAvailable = true;
  const { data: grantsByUser, error: grantsUserError } = await sb
    .from("academy_role_grants")
    .select(grantSelect)
    .eq("user_id", userId)
    .in("status", ["invited", "active"])
    .limit(1000);
  if (grantsUserError) {
    if (relationMissing(grantsUserError)) grantsAvailable = false;
    else throw new Error(`Failed to load academy role grants: ${grantsUserError.message}`);
  } else {
    collectGrantRows((grantsByUser ?? []) as Array<Record<string, unknown>>);
  }

  if (grantsAvailable && normalizedEmail) {
    const { data: grantsByEmail, error: grantsEmailError } = await sb
      .from("academy_role_grants")
      .select(grantSelect)
      .eq("email", normalizedEmail)
      .in("status", ["invited", "active"])
      .limit(1000);
    if (grantsEmailError) {
      if (relationMissing(grantsEmailError)) grantsAvailable = false;
      else throw new Error(`Failed to load academy role grant email access: ${grantsEmailError.message}`);
    } else {
      collectGrantRows((grantsByEmail ?? []) as Array<Record<string, unknown>>);
    }
  }

  for (let grant of grantRowsById.values()) {
    if (!academyAuthorityIdentityMatches(grant,principal)) continue;
    if (!academyRoleGrantCanAccess(grant,new Date(nowIso))) continue;
    if (String(grant.status) === "invited") {
      try {
        const accepted = await acceptStaffAccess(sb,userId,{grantId:String(grant.id)});
        grant = accepted.grant as Record<string,unknown>;
      } catch (error) {
        if(error instanceof StaffInvitationError && [403,404,409,410].includes(error.status)) continue;
        throw new Error("Failed to accept academy access invitation");
      }
      if (!academyAuthorityIdentityMatches(grant,principal)) continue;
    }
    const membership = academyRoleGrantToMembership(grant, new Date(nowIso));
    if (!membership) continue;
    const authority = academyGrantAuthorityEntry(grant,principal);
    if (!authority) continue;
    accessRows.push({...membership,scope_type:authority.scope_type,scope_ids:authority.scope_ids,
      starts_at:authority.starts_at,expires_at:authority.expires_at,authority_entries:[authority]} as MembershipRow);
    if (membership.grant_id) usedGrantIds.push(membership.grant_id);
  }
  const uniqueUsedGrantIds = Array.from(new Set(usedGrantIds));
  if (grantsAvailable && uniqueUsedGrantIds.length > 0) {
    await sb
      .from("academy_role_grants")
      .update({ last_used_at: nowIso, updated_at: nowIso })
      .in("id", uniqueUsedGrantIds).eq("status","active").eq("user_id",userId);
  }

  const staffRowsById = new Map<string, Record<string, unknown>>();
  const { data: staffByUser, error: staffUserError } = await sb
    .from("academy_staff")
    .select("id, academy_id, user_id, email, role, classroom_ids, is_active, managed_grant_id")
    .eq("user_id", userId)
    .limit(1000);
  if (staffUserError) throw new Error(`Failed to load academy staff access: ${staffUserError.message}`);
  for (const row of (staffByUser ?? []) as Array<Record<string, unknown>>) {
    staffRowsById.set(String(row.id ?? crypto.randomUUID()), row);
  }

  if (normalizedEmail) {
    const { data: staffByEmail, error: staffEmailError } = await sb
      .from("academy_staff")
      .select("id, academy_id, user_id, email, role, classroom_ids, is_active, managed_grant_id")
      .eq("email", normalizedEmail)
      .limit(1000);
    if (staffEmailError) throw new Error(`Failed to load academy staff email access: ${staffEmailError.message}`);
    for (const row of (staffByEmail ?? []) as Array<Record<string, unknown>>) {
      staffRowsById.set(String(row.id ?? crypto.randomUUID()), row);
    }
  }

  const branchIdsByStaffId = new Map<string, string[]>();
  if (uniqueUsedGrantIds.length > 0) {
    const {data:linkedProfiles,error:linkedError} = await sb.from("academy_staff")
      .select("id, academy_id, user_id, email, role, classroom_ids, is_active, managed_grant_id")
      .in("managed_grant_id", uniqueUsedGrantIds).limit(2000);
    if (linkedError) throw new Error("Failed to load linked academy staff identities");
    for (const row of (linkedProfiles ?? []) as Array<Record<string, unknown>>) staffRowsById.set(String(row.id),row);
  }
  const staffIds = Array.from(staffRowsById.keys()).filter(Boolean);
  if (staffIds.length > 0) {
    const { data: branchAssignments, error: branchAssignmentsError } = await sb
      .from("academy_staff_branch_assignments")
      .select("academy_id,staff_id,branch_id,starts_on,ends_on,academy_branches(academy_id,id,timezone,is_active)")
      .in("staff_id", staffIds)
      .eq("status", "active")
      .limit(5000);
    if (branchAssignmentsError && !relationMissing(branchAssignmentsError)) {
      throw new Error(`Failed to load academy branch access: ${branchAssignmentsError.message}`);
    }
    for (const assignment of (branchAssignments ?? []) as Array<Record<string, unknown>>) {
      const staff = staffRowsById.get(String(assignment.staff_id));
      const relation = assignment.academy_branches;
      const branch = (Array.isArray(relation) ? relation[0] : relation) as Record<string, unknown> | null;
      if (!staff || !branch || branch.is_active !== true || assignment.academy_id !== staff.academy_id
        || branch.academy_id !== staff.academy_id || branch.id !== assignment.branch_id) continue;
      let localDay: string;
      try {
        if (typeof branch.timezone !== "string" || !branch.timezone) continue;
        const parts = new Intl.DateTimeFormat("en-US", {timeZone:branch.timezone,year:"numeric",month:"2-digit",day:"2-digit"})
          .formatToParts(new Date(nowIso));
        const part = (type: string) => parts.find(value => value.type === type)?.value ?? "";
        localDay = `${part("year")}-${part("month")}-${part("day")}`;
      } catch { continue; }
      const start = String(assignment.starts_on ?? ""), end = assignment.ends_on == null ? null : String(assignment.ends_on);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start > localDay
        || (end !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end < localDay))) continue;
      const existing = branchIdsByStaffId.get(String(assignment.staff_id)) ?? [];
      existing.push(String(assignment.branch_id));
      branchIdsByStaffId.set(String(assignment.staff_id), Array.from(new Set(existing)));
    }
  }

  for (const staff of staffRowsById.values()) {
    const academyId = String(staff.academy_id ?? "");
    if (!academyId) continue;
    const staffId = staff.id ? String(staff.id) : "";
    if (staff.managed_grant_id != null) {
      // A linked profile supplies operational identity, never a second source
      // of authority. Missing/revoked/expired grants cannot fall back to staff.
      const grant = accessRows.find(row => row.source === "grant" && row.tenant_id === academyId
        && row.grant_id === staff.managed_grant_id);
      if (!grant) continue;
      if (academyAuthorityIdentityMatches(staff,principal)) {
        grant.staff_id = staffId;
        grant.authority_entries = (grant.authority_entries ?? []).map(entry => ({...entry,staff_id:staffId}));
      }
      if (grant.scope_type === "branches") {
        const assigned = new Set(branchIdsByStaffId.get(staffId) ?? []);
        const effective = toStringArray(grant.scope_ids).filter(id => assigned.has(id));
        grant.scope_ids = effective;
        grant.branch_ids = effective;
        grant.authority_entries = (grant.authority_entries ?? []).map(entry => ({...entry,scope_ids:effective.slice(),branch_ids:effective.slice()}));
      }
      continue;
    }
    if (staff.is_active !== true || !academyAuthorityIdentityMatches(staff,principal)) continue;
    accessRows.push({
      tenant_id: academyId,
      role: normalizeAcademyRole(staff.role),
      status: "active",
      source: "staff",
      staff_id: staffId || null,
      classroom_ids: toStringArray(staff.classroom_ids),
      branch_ids: branchIdsByStaffId.get(staffId) ?? [],
    });
  }

  return mergeAccessRows(accessRows);
};

const resolveAcademyId = (memberships: MembershipRow[], requested: string | null): string => {
  if (!requested) return memberships[0]?.tenant_id ?? "";
  const found = memberships.find((m) => m.tenant_id === requested);
  if (!found) throw new Error("Forbidden");
  return requested;
};

export const ACADEMY_ACTION_PERMISSIONS = {
  resolve_action_item: "resolveActionItems",
  set_lifecycle_stage: "manageContacts",
  upsert_automation_rule: "manageAutomation",
  run_automation_rules: "manageAutomation",
  create_automation_version: "manageAutomation",
  execute_automation_event: "manageAutomation",
  review_automation_execution: "manageAutomation",
  request_ai_assistance: "useAcademyAI",
  review_ai_assistance: "useAcademyAI",
  upsert_localization: "manageLocalization",
  upsert_campaign: "exportAdmissions",
  upsert_staff_branch_assignment: "manageStaff",
  upsert_branch: "manageBranches",
  upsert_room: "manageBranches",
  create_lead: "manageAdmissions",
  transition_lead: "manageAdmissions",
  record_lead_activity: "manageAdmissions",
  schedule_trial: "manageAdmissions",
  set_trial_status: "manageTrialFeedback",
  convert_lead: "manageAdmissions",
  convert_lead_full: "manageAdmissions",
  create_pricing_plan: "manageFinance",
  create_subscription: "manageFinance",
  manage_subscription: "manageFinance",
  create_charge: "manageFinance",
  allocate_payment: "collectFinance",
  post_account_adjustment: "adjustFinance",
  record_payment_reconciliation: "reconcileFinance",
  record_payment_promise: "collectFinance",
  create_cashbox: "manageCashier",
  open_cashier_shift: "manageCashier",
  record_cash_movement: "manageCashier",
  close_cashier_shift: "manageCashier",
  upsert_expense_category: "manageFinance",
  record_expense: "manageFinance",
  upsert_budget: "manageFinance",
  upsert_compensation_rule: "calculatePayroll",
  record_lesson_delivery: "calculatePayroll",
  create_payroll_period: "calculatePayroll",
  calculate_payroll: "calculatePayroll",
  post_payroll_adjustment: "calculatePayroll",
  transition_payroll: "viewPayroll",
  upsert_academic_calendar: "manageAcademicOperations",
  upsert_calendar_event: "manageAcademicOperations",
  upsert_staff_availability: "manageAcademicOperations",
  upsert_room_availability: "manageAcademicOperations",
  create_lesson_session: "manageAcademicOperations",
  upsert_session_delivery: "manageAcademicOperations",
  transition_lesson_session: "manageAcademicOperations",
  assign_session_substitute: "manageAcademicOperations",
  record_session_attendance: "markAttendance",
  record_attendance_exception: "manageAcademicOperations",
  upsert_make_up_lesson: "manageAcademicOperations",
  record_session_quality_review: "manageAcademicOperations",
  create_guardian_relationship: "manageGuardians",
  issue_guardian_link: "manageGuardians",
  revoke_guardian_relationship: "manageGuardians",
  upsert_guardian_preferences: "manageGuardians",
  queue_guardian_notification: "communicateGuardians",
  send_guardian_message: "communicateGuardians",
  upsert_risk_definition: "manageRetention",
  evaluate_retention_risk: "manageRetention",
  create_intervention: "manageRetention",
  update_intervention: "manageRetention",
  record_intervention_activity: "manageRetention",
  upsert_renewal_opportunity: "manageRetention",
  record_renewal_activity: "manageRetention",
  update_operational_action: "resolveActionItems",
  create_import_job: "manageImports",
  add_import_row: "manageImports",
  commit_import_job: "manageImports",
  rollback_import_job: "manageImports",
  update_academy_landing: "manageAcademy",
  update_classroom_landing: "manageClassrooms",
  upsert_contact: "manageContacts",
  create_classroom: "manageClassrooms",
  upsert_classroom_membership: "manageRoster",
  remove_classroom_membership: "manageRoster",
  send_message: "manageMessages",
  send_announcement: "manageAnnouncements",
  create_alert: "manageAlerts",
  resolve_alert: "resolveAlerts",
  create_offer: "manageOffers",
  upsert_offer_grant: "manageOffers",
  create_payment: "collectFinance",
  mark_payment_paid: "collectFinance",
  grant_contact: "manageOffers",
  create_assignment: "manageAssignments",
  update_assignment: "manageAssignments",
  upsert_course: "manageAssignments",
  publish_course: "manageAssignments",
  assign_course: "manageAssignments",
  upsert_module: "manageAssignments",
  upsert_lesson: "manageAssignments",
  upsert_quiz: "manageAssignments",
  upsert_quiz_question: "manageAssignments",
  upsert_grade_category: "gradeSubmissions",
  upsert_rubric: "gradeSubmissions",
  grade_quiz_attempt: "gradeSubmissions",
  set_enrollment_status: "manageRoster",
  grade_submission: "gradeSubmissions",
  mark_attendance: "markAttendance",
  bulk_invite: "manageRoster",
  update_classroom_settings: "manageClassrooms",
  export_gradebook: "gradeSubmissions",
  upsert_schedule: "manageSchedule",
  delete_schedule: "manageSchedule",
  record_placement: "manageContacts",
  upsert_staff: "manageStaff",
  remove_staff: "manageStaff",
  issue_academy_certificate: "issueCertificates",
  compute_at_risk: "viewEducationOS",
  generate_classroom_lesson_plan: "viewEducationOS",
  dispatch_notifications: "dispatchNotifications",
  generate_morning_brief: "dispatchNotifications",
  generate_parent_report: "viewReports",
  upsert_branding: "manageBranding",
  upsert_timetable_term: "manageAcademicOperations",
  upsert_timetable_series: "manageAcademicOperations",
  generate_timetable: "manageAcademicOperations",
  upsert_communication_journey: "manageAutomation",
  enroll_communication_journey: "manageAutomation",
  advance_communication_journeys: "dispatchNotifications",
  upsert_collection_case: "collectFinance",
  record_collection_attempt: "collectFinance",
  create_sensitive_case: "manageRetention",
  update_sensitive_case: "manageRetention",
  upsert_competency_framework: "manageAssignments",
  upsert_competency: "manageAssignments",
  upsert_learning_plan: "manageAssignments",
  record_competency_evidence: "gradeSubmissions",
  upsert_integration_endpoint: "manageAutomation",
  queue_integration_event: "manageAutomation",
  dispatch_integration_events: "manageAutomation",
} as const satisfies Record<string, keyof AcademyAccessPermissions>;

const ensureConversationId = async (
  sb: SupabaseClientLike,
  academyId: string,
  contactId: string,
): Promise<string> => {
  const { data: existing, error: loadError } = await sb
    .from("academy_conversations")
    .select("id")
    .eq("academy_id", academyId)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (loadError) throw new Error("Failed to load conversation");
  if (existing?.id) return String(existing.id);

  const { data: created, error: createError } = await sb
    .from("academy_conversations")
    .insert({
      academy_id: academyId,
      contact_id: contactId,
    })
    .select("id")
    .maybeSingle();
  if (createError || !created?.id) throw new Error("Failed to create conversation");
  return String(created.id);
};

const loadStudentFeed = async (
  sb: SupabaseClientLike,
  userId: string,
  userEmail: string | null,
): Promise<Response> => {
  let contacts: Array<Record<string, unknown>> = [];
  try {
    contacts = await loadStudentContacts(sb, userId, userEmail);
  } catch (err) {
    return json(500, { error: "Failed to load student contacts", detail: err instanceof Error ? err.message : String(err) });
  }

  const feedContacts = contacts.map((row) => ({
    id: String(row.id ?? ""),
    academy_id: String(row.academy_id ?? ""),
    first_name: String(row.first_name ?? ""),
    last_name: String(row.last_name ?? ""),
    email: row.email ? String(row.email) : null,
    status: String(row.status ?? "active"),
  }));

  if (contacts.length === 0) {
    return json(200, { academies: [], contacts: [], messages: [], alerts: [] });
  }

  const contactIds = Array.from(new Set(contacts.map((row) => String(row.id ?? "")).filter((id) => id.length > 0)));
  const academyIds = Array.from(
    new Set(contacts.map((row) => String(row.academy_id ?? "")).filter((id) => id.length > 0)),
  );

  const [academiesRes, messagesRes, alertsScopedRes, alertsGlobalRes] = await Promise.all([
    sb
      .from("tenants")
      .select("id, name, slug, type, metadata")
      .in("id", academyIds),
    sb
      .from("academy_messages")
      .select("id, academy_id, conversation_id, contact_id, sender_type, message_type, content, metadata, created_at")
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false })
      .limit(400),
    sb
      .from("academy_alerts")
      .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
      .in("academy_id", academyIds)
      .in("contact_id", contactIds)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(120),
    sb
      .from("academy_alerts")
      .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
      .in("academy_id", academyIds)
      .is("contact_id", null)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  if (academiesRes.error) {
    return json(500, { error: "Failed to load academies", detail: academiesRes.error.message });
  }
  if (messagesRes.error) {
    return json(500, { error: "Failed to load student messages", detail: messagesRes.error.message });
  }
  if (alertsScopedRes.error) {
    return json(500, { error: "Failed to load scoped alerts", detail: alertsScopedRes.error.message });
  }
  if (alertsGlobalRes.error) {
    return json(500, { error: "Failed to load global alerts", detail: alertsGlobalRes.error.message });
  }

  const alertsMap = new Map<string, Record<string, unknown>>();
  for (const row of [...(alertsScopedRes.data ?? []), ...(alertsGlobalRes.data ?? [])] as Array<Record<string, unknown>>) {
    const id = String(row.id ?? "");
    if (!id || alertsMap.has(id)) continue;
    alertsMap.set(id, row);
  }

  return json(200, {
    academies: academiesRes.data ?? [],
    contacts: feedContacts,
    messages: messagesRes.data ?? [],
    alerts: Array.from(alertsMap.values()),
  });
};

const loadStudentDashboard = async (
  sb: SupabaseClientLike,
  userId: string,
  userEmail: string | null,
): Promise<Response> => {
  let contacts: Array<Record<string, unknown>> = [];
  try {
    contacts = await loadStudentContacts(sb, userId, userEmail);
  } catch (err) {
    return json(500, { error: "Failed to load student contacts", detail: err instanceof Error ? err.message : String(err) });
  }

  if (contacts.length === 0) {
    return json(200, {
      academies: [],
      contacts: [],
      classrooms: [],
      classroom_memberships: [],
      announcements: [],
      messages: [],
      alerts: [],
      entitlements: [],
      payments: [],
      offers: [],
    });
  }

  const contactIds = Array.from(new Set(contacts.map((row) => String(row.id ?? "")).filter((id) => id.length > 0)));
  const academyIds = Array.from(
    new Set(contacts.map((row) => String(row.academy_id ?? "")).filter((id) => id.length > 0)),
  );

  const [
    academiesRes,
    membershipsRes,
    classroomsRes,
    announcementsGlobalRes,
    messagesRes,
    alertsScopedRes,
    alertsGlobalRes,
    entitlementsRes,
    paymentsRes,
    offersRes,
  ] = await Promise.all([
    sb
      .from("tenants")
      .select("id, name, slug, type, metadata")
      .in("id", academyIds),
    sb
      .from("academy_classroom_memberships")
      .select("id, academy_id, classroom_id, contact_id, role, status, joined_at, started_at, completed_at, paused_at, withdrawn_at, expires_at, metadata")
      .in("academy_id", academyIds)
      .in("contact_id", contactIds)
      .in("status", ["active", "completed"])
      .order("joined_at", { ascending: false })
      .limit(2000),
    sb
      .from("academy_classrooms")
      .select("id, academy_id, name, description, is_active, metadata, created_at, updated_at")
      .in("academy_id", academyIds)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1000),
    sb
      .from("academy_announcements")
      .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
      .in("academy_id", academyIds)
      .is("classroom_id", null)
      .order("created_at", { ascending: false })
      .limit(160),
    sb
      .from("academy_messages")
      .select("id, academy_id, conversation_id, contact_id, sender_type, message_type, content, metadata, created_at")
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false })
      .limit(500),
    sb
      .from("academy_alerts")
      .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
      .in("academy_id", academyIds)
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false })
      .limit(240),
    sb
      .from("academy_alerts")
      .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
      .in("academy_id", academyIds)
      .is("contact_id", null)
      .order("created_at", { ascending: false })
      .limit(240),
    sb
      .from("academy_entitlements")
      .select("id, academy_id, contact_id, user_id, offer_id, payment_id, grant_type, resource_type, resource_id, capability_key, quantity, remaining, starts_at, expires_at, status, source, metadata, created_at, updated_at")
      .in("academy_id", academyIds)
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false })
      .limit(500),
    sb
      .from("academy_payments")
      .select("id, academy_id, contact_id, offer_id, provider, provider_transaction_id, amount, currency, status, metadata, created_by, created_at, updated_at")
      .in("academy_id", academyIds)
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false })
      .limit(500),
    sb
      .from("academy_offers")
      .select("id, academy_id, name, type, price_amount, currency, duration_days, description, is_active, metadata, created_at, updated_at")
      .in("academy_id", academyIds)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (academiesRes.error) return json(500, { error: "Failed to load academies", detail: academiesRes.error.message });
  if (membershipsRes.error) {
    return json(500, { error: "Failed to load classroom memberships", detail: membershipsRes.error.message });
  }
  if (classroomsRes.error) return json(500, { error: "Failed to load classrooms", detail: classroomsRes.error.message });
  if (announcementsGlobalRes.error) {
    return json(500, { error: "Failed to load academy announcements", detail: announcementsGlobalRes.error.message });
  }
  if (messagesRes.error) return json(500, { error: "Failed to load student messages", detail: messagesRes.error.message });
  if (alertsScopedRes.error) {
    return json(500, { error: "Failed to load scoped alerts", detail: alertsScopedRes.error.message });
  }
  if (alertsGlobalRes.error) {
    return json(500, { error: "Failed to load global alerts", detail: alertsGlobalRes.error.message });
  }
  if (entitlementsRes.error) {
    return json(500, { error: "Failed to load student entitlements", detail: entitlementsRes.error.message });
  }
  if (paymentsRes.error) {
    return json(500, { error: "Failed to load student payments", detail: paymentsRes.error.message });
  }
  if (offersRes.error) return json(500, { error: "Failed to load offers", detail: offersRes.error.message });

  const classroomMemberships = (membershipsRes.data ?? []) as Array<Record<string, unknown>>;
  const classroomIds = Array.from(
    new Set(classroomMemberships.map((row) => String(row.classroom_id ?? "")).filter((id) => id.length > 0)),
  );

  const announcementsClassroomRes = classroomIds.length > 0
    ? await sb
      .from("academy_announcements")
      .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
      .in("academy_id", academyIds)
      .in("classroom_id", classroomIds)
      .order("created_at", { ascending: false })
      .limit(240)
    : { data: [], error: null };

  if (announcementsClassroomRes.error) {
    return json(500, {
      error: "Failed to load classroom announcements",
      detail: announcementsClassroomRes.error.message,
    });
  }

  const contextualEmpty = { data: [] as Array<Record<string, unknown>>, error: null };
  const [assignmentsRes, submissionsRes, sessionsRes, lessonProgressRes] = classroomIds.length > 0
    ? await Promise.all([
      sb.from("academy_assignments")
        .select("id, academy_id, classroom_id, title, description, assignment_type, due_at, status, max_score, created_at")
        .in("academy_id", academyIds)
        .in("classroom_id", classroomIds)
        .in("status", ["active", "closed"])
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(1000),
      sb.from("academy_submissions")
        .select("id, academy_id, classroom_id, assignment_id, contact_id, status, score, max_score, submitted_at, graded_at")
        .in("academy_id", academyIds)
        .in("classroom_id", classroomIds)
        .in("contact_id", contactIds)
        .order("created_at", { ascending: false })
        .limit(2000),
      sb.from("academy_lesson_sessions")
        .select("id, academy_id, classroom_id, title, session_type, delivery_mode, starts_at, ends_at, timezone, status")
        .in("academy_id", academyIds)
        .in("classroom_id", classroomIds)
        .gte("ends_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
        .lte("starts_at", new Date(Date.now() + 180 * 86_400_000).toISOString())
        .order("starts_at", { ascending: true })
        .limit(1000),
      sb.from("academy_lesson_progress")
        .select("id, academy_id, classroom_id, course_id, lesson_id, contact_id, status, started_at, completed_at, time_spent_seconds, updated_at")
        .in("academy_id", academyIds)
        .in("classroom_id", classroomIds)
        .in("contact_id", contactIds)
        .limit(5000),
    ])
    : [contextualEmpty, contextualEmpty, contextualEmpty, contextualEmpty];

  const partialErrors: Array<{ source: string; message: string; retryable: boolean }> = [];
  const captureContextError = (source: string, error: { message?: string } | null | undefined) => {
    if (error) partialErrors.push({ source, message: error.message ?? `Failed to load ${source}`, retryable: true });
  };
  captureContextError("assignments", assignmentsRes.error);
  captureContextError("submissions", submissionsRes.error);
  captureContextError("sessions", sessionsRes.error);
  captureContextError("lesson_progress", lessonProgressRes.error);

  const sessionRows = sessionsRes.error ? [] : (sessionsRes.data ?? []) as Array<Record<string, unknown>>;
  const sessionIds = sessionRows.map((row) => String(row.id ?? "")).filter(Boolean);
  const deliveryRes = sessionIds.length > 0
    ? await sb.from("academy_session_delivery")
      .select("academy_id, session_id, provider, attendee_url, join_opens_at, join_closes_at, status")
      .in("academy_id", academyIds)
      .in("session_id", sessionIds)
      .eq("status", "active")
      .limit(1000)
    : contextualEmpty;
  captureContextError("session_delivery", deliveryRes.error);

  const deliveryBySession = new Map(
    ((deliveryRes.error ? [] : deliveryRes.data ?? []) as Array<Record<string, unknown>>)
      .map((row) => [String(row.session_id ?? ""), row] as const),
  );
  const now = Date.now();
  const sessions = sessionRows.map((session) => {
    const delivery = deliveryBySession.get(String(session.id ?? ""));
    const opensAt = delivery?.join_opens_at ? Date.parse(String(delivery.join_opens_at)) : Number.NaN;
    const closesAt = delivery?.join_closes_at ? Date.parse(String(delivery.join_closes_at)) : Number.NaN;
    const joinAvailable = Boolean(delivery && Number.isFinite(opensAt) && Number.isFinite(closesAt) && now >= opensAt && now <= closesAt);
    return {
      ...session,
      meeting_provider: delivery?.provider ?? null,
      join_available: joinAvailable,
      ...(joinAvailable ? { join_url: delivery?.attendee_url ?? null } : {}),
    };
  });

  const memberCountByClassroom = new Map<string, number>();
  for (const row of classroomMemberships) {
    const classroomId = String(row.classroom_id ?? "");
    if (!classroomId) continue;
    memberCountByClassroom.set(classroomId, (memberCountByClassroom.get(classroomId) ?? 0) + 1);
  }

  const classroomIdSet = new Set(classroomIds);
  const classrooms = ((classroomsRes.data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => classroomIdSet.has(String(row.id ?? "")))
    .map((row) => {
      const classroomId = String(row.id ?? "");
      return {
        ...row,
        member_count: memberCountByClassroom.get(classroomId) ?? 0,
      };
    });

  const alertsMap = new Map<string, Record<string, unknown>>();
  for (const row of [...(alertsScopedRes.data ?? []), ...(alertsGlobalRes.data ?? [])] as Array<Record<string, unknown>>) {
    const id = String(row.id ?? "");
    if (!id || alertsMap.has(id)) continue;
    alertsMap.set(id, row);
  }

  const announcementMap = new Map<string, Record<string, unknown>>();
  for (const row of [...(announcementsGlobalRes.data ?? []), ...(announcementsClassroomRes.data ?? [])] as Array<Record<string, unknown>>) {
    const id = String(row.id ?? "");
    if (!id || announcementMap.has(id)) continue;
    announcementMap.set(id, row);
  }

  return json(200, {
    academies: academiesRes.data ?? [],
    contacts,
    classrooms,
    classroom_memberships: classroomMemberships,
    announcements: Array.from(announcementMap.values()),
    messages: messagesRes.data ?? [],
    alerts: Array.from(alertsMap.values()),
    entitlements: entitlementsRes.data ?? [],
    payments: paymentsRes.data ?? [],
    offers: offersRes.data ?? [],
    assignments: assignmentsRes.error ? [] : assignmentsRes.data ?? [],
    submissions: submissionsRes.error ? [] : submissionsRes.data ?? [],
    sessions,
    lesson_progress: lessonProgressRes.error ? [] : lessonProgressRes.data ?? [],
    partial_errors: partialErrors,
  });
};

const resolveClassroomChatContext = async (
  sb: SupabaseClientLike,
  memberships: MembershipRow[],
  userId: string,
  userEmail: string | null,
  academyIdRaw: string | null,
  classroomIdRaw: string | null,
): Promise<ClassroomChatContext | Response> => {
  const academyId = normalizeText(academyIdRaw, 64);
  const classroomId = normalizeText(classroomIdRaw, 64);
  if (!academyId) return json(400, { error: "academy_id is required" });
  if (!classroomId) return json(400, { error: "classroom_id is required" });

  const { data: classroomRow, error: classroomError } = await sb
    .from("academy_classrooms")
    .select("id, academy_id, name, description, is_active, metadata, created_at, updated_at")
    .eq("academy_id", academyId)
    .eq("id", classroomId)
    .maybeSingle();
  if (classroomError) return json(500, { error: "Failed to load classroom", detail: classroomError.message });
  if (!classroomRow?.id) return json(404, { error: "Classroom not found" });

  const academyAccess = resolveAcademyAccess(memberships, academyId);
  const teacherMembership =
    academyAccess && academyAccessHas(academyAccess, "viewClassrooms") && accessCanUseClassroom(academyAccess, classroomId)
      ? academyAccess
      : null;
  let viewerType: ClassroomChatViewer["type"] = "teacher";
  let viewerRole = String(teacherMembership?.role ?? "member");
  let viewerContactId: string | null = null;
  let viewerDisplayName = "";
  let viewerCanManageResources = Boolean(teacherMembership && academyAccessHas(teacherMembership, "manageResources"));

  if (!teacherMembership) {
    let contacts: Array<Record<string, unknown>> = [];
    try {
      contacts = await loadStudentContacts(sb, userId, userEmail);
    } catch (err) {
      return json(500, { error: "Failed to load student contacts", detail: err instanceof Error ? err.message : String(err) });
    }

    const matchedContact = contacts.find((row) => String(row.academy_id ?? "") === academyId) ?? null;
    if (!matchedContact) return json(403, { error: "Forbidden" });

    const contactId = String(matchedContact.id ?? "");
    if (!contactId) return json(403, { error: "Forbidden" });

    const { data: classroomMembershipRow, error: classroomMembershipError } = await sb
      .from("academy_classroom_memberships")
      .select("id, role, status")
      .eq("academy_id", academyId)
      .eq("classroom_id", classroomId)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (classroomMembershipError) {
      return json(500, { error: "Failed to verify classroom membership", detail: classroomMembershipError.message });
    }
    if (!classroomMembershipRow?.id || !["active", "completed"].includes(String(classroomMembershipRow.status ?? "active"))) return json(403, { error: "Forbidden" });

    viewerType = "student";
    viewerRole = String(classroomMembershipRow.role ?? "student");
    viewerContactId = contactId;
    viewerDisplayName = contactDisplayName(matchedContact) || fallbackDisplayName(userEmail, "Student");
    viewerCanManageResources = false;
  } else {
    const { data: selfContactRow } = await sb
      .from("academy_contacts")
      .select("id, first_name, last_name, email")
      .eq("academy_id", academyId)
      .eq("user_id", userId)
      .maybeSingle();
    if (selfContactRow?.id) {
      viewerContactId = String(selfContactRow.id);
      viewerDisplayName = contactDisplayName(selfContactRow as Record<string, unknown>);
    }
    if (!viewerDisplayName) {
      const fallbackRole = ["owner", "admin"].includes(viewerRole) ? "Instructor" : "Teacher";
      viewerDisplayName = fallbackDisplayName(userEmail, fallbackRole);
    }
  }

  const { data: classroomMembershipRows, error: classroomMembersError } = await sb
    .from("academy_classroom_memberships")
    .select("id, academy_id, classroom_id, contact_id, role, status, joined_at, started_at, completed_at, paused_at, withdrawn_at, expires_at, metadata")
    .eq("academy_id", academyId)
    .eq("classroom_id", classroomId)
    .order("joined_at", { ascending: true })
    .limit(5000);
  if (classroomMembersError) {
    return json(500, { error: "Failed to load classroom memberships", detail: classroomMembersError.message });
  }

  const classroomMemberships = (classroomMembershipRows ?? []) as Array<Record<string, unknown>>;
  const contactIds = Array.from(
    new Set(classroomMemberships.map((row) => String(row.contact_id ?? "")).filter((id) => id.length > 0)),
  );

  const contactsById = new Map<string, Record<string, unknown>>();
  if (contactIds.length > 0) {
    const { data: classroomContacts, error: classroomContactsError } = await sb
      .from("academy_contacts")
      .select("id, user_id, first_name, last_name, email, status")
      .eq("academy_id", academyId)
      .in("id", contactIds);
    if (classroomContactsError) {
      return json(500, { error: "Failed to load classroom contacts", detail: classroomContactsError.message });
    }

    for (const row of (classroomContacts ?? []) as Array<Record<string, unknown>>) {
      contactsById.set(String(row.id ?? ""), row);
    }
  }

  return {
    academy_id: academyId,
    classroom_id: classroomId,
    classroom: classroomRow as Record<string, unknown>,
    classroom_memberships: classroomMemberships,
    contacts_by_id: contactsById,
    viewer: {
      type: viewerType,
      role: viewerRole,
      contact_id: viewerContactId,
      display_name: viewerDisplayName,
      can_manage_resources: viewerCanManageResources,
    },
    teacher_access: teacherMembership,
  };
};

const classroomContextCanManageResources = (context: ClassroomChatContext): boolean =>
  context.viewer.type === "teacher" &&
  Boolean(context.teacher_access && academyAccessHas(context.teacher_access, "manageResources"));

const loadClassroomChat = async (
  sb: SupabaseClientLike,
  memberships: MembershipRow[],
  userId: string,
  userEmail: string | null,
  academyIdRaw: string | null,
  classroomIdRaw: string | null,
): Promise<Response> => {
  const contextResult = await resolveClassroomChatContext(sb, memberships, userId, userEmail, academyIdRaw, classroomIdRaw);
  if (contextResult instanceof Response) return contextResult;
  const context = contextResult;

  let resourcesQuery = sb
    .from("academy_classroom_resources")
    .select(
      "id, academy_id, classroom_id, title, kind, url, description, metadata, sort_order, is_published, legacy_video_read_only, created_by, created_at, updated_at",
    )
    .eq("academy_id", context.academy_id)
    .eq("classroom_id", context.classroom_id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(800);
  if (context.viewer.type === "student") {
    resourcesQuery = resourcesQuery.eq("is_published", true);
  }

  const [{ data: resourceRows, error: resourceError }, { data: messageRows, error: messageError }, {
    data: scopedAnnouncements,
    error: scopedAnnouncementError,
  }, {
    data: globalAnnouncements,
    error: globalAnnouncementError,
  }] = await Promise.all([
    resourcesQuery,
    sb
      .from("academy_messages")
      .select("id, academy_id, conversation_id, contact_id, sender_type, message_type, content, metadata, created_at")
      .eq("academy_id", context.academy_id)
      .eq("metadata->>classroom_id", context.classroom_id)
      .order("created_at", { ascending: true })
      .limit(800),
    sb
      .from("academy_announcements")
      .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
      .eq("academy_id", context.academy_id)
      .eq("classroom_id", context.classroom_id)
      .order("created_at", { ascending: false })
      .limit(80),
    sb
      .from("academy_announcements")
      .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
      .eq("academy_id", context.academy_id)
      .is("classroom_id", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (resourceError) return json(500, { error: "Failed to load classroom resources", detail: resourceError.message });
  if (messageError) return json(500, { error: "Failed to load classroom messages", detail: messageError.message });
  if (scopedAnnouncementError) {
    return json(500, { error: "Failed to load classroom announcements", detail: scopedAnnouncementError.message });
  }
  if (globalAnnouncementError) {
    return json(500, { error: "Failed to load academy announcements", detail: globalAnnouncementError.message });
  }

  const members = context.classroom_memberships.map((row) => {
    const contactId = String(row.contact_id ?? "");
    const contact = context.contacts_by_id.get(contactId) ?? null;
    return {
      id: String(row.id ?? ""),
      academy_id: String(row.academy_id ?? context.academy_id),
      classroom_id: String(row.classroom_id ?? context.classroom_id),
      contact_id: contactId,
      role: String(row.role ?? "student"),
      joined_at: String(row.joined_at ?? ""),
      metadata: toJsonObject(row.metadata),
      contact: contact
        ? {
            id: String(contact.id ?? ""),
            first_name: String(contact.first_name ?? ""),
            last_name: String(contact.last_name ?? ""),
            email: contact.email ? String(contact.email) : null,
            status: String(contact.status ?? "active"),
            display_name: contactDisplayName(contact),
          }
        : null,
    };
  });

  const messages = ((messageRows ?? []) as Array<Record<string, unknown>>).map((row) => {
    const metadata = toJsonObject(row.metadata);
    const senderContactId = normalizeText(metadata.sender_contact_id, 64);
    const senderContact = senderContactId ? context.contacts_by_id.get(senderContactId) ?? null : null;
    const senderLabel = normalizeText(metadata.sender_label, 160) ||
      contactDisplayName(senderContact) ||
      (String(row.sender_type ?? "system") === "teacher"
        ? "Teacher"
        : String(row.sender_type ?? "system") === "student"
          ? "Student"
          : "System");
    const senderRole = normalizeText(metadata.sender_role, 60) || String(row.sender_type ?? "system");

    return {
      id: String(row.id ?? ""),
      academy_id: String(row.academy_id ?? context.academy_id),
      conversation_id: String(row.conversation_id ?? ""),
      contact_id: row.contact_id ? String(row.contact_id) : null,
      sender_type: String(row.sender_type ?? "system"),
      message_type: String(row.message_type ?? "message"),
      content: String(row.content ?? ""),
      metadata,
      created_at: String(row.created_at ?? ""),
      sender_label: senderLabel,
      sender_role: senderRole,
      sender_contact_id: senderContactId || null,
    };
  });

  const announcementMap = new Map<string, Record<string, unknown>>();
  for (const row of [...(scopedAnnouncements ?? []), ...(globalAnnouncements ?? [])] as Array<Record<string, unknown>>) {
    const id = String(row.id ?? "");
    if (!id || announcementMap.has(id)) continue;
    announcementMap.set(id, row);
  }

  const announcements = Array.from(announcementMap.values())
    .sort((a, b) => Date.parse(String(b.created_at ?? "")) - Date.parse(String(a.created_at ?? "")))
    .map((row) => ({
      id: String(row.id ?? ""),
      academy_id: String(row.academy_id ?? context.academy_id),
      classroom_id: row.classroom_id ? String(row.classroom_id) : null,
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      metadata: toJsonObject(row.metadata),
      created_by: row.created_by ? String(row.created_by) : null,
      created_at: String(row.created_at ?? ""),
    }));

  const resources = await Promise.all(((resourceRows ?? []) as Array<Record<string, unknown>>).map(async (row) => {
    const signedRow = await attachSignedStorageUrl(sb, row, userId);
    return {
      id: String(signedRow.id ?? ""),
      academy_id: String(signedRow.academy_id ?? context.academy_id),
      classroom_id: String(signedRow.classroom_id ?? context.classroom_id),
      title: String(signedRow.title ?? ""),
      kind: String(signedRow.kind ?? "asset"),
      url: String(signedRow.url ?? ""),
      signed_url: signedRow.signed_url ? String(signedRow.signed_url) : null,
      description: signedRow.description ? String(signedRow.description) : null,
      metadata: toJsonObject(signedRow.metadata),
      sort_order: Number(signedRow.sort_order ?? 0),
      is_published: Boolean(signedRow.is_published ?? true),
      created_by: signedRow.created_by ? String(signedRow.created_by) : null,
      created_at: String(signedRow.created_at ?? ""),
      updated_at: String(signedRow.updated_at ?? ""),
    };
  }));

  const resourceIds = resources.map((row) => String(row.id)).filter((id) => id.length > 0);
  const memberContactIds = new Set(
    context.classroom_memberships.map((row) => String(row.contact_id ?? "")).filter((id) => id.length > 0),
  );
  let progressRows: Array<Record<string, unknown>> = [];
  if (resourceIds.length > 0) {
    const { data: loadedProgressRows, error: progressError } = await sb
      .from("academy_classroom_resource_progress")
      .select("id, academy_id, classroom_id, resource_id, contact_id, user_id, completed, completed_at, updated_at")
      .eq("academy_id", context.academy_id)
      .eq("classroom_id", context.classroom_id)
      .in("resource_id", resourceIds)
      .limit(10000);
    if (progressError) {
      return json(500, { error: "Failed to load classroom progress", detail: progressError.message });
    }
    progressRows = (loadedProgressRows ?? []) as Array<Record<string, unknown>>;
  }

  const viewerCompleted = new Set<string>();
  const resourceCompletedCounts: Record<string, number> = {};
  for (const row of progressRows) {
    const resourceId = String(row.resource_id ?? "");
    if (!resourceId) continue;
    const completed = Boolean(row.completed ?? false);
    if (!completed) continue;
    const contactId = String(row.contact_id ?? "");
    if (!contactId || !memberContactIds.has(contactId)) continue;

    resourceCompletedCounts[resourceId] = Number(resourceCompletedCounts[resourceId] ?? 0) + 1;

    const viewerMatchesContact = context.viewer.contact_id && contactId === context.viewer.contact_id;
    const viewerMatchesUser = !context.viewer.contact_id && String(row.user_id ?? "") === userId;
    if (viewerMatchesContact || viewerMatchesUser) viewerCompleted.add(resourceId);
  }

  return json(200, {
    academy_id: context.academy_id,
    classroom: context.classroom,
    viewer: context.viewer,
    members,
    resources,
    progress: {
      viewer_completed_resource_ids: Array.from(viewerCompleted.values()),
      resource_completed_counts: resourceCompletedCounts,
      total_members: memberContactIds.size,
    },
    messages,
    announcements,
  });
};

const sendClassroomChatMessage = async (
  sb: SupabaseClientLike,
  memberships: MembershipRow[],
  userId: string,
  userEmail: string | null,
  academyIdRaw: string | null,
  classroomIdRaw: string | null,
  contentRaw: string | null,
): Promise<Response> => {
  const contextResult = await resolveClassroomChatContext(sb, memberships, userId, userEmail, academyIdRaw, classroomIdRaw);
  if (contextResult instanceof Response) return contextResult;
  const context = contextResult;

  const content = normalizeText(contentRaw, 6000);
  if (!content) return json(400, { error: "content is required" });

  const recipientContactIds = Array.from(
    new Set(
      context.classroom_memberships
        .map((row) => String(row.contact_id ?? ""))
        .filter((contactId) => {
          if (!contactId) return false;
          const contact = context.contacts_by_id.get(contactId);
          return String(contact?.status ?? "active").toLowerCase() !== "inactive";
        }),
    ),
  );

  if (recipientContactIds.length === 0) {
    return json(400, { error: "Classroom has no active recipients" });
  }

  const upsertRows = recipientContactIds.map((contactId) => ({
    academy_id: context.academy_id,
    contact_id: contactId,
  }));

  const { error: conversationUpsertError } = await sb
    .from("academy_conversations")
    .upsert(upsertRows, { onConflict: "academy_id,contact_id" });
  if (conversationUpsertError) {
    return json(500, { error: "Failed to prepare classroom conversations", detail: conversationUpsertError.message });
  }

  const { data: conversationRows, error: conversationLoadError } = await sb
    .from("academy_conversations")
    .select("id, contact_id")
    .eq("academy_id", context.academy_id)
    .in("contact_id", recipientContactIds);
  if (conversationLoadError) {
    return json(500, { error: "Failed to load classroom conversations", detail: conversationLoadError.message });
  }

  const conversationByContact = new Map<string, string>();
  for (const row of (conversationRows ?? []) as Array<Record<string, unknown>>) {
    conversationByContact.set(String(row.contact_id ?? ""), String(row.id ?? ""));
  }

  const senderType = context.viewer.type === "student" ? "student" : "teacher";
  const messageMetadata = {
    classroom_id: context.classroom_id,
    classroom_chat: true,
    sender_user_id: userId,
    sender_contact_id: context.viewer.contact_id,
    sender_role: context.viewer.role,
    sender_label: context.viewer.display_name,
  };

  const messageRows = recipientContactIds
    .map((contactId) => {
      const conversationId = conversationByContact.get(contactId);
      if (!conversationId) return null;
      return {
        academy_id: context.academy_id,
        conversation_id: conversationId,
        contact_id: contactId,
        sender_type: senderType,
        message_type: "message",
        content,
        metadata: messageMetadata,
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row);

  if (messageRows.length === 0) {
    return json(500, { error: "No classroom conversation available for delivery" });
  }

  const { error: insertError } = await sb.from("academy_messages").insert(messageRows);
  if (insertError) return json(500, { error: "Failed to send classroom message", detail: insertError.message });

  await sb
    .from("academy_conversations")
    .update({ updated_at: new Date().toISOString() })
    .in("id", messageRows.map((row) => String(row.conversation_id)));

  return json(200, {
    academy_id: context.academy_id,
    classroom_id: context.classroom_id,
    sender: context.viewer,
    delivered: messageRows.length,
  });
};

const upsertClassroomResource = async (
  sb: SupabaseClientLike,
  memberships: MembershipRow[],
  userId: string,
  userEmail: string | null,
  academyIdRaw: string | null,
  classroomIdRaw: string | null,
  resourceIdRaw: string | null,
  titleRaw: string | null,
  kindRaw: string | null,
  urlRaw: string | null,
  descriptionRaw: string | null,
  sortOrderRaw: unknown,
  isPublishedRaw: unknown,
  metadataRaw: unknown,
  fileRaw: File | null,
): Promise<Response> => {
  const contextResult = await resolveClassroomChatContext(sb, memberships, userId, userEmail, academyIdRaw, classroomIdRaw);
  if (contextResult instanceof Response) return contextResult;
  const context = contextResult;
  if (!classroomContextCanManageResources(context)) return json(403, { error: "Forbidden" });

  const resourceId = normalizeText(resourceIdRaw, 64);
  const title = normalizeText(titleRaw, 220);
  const kind = normalizeText(kindRaw, 20).toLowerCase() as ClassroomResourceKind;
  let resourceUrl = normalizeText(urlRaw, 2000);
  const description = normalizeText(descriptionRaw, 4000) || null;
  const sortOrder = toIntOrNull(sortOrderRaw) ?? 0;
  const isPublished = typeof isPublishedRaw === "boolean" ? isPublishedRaw : true;
  const metadata = toJsonObject(metadataRaw);

  if (!title) return json(400, { error: "title is required" });
  if (!resourceUrl && !fileRaw) return json(400, { error: "url or file is required" });
  if (!CLASSROOM_RESOURCE_KINDS.includes(kind)) {
    return json(400, { error: `kind must be one of ${CLASSROOM_RESOURCE_KINDS.join(", ")}` });
  }
  if (kind === "video") {
    return json(409, {
      error: "New video resources must use managed lesson media",
      code: "VIDEO_MANAGED_HOSTING_REQUIRED",
    });
  }

  if (fileRaw) {
    try {
      const storage = await uploadAcademyFile("resource", context.academy_id, context.classroom_id, userId, fileRaw);
      metadata.storage = storage;
      metadata.storage_kind = "classroom_resource";
      resourceUrl = storagePlaceholderUrl(storage);
    } catch (err) {
      return json(400, { error: err instanceof Error ? err.message : "Failed to upload resource file" });
    }
  }

  const payload = {
    academy_id: context.academy_id,
    classroom_id: context.classroom_id,
    title,
    kind,
    url: resourceUrl,
    description,
    sort_order: sortOrder,
    is_published: isPublished,
    metadata,
    created_by: userId,
  };

  if (resourceId) {
    const { data, error } = await sb
      .from("academy_classroom_resources")
      .update(payload)
      .eq("academy_id", context.academy_id)
      .eq("classroom_id", context.classroom_id)
      .eq("id", resourceId)
      .select(
        "id, academy_id, classroom_id, title, kind, url, description, metadata, sort_order, is_published, legacy_video_read_only, created_by, created_at, updated_at",
      )
      .maybeSingle();
    if (error) return json(500, { error: "Failed to update classroom resource", detail: error.message });
    if (!data?.id) return json(404, { error: "Resource not found" });
    const signedResource = await attachSignedStorageUrl(sb, data as Record<string, unknown>, userId);
    return json(200, { resource: signedResource });
  }

  const { data, error } = await sb
    .from("academy_classroom_resources")
    .insert(payload)
    .select(
      "id, academy_id, classroom_id, title, kind, url, description, metadata, sort_order, is_published, legacy_video_read_only, created_by, created_at, updated_at",
    )
    .maybeSingle();
  if (error) return json(500, { error: "Failed to create classroom resource", detail: error.message });
  const signedResource = data ? await attachSignedStorageUrl(sb, data as Record<string, unknown>, userId) : data;
  return json(200, { resource: signedResource });
};

const deleteClassroomResource = async (
  sb: SupabaseClientLike,
  memberships: MembershipRow[],
  userId: string,
  userEmail: string | null,
  academyIdRaw: string | null,
  classroomIdRaw: string | null,
  resourceIdRaw: string | null,
): Promise<Response> => {
  const contextResult = await resolveClassroomChatContext(sb, memberships, userId, userEmail, academyIdRaw, classroomIdRaw);
  if (contextResult instanceof Response) return contextResult;
  const context = contextResult;
  if (!classroomContextCanManageResources(context)) return json(403, { error: "Forbidden" });

  const resourceId = normalizeText(resourceIdRaw, 64);
  if (!resourceId) return json(400, { error: "id is required" });

  const { data, error } = await sb
    .from("academy_classroom_resources")
    .delete()
    .eq("academy_id", context.academy_id)
    .eq("classroom_id", context.classroom_id)
    .eq("id", resourceId)
    .select("id")
    .maybeSingle();
  if (error) return json(500, { error: "Failed to delete classroom resource", detail: error.message });
  if (!data?.id) return json(404, { error: "Resource not found" });
  return json(200, { removed: true, id: String(data.id) });
};

const setClassroomResourceProgress = async (
  sb: SupabaseClientLike,
  memberships: MembershipRow[],
  userId: string,
  userEmail: string | null,
  academyIdRaw: string | null,
  classroomIdRaw: string | null,
  resourceIdRaw: string | null,
  completedRaw: unknown,
  contactIdRaw: string | null,
): Promise<Response> => {
  const contextResult = await resolveClassroomChatContext(sb, memberships, userId, userEmail, academyIdRaw, classroomIdRaw);
  if (contextResult instanceof Response) return contextResult;
  const context = contextResult;

  const resourceId = normalizeText(resourceIdRaw, 64);
  if (!resourceId) return json(400, { error: "resource_id is required" });

  const { data: resourceRow, error: resourceError } = await sb
    .from("academy_classroom_resources")
    .select("id, is_published")
    .eq("academy_id", context.academy_id)
    .eq("classroom_id", context.classroom_id)
    .eq("id", resourceId)
    .maybeSingle();
  if (resourceError) return json(500, { error: "Failed to load classroom resource", detail: resourceError.message });
  if (!resourceRow?.id) return json(404, { error: "Resource not found" });
  if (context.viewer.type === "student" && resourceRow.is_published === false) {
    return json(403, { error: "Forbidden" });
  }

  let targetContactId = context.viewer.contact_id;
  if (context.viewer.type === "teacher") {
    if (!classroomContextCanManageResources(context)) return json(403, { error: "Forbidden" });
    const requestedContactId = normalizeText(contactIdRaw, 64);
    if (requestedContactId) targetContactId = requestedContactId;
  }
  if (!targetContactId) {
    return json(400, { error: "No classroom contact linked to this account" });
  }

  const contactIsInClassroom = context.classroom_memberships.some(
    (row) => String(row.contact_id ?? "") === targetContactId,
  );
  if (!contactIsInClassroom) return json(403, { error: "Forbidden" });

  const targetContact = context.contacts_by_id.get(targetContactId) ?? null;
  const completed = typeof completedRaw === "boolean" ? completedRaw : true;
  const nowIso = new Date().toISOString();

  const payload = {
    academy_id: context.academy_id,
    classroom_id: context.classroom_id,
    resource_id: resourceId,
    contact_id: targetContactId,
    user_id: targetContact?.user_id ? String(targetContact.user_id) : null,
    completed,
    completed_at: completed ? nowIso : null,
    metadata: {},
  };

  const { data, error } = await sb
    .from("academy_classroom_resource_progress")
    .upsert(payload, { onConflict: "classroom_id,resource_id,contact_id" })
    .select("id, academy_id, classroom_id, resource_id, contact_id, user_id, completed, completed_at, updated_at")
    .maybeSingle();
  if (error) return json(500, { error: "Failed to save classroom progress", detail: error.message });
  if (!data?.id) return json(500, { error: "Failed to save classroom progress" });
  return json(200, { progress: data });
};

const accessCanUseBranch = (access: MembershipRow, branchIdRaw: unknown): boolean => {
  const branchId = normalizeText(branchIdRaw, 64);
  if (!branchId) return false;
  const scopedIds = academyAccessBranchIds(access);
  return scopedIds === null || scopedIds.includes(branchId);
};

const validateBranchScopedMutation = async (
  sb: SupabaseClientLike,
  academyId: string,
  access: MembershipRow,
  body: StudioBody,
  action: string,
): Promise<boolean> => validateAcademyMutationBranches(sb as unknown as Parameters<typeof validateAcademyMutationBranches>[0], academyId, academyAccessBranchIds(access), body as unknown as Record<string, unknown>, action);

const toNumber = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const loadAccessibleCourseIds = async (
  sb: SupabaseClientLike,
  academyId: string,
  access: MembershipRow,
  classroomIdRaw: unknown,
): Promise<string[] | null> => {
  const classroomId = normalizeText(classroomIdRaw, 64);
  const scopedClassroomIds = academyAccessClassroomIds(access);
  if (classroomId && !accessCanUseClassroom(access, classroomId)) throw new Error("Forbidden");

  const classroomIds = classroomId
    ? [classroomId]
    : scopedClassroomIds;
  if (classroomIds === null) return null;
  if (classroomIds.length === 0) return [];

  const { data, error } = await sb
    .from("academy_classroom_courses")
    .select("course_id")
    .eq("academy_id", academyId)
    .in("classroom_id", classroomIds)
    .neq("status", "archived")
    .limit(1000);
  if (error) throw new Error(`Failed to resolve curriculum scope: ${error.message}`);
  return Array.from(new Set(((data ?? []) as Array<{ course_id: string | null }>).map((row) => String(row.course_id ?? "")).filter(Boolean)));
};

const loadStudentClassroomEnrollment = async (
  sb: SupabaseClientLike,
  userId: string,
  userEmail: string | null,
  academyIdRaw: unknown,
  classroomIdRaw: unknown,
): Promise<{ academy_id: string; classroom_id: string; contact_id: string }> => {
  const academyId = normalizeText(academyIdRaw, 64);
  const classroomId = normalizeText(classroomIdRaw, 64);
  if (!academyId) throw new Error("academy_id is required");
  if (!classroomId) throw new Error("classroom_id is required");
  const contacts = await loadStudentContacts(sb, userId, userEmail);
  const contact = contacts.find((row) => String(row.academy_id ?? "") === academyId);
  if (!contact?.id) throw new Error("No enrollment found for this academy");
  const contactId = String(contact.id);
  const { data: membership, error } = await sb.from("academy_classroom_memberships")
    .select("id, status")
    .eq("academy_id", academyId)
    .eq("classroom_id", classroomId)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (error) throw new Error(`Failed to verify classroom enrollment: ${error.message}`);
  if (!membership?.id || !["active", "completed"].includes(String(membership.status ?? "active"))) {
    throw new Error("No active enrollment found for this classroom");
  }
  return { academy_id: academyId, classroom_id: classroomId, contact_id: contactId };
};

const loadCourseForAccess = async (
  sb: SupabaseClientLike,
  academyId: string,
  access: MembershipRow,
  courseIdRaw: unknown,
  classroomIdRaw?: unknown,
): Promise<Record<string, unknown> | null> => {
  const courseId = normalizeText(courseIdRaw, 64);
  if (!courseId) return null;
  const { data: course, error } = await sb.from("academy_courses")
    .select("id, academy_id, code, title, description, level, estimated_minutes, status, published_at, metadata, created_by, created_at, updated_at")
    .eq("academy_id", academyId).eq("id", courseId).maybeSingle();
  if (error) throw new Error(`Failed to load course: ${error.message}`);
  if (!course?.id) return null;
  const classroomId = normalizeText(classroomIdRaw, 64);
  const scopedClassroomIds = academyAccessClassroomIds(access);
  if (classroomId && !accessCanUseClassroom(access, classroomId)) throw new Error("Forbidden");
  if (scopedClassroomIds === null && !classroomId) return course as Record<string, unknown>;
  const allowedClassrooms = classroomId ? [classroomId] : scopedClassroomIds ?? [];
  if (allowedClassrooms.length === 0) throw new Error("Forbidden");
  const { data: assignment, error: assignmentError } = await sb.from("academy_classroom_courses")
    .select("id").eq("academy_id", academyId).eq("course_id", courseId)
    .in("classroom_id", allowedClassrooms).neq("status", "archived").limit(1).maybeSingle();
  if (assignmentError) throw new Error(`Failed to verify course scope: ${assignmentError.message}`);
  if (!assignment?.id) throw new Error("Forbidden");
  return course as Record<string, unknown>;
};

const handleReadAction = async (
  sb: SupabaseClientLike,
  memberships: MembershipRow[],
  action: string,
  academyIdRaw: string | null,
  offerIdRaw: string | null,
  classroomIdRaw: string | null,
  contactIdRaw: string | null,
  conversationIdRaw: string | null,
  assignmentIdRaw: string | null = null,
  courseIdRaw: string | null = null,
  quizIdRaw: string | null = null,
  searchQueryRaw: string | null = null,
  searchLimitRaw: string | null = null,
  dateRaw: string | null = null,
  roomTimetableRaw: unknown = null,
  directoryContext: {actorId:string;before_time?:unknown;before_id?:unknown;after_source?:unknown;after_id?:unknown;reference_mode?:unknown}|null = null,
): Promise<Response | null> => {
  if (
    ![
      "academies",
      "summary",
      "contacts",
      "classrooms",
      "classroom-memberships",
      "conversations",
      "conversation-messages",
      "announcements",
      "alerts",
      "offers",
      "offer-grants",
      "payments",
      "entitlements",
      "assignments",
      "curriculum",
      "quizzes",
      "grade_categories",
      "rubrics",
      "quiz_attempts",
      "submissions",
      "gradebook",
      "student_progress",
      "attendance",
      "bulk_invites",
      "schedule",
      "classroom_billing",
      "branding",
      "notifications",
      "audit_events",
      "owner_dashboard",
      "education_os",
      "teacher_day",
      "business_foundation",
      "commercial_core",
      "operations_finance",
      "academic_operations",
      "room_timetable",
      "room_timetable_branches",
      "guardian_relationships",
      "business_intelligence",
      "global_search",
      "automation_rules",
      "staff",
      "referral_leaderboard",
      "access_invitations",
      "timetable_planning",
      "service_requests",
      "communication_journeys",
      "collection_cases",
      "workforce_requests",
      "sensitive_cases",
      "competency_plans",
      "integration_endpoints",
    ].includes(action)
  ) {
    return null;
  }

  if (action === "academies") {
    const academyIds = Array.from(new Set(memberships.map((item) => String(item.tenant_id || "")).filter((id) => id.length > 0)));
    if (academyIds.length === 0) return json(200, { academies: [] });

    const { data: academyRows, error: academyError } = await sb
      .from("tenants")
      .select("id, name, slug, type, metadata, created_at")
      .in("id", academyIds)
      .order("created_at", { ascending: true });
    if (academyError) return json(500, { error: "Failed to load academies", detail: academyError.message });

    const academyById = new Map<string, Record<string, unknown>>();
    for (const row of (academyRows ?? []) as Array<Record<string, unknown>>) {
      academyById.set(String(row.id ?? ""), row);
    }

    return json(200, {
      academies: memberships
        .map((membership) => {
          const academy = academyById.get(String(membership.tenant_id ?? ""));
          if (!academy) return null;
          return {
            id: String(academy.id ?? ""),
            name: String(academy.name ?? ""),
            slug: String(academy.slug ?? ""),
            type: String(academy.type ?? "team"),
            metadata: toJsonObject(academy.metadata),
            created_at: String(academy.created_at ?? ""),
            role: String(membership.role ?? "member"),
            status: String(membership.status ?? "active"),
            access: academyAccessProfile(membership),
          };
        })
        .filter((item): item is NonNullable<typeof item> => !!item),
    });
  }

  const academyId = resolveAcademyId(memberships, academyIdRaw);
  if(action==='commercial_core'||action==='operations_finance'){
    if(!directoryContext?.actorId)return json(403,{error:'Forbidden'});
    return json(200,await runFinanceRead(sb,academyId,directoryContext.actorId,action,{
      ...((roomTimetableRaw as {branch_id?:unknown}|null)?.branch_id?{branch_id:(roomTimetableRaw as {branch_id:unknown}).branch_id}:{}),...(searchLimitRaw?{limit:searchLimitRaw}:{}),
    }));
  }
  const access = requireAcademyAccess(memberships, academyId);
  if (action === "contacts" || action === "classrooms" || action === "classroom-memberships") {
    if (!directoryContext) return json(403, {error: "Forbidden"});
    try {
      return json(200, await readAcademyScopedDirectory(sb as unknown as Parameters<typeof readAcademyScopedDirectory>[0], directoryContext.actorId, academyId, action, {
        ...(searchQueryRaw ? {query: searchQueryRaw} : {}), ...(searchLimitRaw ? {limit: searchLimitRaw} : {}),
        ...(classroomIdRaw ? {classroom_id: classroomIdRaw} : {}),
        ...(directoryContext.before_time != null ? {before_time: directoryContext.before_time} : {}),
        ...(directoryContext.before_id != null ? {before_id: directoryContext.before_id} : {}),
      }));
    } catch (error) {
      if (error instanceof ScopedDirectoryError) return json(error.status, {error: error.message});
      throw error;
    }
  }
  const scopedClassroomIds = academyAccessClassroomIds(access);
  const operationalBranchIds = academyAccessBranchIds(access);

  if (action === "room_timetable" || action === "room_timetable_branches") {
    try {
      return json(200, action === "room_timetable_branches"
        ? await readAcademyRoomBranches(sb, access)
        : await readAcademyRoomTimetable(sb, access, roomTimetableRaw));
    } catch (error) {
      if (error instanceof RoomTimetableError) return json(error.status, { error: error.message });
      throw error;
    }
  }

  if (action === "teacher_day") {
    const profile = academyAccessProfile(access);
    const day = await loadAcademyTeacherDay(sb, { ...access, permissions: profile.permissions as Record<string, boolean> }, dateRaw);
    return json(200, day);
  }

  if (action === "summary") {
    if (scopedClassroomIds !== null) {
      const scopedContactIds = await loadScopedContactIds(sb, academyId, scopedClassroomIds);
      const contactIds = Array.from(scopedContactIds ?? []);
      const alertsQuery = sb
        .from("academy_alerts")
        .select("id", { count: "exact", head: true })
        .eq("academy_id", academyId)
        .eq("resolved", false);
      const alertsResult = contactIds.length > 0 ? await alertsQuery.in("contact_id", contactIds) : { count: 0 };
      return json(200, {
        academy_id: academyId,
        access: academyAccessProfile(access),
        counts: {
          contacts: contactIds.length,
          classrooms: scopedClassroomIds.length,
          offers: 0,
          active_entitlements: 0,
          open_alerts: alertsResult.count ?? 0,
        },
      });
    }

    const [{ count: contacts }, { count: classrooms }, { count: offers }, { count: entitlements }, { count: alertsOpen }] =
      await Promise.all([
        sb.from("academy_contacts").select("id", { count: "exact", head: true }).eq("academy_id", academyId),
        sb.from("academy_classrooms").select("id", { count: "exact", head: true }).eq("academy_id", academyId),
        sb.from("academy_offers").select("id", { count: "exact", head: true }).eq("academy_id", academyId),
        sb.from("academy_entitlements").select("id", { count: "exact", head: true }).eq("academy_id", academyId).eq("status", "active"),
        sb.from("academy_alerts").select("id", { count: "exact", head: true }).eq("academy_id", academyId).eq("resolved", false),
      ]);

    return json(200, {
      academy_id: academyId,
      access: academyAccessProfile(access),
      counts: {
        contacts: contacts ?? 0,
        classrooms: classrooms ?? 0,
        offers: academyAccessHas(access, "manageOffers") ? offers ?? 0 : 0,
        active_entitlements: academyAccessHas(access, "manageFinance") || academyAccessHas(access, "manageOffers") ? entitlements ?? 0 : 0,
        open_alerts: alertsOpen ?? 0,
      },
    });
  }

  if (action === "conversations") {
    requireAcademyPermission(access, "manageMessages");
    const scopedContactIds = await loadScopedContactIds(sb, academyId, scopedClassroomIds);
    if (scopedContactIds !== null && scopedContactIds.size === 0) return json(200, { conversations: [] });

    let conversationQuery = sb
      .from("academy_conversations")
      .select("id, academy_id, contact_id, created_at, updated_at")
      .eq("academy_id", academyId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (scopedContactIds !== null) conversationQuery = conversationQuery.in("contact_id", Array.from(scopedContactIds));
    const { data: conversations, error: conversationError } = await conversationQuery;
    if (conversationError) return json(500, { error: "Failed to load conversations", detail: conversationError.message });

    const rows = (conversations ?? []) as Array<{ id: string; contact_id: string; created_at: string; updated_at: string }>;
    if (rows.length === 0) return json(200, { conversations: [] });

    const contactIds = Array.from(new Set(rows.map((row) => String(row.contact_id))));
    const conversationIds = Array.from(new Set(rows.map((row) => String(row.id))));

    const { data: contactsData, error: contactError } = await sb
      .from("academy_contacts")
      .select("id, first_name, last_name, email, status")
      .eq("academy_id", academyId)
      .in("id", contactIds);
    if (contactError) return json(500, { error: "Failed to load conversation contacts", detail: contactError.message });

    const { data: messagesData, error: messageError } = await sb
      .from("academy_messages")
      .select("id, conversation_id, sender_type, message_type, content, created_at")
      .eq("academy_id", academyId)
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (messageError) return json(500, { error: "Failed to load conversation messages", detail: messageError.message });

    const contactById = new Map(
      ((contactsData ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id ?? ""), row]),
    );
    const lastMessageByConversation = new Map<string, Record<string, unknown>>();
    for (const row of (messagesData ?? []) as Array<Record<string, unknown>>) {
      const conversationId = String(row.conversation_id ?? "");
      if (!conversationId || lastMessageByConversation.has(conversationId)) continue;
      lastMessageByConversation.set(conversationId, row);
    }

    const result = rows.map((row) => ({
      ...row,
      contact: contactById.get(String(row.contact_id)) ?? null,
      last_message: lastMessageByConversation.get(String(row.id)) ?? null,
    }));

    return json(200, { conversations: result });
  }

  if (action === "conversation-messages") {
    requireAcademyPermission(access, "manageMessages");
    const conversationIdParam = normalizeText(conversationIdRaw, 64) || null;
    const contactIdParam = normalizeText(contactIdRaw, 64) || null;

    let conversationId = conversationIdParam;
    if (!conversationId && contactIdParam) {
      const { data: conversationRow, error: conversationError } = await sb
        .from("academy_conversations")
        .select("id")
        .eq("academy_id", academyId)
        .eq("contact_id", contactIdParam)
        .maybeSingle();
      if (conversationError) {
        return json(500, { error: "Failed to resolve conversation", detail: conversationError.message });
      }
      conversationId = conversationRow?.id ? String(conversationRow.id) : null;
    }

    if (!conversationId) return json(200, { conversation_id: null, messages: [] });

    const { data: conversationRow, error: validateError } = await sb
      .from("academy_conversations")
      .select("id, contact_id")
      .eq("academy_id", academyId)
      .eq("id", conversationId)
      .maybeSingle();
    if (validateError) return json(500, { error: "Failed to load conversation", detail: validateError.message });
    if (!conversationRow?.id) return json(404, { error: "Conversation not found" });
    await ensureContactInAccessScope(sb, academyId, access, conversationRow.contact_id);

    const { data, error } = await sb
      .from("academy_messages")
      .select("id, academy_id, conversation_id, contact_id, sender_type, message_type, content, metadata, created_at")
      .eq("academy_id", academyId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) return json(500, { error: "Failed to load messages", detail: error.message });
    return json(200, { conversation_id: conversationId, messages: data ?? [] });
  }

  if (action === "announcements") {
    requireAcademyPermission(access, "manageAnnouncements");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
    if (!classroomId && scopedClassroomIds !== null) {
      const [globalRes, classroomRes] = await Promise.all([
        sb
          .from("academy_announcements")
          .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
          .eq("academy_id", academyId)
          .is("classroom_id", null)
          .order("created_at", { ascending: false })
          .limit(100),
        scopedClassroomIds.length > 0
          ? sb
            .from("academy_announcements")
            .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
            .eq("academy_id", academyId)
            .in("classroom_id", scopedClassroomIds)
            .order("created_at", { ascending: false })
            .limit(300)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (globalRes.error) return json(500, { error: "Failed to load announcements", detail: globalRes.error.message });
      if (classroomRes.error) return json(500, { error: "Failed to load announcements", detail: classroomRes.error.message });
      const announcementById = new Map<string, Record<string, unknown>>();
      for (const row of [...(globalRes.data ?? []), ...(classroomRes.data ?? [])] as Array<Record<string, unknown>>) {
        const id = String(row.id ?? "");
        if (!id || announcementById.has(id)) continue;
        announcementById.set(id, row);
      }
      return json(200, {
        announcements: Array.from(announcementById.values()).sort((a, b) =>
          Date.parse(String(b.created_at ?? "")) - Date.parse(String(a.created_at ?? "")),
        ),
      });
    }

    let query = sb
      .from("academy_announcements")
      .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (classroomId) query = query.eq("classroom_id", classroomId);
    const { data, error } = await query;
    if (error) return json(500, { error: "Failed to load announcements", detail: error.message });
    return json(200, { announcements: data ?? [] });
  }

  if (action === "alerts") {
    requireAcademyPermission(access, "manageAlerts");
    const contactId = normalizeText(contactIdRaw, 64) || null;
    const scopedContactIds = await loadScopedContactIds(sb, academyId, scopedClassroomIds);
    if (contactId) await ensureContactInAccessScope(sb, academyId, access, contactId);
    if (!contactId && scopedContactIds !== null) {
      const contactIdList = Array.from(scopedContactIds);
      const classroomIdList = scopedClassroomIds ?? [];
      if (contactIdList.length === 0 && classroomIdList.length === 0) return json(200, { alerts: [] });

      const [contactAlertsResult, classroomAlertsResult] = await Promise.all([
        contactIdList.length > 0
          ? sb
            .from("academy_alerts")
            .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
            .eq("academy_id", academyId)
            .in("contact_id", contactIdList)
            .order("created_at", { ascending: false })
            .limit(500)
          : Promise.resolve({ data: [], error: null }),
        classroomIdList.length > 0
          ? sb
            .from("academy_alerts")
            .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
            .eq("academy_id", academyId)
            .is("contact_id", null)
            .in("metadata->>classroom_id", classroomIdList)
            .order("created_at", { ascending: false })
            .limit(500)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (contactAlertsResult.error) return json(500, { error: "Failed to load alerts", detail: contactAlertsResult.error.message });
      if (classroomAlertsResult.error) return json(500, { error: "Failed to load alerts", detail: classroomAlertsResult.error.message });

      const alertById = new Map<string, Record<string, unknown>>();
      for (const row of [...(contactAlertsResult.data ?? []), ...(classroomAlertsResult.data ?? [])] as Array<Record<string, unknown>>) {
        const id = String(row.id ?? "");
        if (!id || alertById.has(id)) continue;
        alertById.set(id, row);
      }
      return json(200, {
        alerts: Array.from(alertById.values()).sort((a, b) =>
          Date.parse(String(b.created_at ?? "")) - Date.parse(String(a.created_at ?? "")),
        ),
      });
    }

    let query = sb
      .from("academy_alerts")
      .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (contactId) query = query.eq("contact_id", contactId);
    else if (scopedContactIds !== null) query = query.in("contact_id", Array.from(scopedContactIds));
    const { data, error } = await query;
    if (error) return json(500, { error: "Failed to load alerts", detail: error.message });
    return json(200, { alerts: data ?? [] });
  }

  if (action === "offers") {
    if (!academyAccessHas(access, "manageOffers")) return json(403, { error: "Forbidden" });
    const { data, error } = await sb
      .from("academy_offers")
      .select("id, academy_id, name, type, price_amount, currency, duration_days, description, is_active, metadata, created_at, updated_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return json(500, { error: "Failed to load offers", detail: error.message });
    return json(200, { offers: data ?? [] });
  }

  if (action === "offer-grants") {
    if (!academyAccessHas(access, "manageOffers")) return json(403, { error: "Forbidden" });
    const offerId = normalizeText(offerIdRaw, 64) || null;

    let query = sb
      .from("academy_offer_grants")
      .select("id, academy_id, offer_id, grant_type, resource_type, resource_id, capability_key, quantity, duration_days, metadata, created_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (offerId) query = query.eq("offer_id", offerId);
    const { data, error } = await query;
    if (error) return json(500, { error: "Failed to load offer grants", detail: error.message });
    return json(200, { offer_grants: data ?? [] });
  }

  if (action === "payments") {
    if (!academyAccessHas(access, "manageFinance")) return json(403, { error: "Forbidden" });
    const { data, error } = await sb
      .from("academy_payments")
      .select("id, academy_id, contact_id, offer_id, provider, provider_transaction_id, amount, currency, status, metadata, created_by, created_at, updated_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return json(500, { error: "Failed to load payments", detail: error.message });
    return json(200, { payments: data ?? [] });
  }

  // ── LMS: Assignments ────────────────────────────────────────────────────

  if (action === "curriculum") {
    requireAcademyPermission(access, "manageAssignments");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    const accessibleCourseIds = await loadAccessibleCourseIds(sb, academyId, access, classroomId);
    if (accessibleCourseIds !== null && accessibleCourseIds.length === 0) {
      return json(200, { courses: [], modules: [], lessons: [], classroom_courses: [] });
    }

    let coursesQuery = sb
      .from("academy_courses")
      .select("id, academy_id, code, title, description, level, estimated_minutes, status, published_at, metadata, created_by, created_at, updated_at")
      .eq("academy_id", academyId)
      .neq("status", "archived")
      .order("created_at", { ascending: true });
    if (accessibleCourseIds !== null) coursesQuery = coursesQuery.in("id", accessibleCourseIds);
    const coursesResult = await coursesQuery.limit(500);
    if (coursesResult.error) return json(500, { error: "Failed to load courses", detail: coursesResult.error.message });

    const courseIds = ((coursesResult.data ?? []) as Array<{ id: string }>).map((row) => String(row.id));
    if (courseIds.length === 0) return json(200, { courses: [], modules: [], lessons: [], classroom_courses: [] });

    let classroomCoursesQuery = sb
      .from("academy_classroom_courses")
      .select("id, academy_id, classroom_id, course_id, status, starts_at, ends_at, assigned_by, assigned_at, metadata")
      .eq("academy_id", academyId)
      .in("course_id", courseIds)
      .order("assigned_at", { ascending: true });
    if (classroomId) classroomCoursesQuery = classroomCoursesQuery.eq("classroom_id", classroomId);
    else if (scopedClassroomIds !== null) classroomCoursesQuery = classroomCoursesQuery.in("classroom_id", scopedClassroomIds);

    const [modulesResult, lessonsResult, classroomCoursesResult] = await Promise.all([
      sb.from("academy_course_modules")
        .select("id, academy_id, course_id, title, description, position, status, unlock_rule, metadata, created_by, created_at, updated_at")
        .eq("academy_id", academyId).in("course_id", courseIds).neq("status", "archived")
        .order("position", { ascending: true }).limit(2000),
      sb.from("academy_lessons")
        .select("id, academy_id, course_id, module_id, prerequisite_lesson_id, title, summary, content, position, estimated_minutes, status, available_from, completion_rule, metadata, created_by, created_at, updated_at")
        .eq("academy_id", academyId).in("course_id", courseIds).neq("status", "archived")
        .order("position", { ascending: true }).limit(5000),
      classroomCoursesQuery.limit(2000),
    ]);
    if (modulesResult.error) return json(500, { error: "Failed to load course modules", detail: modulesResult.error.message });
    if (lessonsResult.error) return json(500, { error: "Failed to load lessons", detail: lessonsResult.error.message });
    if (classroomCoursesResult.error) return json(500, { error: "Failed to load classroom courses", detail: classroomCoursesResult.error.message });
    return json(200, {
      courses: coursesResult.data ?? [],
      modules: modulesResult.data ?? [],
      lessons: lessonsResult.data ?? [],
      classroom_courses: classroomCoursesResult.data ?? [],
    });
  }

  if (action === "quizzes") {
    requireAcademyPermission(access, "manageAssignments");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    const requestedCourseId = normalizeText(courseIdRaw, 64) || null;
    const accessibleCourseIds = await loadAccessibleCourseIds(sb, academyId, access, classroomId);
    if (requestedCourseId && accessibleCourseIds !== null && !accessibleCourseIds.includes(requestedCourseId)) {
      return json(403, { error: "Forbidden" });
    }
    const courseIds = requestedCourseId ? [requestedCourseId] : accessibleCourseIds;
    if (courseIds !== null && courseIds.length === 0) return json(200, { quizzes: [], questions: [] });

    let quizQuery = sb
      .from("academy_quizzes")
      .select("id, academy_id, course_id, lesson_id, title, instructions, status, passing_score, attempts_allowed, time_limit_seconds, shuffle_questions, show_answers_after, metadata, created_by, created_at, updated_at")
      .eq("academy_id", academyId)
      .neq("status", "archived")
      .order("created_at", { ascending: true });
    if (courseIds !== null) quizQuery = quizQuery.in("course_id", courseIds);
    const quizzesResult = await quizQuery.limit(1000);
    if (quizzesResult.error) return json(500, { error: "Failed to load quizzes", detail: quizzesResult.error.message });
    const quizIds = ((quizzesResult.data ?? []) as Array<{ id: string }>).map((row) => String(row.id));
    if (quizIds.length === 0) return json(200, { quizzes: quizzesResult.data ?? [], questions: [] });
    const { data: questions, error: questionsError } = await sb
      .from("academy_quiz_questions")
      .select("id, academy_id, quiz_id, question_type, prompt, options, correct_answer, points, position, explanation, metadata, created_by, created_at, updated_at")
      .eq("academy_id", academyId)
      .in("quiz_id", quizIds)
      .order("position", { ascending: true })
      .limit(10000);
    if (questionsError) return json(500, { error: "Failed to load quiz questions", detail: questionsError.message });
    return json(200, { quizzes: quizzesResult.data ?? [], questions: questions ?? [] });
  }

  if (action === "grade_categories") {
    requireAcademyPermission(access, "gradeSubmissions");
    const classroomId = normalizeText(classroomIdRaw, 64);
    if (!classroomId) return json(400, { error: "classroom_id is required" });
    if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
    const { data, error } = await sb.from("academy_grade_categories")
      .select("id, academy_id, classroom_id, name, weight, position, drop_lowest, metadata, created_by, created_at, updated_at")
      .eq("academy_id", academyId).eq("classroom_id", classroomId).order("position", { ascending: true }).limit(100);
    if (error) return json(500, { error: "Failed to load grade categories", detail: error.message });
    return json(200, { grade_categories: data ?? [] });
  }

  if (action === "rubrics") {
    requireAcademyPermission(access, "gradeSubmissions");
    const { data, error } = await sb.from("academy_rubrics")
      .select("id, academy_id, title, description, criteria, status, metadata, created_by, created_at, updated_at")
      .eq("academy_id", academyId).neq("status", "archived").order("created_at", { ascending: true }).limit(500);
    if (error) return json(500, { error: "Failed to load rubrics", detail: error.message });
    return json(200, { rubrics: data ?? [] });
  }

  if (action === "quiz_attempts") {
    requireAcademyPermission(access, "gradeSubmissions");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    const requestedQuizId = normalizeText(quizIdRaw, 64) || null;
    if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
    if (!classroomId && scopedClassroomIds !== null) return json(400, { error: "classroom_id is required" });
    let query = sb.from("academy_quiz_attempts")
      .select("id, academy_id, classroom_id, course_id, quiz_id, contact_id, user_id, attempt_number, status, answers, result, score, max_score, percentage, passed, feedback, started_at, submitted_at, graded_at, graded_by, metadata, created_at, updated_at")
      .eq("academy_id", academyId).order("submitted_at", { ascending: false }).limit(2000);
    if (classroomId) query = query.eq("classroom_id", classroomId);
    else if (scopedClassroomIds !== null) query = query.in("classroom_id", scopedClassroomIds);
    if (requestedQuizId) query = query.eq("quiz_id", requestedQuizId);
    const { data, error } = await query;
    if (error) return json(500, { error: "Failed to load quiz attempts", detail: error.message });
    return json(200, { quiz_attempts: data ?? [] });
  }

  if (action === "assignments") {
    requireAcademyPermission(access, "manageAssignments");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
    if (!classroomId && scopedClassroomIds !== null && scopedClassroomIds.length === 0) return json(200, { assignments: [] });
    let query = sb
      .from("academy_assignments")
      .select("id, academy_id, classroom_id, course_id, module_id, lesson_id, grade_category_id, rubric_id, title, description, assignment_type, experience_id, experience_url, due_at, released_at, prerequisite_id, position, max_score, score_weight, attempts_allowed, allow_late_submission, status, metadata, created_by, created_at, updated_at")
      .eq("academy_id", academyId)
      .neq("status", "archived")
      .order("position", { ascending: true });
    if (classroomId) query = query.eq("classroom_id", classroomId);
    else if (scopedClassroomIds !== null) query = query.in("classroom_id", scopedClassroomIds);
    const { data, error } = await query.limit(500);
    if (error) return json(500, { error: "Failed to load assignments", detail: error.message });
    return json(200, { assignments: data ?? [] });
  }

  // ── LMS: Submissions / Gradebook ────────────────────────────────────────

  if (action === "submissions") {
    requireAcademyPermission(access, "gradeSubmissions");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    const assignmentId = normalizeText(assignmentIdRaw || contactIdRaw, 64) || null;
    if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
    if (!classroomId && scopedClassroomIds !== null && scopedClassroomIds.length === 0) return json(200, { submissions: [] });
    let query = sb
      .from("academy_submissions")
      .select("id, academy_id, assignment_id, classroom_id, contact_id, user_id, session_id, score, max_score, status, submitted_at, graded_at, graded_by, notes, feedback, metadata, created_at, updated_at")
      .eq("academy_id", academyId)
      .order("submitted_at", { ascending: false });
    if (classroomId) query = query.eq("classroom_id", classroomId);
    else if (scopedClassroomIds !== null) query = query.in("classroom_id", scopedClassroomIds);
    if (assignmentId) query = query.eq("assignment_id", assignmentId);
    const { data, error } = await query.limit(2000);
    if (error) return json(500, { error: "Failed to load submissions", detail: error.message });
    const submissions = await Promise.all(((data ?? []) as Array<Record<string, unknown>>).map((row) =>
      attachSignedStorageUrl(sb, row, null)
    ));
    return json(200, { submissions });
  }

  if (action === "gradebook") {
    requireAcademyPermission(access, "gradeSubmissions");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (!classroomId) return json(400, { error: "classroom_id is required for gradebook" });
    if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

    const [assignmentsResult, submissionsResult, membersResult, categoriesResult] = await Promise.all([
      sb.from("academy_assignments")
        .select("id, title, assignment_type, due_at, max_score, score_weight, grade_category_id, rubric_id, attempts_allowed, allow_late_submission, position, status")
        .eq("academy_id", academyId).eq("classroom_id", classroomId).neq("status", "archived")
        .order("position", { ascending: true }).limit(200),
      sb.from("academy_submissions")
        .select("id, assignment_id, contact_id, score, max_score, status, attempt_number, submitted_at, graded_at, notes, feedback, submission_content, submission_url, metadata")
        .eq("academy_id", academyId).eq("classroom_id", classroomId).limit(5000),
      sb.from("academy_classroom_memberships")
        .select("contact_id, role, academy_contacts!academy_memberships_contact_tenant_fk(id, first_name, last_name, email, status)")
        .eq("academy_id", academyId).eq("classroom_id", classroomId).in("role", ["student", "observer"])
        .in("status", ["active", "completed"]).limit(500),
      sb.from("academy_grade_categories")
        .select("id, name, weight, position, drop_lowest")
        .eq("academy_id", academyId).eq("classroom_id", classroomId).order("position", { ascending: true }).limit(100),
    ]);

    if (assignmentsResult.error) return json(500, { error: "Failed to load assignments", detail: assignmentsResult.error.message });
    if (submissionsResult.error) return json(500, { error: "Failed to load submissions", detail: submissionsResult.error.message });
    if (membersResult.error) return json(500, { error: "Failed to load members", detail: membersResult.error.message });
    if (categoriesResult.error) return json(500, { error: "Failed to load grade categories", detail: categoriesResult.error.message });

    const submissionMap = new Map<string, Record<string, unknown>>();
    for (const s of (submissionsResult.data ?? []) as Array<Record<string, unknown>>) {
      submissionMap.set(`${String(s.assignment_id)}__${String(s.contact_id)}`, await attachSignedStorageUrl(sb, s, null));
    }

    const students = ((membersResult.data ?? []) as Array<Record<string, unknown>>).map((m) => {
      const contact = (m.academy_contacts as Record<string, unknown>) ?? {};
      return {
        contact_id: String(contact.id ?? m.contact_id ?? ""),
        first_name: String(contact.first_name ?? ""),
        last_name: String(contact.last_name ?? ""),
        email: contact.email ?? null,
        status: String(contact.status ?? "active"),
        role: String(m.role ?? "student"),
      };
    });

    const assignments = assignmentsResult.data ?? [];
    const gradeCategories = (categoriesResult.data ?? []) as Array<Record<string, unknown>>;

    const rows = students.map((student) => {
      const submissions: Record<string, unknown> = {};
      let totalScore = 0;
      let totalWeight = 0;
      let submittedCount = 0;
      const categoryEntries = new Map<string, Array<{ percentage: number; weight: number }>>();

      for (const asgn of assignments as Array<Record<string, unknown>>) {
        const key = `${String(asgn.id)}__${student.contact_id}`;
        const sub = submissionMap.get(key) ?? null;
        submissions[String(asgn.id)] = sub ? {
          id: sub.id,
          score: sub.score ?? null,
          max_score: sub.max_score ?? asgn.max_score ?? null,
          status: sub.status,
          attempt_number: sub.attempt_number ?? 1,
          submitted_at: sub.submitted_at ?? null,
          graded_at: sub.graded_at ?? null,
          notes: sub.notes ?? null,
          feedback: sub.feedback ?? {},
          submission_content: sub.submission_content ?? null,
          submission_url: sub.submission_url ?? null,
          signed_url: sub.signed_url ?? null,
          metadata: sub.metadata ?? {},
        } : { status: "missing", score: null };

        if (sub && ["submitted", "resubmitted", "late", "graded", "returned"].includes(String(sub.status))) submittedCount++;
        if (sub && typeof sub.score === "number" && typeof (sub.max_score ?? asgn.max_score) === "number") {
          const maxS = Number(sub.max_score ?? asgn.max_score);
          if (maxS > 0) {
            const w = Number((asgn.score_weight as number) ?? 1);
            totalScore += (Number(sub.score) / maxS) * 100 * w;
            totalWeight += w;
            const categoryId = normalizeText(asgn.grade_category_id, 64) || "__uncategorized";
            const entries = categoryEntries.get(categoryId) ?? [];
            entries.push({ percentage: (Number(sub.score) / maxS) * 100, weight: w });
            categoryEntries.set(categoryId, entries);
          }
        }
      }

      const categoryScores: Record<string, number> = {};
      let categoryWeightedScore = 0;
      let categoryWeightTotal = 0;
      for (const [categoryId, rawEntries] of categoryEntries) {
        const category = gradeCategories.find((item) => String(item.id) === categoryId) ?? null;
        const dropLowest = Math.max(0, toIntOrNull(category?.drop_lowest) ?? 0);
        const entries = [...rawEntries].sort((left, right) => left.percentage - right.percentage).slice(dropLowest);
        if (entries.length === 0) continue;
        const entryWeight = entries.reduce((sum, item) => sum + item.weight, 0);
        const average = entryWeight > 0
          ? entries.reduce((sum, item) => sum + item.percentage * item.weight, 0) / entryWeight
          : 0;
        const categoryWeight = Math.max(0.01, Number(category?.weight ?? 1));
        categoryScores[categoryId] = Math.round(average * 10) / 10;
        categoryWeightedScore += average * categoryWeight;
        categoryWeightTotal += categoryWeight;
      }

      const categorizedComposite = categoryWeightTotal > 0
        ? Math.round((categoryWeightedScore / categoryWeightTotal) * 10) / 10
        : null;

      return {
        ...student,
        submissions,
        composite_score: categorizedComposite ?? (totalWeight > 0 ? Math.round((totalScore / totalWeight) * 10) / 10 : null),
        category_scores: categoryScores,
        submitted_count: submittedCount,
        total_assignments: assignments.length,
      };
    });

    return json(200, { classroom_id: classroomId, assignments, grade_categories: gradeCategories, rows });
  }

  // ── LMS: Student Progress ────────────────────────────────────────────────

  if (action === "student_progress") {
    requireAcademyPermission(access, "viewContacts");
    const contactId = normalizeText(contactIdRaw, 64) || null;
    if (!contactId) return json(400, { error: "contact_id is required for student_progress" });
    await ensureContactInAccessScope(sb, academyId, access, contactId);

    let membershipsQuery = sb.from("academy_classroom_memberships")
      .select("classroom_id, role, joined_at, academy_classrooms(id, name, is_active)")
      .eq("academy_id", academyId).eq("contact_id", contactId).limit(50);
    let submissionsQuery = sb.from("academy_submissions")
      .select("id, assignment_id, classroom_id, score, max_score, status, submitted_at, graded_at, notes, academy_assignments(title, assignment_type, due_at, max_score)")
      .eq("academy_id", academyId).eq("contact_id", contactId)
      .order("submitted_at", { ascending: false }).limit(200);
    let attendanceQuery = sb.from("academy_attendance")
      .select("classroom_id, session_date, status, notes, marked_at")
      .eq("academy_id", academyId).eq("contact_id", contactId)
      .order("session_date", { ascending: false }).limit(90);
    if (scopedClassroomIds !== null) {
      membershipsQuery = scopedClassroomIds.length > 0 ? membershipsQuery.in("classroom_id", scopedClassroomIds) : membershipsQuery.eq("classroom_id", "__none__");
      submissionsQuery = scopedClassroomIds.length > 0 ? submissionsQuery.in("classroom_id", scopedClassroomIds) : submissionsQuery.eq("classroom_id", "__none__");
      attendanceQuery = scopedClassroomIds.length > 0 ? attendanceQuery.in("classroom_id", scopedClassroomIds) : attendanceQuery.eq("classroom_id", "__none__");
    }

    const [contactResult, membershipsResult, submissionsResult, attendanceResult] = await Promise.all([
      sb.from("academy_contacts")
        .select("id, first_name, last_name, email, phone, status, last_activity_at, metadata, created_at")
        .eq("academy_id", academyId).eq("id", contactId).maybeSingle(),
      membershipsQuery,
      submissionsQuery,
      attendanceQuery,
    ]);

    if (!contactResult.data) return json(404, { error: "Contact not found" });

    const submissions = (submissionsResult.data ?? []) as Array<Record<string, unknown>>;
    const graded = submissions.filter((s) => typeof s.score === "number");
    const avgScore = graded.length > 0
      ? Math.round(graded.reduce((acc, s) => {
          const ms = Number((s.academy_assignments as Record<string, unknown>)?.max_score ?? s.max_score ?? 100);
          return acc + (ms > 0 ? (Number(s.score) / ms) * 100 : 0);
        }, 0) / graded.length * 10) / 10
      : null;

    const attendance = (attendanceResult.data ?? []) as Array<Record<string, unknown>>;
    const presentDays = attendance.filter((a) => a.status === "present" || a.status === "late").length;
    const attendanceRate = attendance.length > 0 ? Math.round((presentDays / attendance.length) * 100) : null;

    return json(200, {
      contact: contactResult.data,
      classrooms: (membershipsResult.data ?? []),
      submissions,
      attendance: attendance.slice(0, 30),
      stats: {
        total_submissions: submissions.length,
        graded_submissions: graded.length,
        avg_score: avgScore,
        attendance_rate: attendanceRate,
        total_attendance_days: attendance.length,
        present_days: presentDays,
      },
    });
  }

  // ── LMS: Attendance ──────────────────────────────────────────────────────

  if (action === "attendance") {
    requireAcademyPermission(access, "markAttendance");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (!classroomId) return json(400, { error: "classroom_id is required" });
    if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

    const { data, error } = await sb
      .from("academy_attendance")
      .select("id, classroom_id, contact_id, session_date, status, notes, marked_by, marked_at")
      .eq("academy_id", academyId).eq("classroom_id", classroomId)
      .order("session_date", { ascending: false }).limit(2000);
    if (error) return json(500, { error: "Failed to load attendance", detail: error.message });
    return json(200, { attendance: data ?? [] });
  }

  // ── LMS: Bulk Invites ────────────────────────────────────────────────────

  if (action === "bulk_invites") {
    requireAcademyPermission(access, "manageRoster");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
    if (!classroomId && scopedClassroomIds !== null && scopedClassroomIds.length === 0) return json(200, { bulk_invites: [] });
    let query = sb
      .from("academy_bulk_invites")
      .select("id, classroom_id, email, first_name, last_name, status, invited_at, joined_at, error")
      .eq("academy_id", academyId)
      .order("invited_at", { ascending: false });
    if (classroomId) query = query.eq("classroom_id", classroomId);
    else if (scopedClassroomIds !== null) query = query.in("classroom_id", scopedClassroomIds);
    const { data, error } = await query.limit(500);
    if (error) return json(500, { error: "Failed to load bulk invites", detail: error.message });
    return json(200, { bulk_invites: data ?? [] });
  }

  if (action === "referral_leaderboard") {
    if (!academyAccessHas(access, "viewReferrals")) return json(403, { error: "Forbidden" });
    const { data: refs, error } = await sb.from("academy_referrals")
      .select("referrer_contact_id, status").eq("academy_id", academyId).not("referred_contact_id", "is", null).limit(20000);
    if (error) return json(500, { error: "Failed to load referrals", detail: error.message });

    const byReferrer = new Map<string, { joined: number; enrolled: number }>();
    for (const r of (refs ?? []) as Array<Record<string, unknown>>) {
      const id = String(r.referrer_contact_id);
      const entry = byReferrer.get(id) ?? { joined: 0, enrolled: 0 };
      entry.joined += 1;
      if (String(r.status) === "enrolled") entry.enrolled += 1;
      byReferrer.set(id, entry);
    }
    const referrerIds = Array.from(byReferrer.keys());
    if (referrerIds.length === 0) return json(200, { leaderboard: [] });

    const { data: contactRows } = await sb.from("academy_contacts")
      .select("id, first_name, last_name, email").eq("academy_id", academyId).in("id", referrerIds);
    const contactById = new Map(((contactRows ?? []) as Array<Record<string, unknown>>).map((c) => [String(c.id), c]));

    const leaderboard = referrerIds.map((id) => {
      const c = contactById.get(id) ?? {};
      const stats = byReferrer.get(id)!;
      return {
        contact_id: id,
        name: `${String((c as any).first_name ?? "")} ${String((c as any).last_name ?? "")}`.trim() || String((c as any).email ?? "Student"),
        referrals: stats.joined,
        enrolled: stats.enrolled,
      };
    }).sort((a, b) => b.referrals - a.referrals).slice(0, 50);

    return json(200, { leaderboard });
  }

  if (action === "staff") {
    if (!directoryContext) throw new StaffAccessError(403,"Forbidden");
    const result = await readAcademyStaffDirectory(sb,directoryContext.actorId,academyId,directoryContext);
    return json(200,{...result,staff:(result.staff as Array<Record<string,unknown>>).map(row => row.source === "grant"
      ? {...formatRoleGrantAsStaff(row),staff_id:row.staff_id ?? null} : row)});
  }

  if (action === "owner_dashboard") {
    const canSeeFinance = academyAccessHas(access, "viewFinancialReports") || academyAccessHas(access, "manageFinance");
    if (!canSeeFinance && !academyAccessHas(access, "viewReports")) return json(403, { error: "Forbidden" });
    const scopedBranchIds = academyAccessBranchIds(access);
    const allowedBranchIds = new Set(scopedBranchIds ?? []);
    const branchAllowed = (value: unknown) => scopedBranchIds === null || allowedBranchIds.has(String(value ?? ""));
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const [contactsRes, classroomsRes, paymentsRes, membersRes, subsRes, attRes, asgnRes] = await Promise.all([
      sb.from("academy_contacts").select("id, primary_branch_id, status").eq("academy_id", academyId).limit(10000),
      sb.from("academy_classrooms").select("id, branch_id, name, is_active").eq("academy_id", academyId).limit(1000),
      canSeeFinance
        ? sb.from("academy_payments").select("branch_id, amount, currency, status, created_at").eq("academy_id", academyId).limit(20000)
        : Promise.resolve({ data: [], error: null }),
      sb.from("academy_classroom_memberships").select("classroom_id, contact_id, role").eq("academy_id", academyId).in("role", ["student", "observer"]).limit(20000),
      sb.from("academy_submissions").select("classroom_id, contact_id, score, max_score, status").eq("academy_id", academyId).limit(50000),
      sb.from("academy_attendance").select("classroom_id, status, session_date").eq("academy_id", academyId).gte("session_date", since30).limit(50000),
      sb.from("academy_assignments").select("id, classroom_id, status").eq("academy_id", academyId).neq("status", "archived").limit(5000),
    ]);

    const contacts = ((contactsRes.data ?? []) as Array<Record<string, unknown>>).filter((row) => branchAllowed(row.primary_branch_id));
    const classrooms = ((classroomsRes.data ?? []) as Array<Record<string, unknown>>).filter((row) => branchAllowed(row.branch_id));
    const payments = ((paymentsRes.data ?? []) as Array<Record<string, unknown>>).filter((row) => branchAllowed(row.branch_id));
    const classroomIdSet = new Set(classrooms.map((row) => String(row.id)));
    const members = ((membersRes.data ?? []) as Array<Record<string, unknown>>).filter((row) => classroomIdSet.has(String(row.classroom_id)));
    const subs = ((subsRes.data ?? []) as Array<Record<string, unknown>>).filter((row) => classroomIdSet.has(String(row.classroom_id)));
    const attendance = ((attRes.data ?? []) as Array<Record<string, unknown>>).filter((row) => classroomIdSet.has(String(row.classroom_id)));
    const assignments = ((asgnRes.data ?? []) as Array<Record<string, unknown>>).filter((row) => classroomIdSet.has(String(row.classroom_id)));

    const revenue = canSeeFinance
      ? (() => {
        const paid = payments.filter((p) => String(p.status) === "paid");
        const collectedTotal = paid.reduce((acc, p) => acc + Number(p.amount ?? 0), 0);
        const collectedThisMonth = paid.filter((p) => String(p.created_at ?? "") >= monthStart).reduce((acc, p) => acc + Number(p.amount ?? 0), 0);
        const outstanding = payments.filter((p) => String(p.status) === "pending").reduce((acc, p) => acc + Number(p.amount ?? 0), 0);
        const currency = String(paid[0]?.currency ?? payments[0]?.currency ?? "UZS");
        return { currency, collected_total: collectedTotal, collected_this_month: collectedThisMonth, outstanding, paid_count: paid.length };
      })()
      : null;

    // Enrollment funnel
    const funnel = { trial: 0, active: 0, paused: 0, inactive: 0 } as Record<string, number>;
    for (const c of contacts) {
      const s = String(c.status ?? "active");
      funnel[s] = (funnel[s] ?? 0) + 1;
    }

    // Per-classroom performance
    const membersByClassroom = new Map<string, number>();
    for (const m of members) membersByClassroom.set(String(m.classroom_id), (membersByClassroom.get(String(m.classroom_id)) ?? 0) + 1);
    const classroomStats = classrooms.map((cl) => {
      const cid = String(cl.id);
      const clSubs = subs.filter((s) => String(s.classroom_id) === cid && typeof s.score === "number" && Number(s.max_score ?? 0) > 0);
      const avgScore = clSubs.length > 0
        ? Math.round(clSubs.reduce((acc, s) => acc + (Number(s.score) / Number(s.max_score)) * 100, 0) / clSubs.length * 10) / 10
        : null;
      const clAtt = attendance.filter((a) => String(a.classroom_id) === cid);
      const present = clAtt.filter((a) => a.status === "present" || a.status === "late").length;
      const attendanceRate = clAtt.length > 0 ? Math.round((present / clAtt.length) * 100) : null;
      const clAsgn = assignments.filter((a) => String(a.classroom_id) === cid).length;
      return {
        classroom_id: cid, name: String(cl.name ?? ""), is_active: Boolean(cl.is_active),
        students: membersByClassroom.get(cid) ?? 0, assignments: clAsgn,
        avg_score: avgScore, attendance_rate: attendanceRate,
      };
    });

    // Attendance trend: last 8 distinct session dates academy-wide
    const dates = Array.from(new Set(attendance.map((a) => String(a.session_date)))).sort().reverse().slice(0, 8).reverse();
    const trend = dates.map((d) => {
      const recs = attendance.filter((a) => String(a.session_date) === d);
      const present = recs.filter((a) => a.status === "present" || a.status === "late").length;
      return { date: d, rate: recs.length > 0 ? Math.round((present / recs.length) * 100) : null };
    });

    const centerTenantId = await loadAcademyParentCenterId(sb, academyId, access);
    const classroomIds = classrooms.map((classroom) => normalizeText(classroom.id, 64)).filter(Boolean);
    const centerVoucherHeatmaps = await loadAcademyCenterVoucherHeatmaps(sb, academyId, centerTenantId, classroomIds);

    return json(200, {
      revenue,
      funnel,
      total_students: contacts.length,
      total_classrooms: classrooms.length,
      classroom_stats: classroomStats,
      attendance_trend: trend,
      center_voucher_source: { center_tenant_id: centerTenantId },
      center_voucher_heatmaps: centerVoucherHeatmaps,
    });
  }

  if (action === "education_os") {
    requireAcademyPermission(access, "viewEducationOS");
    const scopedBranchIds = academyAccessBranchIds(access);
    let educationClassroomIds = scopedClassroomIds;
    if (scopedBranchIds !== null) {
      const { data: branchClassrooms, error: branchClassroomsError } = scopedBranchIds.length
        ? await sb.from("academy_classrooms").select("id").eq("academy_id", academyId).in("branch_id", scopedBranchIds)
        : { data: [], error: null };
      if (branchClassroomsError) return json(500, { error: "Failed to resolve branch classrooms", detail: branchClassroomsError.message });
      educationClassroomIds = ((branchClassrooms ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
    }
    const educationAccess: MembershipRow = educationClassroomIds === null ? access : { ...access, classroom_ids: educationClassroomIds };
    const scopedContactIdsForSync = await loadScopedContactIds(sb, academyId, educationClassroomIds);
    const constrainActionSync =
      educationClassroomIds !== null ||
      !academyAccessHas(access, "manageFinance") ||
      !academyAccessHas(access, "issueCertificates");
    const syncOptions: EducationActionSyncOptions = constrainActionSync
      ? {
        candidateFilter: (candidate) =>
          educationActionCandidateAllowedForAccess(candidate, educationAccess, educationClassroomIds, scopedContactIdsForSync),
        resolveStale: false,
      }
      : {};
    const os = await buildEducationOS(sb, academyId, null, syncOptions);
    return json(200, await filterEducationOSForAccess(sb, academyId, educationAccess, os));
  }

  if (action === "business_foundation") {
    requireAcademyPermission(access, "viewAdmissions");
    const { error: defaultsError } = await sb.rpc("ensure_academy_crm_defaults", {
      p_academy_id: academyId,
      p_actor_id: null,
    });
    if (defaultsError) return json(500, { error: "Failed to initialize admissions defaults", detail: defaultsError.message });

    const [branches, rooms, sources, stages, transitions, leads, activities, trials, conversions, classrooms, staff, branchAssignments] = await Promise.all([
      sb.from("academy_branches")
        .select("id, academy_id, branch_key, name, address, phone, timezone, currency, capacity, is_default, is_active, metadata, created_at, updated_at")
        .eq("academy_id", academyId).order("is_default", { ascending: false }).order("name"),
      sb.from("academy_rooms")
        .select("id, academy_id, branch_id, room_key, name, capacity, room_type, is_active, features, metadata, created_at, updated_at")
        .eq("academy_id", academyId).order("name"),
      sb.from("academy_lead_sources")
        .select("id, academy_id, source_key, label_i18n, category, is_system, is_active, position")
        .eq("academy_id", academyId).eq("is_active", true).order("position"),
      sb.from("academy_pipeline_stages")
        .select("id, academy_id, pipeline_id, stage_key, label_i18n, position, probability_percent, terminal_kind, is_active")
        .eq("academy_id", academyId).eq("is_active", true).order("position"),
      sb.from("academy_pipeline_transitions")
        .select("id, academy_id, pipeline_id, from_stage_id, to_stage_id, is_active, requires_reason")
        .eq("academy_id", academyId).eq("is_active", true),
      sb.from("academy_leads")
        .select("id, academy_id, branch_id, preferred_branch_id, pipeline_id, current_stage_id, source_id, assigned_user_id, responsible_user_id, full_name, phone, telegram, email, parent_name, parent_phone, age, interested_course, preferred_schedule, expected_price, currency, campaign, referral_source, notes, tags, estimated_probability, status, lost_reason, last_contacted_at, next_follow_up_at, converted_at, metadata, created_at, updated_at")
        .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(1000),
      sb.from("academy_lead_activities")
        .select("id, academy_id, lead_id, activity_type, method, status, assigned_user_id, due_at, completed_at, outcome, notes, next_follow_up_at, created_at")
        .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(1000),
      sb.from("academy_trial_lessons")
        .select("id, academy_id, lead_id, branch_id, room_id, classroom_id, teacher_user_id, starts_at, ends_at, status, feedback, recommended_course, recommended_level, next_step, created_at, updated_at")
        .eq("academy_id", academyId).order("starts_at", { ascending: false }).limit(1000),
      sb.from("academy_lead_conversions")
        .select("id, academy_id, lead_id, contact_id, classroom_id, trial_id, source_id, salesperson_user_id, expected_value, currency, converted_at")
        .eq("academy_id", academyId).order("converted_at", { ascending: false }).limit(1000),
      sb.from("academy_classrooms").select("id, branch_id, name, is_active").eq("academy_id", academyId).eq("is_active", true).order("name"),
      sb.from("academy_staff").select("id, user_id, display_name, role, is_active").eq("academy_id", academyId).eq("is_active", true).order("display_name"),
      sb.from("academy_staff_branch_assignments").select("staff_id,branch_id,status").eq("academy_id",academyId).eq("status","active").limit(5000),
    ]);
    const failed = [branches, rooms, sources, stages, transitions, leads, activities, trials, conversions, classrooms, staff, branchAssignments]
      .find((result) => result.error);
    if (failed?.error) return json(500, { error: "Failed to load business foundation", detail: failed.error.message });

    const scopedBranches=academyAccessBranchIds(access);const allowedBranches=new Set(scopedBranches??[]);const allowBranch=(value:unknown)=>scopedBranches===null||allowedBranches.has(String(value??""));
    const scopedLeads=((leads.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id));const scopedLeadIds=new Set(scopedLeads.map((row)=>String(row.id)));
    const scopedStaffIds=new Set(((branchAssignments.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id)).map((row)=>String(row.staff_id)));
    return json(200, {
      generated_at: new Date().toISOString(), access: academyAccessProfile(access),
      branches: ((branches.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.id)), rooms: ((rooms.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id)), sources: sources.data ?? [],
      stages: stages.data ?? [], transitions: transitions.data ?? [], leads: scopedLeads,
      activities: ((activities.data??[]) as Array<Record<string,unknown>>).filter((row)=>scopedLeadIds.has(String(row.lead_id))), trials: ((trials.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id)), conversions: ((conversions.data??[]) as Array<Record<string,unknown>>).filter((row)=>scopedLeadIds.has(String(row.lead_id))),
      classrooms: ((classrooms.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id)), staff: scopedBranches===null?(staff.data??[]):((staff.data??[]) as Array<Record<string,unknown>>).filter((row)=>scopedStaffIds.has(String(row.id))),
    });
  }

  if (action === "commercial_core") {
    requireAcademyPermission(access, "viewFinance");
    const [
      plans, subscriptions, freezes, adjustments, chargeBalances, payments, allocations,
      ledger, accountBalances, debtCases, promises, collectionEvents,
      reconciliations, contacts, branches, classrooms,
    ] = await Promise.all([
      sb.from("academy_pricing_plans")
        .select("id, academy_id, branch_id, classroom_id, legacy_offer_id, plan_key, name, pricing_model, billing_cycle, base_amount, currency, lessons_included, teaching_hours_included, duration_days, installment_count, is_active, metadata, created_at, updated_at")
        .eq("academy_id", academyId).order("name"),
      sb.from("academy_subscriptions")
        .select("id, academy_id, contact_id, branch_id, classroom_id, pricing_plan_id, entitlement_id, status, starts_on, ends_on, billing_cycle, billing_anchor_day, list_amount, discount_amount, agreed_amount, currency, auto_renew, renewal_notice_days, cancelled_at, cancellation_reason, completed_at, metadata, created_at, updated_at")
        .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(2000),
      sb.from("academy_subscription_freezes")
        .select("id, academy_id, subscription_id, starts_on, ends_on, reason, status, created_by, created_at")
        .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(2000),
      sb.from("academy_pricing_adjustments")
        .select("id, academy_id, subscription_id, adjustment_type, percentage_basis_points, amount, original_amount, final_amount, reason, promo_code, starts_on, ends_on, applied_by, approved_by, metadata, created_at")
        .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(2000),
      sb.from("academy_charge_balances")
        .select("id, academy_id, contact_id, subscription_id, branch_id, classroom_id, charge_number, cycle_key, charge_type, service_period_start, service_period_end, issued_on, due_on, original_amount, discount_amount, net_amount, currency, status, description, metadata, created_at, updated_at, allocated_amount, adjustment_amount, effective_amount, outstanding_amount, calculated_status, days_overdue, aging_bucket")
        .eq("academy_id", academyId).order("issued_on", { ascending: false }).limit(5000),
      sb.from("academy_payments")
        .select("id, academy_id, contact_id, offer_id, provider, provider_transaction_id, amount, currency, status, metadata, created_at, updated_at")
        .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(5000),
      sb.from("academy_payment_allocations")
        .select("id, academy_id, payment_id, charge_id, amount, currency, allocation_kind, reverses_allocation_id, allocated_by, allocated_at, metadata")
        .eq("academy_id", academyId).order("allocated_at", { ascending: false }).limit(5000),
      sb.from("academy_account_ledger_entries")
        .select("id, academy_id, contact_id, subscription_id, charge_id, payment_id, entry_type, amount, currency, effective_at, reason, created_by, metadata, created_at")
        .eq("academy_id", academyId).order("effective_at", { ascending: false }).limit(5000),
      sb.from("academy_account_balances")
        .select("academy_id, contact_id, currency, balance, debits, credits, last_entry_at")
        .eq("academy_id", academyId),
      sb.from("academy_debt_cases")
        .select("id, academy_id, contact_id, subscription_id, branch_id, status, responsible_user_id, restriction_state, collection_notes, opened_at, resolved_at, metadata, created_at, updated_at")
        .eq("academy_id", academyId).order("updated_at", { ascending: false }).limit(2000),
      sb.from("academy_payment_promises")
        .select("id, academy_id, debt_case_id, amount, currency, promised_for, status, notes, created_by, created_at")
        .eq("academy_id", academyId).order("promised_for").limit(2000),
      sb.from("academy_collection_events")
        .select("id, academy_id, debt_case_id, event_type, channel, outcome, occurred_at, created_by, metadata")
        .eq("academy_id", academyId).order("occurred_at", { ascending: false }).limit(2000),
      sb.from("academy_payment_reconciliations")
        .select("id, academy_id, academy_payment_id, provider, provider_transaction_id, provider_event_id, event_type, amount, currency, status, payload_hash, received_at, metadata")
        .eq("academy_id", academyId).order("received_at", { ascending: false }).limit(2000),
      sb.from("academy_contacts")
        .select("id, primary_branch_id, first_name, last_name, email, phone, status, lifecycle_stage")
        .eq("academy_id", academyId).order("first_name").limit(5000),
      sb.from("academy_branches")
        .select("id, name, is_active, currency").eq("academy_id", academyId).order("name"),
      sb.from("academy_classrooms")
        .select("id, branch_id, name, is_active").eq("academy_id", academyId).order("name"),
    ]);
    const failed = [plans, subscriptions, freezes, adjustments, chargeBalances, payments, allocations, ledger,
      accountBalances, debtCases, promises, collectionEvents, reconciliations, contacts, branches, classrooms]
      .find((result) => result.error);
    if (failed?.error) return json(500, { error: "Failed to load commercial core", detail: failed.error.message });
    const scopedBranches=academyAccessBranchIds(access);const allowedBranches=new Set(scopedBranches??[]);const allowBranch=(value:unknown)=>scopedBranches===null||allowedBranches.has(String(value??""));
    const scopedContacts=((contacts.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.primary_branch_id));const contactIds=new Set(scopedContacts.map((row)=>String(row.id)));
    const scopedSubscriptions=((subscriptions.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id));const subscriptionIds=new Set(scopedSubscriptions.map((row)=>String(row.id)));
    const scopedCharges=((chargeBalances.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id));const chargeIds=new Set(scopedCharges.map((row)=>String(row.id)));
    const scopedPayments=((payments.data??[]) as Array<Record<string,unknown>>).filter((row)=>contactIds.has(String(row.contact_id)));const paymentIds=new Set(scopedPayments.map((row)=>String(row.id)));
    const scopedDebt=((debtCases.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id));const debtIds=new Set(scopedDebt.map((row)=>String(row.id)));
    return json(200, {
      generated_at: new Date().toISOString(), access: academyAccessProfile(access),
      pricing_plans: ((plans.data??[]) as Array<Record<string,unknown>>).filter((row)=>!row.branch_id||allowBranch(row.branch_id)), subscriptions: scopedSubscriptions, subscription_freezes: ((freezes.data??[]) as Array<Record<string,unknown>>).filter((row)=>subscriptionIds.has(String(row.subscription_id))), pricing_adjustments: ((adjustments.data??[]) as Array<Record<string,unknown>>).filter((row)=>subscriptionIds.has(String(row.subscription_id))),
      charges: scopedCharges, payments: scopedPayments, allocations: ((allocations.data??[]) as Array<Record<string,unknown>>).filter((row)=>chargeIds.has(String(row.charge_id))&&paymentIds.has(String(row.payment_id))),
      ledger_entries: ((ledger.data??[]) as Array<Record<string,unknown>>).filter((row)=>contactIds.has(String(row.contact_id))), account_balances: ((accountBalances.data??[]) as Array<Record<string,unknown>>).filter((row)=>contactIds.has(String(row.contact_id))), debt_cases: scopedDebt,
      payment_promises: ((promises.data??[]) as Array<Record<string,unknown>>).filter((row)=>debtIds.has(String(row.debt_case_id))), collection_events: ((collectionEvents.data??[]) as Array<Record<string,unknown>>).filter((row)=>debtIds.has(String(row.debt_case_id))),
      reconciliations: ((reconciliations.data??[]) as Array<Record<string,unknown>>).filter((row)=>paymentIds.has(String(row.academy_payment_id))), contacts: scopedContacts, branches: ((branches.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.id)), classrooms: ((classrooms.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id)),
    });
  }

  if (action === "guardian_relationships") {
    requireAcademyPermission(access, "manageGuardians");
    const results=await Promise.all([
      sb.from('academy_guardians').select('id,academy_id,user_id,full_name,phone,email,telegram_user_id,telegram_username,telegram_verified_at,status,locale,notes,metadata,created_at,updated_at').eq('academy_id',academyId).order('created_at',{ascending:false}).limit(2000),
      sb.from('academy_student_guardian_relationships').select('*').eq('academy_id',academyId).order('created_at',{ascending:false}).limit(3000),
      sb.from('academy_guardian_consents').select('*').eq('academy_id',academyId).order('occurred_at',{ascending:false}).limit(5000),
      sb.from('academy_guardian_link_tokens').select('id,academy_id,relationship_id,purpose,expires_at,max_uses,use_count,status,issued_by,used_by,used_at,revoked_at,created_at').eq('academy_id',academyId).order('created_at',{ascending:false}).limit(3000),
      sb.from('academy_guardian_notification_preferences').select('*').eq('academy_id',academyId).order('event_type').limit(5000),
      sb.from('academy_guardian_messages').select('*').eq('academy_id',academyId).order('created_at',{ascending:false}).limit(5000),
      sb.from('academy_notification_delivery_attempts').select('*').eq('academy_id',academyId).order('attempted_at',{ascending:false}).limit(5000),
      sb.from('academy_notifications').select('id,academy_id,contact_id,guardian_id,relationship_id,event_key,dedupe_key,channel,type,title,body,status,error,attempts,scheduled_at,sent_at,critical_override,created_at').eq('academy_id',academyId).not('guardian_id','is',null).order('created_at',{ascending:false}).limit(5000),
      sb.from('academy_contacts').select('id,primary_branch_id,first_name,last_name,email,phone,status').eq('academy_id',academyId).order('first_name').limit(5000),
    ]);const failed=results.find(result=>result.error);if(failed?.error)return json(500,{error:'Failed to load guardian relationships',detail:failed.error.message});const [guardians,relationships,consents,linkTokens,preferences,messages,deliveryAttempts,notifications,contacts]=results;
    const scopedBranches=academyAccessBranchIds(access);const allowedBranches=new Set(scopedBranches??[]);const scopedContacts=((contacts.data??[]) as Array<Record<string,unknown>>).filter((row)=>scopedBranches===null||allowedBranches.has(String(row.primary_branch_id)));const contactIds=new Set(scopedContacts.map((row)=>String(row.id)));const scopedRelationships=((relationships.data??[]) as Array<Record<string,unknown>>).filter((row)=>contactIds.has(String(row.contact_id)));const relationshipIds=new Set(scopedRelationships.map((row)=>String(row.id)));const guardianIds=new Set(scopedRelationships.map((row)=>String(row.guardian_id)));const scopedNotifications=((notifications.data??[]) as Array<Record<string,unknown>>).filter((row)=>contactIds.has(String(row.contact_id))||relationshipIds.has(String(row.relationship_id)));const notificationIds=new Set(scopedNotifications.map((row)=>String(row.id)));
    return json(200,{generated_at:new Date().toISOString(),access:academyAccessProfile(access),guardians:((guardians.data??[]) as Array<Record<string,unknown>>).filter((row)=>guardianIds.has(String(row.id))),relationships:scopedRelationships,consents:((consents.data??[]) as Array<Record<string,unknown>>).filter((row)=>relationshipIds.has(String(row.relationship_id))),link_tokens:((linkTokens.data??[]) as Array<Record<string,unknown>>).filter((row)=>relationshipIds.has(String(row.relationship_id))),preferences:((preferences.data??[]) as Array<Record<string,unknown>>).filter((row)=>relationshipIds.has(String(row.relationship_id))),messages:((messages.data??[]) as Array<Record<string,unknown>>).filter((row)=>relationshipIds.has(String(row.relationship_id))),delivery_attempts:((deliveryAttempts.data??[]) as Array<Record<string,unknown>>).filter((row)=>notificationIds.has(String(row.notification_id))),notifications:scopedNotifications,contacts:scopedContacts});
  }

  if (action === "academic_operations") {
    requireAcademyPermission(access, "manageAcademicOperations");
    const results = await Promise.all([
      sb.from("academy_academic_calendars").select("*").eq("academy_id", academyId).order("starts_on", { ascending: false }).limit(500),
      sb.from("academy_calendar_events").select("*").eq("academy_id", academyId).order("starts_at", { ascending: false }).limit(1000),
      sb.from("academy_staff_availability").select("*").eq("academy_id", academyId).order("day_of_week").order("starts_at").limit(2000),
      sb.from("academy_room_availability").select("*").eq("academy_id", academyId).order("day_of_week").order("starts_at").limit(2000),
      sb.from("academy_lesson_sessions").select("*").eq("academy_id", academyId).order("starts_at", { ascending: false }).limit(3000),
      sb.from("academy_session_delivery").select("id,session_id,provider,attendee_url,join_opens_at,join_closes_at,status,updated_at").eq("academy_id", academyId).limit(3000),
      sb.from("academy_session_staff_assignments").select("*").eq("academy_id", academyId).order("assigned_at", { ascending: false }).limit(3000),
      sb.from("academy_attendance").select("*").eq("academy_id", academyId).not("session_id", "is", null).order("marked_at", { ascending: false }).limit(5000),
      sb.from("academy_attendance_exceptions").select("*").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(2000),
      sb.from("academy_make_up_lessons").select("*").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(2000),
      sb.from("academy_session_quality_reviews").select("*").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(2000),
      sb.from("academy_room_capacity_summary").select("*").eq("academy_id", academyId),
      sb.from("academy_room_peak_periods").select("*").eq("academy_id", academyId).order("session_count", { ascending: false }),
      sb.from("academy_classroom_capacity_summary").select("*").eq("academy_id", academyId),
      sb.from("academy_branches").select("id,name,is_active,currency,timezone").eq("academy_id", academyId).order("name"),
      sb.from("academy_rooms").select("id,branch_id,name,capacity,is_active").eq("academy_id", academyId).order("name"),
      sb.from("academy_classrooms").select("id,branch_id,name,is_active,student_capacity").eq("academy_id", academyId).order("name"),
      sb.from("academy_staff").select("id,email,display_name,role,classroom_ids,is_active").eq("academy_id", academyId).order("display_name"),
      sb.from("academy_classroom_memberships").select("classroom_id,contact_id,role,status").eq("academy_id", academyId).eq("role", "student").eq("status", "active").limit(5000),
      sb.from("academy_contacts").select("id,primary_branch_id,first_name,last_name,email,status").eq("academy_id", academyId).order("first_name").limit(5000),
      sb.from("academy_staff_branch_assignments").select("staff_id,branch_id,status").eq("academy_id",academyId).eq("status","active").limit(5000),
    ]);
    const failed = results.find((result) => result.error);
    if (failed?.error) return json(500, { error: "Failed to load academic operations", detail: failed.error.message });
    const [calendars,calendarEvents,staffAvailability,roomAvailability,sessions,sessionDelivery,assignments,attendance,exceptions,makeups,qualityReviews,roomCapacity,roomPeaks,classroomCapacity,branches,rooms,classrooms,staff,memberships,contacts,branchAssignments] = results;
    const scopedBranches=academyAccessBranchIds(access);const allowedBranches=new Set(scopedBranches??[]);const allowBranch=(value:unknown)=>scopedBranches===null||allowedBranches.has(String(value??""));
    const scopedRooms=((rooms.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id));const roomIds=new Set(scopedRooms.map((row)=>String(row.id)));
    const scopedClassrooms=((classrooms.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id));const classroomIds=new Set(scopedClassrooms.map((row)=>String(row.id)));
    const scopedCalendars=((calendars.data??[]) as Array<Record<string,unknown>>).filter((row)=>!row.branch_id||allowBranch(row.branch_id));const calendarIds=new Set(scopedCalendars.map((row)=>String(row.id)));
    const scopedSessions=((sessions.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id)&&classroomIds.has(String(row.classroom_id)));const sessionIds=new Set(scopedSessions.map((row)=>String(row.id)));
    const scopedAssignments=((assignments.data??[]) as Array<Record<string,unknown>>).filter((row)=>sessionIds.has(String(row.session_id)));const scopedStaffIds=new Set(((branchAssignments.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id)).map((row)=>String(row.staff_id)));for(const row of scopedSessions)scopedStaffIds.add(String(row.primary_staff_id));for(const row of scopedAssignments)scopedStaffIds.add(String(row.staff_id));
    const scopedAttendance=((attendance.data??[]) as Array<Record<string,unknown>>).filter((row)=>sessionIds.has(String(row.session_id)));const attendanceIds=new Set(scopedAttendance.map((row)=>String(row.id)));
    const scopedMemberships=((memberships.data??[]) as Array<Record<string,unknown>>).filter((row)=>classroomIds.has(String(row.classroom_id)));const contactIds=new Set(scopedMemberships.map((row)=>String(row.contact_id)));const scopedContacts=((contacts.data??[]) as Array<Record<string,unknown>>).filter((row)=>contactIds.has(String(row.id))||allowBranch(row.primary_branch_id));
    return json(200, { generated_at: new Date().toISOString(), access: academyAccessProfile(access),
      calendars: scopedCalendars, calendar_events: ((calendarEvents.data??[]) as Array<Record<string,unknown>>).filter((row)=>calendarIds.has(String(row.calendar_id))), staff_availability: ((staffAvailability.data??[]) as Array<Record<string,unknown>>).filter((row)=>scopedBranches===null||scopedStaffIds.has(String(row.staff_id))), room_availability: ((roomAvailability.data??[]) as Array<Record<string,unknown>>).filter((row)=>roomIds.has(String(row.room_id))),
      sessions: scopedSessions, session_delivery: ((sessionDelivery.data??[]) as Array<Record<string,unknown>>).filter((row)=>sessionIds.has(String(row.session_id))), session_staff_assignments: scopedAssignments, attendance: scopedAttendance, attendance_exceptions: ((exceptions.data??[]) as Array<Record<string,unknown>>).filter((row)=>attendanceIds.has(String(row.attendance_id))),
      make_up_lessons: ((makeups.data??[]) as Array<Record<string,unknown>>).filter((row)=>sessionIds.has(String(row.original_session_id))||sessionIds.has(String(row.replacement_session_id))||contactIds.has(String(row.contact_id))), quality_reviews: ((qualityReviews.data??[]) as Array<Record<string,unknown>>).filter((row)=>sessionIds.has(String(row.session_id))), room_capacity: ((roomCapacity.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id)), room_peak_periods: ((roomPeaks.data??[]) as Array<Record<string,unknown>>).filter((row)=>roomIds.has(String(row.room_id))),
      classroom_capacity: ((classroomCapacity.data??[]) as Array<Record<string,unknown>>).filter((row)=>classroomIds.has(String(row.classroom_id))), branches: ((branches.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.id)), rooms: scopedRooms, classrooms: scopedClassrooms, staff: scopedBranches===null?(staff.data??[]):((staff.data??[]) as Array<Record<string,unknown>>).filter((row)=>scopedStaffIds.has(String(row.id))),
      classroom_memberships: scopedMemberships, contacts: scopedContacts,
    });
  }

  if (action === "business_intelligence") {
    requireAcademyPermission(access, "viewBusinessIntelligence");
    const scopedBranchIds = academyAccessBranchIds(access);
    const emptyResult = <T = Record<string, unknown>[]>(data: T = [] as T) => Promise.resolve({ data, error: null });
    const emptyUuid = "00000000-0000-0000-0000-000000000000";
    let contactQuery = sb.from("academy_contacts")
      .select("id,first_name,last_name,email,phone,status,lifecycle_stage,last_activity_at,primary_branch_id")
      .eq("academy_id", academyId).order("first_name").limit(5000);
    if (scopedBranchIds !== null) contactQuery = contactQuery.in("primary_branch_id", scopedBranchIds.length ? scopedBranchIds : [emptyUuid]);
    const contacts = await contactQuery;
    if (contacts.error) return json(500, { error: "Failed to load business intelligence", detail: contacts.error.message });
    const contactIds = ((contacts.data ?? []) as Array<{ id: string }>).map((row) => row.id);

    let scopedStaffIds: string[] | null = null;
    if (scopedBranchIds !== null) {
      const { data: assignments, error: assignmentError } = await sb.from("academy_staff_branch_assignments")
        .select("staff_id").eq("academy_id", academyId)
        .in("branch_id", scopedBranchIds.length ? scopedBranchIds : [emptyUuid]).eq("status", "active").limit(5000);
      if (assignmentError) return json(500, { error: "Failed to load branch staff scope", detail: assignmentError.message });
      scopedStaffIds = Array.from(new Set(((assignments ?? []) as Array<{ staff_id: string }>).map((row) => row.staff_id)));
    }
    const contactScopeIds = contactIds.length ? contactIds : [emptyUuid];
    const staffScopeIds = scopedStaffIds === null ? null : (scopedStaffIds.length ? scopedStaffIds : [emptyUuid]);
    const canViewRisk = academyAccessHas(access, "viewRisk");
    const canViewAutomation = academyAccessHas(access, "viewAutomation");
    const canUseAi = academyAccessHas(access, "useAcademyAI");
    const canViewImports = academyAccessHas(access, "manageImports");
    const permittedImportTypes=allowedLegacyImportTypes(access);
    const canViewFinancialReports = academyAccessHas(access, "viewFinancialReports");

    let branchComparisonQuery = sb.from("academy_branch_comparison_v2").select("*").eq("academy_id", academyId).order("name");
    let attributionQuery = sb.from("academy_marketing_attribution_metrics").select("*").eq("academy_id", academyId).limit(5000);
    let unitEconomicsQuery = sb.from("academy_unit_economics_metrics").select("*").eq("academy_id", academyId).limit(5000);
    let studentIntelligenceQuery = sb.from("academy_unified_student_intelligence").select("*").eq("academy_id", academyId).limit(5000);
    let lifecycleQuery = sb.from("academy_student_lifecycle_events").select("*").eq("academy_id", academyId).order("occurred_at", { ascending: false }).limit(10000);
    let actionQuery = sb.from("academy_action_items").select("*").eq("academy_id", academyId).order("status").order("sla_due_at").limit(5000);
    let subscriptionQuery = sb.from("academy_subscriptions").select("id,contact_id,classroom_id,branch_id,status,starts_on,ends_on,currency,agreed_amount").eq("academy_id",academyId).order("ends_on").limit(5000);
    let staffQuery = sb.from("academy_staff").select("id,user_id,display_name,email,role,is_active").eq("academy_id",academyId).order("display_name").limit(2000);
    let teacherMetricsQuery = sb.from("academy_teacher_performance_metrics").select("*").eq("academy_id", academyId).limit(2000);
    let staffMetricsQuery = sb.from("academy_staff_performance_metrics").select("*").eq("academy_id", academyId).limit(2000);
    if (scopedBranchIds !== null) {
      const branchFilter = scopedBranchIds.length ? scopedBranchIds : [emptyUuid];
      branchComparisonQuery = branchComparisonQuery.in("branch_id", branchFilter);
      attributionQuery = attributionQuery.in("branch_id", branchFilter);
      unitEconomicsQuery = unitEconomicsQuery.in("branch_id", branchFilter);
      studentIntelligenceQuery = studentIntelligenceQuery.in("primary_branch_id", branchFilter);
      lifecycleQuery = lifecycleQuery.in("branch_id", branchFilter);
      actionQuery = actionQuery.in("branch_id", branchFilter);
      subscriptionQuery = subscriptionQuery.in("branch_id", branchFilter);
      if (staffScopeIds) {
        staffQuery = staffQuery.in("id", staffScopeIds);
        teacherMetricsQuery = teacherMetricsQuery.in("staff_id", staffScopeIds);
        staffMetricsQuery = staffMetricsQuery.in("staff_id", staffScopeIds);
      }
    }

    const results = await Promise.all([
      scopedBranchIds === null && canViewFinancialReports ? sb.from("academy_owner_intelligence").select("*").eq("academy_id", academyId).maybeSingle() : emptyResult({}),
      scopedBranchIds === null && canViewFinancialReports ? sb.from("academy_business_dashboard_v2").select("*").eq("academy_id", academyId).maybeSingle() : emptyResult({}),
      branchComparisonQuery,
      sb.from("academy_metric_definitions").select("*").or(`academy_id.is.null,academy_id.eq.${academyId}`).eq("status", "active").order("metric_key"),
      attributionQuery, canViewFinancialReports ? unitEconomicsQuery : emptyResult(), teacherMetricsQuery, staffMetricsQuery, studentIntelligenceQuery, lifecycleQuery,
      canViewRisk ? sb.from("academy_risk_definitions").select("*").eq("academy_id",academyId).order("definition_key").order("version",{ascending:false}) : emptyResult(),
      canViewRisk ? sb.from("academy_risk_evaluations").select("*").eq("academy_id",academyId).in("contact_id",contactScopeIds).order("evaluated_at",{ascending:false}).limit(3000) : emptyResult(),
      canViewRisk ? sb.from("academy_risk_signals").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(10000) : emptyResult(),
      canViewRisk ? sb.from("academy_intervention_cases").select("*").eq("academy_id",academyId).in("contact_id",contactScopeIds).order("created_at",{ascending:false}).limit(3000) : emptyResult(),
      canViewRisk ? sb.from("academy_intervention_activities").select("*").eq("academy_id",academyId).order("performed_at",{ascending:false}).limit(10000) : emptyResult(),
      sb.from("academy_renewal_opportunities").select("*").eq("academy_id",academyId).in("contact_id",contactScopeIds).order("renewal_due_on").limit(3000),
      sb.from("academy_renewal_activities").select("*").eq("academy_id",academyId).order("performed_at",{ascending:false}).limit(10000),
      actionQuery,
      canViewImports ? sb.from("academy_import_jobs").select("*").eq("academy_id",academyId).in("import_type",permittedImportTypes.length?permittedImportTypes:["__none__"]).order("created_at",{ascending:false}).limit(1000) : emptyResult(),
      canViewImports ? sb.from("academy_import_rows").select("*,academy_import_jobs!inner(import_type)").eq("academy_id",academyId).in("academy_import_jobs.import_type",permittedImportTypes.length?permittedImportTypes:["__none__"]).order("created_at",{ascending:false}).limit(10000) : emptyResult(),
      canViewImports ? sb.from("academy_import_effects").select("*,academy_import_jobs!inner(import_type)").eq("academy_id",academyId).in("academy_import_jobs.import_type",permittedImportTypes.length?permittedImportTypes:["__none__"]).order("created_at",{ascending:false}).limit(10000) : emptyResult(),
      staffQuery, subscriptionQuery,
      sb.from("academy_marketing_campaigns").select("*").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(1000),
      sb.from("academy_localization_settings").select("*").eq("academy_id", academyId).maybeSingle(),
      sb.from("academy_translation_overrides").select("*").eq("academy_id", academyId).order("translation_key").limit(3000),
      canViewAutomation ? (scopedBranchIds === null ? sb.from("academy_automation_rule_versions").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(2000) : sb.from("academy_automation_rule_versions").select("*").eq("academy_id",academyId).in("branch_id",scopedBranchIds.length?scopedBranchIds:[emptyUuid]).order("created_at",{ascending:false}).limit(2000)) : emptyResult(),
      canViewAutomation ? (scopedBranchIds === null ? sb.from("academy_automation_executions").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(3000) : sb.from("academy_automation_executions").select("*").eq("academy_id",academyId).in("branch_id",scopedBranchIds.length?scopedBranchIds:[emptyUuid]).order("created_at",{ascending:false}).limit(3000)) : emptyResult(),
      canViewAutomation ? (scopedBranchIds === null ? sb.from("academy_automation_effects").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(10000) : sb.from("academy_automation_effects").select("*").eq("academy_id",academyId).in("branch_id",scopedBranchIds.length?scopedBranchIds:[emptyUuid]).order("created_at",{ascending:false}).limit(10000)) : emptyResult(),
      canUseAi ? (scopedBranchIds === null
        ? sb.from("academy_ai_assistance_requests").select("*").eq("academy_id",academyId).order("requested_at",{ascending:false}).limit(1000)
        : sb.from("academy_ai_assistance_requests").select("*").eq("academy_id",academyId).in("branch_id",scopedBranchIds.length?scopedBranchIds:[emptyUuid]).order("requested_at",{ascending:false}).limit(1000)) : emptyResult(),
      canUseAi ? sb.from("academy_ai_assistance_reviews").select("*").eq("academy_id",academyId).order("reviewed_at",{ascending:false}).limit(3000) : emptyResult(),
    ]);
    const failed=results.find(result=>result.error);if(failed?.error)return json(500,{error:'Failed to load business intelligence',detail:failed.error.message});
    const [owner,dashboard,branches,metricDefinitions,attribution,unitEconomics,teacherPerformance,staffPerformance,studentIntelligence,lifecycle,definitions,evaluations,signals,interventions,interventionActivities,renewals,renewalActivities,actions,importJobs,importRows,importEffects,staff,subscriptions,campaigns,localization,translations,automationVersions,automationExecutions,automationEffects,aiRequests,aiReviews]=results;
    const aiRequestIds = new Set(((aiRequests.data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id ?? "")));
    const scopedAiReviews = scopedBranchIds === null ? (aiReviews.data ?? []) : ((aiReviews.data ?? []) as Array<Record<string, unknown>>).filter((row) => aiRequestIds.has(String(row.request_id ?? "")));
    const scopedEvaluationIds = new Set(((evaluations.data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id ?? "")));
    const scopedInterventionIds = new Set(((interventions.data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id ?? "")));
    const permittedHistory=permittedLegacyImportHistory(access,importJobs.data??[],importRows.data??[],importEffects.data??[]);
    const scopedRenewalIds = new Set(((renewals.data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id ?? "")));
    const scopedSignals = ((signals.data ?? []) as Array<Record<string, unknown>>).filter((row) => scopedEvaluationIds.has(String(row.evaluation_id ?? "")));
    const scopedInterventionActivities = ((interventionActivities.data ?? []) as Array<Record<string, unknown>>).filter((row) => scopedInterventionIds.has(String(row.case_id ?? "")));
    const scopedRenewalActivities = ((renewalActivities.data ?? []) as Array<Record<string, unknown>>).filter((row) => scopedRenewalIds.has(String(row.opportunity_id ?? "")));
    const scopedBranchComparison=canViewFinancialReports?(branches.data??[]):((branches.data??[]) as Array<Record<string,unknown>>).map((row)=>({...row,collected_revenue:null,collected_amount:null,outstanding_amount:null,outstanding_debt:null,teacher_cost:null,contribution:null}));
    const scopedSubscriptions=canViewFinancialReports?(subscriptions.data??[]):((subscriptions.data??[]) as Array<Record<string,unknown>>).map((row)=>({...row,agreed_amount:null,currency:null}));
    const scopedStudentIntelligence=canViewFinancialReports?(studentIntelligence.data??[]):((studentIntelligence.data??[]) as Array<Record<string,unknown>>).map((row)=>({...row,outstanding_balance:null,last_payment_at:null}));
    return json(200,{generated_at:new Date().toISOString(),access:academyAccessProfile(access),owner:owner.data??{},dashboard:dashboard.data??{},branches:scopedBranchComparison,metric_definitions:metricDefinitions.data??[],marketing_attribution:attribution.data??[],unit_economics:unitEconomics.data??[],teacher_performance:teacherPerformance.data??[],staff_performance:staffPerformance.data??[],student_intelligence:scopedStudentIntelligence,lifecycle_events:lifecycle.data??[],risk_definitions:definitions.data??[],risk_evaluations:evaluations.data??[],risk_signals:scopedSignals,interventions:interventions.data??[],intervention_activities:scopedInterventionActivities,renewals:renewals.data??[],renewal_activities:scopedRenewalActivities,actions:actions.data??[],allowed_import_types:permittedImportTypes,import_jobs:permittedHistory.jobs,import_rows:permittedHistory.rows,import_effects:permittedHistory.effects,contacts:contacts.data??[],staff:staff.data??[],subscriptions:scopedSubscriptions,campaigns:campaigns.data??[],localization:localization.data??{},translations:translations.data??[],automation_versions:automationVersions.data??[],automation_executions:automationExecutions.data??[],automation_effects:automationEffects.data??[],ai_requests:aiRequests.data??[],ai_reviews:scopedAiReviews});
  }

  if (action === "global_search") {
    requireAcademyPermission(access, "viewBusinessIntelligence");
    const query=normalizeText(searchQueryRaw,200);if(query.length<2)return json(200,{results:[]});const {data,error}=await sb.rpc('academy_global_search_v2',{p_academy_id:academyId,p_query:query,p_limit:Math.min(Math.max(toIntOrNull(searchLimitRaw)??25,1),100)});if(error)return json(500,{error:'Search failed',detail:error.message});const scopedBranchIds=academyAccessBranchIds(access);const results=scopedBranchIds===null?(data??[]):((data??[]) as Array<Record<string,unknown>>).filter((row)=>!row.branch_id||scopedBranchIds.includes(String(row.branch_id)));return json(200,{results});
  }

  if (action === "operations_finance") {
    if(!academyAccessHas(access,"viewEconomics")&&!academyAccessHas(access,"manageCashier")&&!academyAccessHas(access,"viewPayroll"))return json(403,{error:"Forbidden"});
    const {error:defaultsError}=await sb.rpc("ensure_academy_operations_defaults",{p_academy_id:academyId,p_actor_id:null});
    if(defaultsError)return json(500,{error:"Failed to initialize operations finance",detail:defaultsError.message});
    const results = await Promise.all([
      sb.from("academy_cashboxes").select("*").eq("academy_id",academyId).order("name"),
      sb.from("academy_cashier_shifts").select("*").eq("academy_id",academyId).order("opened_at",{ascending:false}).limit(500),
      sb.from("academy_cash_movements").select("*").eq("academy_id",academyId).order("occurred_at",{ascending:false}).limit(2000),
      sb.from("academy_cash_reconciliations").select("*").eq("academy_id",academyId).order("reconciled_at",{ascending:false}).limit(500),
      sb.from("academy_expense_categories").select("*").eq("academy_id",academyId).order("name"),
      sb.from("academy_expenses").select("*").eq("academy_id",academyId).order("expense_date",{ascending:false}).limit(2000),
      sb.from("academy_budgets").select("*").eq("academy_id",academyId).order("period_start",{ascending:false}).limit(1000),
      sb.from("academy_lesson_deliveries").select("*").eq("academy_id",academyId).order("delivered_on",{ascending:false}).limit(3000),
      sb.from("academy_compensation_rules").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(1000),
      sb.from("academy_payroll_periods").select("*").eq("academy_id",academyId).order("period_start",{ascending:false}).limit(500),
      sb.from("academy_payroll_row_totals").select("*").eq("academy_id",academyId).limit(3000),
      sb.from("academy_payroll_adjustments").select("*").eq("academy_id",academyId).order("created_at",{ascending:false}).limit(3000),
      sb.from("academy_payroll_payouts").select("*").eq("academy_id",academyId).order("paid_at",{ascending:false}).limit(3000),
      sb.from("academy_branch_contribution").select("*").eq("academy_id",academyId),
      sb.from("academy_classroom_contribution").select("*").eq("academy_id",academyId),
      sb.from("academy_staff").select("id,email,display_name,role,classroom_ids,is_active").eq("academy_id",academyId).order("display_name"),
      sb.from("academy_branches").select("id,name,currency,is_active").eq("academy_id",academyId).order("name"),
      sb.from("academy_classrooms").select("id,branch_id,name,is_active").eq("academy_id",academyId).order("name"),
      sb.from("academy_staff_branch_assignments").select("staff_id,branch_id,status").eq("academy_id",academyId).eq("status","active").limit(5000),
    ]);
    const failed=results.find((result)=>result.error);if(failed?.error)return json(500,{error:"Failed to load operations finance",detail:failed.error.message});
    const [cashboxes,shifts,movements,reconciliations,categories,expenses,budgets,deliveries,rules,periods,rows,adjustments,payouts,branchEconomics,classroomEconomics,staff,branches,classrooms,branchAssignments]=results;
    const scopedBranches=academyAccessBranchIds(access);const allowedBranches=new Set(scopedBranches??[]);const allowBranch=(value:unknown)=>scopedBranches===null||allowedBranches.has(String(value??""));const scopedCashboxes=((cashboxes.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id));const cashboxIds=new Set(scopedCashboxes.map((row)=>String(row.id)));const scopedShifts=((shifts.data??[]) as Array<Record<string,unknown>>).filter((row)=>cashboxIds.has(String(row.cashbox_id)));const shiftIds=new Set(scopedShifts.map((row)=>String(row.id)));const scopedClassrooms=((classrooms.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id));const classroomIds=new Set(scopedClassrooms.map((row)=>String(row.id)));const scopedStaffIds=new Set(((branchAssignments.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id)).map((row)=>String(row.staff_id)));const canViewEconomics=academyAccessHas(access,"viewEconomics");const canViewPayroll=academyAccessHas(access,"viewPayroll");
    return json(200,{generated_at:new Date().toISOString(),access:academyAccessProfile(access),cashboxes:scopedCashboxes,cashier_shifts:scopedShifts,cash_movements:((movements.data??[]) as Array<Record<string,unknown>>).filter((row)=>shiftIds.has(String(row.shift_id))),cash_reconciliations:((reconciliations.data??[]) as Array<Record<string,unknown>>).filter((row)=>shiftIds.has(String(row.shift_id))),expense_categories:canViewEconomics?(categories.data??[]):[],expenses:canViewEconomics?((expenses.data??[]) as Array<Record<string,unknown>>).filter((row)=>!row.branch_id||allowBranch(row.branch_id)):[],budgets:canViewEconomics?((budgets.data??[]) as Array<Record<string,unknown>>).filter((row)=>!row.branch_id||allowBranch(row.branch_id)):[],lesson_deliveries:canViewPayroll?((deliveries.data??[]) as Array<Record<string,unknown>>).filter((row)=>classroomIds.has(String(row.classroom_id))):[],compensation_rules:canViewPayroll?(rules.data??[]):[],payroll_periods:canViewPayroll?(periods.data??[]):[],payroll_rows:canViewPayroll?((rows.data??[]) as Array<Record<string,unknown>>).filter((row)=>scopedStaffIds.size===0||scopedStaffIds.has(String(row.staff_id))):[],payroll_adjustments:canViewPayroll?(adjustments.data??[]):[],payroll_payouts:canViewPayroll?(payouts.data??[]):[],branch_economics:canViewEconomics?((branchEconomics.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.branch_id)):[],classroom_economics:canViewEconomics?((classroomEconomics.data??[]) as Array<Record<string,unknown>>).filter((row)=>classroomIds.has(String(row.classroom_id))):[],staff:canViewPayroll?(scopedBranches===null?(staff.data??[]):((staff.data??[]) as Array<Record<string,unknown>>).filter((row)=>scopedStaffIds.has(String(row.id)))):[],branches:((branches.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowBranch(row.id)),classrooms:scopedClassrooms});
  }

  if (action === "automation_rules") {
    if (!academyAccessHas(access, "manageAutomation")) return json(403, { error: "Forbidden" });
    const automationRules = await loadEducationAutomationRules(sb, academyId, null);
    return json(200, { automation_rules: automationRules });
  }

  if (action === "branding") {
    if (!academyAccessHas(access, "manageBranding")) return json(403, { error: "Forbidden" });
    const { data, error } = await sb.from("academy_branding")
      .select("id, academy_id, display_name, tagline, logo_url, favicon_url, primary_color, accent_color, hide_schood_logo, custom_domain, custom_domain_verified, footer_text, metadata, updated_at")
      .eq("academy_id", academyId).maybeSingle();
    if (error) return json(500, { error: "Failed to load branding", detail: error.message });
    return json(200, { branding: data ?? null });
  }

  if (action === "notifications") {
    if (!academyAccessHas(access, "viewNotifications")) return json(403, { error: "Forbidden" });
    const [notificationsResult, contactsResult] = await Promise.all([
      sb.from("academy_notifications")
        .select("id, contact_id, channel, type, title, body, status, error, sent_at, scheduled_at, created_at")
        .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(200),
      sb.from("academy_contacts").select("id,primary_branch_id").eq("academy_id",academyId).limit(10000),
    ]);
    if (notificationsResult.error || contactsResult.error) return json(500, { error: "Failed to load notifications", detail: notificationsResult.error?.message ?? contactsResult.error?.message });
    const scopedBranches=academyAccessBranchIds(access);if(scopedBranches===null)return json(200,{notifications:notificationsResult.data??[]});const allowedBranches=new Set(scopedBranches);const contactIds=new Set(((contactsResult.data??[]) as Array<Record<string,unknown>>).filter((row)=>allowedBranches.has(String(row.primary_branch_id))).map((row)=>String(row.id)));return json(200,{notifications:((notificationsResult.data??[]) as Array<Record<string,unknown>>).filter((row)=>contactIds.has(String(row.contact_id))) });
  }

  if (action === "audit_events") {
    if (!academyAccessHas(access, "viewAudit")) return json(403, { error: "Forbidden" });
    const { data, error } = await sb.from("academy_audit_events")
      .select("id, academy_id, actor_user_id, actor_role, action, target_type, target_id, contact_id, classroom_id, status, metadata, created_at")
      .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(200);
    if (error) return json(500, { error: "Failed to load audit events", detail: error.message });
    return json(200, { audit_events: data ?? [] });
  }

  if (action === "classroom_billing") {
    if (!academyAccessHas(access, "manageFinance")) return json(403, { error: "Forbidden" });
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (!classroomId) return json(400, { error: "classroom_id is required" });
    if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

    const [offersRes, membersRes, entRes, paymentsRes] = await Promise.all([
      sb.from("academy_offers")
        .select("id, name, price_amount, currency, duration_days, is_active")
        .eq("academy_id", academyId).eq("classroom_id", classroomId).eq("is_active", true),
      sb.from("academy_classroom_memberships")
        .select("contact_id, academy_contacts!academy_memberships_contact_tenant_fk(id, first_name, last_name, email, status)")
        .eq("academy_id", academyId).eq("classroom_id", classroomId).in("role", ["student", "observer"]).limit(500),
      sb.from("academy_entitlements")
        .select("contact_id, resource_id, status, expires_at")
        .eq("academy_id", academyId).eq("resource_type", "classroom").eq("resource_id", classroomId).limit(2000),
      sb.from("academy_payments")
        .select("contact_id, amount, currency, status, created_at")
        .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(2000),
    ]);
    if (offersRes.error) return json(500, { error: "Failed to load offers", detail: offersRes.error.message });
    if (membersRes.error) return json(500, { error: "Failed to load members", detail: membersRes.error.message });

    const offers = offersRes.data ?? [];
    const hasTuition = offers.length > 0;
    const paidContacts = new Set(
      ((entRes.data ?? []) as Array<Record<string, unknown>>)
        .filter((e) => String(e.status) === "active" && (!e.expires_at || new Date(String(e.expires_at)) > new Date()))
        .map((e) => String(e.contact_id)),
    );
    const lastPaymentByContact = new Map<string, Record<string, unknown>>();
    for (const p of (paymentsRes.data ?? []) as Array<Record<string, unknown>>) {
      const cid = String(p.contact_id ?? "");
      if (cid && !lastPaymentByContact.has(cid)) lastPaymentByContact.set(cid, p);
    }

    const students = ((membersRes.data ?? []) as Array<Record<string, unknown>>).map((m) => {
      const c = (m.academy_contacts as Record<string, unknown>) ?? {};
      const contactId = String(c.id ?? m.contact_id ?? "");
      return {
        contact_id: contactId,
        first_name: String(c.first_name ?? ""),
        last_name: String(c.last_name ?? ""),
        email: c.email ?? null,
        // No tuition offer => classroom is free => everyone has access.
        paid: hasTuition ? paidContacts.has(contactId) : true,
        last_payment: lastPaymentByContact.get(contactId) ?? null,
      };
    });

    return json(200, {
      classroom_id: classroomId,
      has_tuition: hasTuition,
      offers,
      students,
      paid_count: students.filter((s) => s.paid).length,
      unpaid_count: students.filter((s) => !s.paid).length,
    });
  }

  if (action === "schedule") {
    requireAcademyPermission(access, "manageSchedule");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
    if (!classroomId && scopedClassroomIds !== null && scopedClassroomIds.length === 0) return json(200, { schedule: [] });
    let query = sb.from("academy_classroom_schedules")
      .select("id, academy_id, classroom_id, day_of_week, start_time, end_time, timezone, label, is_active, created_at")
      .eq("academy_id", academyId).eq("is_active", true).order("day_of_week").order("start_time");
    if (classroomId) query = query.eq("classroom_id", classroomId);
    else if (scopedClassroomIds !== null) query = query.in("classroom_id", scopedClassroomIds);
    const { data, error } = await query.limit(200);
    if (error) return json(500, { error: "Failed to load schedule", detail: error.message });
    return json(200, { schedule: data ?? [] });
  }

  if (action === "access_invitations") {
    if(!directoryContext)throw new LearnerInvitationError(403,'Forbidden');
    if(directoryContext.reference_mode){
      if(directoryContext.reference_mode==='staff')return json(200,{mode:'staff',...await readStaffInvitations(sb,directoryContext.actorId,academyId,{before_time:directoryContext.before_time,before_id:directoryContext.before_id})});
      const mode=String(directoryContext.reference_mode);
      return json(200,{mode,...await readLearnerInvitations(sb,directoryContext.actorId,academyId,{mode,after_id:directoryContext.after_id})});
    }
    const modes=['invitations','contacts','classrooms','relationships','guardians'] as const;
    const [staffPage,...pages]=await Promise.all([readStaffInvitations(sb,directoryContext.actorId,academyId),...modes.map(mode=>readLearnerInvitations(sb,directoryContext.actorId,academyId,{mode}))]);
    const [invites,contacts,classes,relationships,guardians]=pages;
    return json(200,{invitations:[...(invites.invitations as Array<Record<string,unknown>>),...(staffPage.invitations as Array<Record<string,unknown>>)],
      access:academyAccessProfile(access),contacts:contacts.contacts,classrooms:classes.classrooms,guardian_relationships:relationships.relationships,guardians:guardians.guardians,
      reference_cursors:Object.fromEntries(modes.map((mode,index)=>[mode,pages[index].has_more?pages[index].cursor:null])),staff_cursor:staffPage.has_more?staffPage.cursor:null});
  }

  if (action === "timetable_planning") {
    requireAcademyPermission(access, "manageAcademicOperations");
    if ((operationalBranchIds !== null && operationalBranchIds.length === 0) || (scopedClassroomIds !== null && scopedClassroomIds.length === 0)) {
      return json(200, { terms: [], series: [], runs: [], schedules: [], rooms: [], staff: [], branches: [], classrooms: [] });
    }
    let classroomsQuery = sb.from("academy_classrooms").select("id,name,is_active,branch_id").eq("academy_id", academyId).eq("is_active", true).order("name").limit(500);
    if (operationalBranchIds !== null) classroomsQuery = classroomsQuery.in("branch_id", operationalBranchIds);
    if (scopedClassroomIds !== null) classroomsQuery = classroomsQuery.in("id", scopedClassroomIds);
    const classrooms = await classroomsQuery;
    if (classrooms.error) return json(500, { error: "Failed to load timetable classrooms", detail: classrooms.error.message });
    const classroomIds = ((classrooms.data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
    let termsQuery = sb.from("academy_timetable_terms").select("*").eq("academy_id", academyId).order("starts_on", { ascending: false }).limit(100);
    let roomsQuery = sb.from("academy_rooms").select("id,branch_id,name,capacity,is_active").eq("academy_id", academyId).eq("is_active", true).order("name").limit(500);
    let branchesQuery = sb.from("academy_branches").select("id,name,is_active").eq("academy_id", academyId).eq("is_active", true).order("name").limit(500);
    let staffAssignmentsQuery = sb.from("academy_staff_branch_assignments").select("staff_id,branch_id,status").eq("academy_id", academyId).eq("status", "active").limit(5000);
    if (operationalBranchIds !== null) {
      const branchList = operationalBranchIds.join(",");
      termsQuery = termsQuery.or(`branch_id.is.null,branch_id.in.(${branchList})`);
      roomsQuery = roomsQuery.in("branch_id", operationalBranchIds);
      branchesQuery = branchesQuery.in("id", operationalBranchIds);
      staffAssignmentsQuery = staffAssignmentsQuery.in("branch_id", operationalBranchIds);
    }
    const none = Promise.resolve({ data: [], error: null });
    const [terms, series, schedules, rooms, branches, staffAssignments] = await Promise.all([
      termsQuery,
      classroomIds.length
        ? sb.from("academy_timetable_series").select("*").eq("academy_id", academyId).in("classroom_id", classroomIds).order("created_at", { ascending: false }).limit(500)
        : none,
      classroomIds.length
        ? sb.from("academy_classroom_schedules").select("id,classroom_id,day_of_week,start_time,end_time,timezone,label,is_active").eq("academy_id", academyId).in("classroom_id", classroomIds).eq("is_active", true).order("day_of_week").limit(500)
        : none,
      roomsQuery,
      branchesQuery,
      staffAssignmentsQuery,
    ]);
    const termIds = ((terms.data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
    const staffIds = Array.from(new Set(((staffAssignments.data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.staff_id))));
    const [runs, staff] = await Promise.all([
      termIds.length
        ? sb.from("academy_timetable_generation_runs").select("*").eq("academy_id", academyId).in("term_id", termIds).order("created_at", { ascending: false }).limit(50)
        : none,
      operationalBranchIds === null
        ? sb.from("academy_staff").select("id,user_id,email,display_name,role,classroom_ids,is_active").eq("academy_id", academyId).eq("is_active", true).order("display_name").limit(500)
        : staffIds.length
          ? sb.from("academy_staff").select("id,user_id,email,display_name,role,classroom_ids,is_active").eq("academy_id", academyId).in("id", staffIds).eq("is_active", true).order("display_name").limit(500)
          : none,
    ]);
    const failed = [terms, series, runs, schedules, rooms, staff, branches, staffAssignments].find((result) => result.error);
    if (failed?.error) return json(500, { error: "Failed to load timetable planning" });
    return json(200, { terms: terms.data ?? [], series: series.data ?? [], runs: ((runs.data ?? []) as Array<Record<string,unknown>>).map(publicTimetableRun), schedules: schedules.data ?? [], rooms: rooms.data ?? [], staff: staff.data ?? [], branches: branches.data ?? [], classrooms: classrooms.data ?? [] });
  }

  if (action === "service_requests") {
    if (!academyAccessHas(access, "manageRetention") && !academyAccessHas(access, "manageAcademicOperations") && !academyAccessHas(access, "refundFinance")) {
      return json(403, { error: "Forbidden" });
    }
    if (operationalBranchIds !== null && operationalBranchIds.length === 0) return json(200, { requests: [], events: [] });
    let requestQuery = sb.from("academy_service_requests").select("*")
      .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(1000);
    if (operationalBranchIds !== null) {
      requestQuery = requestQuery.in("branch_id", operationalBranchIds);
    }
    const { data: requests, error } = await requestQuery;
    if (error) return json(500, { error: "Failed to load service requests", detail: error.message });
    const ids = ((requests ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
    const events = ids.length
      ? await sb.from("academy_service_request_events").select("*").eq("academy_id", academyId).in("request_id", ids).order("created_at").limit(5000)
      : { data: [], error: null };
    if (events.error) return json(500, { error: "Failed to load service request history", detail: events.error.message });
    return json(200, { requests: requests ?? [], events: events.data ?? [] });
  }

  if (action === "communication_journeys") {
    if (!academyAccessHas(access, "viewAutomation") && !academyAccessHas(access, "manageAutomation")) return json(403, { error: "Forbidden" });
    const [journeys, steps, enrollments] = await Promise.all([
      sb.from("academy_communication_journeys").select("*").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(500),
      sb.from("academy_communication_journey_steps").select("*").eq("academy_id", academyId).order("position").limit(5000),
      sb.from("academy_communication_enrollments").select("*").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(5000),
    ]);
    const failed = [journeys, steps, enrollments].find((result) => result.error);
    if (failed?.error) return json(500, { error: "Failed to load communication journeys", detail: failed.error.message });
    return json(200, { journeys: journeys.data ?? [], steps: steps.data ?? [], enrollments: enrollments.data ?? [] });
  }

  if (action === "collection_cases") {
    if (!academyAccessHas(access, "viewFinance") && !academyAccessHas(access, "collectFinance")) return json(403, { error: "Forbidden" });
    if (operationalBranchIds !== null && operationalBranchIds.length === 0) return json(200, { cases: [], attempts: [] });
    let casesQuery = sb.from("academy_collection_cases").select("*").eq("academy_id", academyId).order("opened_at", { ascending: false }).limit(1000);
    if (operationalBranchIds !== null) casesQuery = casesQuery.in("branch_id", operationalBranchIds);
    const cases = await casesQuery;
    if (cases.error) return json(500, { error: "Failed to load collection cases", detail: cases.error.message });
    const caseIds = ((cases.data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
    const attempts = caseIds.length
      ? await sb.from("academy_collection_attempts").select("*").eq("academy_id", academyId).in("case_id", caseIds).order("created_at", { ascending: false }).limit(5000)
      : { data: [], error: null };
    if (attempts.error) return json(500, { error: "Failed to load collection attempts", detail: attempts.error.message });
    return json(200, { cases: cases.data ?? [], attempts: attempts.data ?? [] });
  }

  if (action === "workforce_requests") {
    const canReviewAll = academyAccessHas(access, "manageStaff") || academyAccessHas(access, "manageAcademicOperations") || academyAccessHas(access, "viewPayroll");
    if (canReviewAll && operationalBranchIds !== null && operationalBranchIds.length === 0) return json(200, { requests: [] });
    let requestQuery = sb.from("academy_staff_requests").select("*")
      .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(1000);
    if (!canReviewAll) {
      const staffId = normalizeText(access.staff_id, 64);
      if (!staffId) return json(403, { error: "Your account is not linked to an active Academy staff record" });
      requestQuery = requestQuery.eq("staff_id", staffId);
    } else if (operationalBranchIds !== null) {
      requestQuery = requestQuery.in("branch_id", operationalBranchIds);
    }
    const { data, error } = await requestQuery;
    if (error) return json(500, { error: "Failed to load workforce requests", detail: error.message });
    let branchesQuery = sb.from("academy_branches").select("id,name,is_active").eq("academy_id", academyId).eq("is_active", true).order("name").limit(200);
    if (operationalBranchIds !== null) branchesQuery = branchesQuery.in("id", operationalBranchIds);
    const { data: branches, error: branchError } = await branchesQuery;
    if (branchError) return json(500, { error: "Failed to load staff request branches", detail: branchError.message });
    return json(200, { requests: data ?? [], branches: branches ?? [] });
  }

  if (action === "sensitive_cases") {
    if (!academyAccessHas(access, "manageRetention") || !["owner", "admin", "center_admin", "manager", "counselor"].includes(access.role)) {
      return json(403, { error: "Forbidden" });
    }
    if (operationalBranchIds !== null && operationalBranchIds.length === 0) return json(200, { cases: [], events: [] });
    let caseQuery = sb.from("academy_sensitive_cases").select("*").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(1000);
    if (!["owner", "admin"].includes(access.role)) caseQuery = caseQuery.eq("confidentiality", "restricted");
    if (operationalBranchIds !== null) caseQuery = caseQuery.in("branch_id", operationalBranchIds);
    const { data: cases, error } = await caseQuery;
    if (error) return json(500, { error: "Failed to load restricted cases", detail: error.message });
    const ids = ((cases ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
    const events = ids.length
      ? await sb.from("academy_sensitive_case_events").select("*").eq("academy_id", academyId).in("case_id", ids).order("created_at").limit(5000)
      : { data: [], error: null };
    if (events.error) return json(500, { error: "Failed to load restricted case history", detail: events.error.message });
    return json(200, { cases: cases ?? [], events: events.data ?? [] });
  }

  if (action === "competency_plans") {
    if (!academyAccessHas(access, "manageAssignments") && !academyAccessHas(access, "viewAcademicReports")) return json(403, { error: "Forbidden" });
    let scopedPlanContactIds: string[] | null = null;
    if (operationalBranchIds !== null) {
      const contacts = operationalBranchIds.length
        ? await sb.from("academy_contacts").select("id").eq("academy_id", academyId).in("primary_branch_id", operationalBranchIds).limit(10000)
        : { data: [], error: null };
      if (contacts.error) return json(500, { error: "Failed to resolve branch learners", detail: contacts.error.message });
      scopedPlanContactIds = ((contacts.data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
    } else if (scopedClassroomIds !== null) {
      scopedPlanContactIds = Array.from((await loadScopedContactIds(sb, academyId, scopedClassroomIds)) ?? []);
    }
    let plansQuery = sb.from("academy_learning_plans").select("*").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(1000);
    const noScopedPlans = scopedPlanContactIds !== null && scopedPlanContactIds.length === 0;
    if (scopedPlanContactIds?.length) plansQuery = plansQuery.in("contact_id", scopedPlanContactIds);
    const [frameworks, competencies, plans] = await Promise.all([
      sb.from("academy_competency_frameworks").select("*").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(500),
      sb.from("academy_competencies").select("*").eq("academy_id", academyId).order("position").limit(5000),
      noScopedPlans ? Promise.resolve({ data: [], error: null }) : plansQuery,
    ]);
    const planIds = ((plans.data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
    const items = planIds.length
      ? await sb.from("academy_learning_plan_items").select("*").eq("academy_id", academyId).in("plan_id", planIds).order("created_at").limit(10000)
      : { data: [], error: null };
    const itemIds = ((items.data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
    const evidence = itemIds.length
      ? await sb.from("academy_competency_evidence").select("*").eq("academy_id", academyId).in("plan_item_id", itemIds).order("observed_at", { ascending: false }).limit(10000)
      : { data: [], error: null };
    const failed = [frameworks, competencies, plans, items, evidence].find((result) => result.error);
    if (failed?.error) return json(500, { error: "Failed to load competency plans", detail: failed.error.message });
    return json(200, { frameworks: frameworks.data ?? [], competencies: competencies.data ?? [], plans: plans.data ?? [], items: items.data ?? [], evidence: evidence.data ?? [] });
  }

  if (action === "integration_endpoints") {
    if (!academyAccessHas(access, "manageAcademy") && !academyAccessHas(access, "manageAutomation")) return json(403, { error: "Forbidden" });
    const [endpoints, deliveries, exports] = await Promise.all([
      sb.from("academy_integration_endpoints").select("id,academy_id,name,endpoint_url,signing_secret_last4,event_types,status,consecutive_failures,last_success_at,last_failure_at,created_by,created_at,updated_at,metadata").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(200),
      sb.from("academy_integration_deliveries").select("id,academy_id,endpoint_id,event_type,event_id,status,attempts,next_attempt_at,response_status,response_excerpt,error,idempotency_key,created_at,delivered_at").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(1000),
      sb.from("academy_export_jobs").select("id,academy_id,export_type,format,status,filters,row_count,error,requested_by,requested_at,completed_at,expires_at").eq("academy_id", academyId).order("requested_at", { ascending: false }).limit(200),
    ]);
    const failed = [endpoints, deliveries, exports].find((result) => result.error);
    if (failed?.error) return json(500, { error: "Failed to load integrations", detail: failed.error.message });
    return json(200, { endpoints: endpoints.data ?? [], deliveries: deliveries.data ?? [], exports: exports.data ?? [] });
  }

  if (!academyAccessHas(access, "manageFinance") && !academyAccessHas(access, "manageOffers")) return json(403, { error: "Forbidden" });

  const { data, error } = await sb
    .from("academy_entitlements")
    .select("id, academy_id, contact_id, user_id, offer_id, payment_id, grant_type, resource_type, resource_id, capability_key, quantity, remaining, starts_at, expires_at, status, source, metadata, created_at, updated_at")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return json(500, { error: "Failed to load entitlements", detail: error.message });
  return json(200, { entitlements: data ?? [] });
};

// Education OS engine: generated actions, lifecycle pipeline, automations, calendar, and intelligence.
type EducationActionCandidate = {
  dedupe_key: string;
  source_type: string;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  recommended_action: string;
  contact_id?: string | null;
  classroom_id?: string | null;
  due_at?: string | null;
  metadata?: Json;
};

type EducationActionSyncOptions = {
  candidateFilter?: (candidate: EducationActionCandidate) => boolean;
  resolveStale?: boolean;
};

type EducationPipelineRow = {
  contact_id: string;
  name: string;
  email: string | null;
  status: string;
  stage: string;
  derived_stage: string;
  next_action: string;
  placement_level: string | null;
  placement_score: number | null;
  classroom_ids: string[];
  classroom_names: string[];
  attendance_rate: number | null;
  recent_absences: number;
  missing_assignments: number;
  composite_score: number | null;
  certificate_ready: boolean;
  pending_amount: number;
  entitlement_expires_at: string | null;
  last_activity_at: string | null;
};

type EducationCalendarEvent = {
  id: string;
  type: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  classroom_id: string | null;
  contact_id: string | null;
  priority: string;
  metadata: Json;
};

type EducationInsight = {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low" | "positive";
  title: string;
  detail: string;
  recommended_action: string;
  metric: number | null;
  classroom_id?: string | null;
  contact_id?: string | null;
};

const generatedEducationActionSources = [
  "alert",
  "grading_backlog",
  "missing_assignment",
  "attendance_roll_call",
  "placement_needed",
  "schedule_gap",
  "trial_follow_up",
  "renewal",
  "certificate_ready",
  "parent_follow_up",
];

const teacherScopedEducationActionSources = new Set([
  "alert",
  "grading_backlog",
  "missing_assignment",
  "schedule_gap",
  "attendance_roll_call",
]);

const educationActionCandidateAllowedForAccess = (
  candidate: EducationActionCandidate,
  access: MembershipRow,
  scopedClassroomIds: string[] | null,
  scopedContactIds: Set<string> | null,
): boolean => {
  const sourceType = normalizeText(candidate.source_type, 80);
  if (!academyAccessHas(access, "manageFinance") && ["renewal", "payment", "payment_due"].includes(sourceType)) return false;
  if (!academyAccessHas(access, "issueCertificates") && sourceType === "certificate_ready") return false;
  if (scopedClassroomIds !== null && !teacherScopedEducationActionSources.has(sourceType)) return false;

  const classroomId = normalizeText(candidate.classroom_id, 64);
  if (classroomId && scopedClassroomIds !== null && !scopedClassroomIds.includes(classroomId)) return false;

  const contactId = normalizeText(candidate.contact_id, 64);
  if (contactId && scopedContactIds !== null && !scopedContactIds.has(contactId)) return false;
  if (!classroomId && !contactId && scopedClassroomIds !== null) return false;

  return true;
};

const defaultAutomationRules = [
  {
    rule_key: "assignment_due_reminder",
    name: "Assignment due reminder",
    description: "Queue a student reminder when active work is due in the next 24 hours.",
    channel: "telegram",
    threshold: 24,
  },
  {
    rule_key: "class_reminder",
    name: "Class reminder",
    description: "Queue a same-day class reminder for students in scheduled classrooms.",
    channel: "telegram",
    threshold: 0,
  },
  {
    rule_key: "attendance_follow_up",
    name: "Attendance follow-up",
    description: "Queue a follow-up when a student has repeated absences in the last 14 days.",
    channel: "telegram",
    threshold: 2,
  },
  {
    rule_key: "at_risk_scan",
    name: "At-risk scan",
    description: "Create alerts when attendance or missing work indicates a student needs intervention.",
    channel: "inapp",
    threshold: 70,
  },
  {
    rule_key: "trial_conversion_follow_up",
    name: "Trial conversion follow-up",
    description: "Create an action item for trial students who have not converted yet.",
    channel: "inapp",
    threshold: 7,
  },
  {
    rule_key: "course_completion_certificate",
    name: "Certificate readiness",
    description: "Create an action item when a student is ready for a certificate or next course.",
    channel: "inapp",
    threshold: 80,
  },
];

const priorityWeight = (priority: string): number => {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "medium") return 2;
  return 3;
};

const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);
const addDays = (value: Date, days: number): Date => new Date(value.getTime() + days * 86400000);

const safeNumber = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const ensureDefaultAutomationRules = async (
  sb: SupabaseClientLike,
  academyId: string,
  userId: string | null = null,
): Promise<void> => {
  const rows = defaultAutomationRules.map((rule) => ({
    academy_id: academyId,
    rule_key: rule.rule_key,
    name: rule.name,
    description: rule.description,
    channel: rule.channel,
    threshold: rule.threshold,
    is_active: true,
    metadata: { system_default: true },
    created_by: userId,
  }));
  await sb.from("academy_automation_rules").upsert(rows, {
    onConflict: "academy_id,rule_key",
    ignoreDuplicates: true,
  });
};

const loadEducationAutomationRules = async (
  sb: SupabaseClientLike,
  academyId: string,
  userId: string | null = null,
): Promise<Array<Record<string, unknown>>> => {
  await ensureDefaultAutomationRules(sb, academyId, userId);
  const { data, error } = await sb.from("academy_automation_rules")
    .select("id, academy_id, rule_key, name, description, channel, threshold, is_active, metadata, last_run_at, last_run_summary, created_at, updated_at")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load automation rules: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
};

const ruleIsActive = (rules: Array<Record<string, unknown>>, key: string): boolean => {
  const rule = rules.find((item) => String(item.rule_key) === key);
  return !rule || rule.is_active !== false;
};

const ruleChannel = (rules: Array<Record<string, unknown>>, key: string, fallback = "telegram"): string => {
  const rule = rules.find((item) => String(item.rule_key) === key);
  return normalizeText(rule?.channel, 20) || fallback;
};

const ruleThreshold = (rules: Array<Record<string, unknown>>, key: string, fallback: number): number => {
  const rule = rules.find((item) => String(item.rule_key) === key);
  const value = safeNumber(rule?.threshold);
  return value === null ? fallback : value;
};

const syncEducationActionItems = async (
  sb: SupabaseClientLike,
  academyId: string,
  candidates: EducationActionCandidate[],
  options: { resolveStale?: boolean } = {},
): Promise<Array<Record<string, unknown>>> => {
  const resolveStale = options.resolveStale !== false;
  const activeKeys = new Set(candidates.map((item) => item.dedupe_key));
  const existingByKey = new Map<string, Record<string, unknown>>();

  if (activeKeys.size > 0) {
    const { data: existing } = await sb.from("academy_action_items")
      .select("id, dedupe_key, status")
      .eq("academy_id", academyId)
      .in("dedupe_key", Array.from(activeKeys))
      .limit(1000);
    for (const item of (existing ?? []) as Array<Record<string, unknown>>) {
      existingByKey.set(String(item.dedupe_key), item);
    }
  }

  for (const candidate of candidates.slice(0, 200)) {
    const existing = existingByKey.get(candidate.dedupe_key);
    if (existing && ["resolved", "dismissed"].includes(String(existing.status))) continue;
    const payload = {
      academy_id: academyId,
      dedupe_key: candidate.dedupe_key,
      source_type: candidate.source_type,
      priority: candidate.priority,
      title: candidate.title,
      description: candidate.description,
      recommended_action: candidate.recommended_action,
      contact_id: candidate.contact_id ?? null,
      classroom_id: candidate.classroom_id ?? null,
      due_at: candidate.due_at ?? null,
      status: "open",
      metadata: candidate.metadata ?? {},
    };
    if (existing?.id) {
      await sb.from("academy_action_items").update(payload).eq("academy_id", academyId).eq("id", String(existing.id));
    } else {
      await sb.from("academy_action_items").insert(payload);
    }
  }

  if (resolveStale) {
    const { data: stale } = await sb.from("academy_action_items")
      .select("id, dedupe_key")
      .eq("academy_id", academyId)
      .eq("status", "open")
      .in("source_type", generatedEducationActionSources)
      .limit(1000);
    const staleIds = ((stale ?? []) as Array<Record<string, unknown>>)
      .filter((item) => !activeKeys.has(String(item.dedupe_key)))
      .map((item) => String(item.id));
    if (staleIds.length > 0) {
      await sb.from("academy_action_items")
        .update({ status: "resolved", resolved_at: new Date().toISOString(), resolution_note: "Auto-resolved because the underlying condition cleared." })
        .eq("academy_id", academyId)
        .in("id", staleIds);
    }
  }

  const { data, error } = await sb.from("academy_action_items")
    .select("id, academy_id, dedupe_key, source_type, priority, title, description, recommended_action, contact_id, classroom_id, due_at, status, metadata, created_at, updated_at")
    .eq("academy_id", academyId)
    .in("status", ["open", "snoozed"])
    .limit(300);
  if (error) throw new Error(`Failed to load action queue: ${error.message}`);

  return ((data ?? []) as Array<Record<string, unknown>>).sort((a, b) => {
    const byPriority = priorityWeight(String(a.priority)) - priorityWeight(String(b.priority));
    if (byPriority !== 0) return byPriority;
    return String(a.due_at ?? a.created_at ?? "").localeCompare(String(b.due_at ?? b.created_at ?? ""));
  });
};

const loadAcademyParentCenterId = async (
  sb: SupabaseClientLike,
  academyId: string,
  access: MembershipRow,
): Promise<string | null> => {
  const delegatedCenterId = normalizeText(access.center_tenant_id, 64);
  if (delegatedCenterId) return delegatedCenterId;
  const { data, error } = await sb
    .from("tenants")
    .select("metadata")
    .eq("id", academyId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load academy center link: ${error.message}`);
  const metadata = toJsonObject((data as Record<string, unknown> | null)?.metadata);
  return normalizeText(metadata.parent_center_id, 64) || null;
};

const loadCenterVoucherExamResults = async (
  sb: SupabaseClientLike,
  centerTenantId: string,
): Promise<Array<Record<string, unknown>>> => {
  const { data, error } = await sb
    .from("exam_registrations")
    .select(
      "id, token_id, status, created_at, first_name, last_name, legal_name, email, phone, session_id, experiences ( name ), exam_tokens ( token_code ), sessions!exam_registrations_session_id_fkey ( status )",
    )
    .eq("tenant_id", centerTenantId)
    .order("created_at", { ascending: false })
    .limit(20000);
  if (error) throw new Error(`Failed to load center voucher exam results: ${error.message}`);

  const rows = (data ?? []) as Array<Record<string, any>>;
  const sessionIds = Array.from(new Set(rows.map((row) => normalizeText(row.session_id, 64)).filter(Boolean)));
  const evalMap = new Map<string, Record<string, unknown>>();
  if (sessionIds.length > 0) {
    const { data: evalRows, error: evalError } = await sb
      .from("evaluations")
      .select("session_id, method, status, result")
      .in("session_id", sessionIds);
    if (evalError) throw new Error(`Failed to load center voucher evaluations: ${evalError.message}`);
    for (const row of (evalRows ?? []) as Array<Record<string, unknown>>) {
      const sessionId = normalizeText(row.session_id, 64);
      if (!sessionId) continue;
      const existing = evalMap.get(sessionId);
      if (!existing || row.method === "auto") evalMap.set(sessionId, row);
    }
  }

  return rows.map((row) => {
    const evaluation = evalMap.get(normalizeText(row.session_id, 64)) ?? null;
    const result = toJsonObject(evaluation?.result);
    const overallScore = result.overall_score ?? null;
    return {
      id: row.id,
      token_id: row.token_id,
      token_code: row.exam_tokens?.token_code ?? null,
      experience_name: row.experiences?.name ?? null,
      candidate_name: row.legal_name || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
      email: row.email,
      phone: row.phone,
      session_id: row.session_id,
      session_status: row.sessions?.status ?? null,
      registration_status: row.status,
      overall_score: overallScore,
      overall_band: result.overall_band ?? overallScore,
      listening_score: result.listening_score ?? result.listening_band ?? null,
      reading_score: result.reading_score ?? result.reading_band ?? null,
      writing_score: result.writing_score ?? result.writing_band ?? null,
      speaking_score: result.speaking_score ?? result.speaking_band ?? null,
      weak_areas: Array.isArray(result.weak_areas) ? result.weak_areas : [],
      created_at: row.created_at,
    };
  });
};

const buildCenterVoucherHeatmaps = (
  results: Array<Record<string, unknown>>,
  vouchers: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> => {
  const voucherByCode = new Map<string, Record<string, unknown>>();
  for (const voucher of vouchers) {
    const code = normalizeText(voucher.code, 120).toUpperCase();
    if (code) voucherByCode.set(code, voucher);
  }

  const metrics = [
    ["listening", "Listening", "listening_score"],
    ["reading", "Reading", "reading_score"],
    ["writing", "Writing", "writing_score"],
    ["speaking", "Speaking", "speaking_score"],
  ] as const;
  const groups = new Map<string, Record<string, any>>();

  for (const result of results) {
    const code = normalizeText(result.token_code, 120).toUpperCase();
    const voucher = voucherByCode.get(code);
    if (!voucher) continue;
    const classroomId = normalizeText(voucher.classroom_id, 64);
    if (!classroomId) continue;
    const classroom = relatedClassroom(voucher);
    const classroomName = normalizeText(classroom?.name, 180) || "Assigned classroom";
    const heatmap = groups.get(classroomId) ?? {
      classroom_id: classroomId,
      classroom_name: classroomName,
      attempts: 0,
      completed_attempts: 0,
      average_score: null,
      skills: metrics.map(([id, label]) => ({ id, label, average_score: null, attempts: 0 })),
      weakest_subskill: null,
      systemic_gaps: [],
      focus_areas: [],
      __scores: [],
      __weak: {},
    };

    heatmap.attempts += 1;
    if (normalizeText(result.registration_status ?? result.session_status, 40).toLowerCase() === "completed") heatmap.completed_attempts += 1;
    const overall = Number(result.overall_band ?? result.overall_score ?? NaN);
    if (Number.isFinite(overall)) heatmap.__scores.push(overall);

    heatmap.skills = heatmap.skills.map((skill: Record<string, any>) => {
      const metric = metrics.find(([id]) => id === skill.id);
      const value = metric ? Number(result[metric[2]] ?? NaN) : NaN;
      const scores = Array.isArray(skill.__scores) ? skill.__scores : [];
      if (Number.isFinite(value)) scores.push(value);
      return { ...skill, __scores: scores };
    });

    const weakAreas = Array.isArray(result.weak_areas) ? result.weak_areas : [];
    for (const area of weakAreas) {
      const label = weakAreaLabel(area);
      if (!label) continue;
      heatmap.__weak[label] = Number(heatmap.__weak[label] ?? 0) + 1;
    }
    groups.set(classroomId, heatmap);
  }

  return Array.from(groups.values()).map((heatmap) => {
    const scores = Array.isArray(heatmap.__scores) ? heatmap.__scores : [];
    const weakEntries = Object.entries(heatmap.__weak ?? {})
      .map(([label, count]) => ({ label, count: Number(count), share: heatmap.attempts ? Number(count) / heatmap.attempts : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return {
      classroom_id: heatmap.classroom_id,
      classroom_name: heatmap.classroom_name,
      attempts: heatmap.attempts,
      completed_attempts: heatmap.completed_attempts,
      average_score: scores.length ? Math.round((scores.reduce((sum: number, value: number) => sum + value, 0) / scores.length) * 10) / 10 : null,
      skills: heatmap.skills.map((skill: Record<string, any>) => {
        const skillScores = Array.isArray(skill.__scores) ? skill.__scores : [];
        return {
          id: skill.id,
          label: skill.label,
          average_score: skillScores.length ? Math.round((skillScores.reduce((sum: number, value: number) => sum + value, 0) / skillScores.length) * 10) / 10 : null,
          attempts: skillScores.length,
        };
      }),
      weakest_subskill: weakEntries[0]?.label ?? null,
      systemic_gaps: weakEntries.filter((entry) => entry.share >= 0.35 || entry.count >= 3),
      focus_areas: weakEntries.slice(0, 3).map((entry) => entry.label),
    };
  }).sort((a, b) => Number(b.attempts) - Number(a.attempts));
};

const loadAcademyCenterVoucherHeatmaps = async (
  sb: SupabaseClientLike,
  academyId: string,
  centerTenantId: string | null,
  classroomIds: string[],
): Promise<Array<Record<string, unknown>>> => {
  if (!centerTenantId || classroomIds.length === 0) return [];
  const { data: vouchers, error: voucherError } = await sb
    .from("partner_vouchers")
    .select("id, code, status, classroom_id, academy_classrooms ( id, name, academy_id )")
    .eq("tenant_id", centerTenantId)
    .in("classroom_id", classroomIds)
    .limit(10000);
  if (voucherError) throw new Error(`Failed to load center vouchers for academy heatmap: ${voucherError.message}`);
  const voucherRows = ((vouchers ?? []) as Array<Record<string, unknown>>)
    .filter((voucher) => normalizeText(relatedClassroom(voucher)?.academy_id, 64) === academyId);
  if (voucherRows.length === 0) return [];
  const results = await loadCenterVoucherExamResults(sb, centerTenantId);
  return buildCenterVoucherHeatmaps(results, voucherRows);
};

type AcademyLessonPlanDraft = {
  title: string;
  evidence_summary: string[];
  objectives: string[];
  sequence: Array<{
    minutes: number;
    phase: string;
    teacher_moves: string;
    student_output: string;
    evidence_link: string;
  }>;
  grouping: string[];
  homework: string[];
  follow_up_checks: string[];
  teacher_notes: string[];
};

type AcademyLessonPlanContext = {
  classroom: {
    id: string;
    name: string;
    description: string | null;
    student_count: number;
    is_active: boolean;
  };
  lms: {
    average_score: number | null;
    graded_submissions: number;
    submitted_submissions: number;
    missing_assignments: number;
    attendance_rate: number | null;
    recent_absences: number;
    assignments: Array<Record<string, unknown>>;
    open_alerts: Array<Record<string, unknown>>;
    schedule: Array<Record<string, unknown>>;
  };
  center_voucher_heatmap: Record<string, unknown> | null;
  focus_areas: string[];
};

const averageRounded = (values: number[]): number | null => {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return null;
  return Math.round((clean.reduce((sum, value) => sum + value, 0) / clean.length) * 10) / 10;
};

const lessonTextList = (value: unknown, fallback: string[], max = 8): string[] => {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => normalizeText(item, 320))
    .filter((item) => item.length > 0)
    .slice(0, max);
  return items.length > 0 ? items : fallback;
};

const lessonSequence = (
  value: unknown,
  fallback: AcademyLessonPlanDraft["sequence"],
): AcademyLessonPlanDraft["sequence"] => {
  if (!Array.isArray(value)) return fallback;
  const rows = value
    .map((item) => {
      const row = isJsonObject(item) ? item : {};
      const minutes = Math.max(5, Math.min(45, toIntOrNull(row.minutes) ?? 10));
      return {
        minutes,
        phase: normalizeText(row.phase, 120),
        teacher_moves: normalizeText(row.teacher_moves, 500),
        student_output: normalizeText(row.student_output, 500),
        evidence_link: normalizeText(row.evidence_link, 280),
      };
    })
    .filter((row) => row.phase && row.teacher_moves && row.student_output)
    .slice(0, 8);
  return rows.length > 0 ? rows : fallback;
};

const buildFallbackAcademyLessonPlanDraft = (context: AcademyLessonPlanContext): AcademyLessonPlanDraft => {
  const focusAreas = context.focus_areas.length > 0 ? context.focus_areas : ["attendance consistency", "assignment completion", "error correction"];
  const primary = focusAreas[0] ?? "classroom performance";
  const secondary = focusAreas[1] ?? "independent practice";
  const attendance = context.lms.attendance_rate === null ? "not enough attendance data" : `${context.lms.attendance_rate}% recent attendance`;
  const score = context.lms.average_score === null ? "not enough graded submissions" : `${context.lms.average_score}% average LMS score`;
  const voucherAverage = context.center_voucher_heatmap?.average_score ?? null;

  return {
    title: `${context.classroom.name} intervention plan`,
    evidence_summary: [
      `${context.classroom.student_count} enrolled learner${context.classroom.student_count === 1 ? "" : "s"} in this classroom.`,
      `LMS signal: ${score}; ${attendance}; ${context.lms.missing_assignments} missing assignment${context.lms.missing_assignments === 1 ? "" : "s"}.`,
      voucherAverage === null || typeof voucherAverage === "undefined"
        ? "Center voucher mock signal: no linked completed mock evidence yet."
        : `Center voucher mock signal: ${voucherAverage} average with weakest area ${context.center_voucher_heatmap?.weakest_subskill ?? "not enough data"}.`,
    ],
    objectives: [
      `Repair the highest-frequency weakness: ${primary}.`,
      `Make students explain their correction process for ${secondary}.`,
      "Leave class with one measurable follow-up task for each learner.",
    ],
    sequence: [
      {
        minutes: 10,
        phase: "Evidence warm-up",
        teacher_moves: `Show anonymized patterns from ${primary} and ask students to identify the mistake trigger.`,
        student_output: "Each student writes one rule and one example correction.",
        evidence_link: "Uses classroom heatmap, missing work, and recent score trends.",
      },
      {
        minutes: 20,
        phase: "Guided repair",
        teacher_moves: `Model two worked examples for ${primary}; pause after each step for students to predict the next move.`,
        student_output: "Pairs annotate the exact clue, distractor, or rubric requirement.",
        evidence_link: "Targets the weakest repeated skill instead of reteaching the whole unit.",
      },
      {
        minutes: 20,
        phase: "Controlled practice",
        teacher_moves: `Run a short set focused on ${primary} and ${secondary}; collect answers before revealing feedback.`,
        student_output: "Students submit answers plus a one-sentence reason for each choice.",
        evidence_link: "Produces a checkable artifact for the next gradebook or mock review.",
      },
      {
        minutes: 10,
        phase: "Exit ticket",
        teacher_moves: "Sort exit tickets into ready, needs reteach, and absent/missing-work follow-up groups.",
        student_output: "One corrected answer, one rule, and one personal homework target.",
        evidence_link: "Creates the next action queue for follow-up.",
      },
    ],
    grouping: [
      "Put students with missing work beside a student who submitted the same task successfully.",
      "Keep low-attendance students in the teacher-check group for the first practice cycle.",
    ],
    homework: [
      `Assign a focused worksheet on ${primary}.`,
      "Require one written correction note per missed item.",
      "Re-test the same focus within 7 days and compare the new result to this heatmap.",
    ],
    follow_up_checks: [
      "Record attendance and exit-ticket completion after class.",
      "Grade the short practice artifact before the next session.",
      "If the same weakness remains above 35% of attempts, schedule another repair block.",
    ],
    teacher_notes: [
      "Use anonymized examples only; do not put individual student results on the board.",
      "Treat the plan as a class intervention, then adapt support for individual learners from the gradebook.",
    ],
  };
};

const normalizeAcademyLessonPlanDraft = (
  value: unknown,
  fallback: AcademyLessonPlanDraft,
): AcademyLessonPlanDraft => {
  const raw = isJsonObject(value) ? value : {};
  return {
    title: normalizeText(raw.title, 180) || fallback.title,
    evidence_summary: lessonTextList(raw.evidence_summary, fallback.evidence_summary, 6),
    objectives: lessonTextList(raw.objectives, fallback.objectives, 6),
    sequence: lessonSequence(raw.sequence, fallback.sequence),
    grouping: lessonTextList(raw.grouping, fallback.grouping, 6),
    homework: lessonTextList(raw.homework, fallback.homework, 6),
    follow_up_checks: lessonTextList(raw.follow_up_checks, fallback.follow_up_checks, 6),
    teacher_notes: lessonTextList(raw.teacher_notes, fallback.teacher_notes, 6),
  };
};

const renderAcademyLessonPlanMarkdown = (
  context: AcademyLessonPlanContext,
  draft: AcademyLessonPlanDraft,
  aiStatus: AIStatus,
): string => {
  const lines: string[] = [
    `# ${draft.title}`,
    "",
    `Generated from Academy LMS data${context.center_voucher_heatmap ? " and linked center voucher mock evidence" : ""}. AI status: ${aiStatus}.`,
    "",
    "## Evidence used",
    ...draft.evidence_summary.map((item) => `- ${item}`),
    "",
    "## Objectives",
    ...draft.objectives.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Classroom sequence",
  ];

  for (const item of draft.sequence) {
    lines.push(
      "",
      `### ${item.minutes} min - ${item.phase}`,
      `Teacher: ${item.teacher_moves}`,
      `Students: ${item.student_output}`,
      `Evidence link: ${item.evidence_link}`,
    );
  }

  lines.push(
    "",
    "## Grouping",
    ...draft.grouping.map((item) => `- ${item}`),
    "",
    "## Homework",
    ...draft.homework.map((item) => `- ${item}`),
    "",
    "## Follow-up checks",
    ...draft.follow_up_checks.map((item) => `- ${item}`),
    "",
    "## Teacher notes",
    ...draft.teacher_notes.map((item) => `- ${item}`),
  );

  return lines.join("\n");
};

const loadAcademyClassroomLessonContext = async (
  sb: SupabaseClientLike,
  academyId: string,
  classroomId: string,
  centerTenantId: string | null,
): Promise<AcademyLessonPlanContext | null> => {
  const since45 = dateOnly(addDays(new Date(), -45));
  const [
    classroomRes,
    membersRes,
    assignmentsRes,
    submissionsRes,
    attendanceRes,
    schedulesRes,
    alertsRes,
  ] = await Promise.all([
    sb.from("academy_classrooms")
      .select("id, name, description, is_active, metadata")
      .eq("academy_id", academyId)
      .eq("id", classroomId)
      .maybeSingle(),
    sb.from("academy_classroom_memberships")
      .select("contact_id, role, academy_contacts!academy_memberships_contact_tenant_fk(id, first_name, last_name, status, placement_level, placement_score, lifecycle_stage)")
      .eq("academy_id", academyId)
      .eq("classroom_id", classroomId)
      .in("role", ["student", "observer"])
      .limit(5000),
    sb.from("academy_assignments")
      .select("id, title, assignment_type, due_at, max_score, score_weight, status, created_at")
      .eq("academy_id", academyId)
      .eq("classroom_id", classroomId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(500),
    sb.from("academy_submissions")
      .select("id, assignment_id, contact_id, score, max_score, status, submitted_at, graded_at, notes")
      .eq("academy_id", academyId)
      .eq("classroom_id", classroomId)
      .limit(20000),
    sb.from("academy_attendance")
      .select("contact_id, status, session_date, notes")
      .eq("academy_id", academyId)
      .eq("classroom_id", classroomId)
      .gte("session_date", since45)
      .limit(20000),
    sb.from("academy_classroom_schedules")
      .select("day_of_week, start_time, end_time, timezone, label, is_active")
      .eq("academy_id", academyId)
      .eq("classroom_id", classroomId)
      .eq("is_active", true)
      .order("day_of_week", { ascending: true })
      .limit(20),
    sb.from("academy_alerts")
      .select("id, contact_id, type, severity, message, metadata, created_at")
      .eq("academy_id", academyId)
      .eq("resolved", false)
      .limit(1000),
  ]);

  for (const result of [classroomRes, membersRes, assignmentsRes, submissionsRes, attendanceRes, schedulesRes, alertsRes]) {
    if (result.error) throw new Error(`Failed to load lesson-plan context: ${result.error.message}`);
  }

  const classroom = classroomRes.data as Record<string, unknown> | null;
  if (!classroom?.id) return null;

  const members = (membersRes.data ?? []) as Array<Record<string, unknown>>;
  const assignments = (assignmentsRes.data ?? []) as Array<Record<string, unknown>>;
  const submissions = (submissionsRes.data ?? []) as Array<Record<string, unknown>>;
  const attendance = (attendanceRes.data ?? []) as Array<Record<string, unknown>>;
  const schedules = (schedulesRes.data ?? []) as Array<Record<string, unknown>>;
  const alerts = (alertsRes.data ?? []) as Array<Record<string, unknown>>;
  const contactIds = new Set(members.map((member) => normalizeText(member.contact_id, 64)).filter(Boolean));

  const submissionsByAssignment = new Map<string, Array<Record<string, unknown>>>();
  const submissionKeys = new Set<string>();
  for (const submission of submissions) {
    const assignmentId = normalizeText(submission.assignment_id, 64);
    const contactId = normalizeText(submission.contact_id, 64);
    if (assignmentId) {
      if (!submissionsByAssignment.has(assignmentId)) submissionsByAssignment.set(assignmentId, []);
      submissionsByAssignment.get(assignmentId)!.push(submission);
    }
    if (assignmentId && contactId && String(submission.status ?? "") !== "missing") {
      submissionKeys.add(`${assignmentId}__${contactId}`);
    }
  }

  const nowIso = new Date().toISOString();
  let missingAssignments = 0;
  const assignmentSignals = assignments.map((assignment) => {
    const assignmentId = normalizeText(assignment.id, 64);
    const rows = submissionsByAssignment.get(assignmentId) ?? [];
    const scored = rows
      .map((row) => {
        const score = safeNumber(row.score);
        const maxScore = safeNumber(row.max_score) ?? safeNumber(assignment.max_score) ?? 100;
        if (score === null || !maxScore) return null;
        return Math.max(0, Math.min(100, (score / maxScore) * 100));
      })
      .filter((value): value is number => value !== null);
    const dueAt = normalizeText(assignment.due_at, 80);
    let missing = 0;
    if (dueAt && dueAt < nowIso) {
      for (const contactId of contactIds) {
        if (!submissionKeys.has(`${assignmentId}__${contactId}`)) missing++;
      }
      missingAssignments += missing;
    }
    return {
      id: assignmentId,
      title: normalizeText(assignment.title, 160),
      type: normalizeText(assignment.assignment_type, 60),
      due_at: dueAt || null,
      status: normalizeText(assignment.status, 40),
      graded_count: scored.length,
      average_score: averageRounded(scored),
      missing_count: missing,
    };
  })
    .sort((a, b) => {
      const aScore = typeof a.average_score === "number" ? a.average_score : 101;
      const bScore = typeof b.average_score === "number" ? b.average_score : 101;
      if (a.missing_count !== b.missing_count) return b.missing_count - a.missing_count;
      return aScore - bScore;
    })
    .slice(0, 12);

  const scoreValues = submissions
    .map((row) => {
      const score = safeNumber(row.score);
      const maxScore = safeNumber(row.max_score) ?? 100;
      if (score === null || !maxScore) return null;
      return Math.max(0, Math.min(100, (score / maxScore) * 100));
    })
    .filter((value): value is number => value !== null);

  const present = attendance.filter((record) => ["present", "late"].includes(String(record.status))).length;
  const attendanceRate = attendance.length > 0 ? Math.round((present / attendance.length) * 100) : null;
  const since14 = dateOnly(addDays(new Date(), -14));
  const recentAbsences = attendance.filter((record) => String(record.session_date ?? "") >= since14 && String(record.status) === "absent").length;
  const classroomAlerts = alerts
    .filter((alert) => {
      const metadata = toJsonObject(alert.metadata);
      const alertClassroomId = normalizeText(metadata.classroom_id, 64);
      const contactId = normalizeText(alert.contact_id, 64);
      return alertClassroomId === classroomId || (contactId && contactIds.has(contactId));
    })
    .slice(0, 12)
    .map((alert) => ({
      type: normalizeText(alert.type, 80),
      severity: normalizeText(alert.severity, 40),
      message: normalizeText(alert.message, 240),
      created_at: normalizeText(alert.created_at, 80),
    }));

  const centerHeatmaps = await loadAcademyCenterVoucherHeatmaps(sb, academyId, centerTenantId, [classroomId]);
  const centerVoucherHeatmap = centerHeatmaps[0] ?? null;
  const voucherFocus = centerVoucherHeatmap ? toStringArray(centerVoucherHeatmap.focus_areas) : [];
  const assignmentFocus = assignmentSignals
    .filter((item) => item.missing_count > 0 || (typeof item.average_score === "number" && item.average_score < 75))
    .map((item) => item.title || item.type || "assignment performance")
    .filter(Boolean)
    .slice(0, 3);
  const focusAreas = Array.from(new Set([
    ...voucherFocus,
    ...assignmentFocus,
    attendanceRate !== null && attendanceRate < 75 ? "attendance consistency" : "",
    missingAssignments > 0 ? "missing assignment recovery" : "",
  ].filter(Boolean))).slice(0, 6);

  return {
    classroom: {
      id: classroomId,
      name: normalizeText(classroom.name, 180) || "Classroom",
      description: normalizeText(classroom.description, 500) || null,
      student_count: contactIds.size,
      is_active: classroom.is_active !== false,
    },
    lms: {
      average_score: averageRounded(scoreValues),
      graded_submissions: scoreValues.length,
      submitted_submissions: submissions.filter((row) => ["submitted", "resubmitted", "late", "graded", "returned"].includes(String(row.status))).length,
      missing_assignments: missingAssignments,
      attendance_rate: attendanceRate,
      recent_absences: recentAbsences,
      assignments: assignmentSignals,
      open_alerts: classroomAlerts,
      schedule: schedules.map((slot) => ({
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
        timezone: slot.timezone,
        label: slot.label,
      })),
    },
    center_voucher_heatmap: centerVoucherHeatmap,
    focus_areas: focusAreas,
  };
};

const generateAcademyClassroomLessonPlan = async (
  context: AcademyLessonPlanContext,
): Promise<{
  ai_status: AIStatus;
  ai_error: string | null;
  plan: AcademyLessonPlanDraft;
  lesson_plan: string;
}> => {
  const fallback = buildFallbackAcademyLessonPlanDraft(context);
  const ai = await callOpenRouterJsonWithStatus<AcademyLessonPlanDraft>({
    temperature: 0.25,
    systemPrompt: [
      "You are Schood Education OS, helping an English or test-prep teacher plan a real class.",
      "Use only the evidence in the payload. Do not invent student names or private details.",
      "Create a practical teacher-ready plan for a 60 to 90 minute lesson.",
      "Return strict JSON with keys: title, evidence_summary, objectives, sequence, grouping, homework, follow_up_checks, teacher_notes.",
      "sequence must be an array of objects with minutes, phase, teacher_moves, student_output, evidence_link.",
    ].join(" "),
    userPayload: JSON.stringify({
      classroom: context.classroom,
      lms_signals: context.lms,
      center_voucher_heatmap: context.center_voucher_heatmap,
      focus_areas: context.focus_areas,
      output_constraints: {
        language: "English",
        avoid_private_student_data: true,
        make_actions_specific: true,
        include_follow_up_measurement: true,
      },
    }),
  }, fallback);
  let aiStatus = ai.status;
  let aiError = ai.error ?? null;
  const plan = normalizeAcademyLessonPlanDraft(ai.data, fallback);
  if (ai.status === "ok" && plan.sequence.length === 0) {
    aiStatus = "failed";
    aiError = "ai_invalid_lesson_plan";
  }
  return {
    ai_status: aiStatus,
    ai_error: aiStatus === "failed" ? aiError : null,
    plan,
    lesson_plan: renderAcademyLessonPlanMarkdown(context, plan, aiStatus),
  };
};

const buildEducationOS = async (
  sb: SupabaseClientLike,
  academyId: string,
  userId: string | null = null,
  syncOptions: EducationActionSyncOptions = {},
): Promise<Record<string, unknown>> => {
  const now = new Date();
  const today = dateOnly(now);
  const since30 = dateOnly(addDays(now, -30));
  const since14 = dateOnly(addDays(now, -14));
  const in14 = addDays(now, 14).toISOString();
  const in30 = addDays(now, 30).toISOString();
  const rules = await loadEducationAutomationRules(sb, academyId, userId);

  const [
    contactsRes,
    classroomsRes,
    membersRes,
    assignmentsRes,
    submissionsRes,
    attendanceRes,
    schedulesRes,
    paymentsRes,
    entitlementsRes,
    alertsRes,
    notificationsRes,
  ] = await Promise.all([
    sb.from("academy_contacts").select("id, first_name, last_name, email, phone, telegram_id, status, last_activity_at, placement_level, placement_score, lifecycle_stage, notify_enabled, metadata, created_at").eq("academy_id", academyId).limit(10000),
    sb.from("academy_classrooms").select("id, name, is_active, metadata").eq("academy_id", academyId).limit(1000),
    sb.from("academy_classroom_memberships").select("classroom_id, contact_id, role, joined_at").eq("academy_id", academyId).in("role", ["student", "observer"]).limit(20000),
    sb.from("academy_assignments").select("id, classroom_id, title, assignment_type, due_at, max_score, score_weight, status").eq("academy_id", academyId).neq("status", "archived").limit(5000),
    sb.from("academy_submissions").select("id, assignment_id, classroom_id, contact_id, score, max_score, status, submitted_at, graded_at").eq("academy_id", academyId).limit(50000),
    sb.from("academy_attendance").select("id, classroom_id, contact_id, session_date, status").eq("academy_id", academyId).gte("session_date", since30).limit(50000),
    sb.from("academy_classroom_schedules").select("id, classroom_id, day_of_week, start_time, end_time, timezone, label, is_active").eq("academy_id", academyId).eq("is_active", true).limit(1000),
    sb.from("academy_payments").select("id, contact_id, amount, currency, status, created_at").eq("academy_id", academyId).limit(20000),
    sb.from("academy_entitlements").select("id, contact_id, resource_type, resource_id, status, expires_at").eq("academy_id", academyId).eq("status", "active").limit(20000),
    sb.from("academy_alerts").select("id, contact_id, type, severity, message, resolved, metadata, created_at").eq("academy_id", academyId).eq("resolved", false).limit(1000),
    sb.from("academy_notifications").select("id, contact_id, channel, type, title, body, status, scheduled_at, metadata").eq("academy_id", academyId).order("scheduled_at", { ascending: true }).limit(500),
  ]);

  for (const result of [contactsRes, classroomsRes, membersRes, assignmentsRes, submissionsRes, attendanceRes, schedulesRes, paymentsRes, entitlementsRes, alertsRes, notificationsRes]) {
    if (result.error) throw new Error(`Failed to build Education OS: ${result.error.message}`);
  }

  const contacts = (contactsRes.data ?? []) as Array<Record<string, unknown>>;
  const classrooms = (classroomsRes.data ?? []) as Array<Record<string, unknown>>;
  const members = (membersRes.data ?? []) as Array<Record<string, unknown>>;
  const assignments = (assignmentsRes.data ?? []) as Array<Record<string, unknown>>;
  const submissions = (submissionsRes.data ?? []) as Array<Record<string, unknown>>;
  const attendance = (attendanceRes.data ?? []) as Array<Record<string, unknown>>;
  const schedules = (schedulesRes.data ?? []) as Array<Record<string, unknown>>;
  const payments = (paymentsRes.data ?? []) as Array<Record<string, unknown>>;
  const entitlements = (entitlementsRes.data ?? []) as Array<Record<string, unknown>>;
  const alerts = (alertsRes.data ?? []) as Array<Record<string, unknown>>;
  const notifications = (notificationsRes.data ?? []) as Array<Record<string, unknown>>;

  const contactById = new Map(contacts.map((contact) => [String(contact.id), contact]));
  const classroomById = new Map(classrooms.map((classroom) => [String(classroom.id), classroom]));
  const membersByContact = new Map<string, Array<Record<string, unknown>>>();
  const membersByClassroom = new Map<string, Array<Record<string, unknown>>>();
  for (const member of members) {
    const contactId = String(member.contact_id ?? "");
    const classroomId = String(member.classroom_id ?? "");
    if (!contactId || !classroomId) continue;
    if (!membersByContact.has(contactId)) membersByContact.set(contactId, []);
    if (!membersByClassroom.has(classroomId)) membersByClassroom.set(classroomId, []);
    membersByContact.get(contactId)!.push(member);
    membersByClassroom.get(classroomId)!.push(member);
  }

  const assignmentsByClassroom = new Map<string, Array<Record<string, unknown>>>();
  for (const assignment of assignments) {
    const classroomId = String(assignment.classroom_id ?? "");
    if (!classroomId) continue;
    if (!assignmentsByClassroom.has(classroomId)) assignmentsByClassroom.set(classroomId, []);
    assignmentsByClassroom.get(classroomId)!.push(assignment);
  }

  const submissionByKey = new Map<string, Record<string, unknown>>();
  for (const submission of submissions) {
    submissionByKey.set(`${String(submission.assignment_id)}__${String(submission.contact_id)}`, submission);
  }

  const attendanceByContact = new Map<string, Array<Record<string, unknown>>>();
  const attendanceByClassDate = new Map<string, Array<Record<string, unknown>>>();
  for (const record of attendance) {
    const contactId = String(record.contact_id ?? "");
    const classDate = `${String(record.classroom_id)}__${String(record.session_date)}`;
    if (!attendanceByContact.has(contactId)) attendanceByContact.set(contactId, []);
    attendanceByContact.get(contactId)!.push(record);
    if (!attendanceByClassDate.has(classDate)) attendanceByClassDate.set(classDate, []);
    attendanceByClassDate.get(classDate)!.push(record);
  }

  const openAlertsByContact = new Map<string, Array<Record<string, unknown>>>();
  for (const alert of alerts) {
    const contactId = String(alert.contact_id ?? "");
    if (!contactId) continue;
    if (!openAlertsByContact.has(contactId)) openAlertsByContact.set(contactId, []);
    openAlertsByContact.get(contactId)!.push(alert);
  }

  const pendingPaymentsByContact = new Map<string, Array<Record<string, unknown>>>();
  for (const payment of payments.filter((payment) => String(payment.status) === "pending")) {
    const contactId = String(payment.contact_id ?? "");
    if (!pendingPaymentsByContact.has(contactId)) pendingPaymentsByContact.set(contactId, []);
    pendingPaymentsByContact.get(contactId)!.push(payment);
  }

  const expiringEntitlementsByContact = new Map<string, Array<Record<string, unknown>>>();
  for (const entitlement of entitlements) {
    const expiresAt = String(entitlement.expires_at ?? "");
    if (!expiresAt || expiresAt > in14) continue;
    const contactId = String(entitlement.contact_id ?? "");
    if (!expiringEntitlementsByContact.has(contactId)) expiringEntitlementsByContact.set(contactId, []);
    expiringEntitlementsByContact.get(contactId)!.push(entitlement);
  }

  const pipeline: EducationPipelineRow[] = [];
  const certificateCandidates: EducationPipelineRow[] = [];
  const missingAssignmentCandidates: EducationActionCandidate[] = [];
  const gradingCandidates: EducationActionCandidate[] = [];
  const pipelineCounts: Record<string, number> = { lead: 0, placement: 0, enrolled: 0, learning: 0, attention: 0, renewal: 0, completion: 0 };

  for (const contact of contacts) {
    const contactId = String(contact.id ?? "");
    const contactMemberships = membersByContact.get(contactId) ?? [];
    const classroomIds = contactMemberships.map((member) => String(member.classroom_id));
    const classroomNames = classroomIds.map((id) => String(classroomById.get(id)?.name ?? "Classroom")).filter(Boolean);
    const contactAttendance = attendanceByContact.get(contactId) ?? [];
    const present = contactAttendance.filter((item) => ["present", "late"].includes(String(item.status))).length;
    const recentAbsences = contactAttendance.filter((item) => String(item.session_date ?? "") >= since14 && String(item.status) === "absent").length;
    const attendanceRate = contactAttendance.length > 0 ? Math.round((present / contactAttendance.length) * 100) : null;

    let missingAssignments = 0;
    let weightedScore = 0;
    let totalWeight = 0;
    let submittedAssignments = 0;
    let totalAssignments = 0;

    for (const classroomId of classroomIds) {
      for (const assignment of assignmentsByClassroom.get(classroomId) ?? []) {
        totalAssignments++;
        const assignmentId = String(assignment.id ?? "");
        const dueAt = String(assignment.due_at ?? "");
        const submission = submissionByKey.get(`${assignmentId}__${contactId}`);
        const isSubmitted = submission && String(submission.status) !== "missing";
        if (isSubmitted) submittedAssignments++;
        if (dueAt && dueAt < now.toISOString() && !isSubmitted) {
          missingAssignments++;
          missingAssignmentCandidates.push({
            dedupe_key: `missing_assignment:${assignmentId}:${contactId}`,
            source_type: "missing_assignment",
            priority: dueAt < addDays(now, -7).toISOString() ? "high" : "medium",
            title: `${contactDisplayName(contact) || "Student"} is missing ${String(assignment.title ?? "an assignment")}`,
            description: `Due ${dueAt.slice(0, 10)} in ${String(classroomById.get(classroomId)?.name ?? "classroom")}.`,
            recommended_action: "Send a reminder or mark the assignment after reviewing the student's work.",
            contact_id: contactId,
            classroom_id: classroomId,
            due_at: dueAt,
            metadata: { assignment_id: assignmentId },
          });
        }
        if (submission && typeof submission.score === "number") {
          const maxScore = Number(submission.max_score ?? assignment.max_score ?? 100);
          if (maxScore > 0) {
            const weight = Number(assignment.score_weight ?? 1);
            weightedScore += (Number(submission.score) / maxScore) * 100 * weight;
            totalWeight += weight;
          }
        }
      }
    }

    const compositeScore = totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 10) / 10 : null;
    const hasMembership = classroomIds.length > 0;
    const placementLevel = normalizeText(contact.placement_level, 20) || null;
    const explicitStage = normalizeText(contact.lifecycle_stage, 30).toLowerCase();
    const pendingAmount = (pendingPaymentsByContact.get(contactId) ?? []).reduce((acc, item) => acc + Number(item.amount ?? 0), 0);
    const expiring = (expiringEntitlementsByContact.get(contactId) ?? []).sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)))[0] ?? null;
    const hasAttention = (openAlertsByContact.get(contactId) ?? []).length > 0 || missingAssignments >= 3 || recentAbsences >= 2 || (attendanceRate !== null && attendanceRate < 70);
    const certificateReady = hasMembership && totalAssignments > 0 && submittedAssignments >= totalAssignments && compositeScore !== null && compositeScore >= ruleThreshold(rules, "course_completion_certificate", 80);

    let derivedStage = "enrolled";
    if (!hasMembership || String(contact.status) === "trial") derivedStage = "lead";
    if (hasMembership && !placementLevel) derivedStage = "placement";
    if (hasMembership && (submittedAssignments > 0 || contactAttendance.length > 0)) derivedStage = "learning";
    if (pendingAmount > 0 || expiring) derivedStage = "renewal";
    if (certificateReady) derivedStage = "completion";
    if (hasAttention) derivedStage = "attention";

    const validStage = ["lead", "placement", "enrolled", "learning", "attention", "renewal", "completion"].includes(explicitStage);
    const stage = validStage ? explicitStage : derivedStage;
    pipelineCounts[stage] = (pipelineCounts[stage] ?? 0) + 1;

    const nextActionByStage: Record<string, string> = {
      lead: "Convert the lead: invite them to placement or enroll them in a class.",
      placement: "Record diagnostic score and place the student into the right level.",
      enrolled: "Confirm timetable, teacher, and first assignment.",
      learning: "Monitor attendance, grade submissions, and keep momentum.",
      attention: "Follow up with the student or parent today.",
      renewal: "Collect payment, renew entitlement, or assign the next offer.",
      completion: "Issue a certificate and recommend the next course.",
    };

    const row: EducationPipelineRow = {
      contact_id: contactId,
      name: contactDisplayName(contact) || "Student",
      email: contact.email ? String(contact.email) : null,
      status: String(contact.status ?? "active"),
      stage,
      derived_stage: derivedStage,
      next_action: nextActionByStage[stage] ?? nextActionByStage.enrolled,
      placement_level: placementLevel,
      placement_score: safeNumber(contact.placement_score),
      classroom_ids: classroomIds,
      classroom_names: classroomNames,
      attendance_rate: attendanceRate,
      recent_absences: recentAbsences,
      missing_assignments: missingAssignments,
      composite_score: compositeScore,
      certificate_ready: certificateReady,
      pending_amount: pendingAmount,
      entitlement_expires_at: expiring?.expires_at ? String(expiring.expires_at) : null,
      last_activity_at: contact.last_activity_at ? String(contact.last_activity_at) : null,
    };
    pipeline.push(row);
    if (certificateReady) certificateCandidates.push(row);
  }

  for (const submission of submissions) {
    if (!["submitted", "resubmitted", "late"].includes(String(submission.status)) || typeof submission.score === "number") continue;
    const contact = contactById.get(String(submission.contact_id));
    const assignment = assignments.find((item) => String(item.id) === String(submission.assignment_id));
    gradingCandidates.push({
      dedupe_key: `grading_backlog:${String(submission.id)}`,
      source_type: "grading_backlog",
      priority: String(submission.submitted_at ?? "") < addDays(now, -3).toISOString() ? "high" : "medium",
      title: `Grade ${contactDisplayName(contact) || "student"}'s submission`,
      description: `${String(assignment?.title ?? "Assignment")} is waiting for a score.`,
      recommended_action: "Open the gradebook and record a score with feedback.",
      contact_id: String(submission.contact_id ?? ""),
      classroom_id: String(submission.classroom_id ?? ""),
      due_at: submission.submitted_at ? String(submission.submitted_at) : null,
      metadata: { submission_id: String(submission.id), assignment_id: String(submission.assignment_id) },
    });
  }

  const actionCandidates: EducationActionCandidate[] = [
    ...alerts.map((alert) => {
      const contactId = alert.contact_id ? String(alert.contact_id) : null;
      const contact = contactId ? contactById.get(contactId) : null;
      const severity = String(alert.severity ?? "medium");
      return {
        dedupe_key: `alert:${String(alert.id)}`,
        source_type: "alert",
        priority: severity === "critical" ? "critical" : severity === "high" ? "high" : "medium",
        title: contact ? `Resolve alert for ${contactDisplayName(contact) || "student"}` : "Resolve academy alert",
        description: String(alert.message ?? "Open alert"),
        recommended_action: "Review the alert, contact the student or parent, then resolve it.",
        contact_id: contactId,
        classroom_id: String((toJsonObject(alert.metadata).classroom_id as string) ?? "") || null,
        due_at: String(alert.created_at ?? ""),
        metadata: { alert_id: String(alert.id), alert_type: String(alert.type ?? "") },
      } satisfies EducationActionCandidate;
    }),
    ...gradingCandidates.slice(0, 80),
    ...missingAssignmentCandidates.slice(0, 120),
  ];

  for (const classroom of classrooms.filter((item) => item.is_active !== false)) {
    const classroomId = String(classroom.id);
    if ((schedules.filter((slot) => String(slot.classroom_id) === classroomId)).length === 0) {
      actionCandidates.push({
        dedupe_key: `schedule_gap:${classroomId}`,
        source_type: "schedule_gap",
        priority: "medium",
        title: `${String(classroom.name ?? "Classroom")} has no timetable`,
        description: "Students cannot receive class reminders until a weekly slot exists.",
        recommended_action: "Add at least one weekly schedule slot.",
        classroom_id: classroomId,
        metadata: {},
      });
    }
  }

  const todayDow = now.getUTCDay();
  for (const slot of schedules.filter((item) => Number(item.day_of_week) === todayDow)) {
    const classroomId = String(slot.classroom_id ?? "");
    const expected = (membersByClassroom.get(classroomId) ?? []).length;
    const marked = (attendanceByClassDate.get(`${classroomId}__${today}`) ?? []).length;
    if (expected > 0 && marked < expected) {
      actionCandidates.push({
        dedupe_key: `attendance_roll_call:${String(slot.id)}:${today}`,
        source_type: "attendance_roll_call",
        priority: "high",
        title: `Take attendance for ${String(classroomById.get(classroomId)?.name ?? "today's class")}`,
        description: `${marked}/${expected} students have attendance marked for today.`,
        recommended_action: "Open Attendance and save the roll call.",
        classroom_id: classroomId,
        due_at: `${today}T${String(slot.start_time ?? "00:00")}:00Z`,
        metadata: { schedule_id: String(slot.id), date: today },
      });
    }
  }

  for (const row of pipeline) {
    if (row.stage === "placement") {
      actionCandidates.push({
        dedupe_key: `placement_needed:${row.contact_id}`,
        source_type: "placement_needed",
        priority: "medium",
        title: `Place ${row.name}`,
        description: "No placement level is recorded yet.",
        recommended_action: "Record a diagnostic score or manual CEFR level.",
        contact_id: row.contact_id,
        metadata: {},
      });
    }
    if (row.status === "trial" && ruleIsActive(rules, "trial_conversion_follow_up")) {
      actionCandidates.push({
        dedupe_key: `trial_follow_up:${row.contact_id}`,
        source_type: "trial_follow_up",
        priority: "medium",
        title: `Convert trial student ${row.name}`,
        description: "Trial students should have a clear enrollment or follow-up next step.",
        recommended_action: "Send a follow-up, create payment, or enroll into the right classroom.",
        contact_id: row.contact_id,
        metadata: {},
      });
    }
    if (row.pending_amount > 0 || row.entitlement_expires_at) {
      actionCandidates.push({
        dedupe_key: `renewal:${row.contact_id}`,
        source_type: "renewal",
        priority: row.pending_amount > 0 ? "high" : "medium",
        title: `Renew or collect payment for ${row.name}`,
        description: row.pending_amount > 0 ? `Pending balance: ${row.pending_amount.toLocaleString()}.` : `Entitlement expires ${row.entitlement_expires_at?.slice(0, 10)}.`,
        recommended_action: "Open payments, collect tuition, or grant the next offer.",
        contact_id: row.contact_id,
        due_at: row.entitlement_expires_at,
        metadata: { pending_amount: row.pending_amount },
      });
    }
    if (row.certificate_ready && ruleIsActive(rules, "course_completion_certificate")) {
      actionCandidates.push({
        dedupe_key: `certificate_ready:${row.contact_id}:${row.classroom_ids[0] ?? "academy"}`,
        source_type: "certificate_ready",
        priority: "low",
        title: `${row.name} is ready for completion`,
        description: `Composite score ${row.composite_score ?? "-"}% with required work submitted.`,
        recommended_action: "Issue a certificate and recommend the next class.",
        contact_id: row.contact_id,
        classroom_id: row.classroom_ids[0] ?? null,
        metadata: { composite_score: row.composite_score },
      });
    }
  }

  const syncCandidates = syncOptions.candidateFilter ? actionCandidates.filter(syncOptions.candidateFilter) : actionCandidates;
  const actionQueue = await syncEducationActionItems(sb, academyId, syncCandidates, {
    resolveStale: syncOptions.resolveStale,
  });

  const calendarEvents: EducationCalendarEvent[] = [];
  for (let offset = 0; offset <= 13; offset++) {
    const day = addDays(now, offset);
    const dayDate = dateOnly(day);
    const dow = day.getUTCDay();
    for (const slot of schedules.filter((item) => Number(item.day_of_week) === dow)) {
      const classroomId = String(slot.classroom_id ?? "");
      calendarEvents.push({
        id: `class:${String(slot.id)}:${dayDate}`,
        type: "class",
        title: `${String(classroomById.get(classroomId)?.name ?? "Class")} ${slot.label ? `- ${String(slot.label)}` : ""}`.trim(),
        starts_at: `${dayDate}T${String(slot.start_time ?? "00:00")}:00`,
        ends_at: slot.end_time ? `${dayDate}T${String(slot.end_time)}:00` : null,
        classroom_id: classroomId,
        contact_id: null,
        priority: "medium",
        metadata: { timezone: String(slot.timezone ?? "UTC"), schedule_id: String(slot.id) },
      });
    }
  }

  for (const assignment of assignments) {
    const dueAt = String(assignment.due_at ?? "");
    if (!dueAt || dueAt > in30 || dueAt < addDays(now, -7).toISOString()) continue;
    const classroomId = String(assignment.classroom_id ?? "");
    calendarEvents.push({
      id: `assignment:${String(assignment.id)}`,
      type: "assignment_due",
      title: `Due: ${String(assignment.title ?? "Assignment")}`,
      starts_at: dueAt,
      ends_at: null,
      classroom_id: classroomId,
      contact_id: null,
      priority: dueAt < now.toISOString() ? "high" : "medium",
      metadata: { assignment_id: String(assignment.id), classroom_name: String(classroomById.get(classroomId)?.name ?? "") },
    });
  }

  for (const notification of notifications) {
    const scheduledAt = String(notification.scheduled_at ?? "");
    if (!scheduledAt || scheduledAt > in14) continue;
    calendarEvents.push({
      id: `notification:${String(notification.id)}`,
      type: "notification",
      title: String(notification.title ?? notification.type ?? "Notification"),
      starts_at: scheduledAt,
      ends_at: null,
      classroom_id: null,
      contact_id: notification.contact_id ? String(notification.contact_id) : null,
      priority: String(notification.status) === "failed" ? "high" : "low",
      metadata: { channel: String(notification.channel ?? ""), status: String(notification.status ?? "") },
    });
  }

  for (const item of actionQueue.slice(0, 80)) {
    const dueAt = String(item.due_at ?? "");
    if (!dueAt) continue;
    calendarEvents.push({
      id: `action:${String(item.id)}`,
      type: "action",
      title: String(item.title ?? "Action item"),
      starts_at: dueAt,
      ends_at: null,
      classroom_id: item.classroom_id ? String(item.classroom_id) : null,
      contact_id: item.contact_id ? String(item.contact_id) : null,
      priority: String(item.priority ?? "medium"),
      metadata: { action_item_id: String(item.id), source_type: String(item.source_type ?? "") },
    });
  }

  calendarEvents.sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const insights: EducationInsight[] = [];
  const highPriorityActions = actionQueue.filter((item) => ["critical", "high"].includes(String(item.priority))).length;
  if (highPriorityActions > 0) {
    insights.push({
      id: "high-priority-actions",
      type: "queue",
      severity: highPriorityActions >= 10 ? "critical" : "high",
      title: "High-priority queue needs attention",
      detail: `${highPriorityActions} urgent item(s) are open across the academy.`,
      recommended_action: "Start with the Today queue and resolve attendance, risk, and payment items first.",
      metric: highPriorityActions,
    });
  }

  const gradeBacklog = gradingCandidates.length;
  if (gradeBacklog > 0) {
    insights.push({
      id: "grading-backlog",
      type: "learning",
      severity: gradeBacklog >= 20 ? "high" : "medium",
      title: "Grading backlog is building",
      detail: `${gradeBacklog} submission(s) are waiting for grades.`,
      recommended_action: "Batch-grade the oldest submissions and send feedback.",
      metric: gradeBacklog,
    });
  }

  for (const classroom of classrooms) {
    const classroomId = String(classroom.id);
    const classAttendance = attendance.filter((item) => String(item.classroom_id) === classroomId);
    if (classAttendance.length < 4) continue;
    const presentCount = classAttendance.filter((item) => ["present", "late"].includes(String(item.status))).length;
    const rate = Math.round((presentCount / classAttendance.length) * 100);
    if (rate < 75) {
      insights.push({
        id: `attendance-${classroomId}`,
        type: "attendance",
        severity: rate < 60 ? "high" : "medium",
        title: `${String(classroom.name ?? "Classroom")} attendance is weak`,
        detail: `Recent attendance is ${rate}%.`,
        recommended_action: "Run attendance follow-up and contact absent students.",
        metric: rate,
        classroom_id: classroomId,
      });
    }
  }

  const placementGap = pipeline.filter((row) => row.stage === "placement").length;
  if (placementGap > 0) {
    insights.push({
      id: "placement-gap",
      type: "growth",
      severity: placementGap >= 10 ? "high" : "medium",
      title: "Students are waiting for placement",
      detail: `${placementGap} student(s) need level placement before the next class decision.`,
      recommended_action: "Record diagnostic scores and move them into matching classrooms.",
      metric: placementGap,
    });
  }

  const disabledRules = rules.filter((rule) => rule.is_active === false).length;
  if (disabledRules > 0) {
    insights.push({
      id: "disabled-automation",
      type: "automation",
      severity: "low",
      title: "Some automations are disabled",
      detail: `${disabledRules} automation rule(s) are off.`,
      recommended_action: "Review the automation panel and turn on the rules that match academy policy.",
      metric: disabledRules,
    });
  }

  if (certificateCandidates.length > 0) {
    insights.push({
      id: "completion-ready",
      type: "completion",
      severity: "positive",
      title: "Students are ready to complete",
      detail: `${certificateCandidates.length} student(s) appear ready for a certificate or next course.`,
      recommended_action: "Issue certificates and offer the next level.",
      metric: certificateCandidates.length,
    });
  }

  return {
    generated_at: now.toISOString(),
    action_queue: actionQueue,
    pipeline,
    pipeline_counts: pipelineCounts,
    automation_rules: rules,
    calendar_events: calendarEvents.slice(0, 300),
    intelligence: insights.slice(0, 30),
    stats: {
      open_actions: actionQueue.length,
      urgent_actions: highPriorityActions,
      grading_backlog: gradeBacklog,
      certificate_ready: certificateCandidates.length,
      placement_gap: placementGap,
    },
  };
};

// ── Engagement maintenance (shared by manual actions + cron worker) ───────────

const filterEducationOSForAccess = async (
  sb: SupabaseClientLike,
  academyId: string,
  access: MembershipRow,
  os: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const scopedClassroomIds = academyAccessClassroomIds(access);
  const scopedContactIds = await loadScopedContactIds(sb, academyId, scopedClassroomIds);
  const canSeeFinance = academyAccessHas(access, "manageFinance");
  const canManageAutomation = academyAccessHas(access, "manageAutomation");
  const canIssueCertificates = academyAccessHas(access, "issueCertificates");
  const canUseGrowthOps = academyAccessHas(access, "viewReports");
  const classroomAllowed = (value: unknown): boolean => {
    const classroomId = normalizeText(value, 64);
    if (!classroomId) return scopedClassroomIds === null;
    return scopedClassroomIds === null || scopedClassroomIds.includes(classroomId);
  };

  const contactAllowed = (value: unknown): boolean => {
    const contactId = normalizeText(value, 64);
    if (!contactId) return scopedContactIds === null;
    return scopedContactIds === null || scopedContactIds.has(contactId);
  };

  const rowAllowed = (row: Record<string, unknown>): boolean => {
    const classroomId = normalizeText(row.classroom_id, 64);
    const contactId = normalizeText(row.contact_id, 64);
    if (classroomId && !classroomAllowed(classroomId)) return false;
    if (contactId && !contactAllowed(contactId)) return false;
    if (!classroomId && !contactId && scopedClassroomIds !== null) return false;
    return true;
  };

  const sanitizePipelineRow = (row: Record<string, unknown>): Record<string, unknown> => {
    const stage = normalizeText(row.stage, 40);
    const derivedStage = normalizeText(row.derived_stage, 40);
    const hasRenewalSignal =
      stage === "renewal" ||
      derivedStage === "renewal" ||
      Number(row.pending_amount ?? 0) > 0 ||
      Boolean(normalizeText(row.entitlement_expires_at, 80));
    const hasCertificateSignal =
      stage === "completion" ||
      derivedStage === "completion" ||
      row.certificate_ready === true;
    const hideRenewalSignal = !canSeeFinance && hasRenewalSignal;
    const hideCertificateSignal = !canIssueCertificates && hasCertificateSignal;
    if (!hideRenewalSignal && !hideCertificateSignal) return row;

    const visibleStage = hideRenewalSignal || (hideCertificateSignal && stage === "completion") ? "learning" : stage;
    const visibleDerivedStage =
      (hideRenewalSignal && derivedStage === "renewal") || (hideCertificateSignal && derivedStage === "completion")
        ? visibleStage
        : derivedStage;

    return {
      ...row,
      stage: visibleStage,
      derived_stage: visibleDerivedStage,
      next_action: hideRenewalSignal
        ? "Monitor attendance, grade submissions, and keep learning momentum."
        : hideCertificateSignal
          ? "Review progress, feedback, and the next learning milestone."
        : row.next_action,
      pending_amount: hideRenewalSignal ? 0 : row.pending_amount,
      entitlement_expires_at: hideRenewalSignal ? null : row.entitlement_expires_at,
      certificate_ready: canIssueCertificates ? row.certificate_ready === true : false,
    };
  };

  const actionQueue = ((os.action_queue ?? []) as Array<Record<string, unknown>>)
    .filter(rowAllowed)
    .filter((item) => {
      const sourceType = normalizeText(item.source_type, 80);
      if (!canSeeFinance && ["renewal", "payment", "payment_due"].includes(sourceType)) return false;
      if (!canIssueCertificates && sourceType === "certificate_ready") return false;
      if (scopedClassroomIds !== null && !teacherScopedEducationActionSources.has(sourceType)) return false;
      return true;
    });

  const pipeline = ((os.pipeline ?? []) as Array<Record<string, unknown>>)
    .filter((row) => {
      const contactId = normalizeText(row.contact_id, 64);
      if (contactId && !contactAllowed(contactId)) return false;
      if (scopedClassroomIds === null) return true;
      const classroomIds = toStringArray(row.classroom_ids);
      return classroomIds.some((classroomId) => scopedClassroomIds.includes(classroomId));
    })
    .map(sanitizePipelineRow);

  const pipelineCounts = pipeline.reduce<Record<string, number>>((acc, row) => {
    const stage = normalizeText(row.stage, 40) || "enrolled";
    acc[stage] = (acc[stage] ?? 0) + 1;
    return acc;
  }, { lead: 0, placement: 0, enrolled: 0, learning: 0, attention: 0, renewal: 0, completion: 0 } as Record<string, number>);

  const calendarEvents = ((os.calendar_events ?? []) as Array<Record<string, unknown>>)
    .filter(rowAllowed)
    .filter((event) => {
      const eventType = normalizeText(event.type, 80);
      if (!canSeeFinance && ["payment", "renewal", "notification"].includes(eventType)) return false;
      return true;
    });

  const intelligence = ((os.intelligence ?? []) as Array<Record<string, unknown>>)
    .filter((insight) => {
      if (normalizeText(insight.id, 80) === "high-priority-actions") return false;
      if (!rowAllowed(insight)) return false;
      const type = normalizeText(insight.type, 80);
      if (!canSeeFinance && ["revenue", "renewal", "payment"].includes(type)) return false;
      if (!canManageAutomation && type === "automation") return false;
      if (!canUseGrowthOps && ["growth", "queue"].includes(type) && scopedClassroomIds !== null) return false;
      return scopedClassroomIds === null || Boolean(insight.classroom_id || insight.contact_id) || ["learning", "attendance"].includes(type);
    });

  const gradingBacklog = actionQueue.filter((item) => normalizeText(item.source_type, 80) === "grading_backlog").length;
  const certificateReady = pipeline.filter((row) => row.certificate_ready === true).length;
  const placementGap = pipeline.filter((row) => normalizeText(row.stage, 40) === "placement").length;
  const highPriorityActions = actionQueue.filter((item) => ["critical", "high"].includes(String(item.priority))).length;

  if (highPriorityActions > 0) {
    intelligence.unshift({
      id: "high-priority-actions",
      type: "queue",
      severity: highPriorityActions >= 10 ? "critical" : "high",
      title: "High-priority queue needs attention",
      detail: `${highPriorityActions} urgent item(s) are open in your role scope.`,
      recommended_action: "Start with the Today queue and resolve the most time-sensitive class items first.",
      metric: highPriorityActions,
    });
  }

  return {
    ...os,
    access: academyAccessProfile(access),
    action_queue: actionQueue,
    pipeline,
    pipeline_counts: pipelineCounts,
    automation_rules: canManageAutomation ? os.automation_rules ?? [] : [],
    calendar_events: calendarEvents,
    intelligence,
    stats: {
      open_actions: actionQueue.filter((item) => String(item.status ?? "open") === "open").length,
      urgent_actions: highPriorityActions,
      grading_backlog: gradingBacklog,
      certificate_ready: canIssueCertificates ? certificateReady : 0,
      placement_gap: placementGap,
    },
  };
};

type AtRiskEntry = {
  contact_id: string;
  name: string;
  attendance_rate: number | null;
  missing: number;
  severity: string;
  reasons: string[];
};

const computeAtRiskForAcademy = async (
  sb: SupabaseClientLike,
  academyId: string,
  classroomId: string | null = null,
): Promise<{ atRisk: AtRiskEntry[]; scanned: number }> => {
  const sinceIso = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  let memQuery = sb.from("academy_classroom_memberships")
    .select("contact_id, classroom_id, academy_contacts!academy_memberships_contact_tenant_fk(id, first_name, last_name, email, telegram_id, status, notify_enabled)")
    .eq("academy_id", academyId).in("role", ["student", "observer"]).limit(5000);
  if (classroomId) memQuery = memQuery.eq("classroom_id", classroomId);
  const { data: memberRows } = await memQuery;

  const members = (memberRows ?? []) as Array<Record<string, unknown>>;
  const contactIds = Array.from(new Set(members.map((m) => String((m.academy_contacts as any)?.id ?? m.contact_id ?? "")).filter(Boolean)));
  const classroomIds = Array.from(new Set(members.map((m) => String(m.classroom_id)).filter(Boolean)));
  if (contactIds.length === 0) return { atRisk: [], scanned: 0 };

  const [attRes, subRes, asgnRes] = await Promise.all([
    sb.from("academy_attendance").select("contact_id, status, session_date").eq("academy_id", academyId).in("contact_id", contactIds).gte("session_date", sinceIso).limit(20000),
    sb.from("academy_submissions").select("contact_id, assignment_id, status").eq("academy_id", academyId).in("contact_id", contactIds).limit(20000),
    sb.from("academy_assignments").select("id, classroom_id, due_at, status").eq("academy_id", academyId).in("classroom_id", classroomIds.length > 0 ? classroomIds : ["none"]).eq("status", "active").limit(2000),
  ]);

  const attendance = (attRes.data ?? []) as Array<Record<string, unknown>>;
  const submissions = (subRes.data ?? []) as Array<Record<string, unknown>>;
  const assignments = (asgnRes.data ?? []) as Array<Record<string, unknown>>;

  const dueAssignmentsByClassroom = new Map<string, string[]>();
  for (const a of assignments) {
    if (!a.due_at || new Date(String(a.due_at)) >= new Date()) continue;
    const cid = String(a.classroom_id);
    if (!dueAssignmentsByClassroom.has(cid)) dueAssignmentsByClassroom.set(cid, []);
    dueAssignmentsByClassroom.get(cid)!.push(String(a.id));
  }
  const submittedKey = new Set(submissions.filter((s) => s.status !== "missing").map((s) => `${s.contact_id}__${s.assignment_id}`));

  const atRisk: AtRiskEntry[] = [];
  const memberByContact = new Map<string, Record<string, unknown>>();
  for (const m of members) {
    const c = (m.academy_contacts as Record<string, unknown>) ?? {};
    const cid = String(c.id ?? m.contact_id ?? "");
    if (cid && !memberByContact.has(cid)) memberByContact.set(cid, { contact: c, classroom_id: String(m.classroom_id) });
  }

  for (const [contactId, info] of memberByContact) {
    const c = (info as any).contact as Record<string, unknown>;
    const classroom = String((info as any).classroom_id);
    const att = attendance.filter((a) => String(a.contact_id) === contactId);
    const present = att.filter((a) => a.status === "present" || a.status === "late").length;
    const attendanceRate = att.length >= 4 ? Math.round((present / att.length) * 100) : null;

    const dueIds = dueAssignmentsByClassroom.get(classroom) ?? [];
    const missing = dueIds.filter((aid) => !submittedKey.has(`${contactId}__${aid}`)).length;

    const reasons: string[] = [];
    if (attendanceRate !== null && attendanceRate < 70) reasons.push(`Attendance ${attendanceRate}%`);
    if (missing >= 3) reasons.push(`${missing} missing assignments`);
    if (reasons.length === 0) continue;

    const severity = (attendanceRate !== null && attendanceRate < 50) || missing >= 5 ? "high" : "medium";
    atRisk.push({ contact_id: contactId, name: `${String(c.first_name ?? "")} ${String(c.last_name ?? "")}`.trim(), attendance_rate: attendanceRate, missing, severity, reasons });

    const { data: existingAlert } = await sb.from("academy_alerts")
      .select("id").eq("academy_id", academyId).eq("contact_id", contactId).eq("type", "at_risk").eq("resolved", false).maybeSingle();
    if (!existingAlert?.id) {
      await sb.from("academy_alerts").insert({
        academy_id: academyId, contact_id: contactId, type: "at_risk", severity,
        message: `At risk: ${reasons.join("; ")}`, metadata: { attendance_rate: attendanceRate, missing, classroom_id: classroom },
      });
      const telegram = normalizeText(c.telegram_id, 120);
      if (telegram && c.notify_enabled !== false) {
        await sb.from("academy_notifications").insert({
          academy_id: academyId, contact_id: contactId, channel: "telegram", type: "at_risk",
          title: "Let's get back on track", body: `Hi ${String(c.first_name ?? "")}, your teacher noticed: ${reasons.join("; ")}. Check your assignments in the Schood app.`,
          target: telegram, status: "queued", scheduled_at: nowIso,
        });
      }
    }
  }

  return { atRisk, scanned: memberByContact.size };
};

const dispatchQueuedNotifications = async (
  sb: SupabaseClientLike,
  academyId: string | null = null,
): Promise<{ sent: number; failed: number; skipped: number; processed: number }> => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const smtpEmail = normalizeEmail(Deno.env.get("GMAIL_SMTP_EMAIL"));
  const smtpPassword = normalizeText(Deno.env.get("GMAIL_SMTP_APP_PASSWORD"), 400);
  const mailer = smtpEmail && smtpPassword
    ? nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      pool: true,
      maxConnections: 1,
      maxMessages: 100,
      auth: { user: smtpEmail, pass: smtpPassword },
      disableFileAccess: true,
      disableUrlAccess: true,
    })
    : null;
  if (supabaseUrl && serviceRole) {
    await fetch(`${supabaseUrl}/functions/v1/send-telegram`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "process_queue", limit: 100 }),
    }).catch(() => undefined);
  }
  let q = sb.from("academy_notifications")
    .select("id, academy_id, channel, type, title, body, target, attempts, scheduled_at, contact_id, metadata, guardian_id, relationship_id, user_id, category, dedupe_key, cta_url, academy_contacts(user_id)")
    .eq("status", "queued").lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true }).limit(200);
  if (academyId) q = q.eq("academy_id", academyId);
  const { data: queued } = await q;

  let sent = 0, failed = 0, skipped = 0;
  const recordAttempt=async(n:Record<string,unknown>,status:'sent'|'failed'|'skipped',errorMessage:string|null=null,providerMessageId:string|null=null)=>{
    await sb.from('academy_notification_delivery_attempts').insert({academy_id:n.academy_id,notification_id:n.id,attempt_number:Number(n.attempts??0)+1,channel:n.channel,provider:n.channel==='telegram'?'telegram_bot_api':String(n.channel),status,error_message:errorMessage?.slice(0,1000)??null,provider_message_id:providerMessageId});
  };
  for (const n of (queued ?? []) as Array<Record<string, unknown>>) {
    const id = String(n.id);
    if((n.metadata as Record<string,unknown>|null)?.intended_audience==='guardian'&&(!n.guardian_id||!n.relationship_id)){
      await sb.from('academy_notifications').update({status:'skipped',error:'Verified parent relationship is required'}).eq('id',id).eq('status','queued');
      await recordAttempt(n,'skipped','Verified parent relationship is required');skipped++;continue;
    }
    if(n.guardian_id||n.relationship_id){
      try{
        const outcome=await dispatchGuardianNotification(sb,id,async claim=>{
          if(claim.channel==='telegram')return await sendParentTelegram(getOptionalEnv('ACADEMY_TELEGRAM_BOT_TOKEN')??'',claim);
          if(claim.channel==='sms')return await sendParentSms(getOptionalEnv('ACADEMY_SMS_GATEWAY_URL')??'',getOptionalEnv('ACADEMY_SMS_GATEWAY_TOKEN')??'',claim);
          if(claim.channel==='email'){
            if(!mailer||!smtpEmail||!claim.target)return {outcome:'unconfigured'};
            const result=await mailer.sendMail({from:smtpEmail,to:claim.target,subject:claim.title||'Academy update',text:claim.body});
            return {outcome:'sent',providerId:String(result.messageId??'')};
          }
          return {outcome:'unconfigured'};
        });
        if(outcome==='sent')sent++;else if(outcome==='failed'||outcome==='unknown')failed++;else skipped++;
      }catch{failed++;}
      continue;
    }
    const target = normalizeText(n.target, 320);
    if (n.channel === "telegram") {
      if (!supabaseUrl || !serviceRole) { await sb.from("academy_notifications").update({ status: "skipped", error: "Notification gateway not configured" }).eq("id", id);await recordAttempt(n,'skipped','Notification gateway not configured'); skipped++; continue; }
      if (!target) { await sb.from("academy_notifications").update({ status: "skipped", error: "No telegram target" }).eq("id", id);await recordAttempt(n,'skipped','No telegram target'); skipped++; continue; }
      try {
        const message = `${n.title ? `${String(n.title)}\n` : ""}${String(n.body ?? "")}`;
        const contactUserId = normalizeText((n.academy_contacts as Record<string, unknown> | null)?.user_id, 80);
        const mappedUserId = normalizeText(n.user_id, 80) || contactUserId || null;
        const res = await fetch(`${supabaseUrl}/functions/v1/send-telegram`, {
          method: "POST", headers: { Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: mappedUserId ?? undefined,
            chat_id: mappedUserId ? undefined : target,
            text: message,
            parse_mode: null,
            notification_type: String(n.type ?? "academy_notification"),
            category: String(n.category ?? "academic_required"),
            dedupe_key: String(n.dedupe_key ?? `academy_notification:${id}`),
            cta_url: n.cta_url ?? undefined,
            metadata: { academy_id: n.academy_id, contact_id: n.contact_id, academy_notification_id: id },
          }),
        });
        const result = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (res.ok && result.outcome === "sent") {
          await sb.from("academy_notifications").update({ status: "sent", sent_at: new Date().toISOString(), attempts: Number(n.attempts ?? 0) + 1, policy_decision: result }).eq("id", id);
          await recordAttempt(n,'sent',null,result.message_id ? String(result.message_id) : null);
          sent++;
        } else if (res.ok && (result.outcome === "suppressed" || result.outcome === "suppress")) {
          await sb.from("academy_notifications").update({ status: "suppressed", suppression_reason: String(result.reason ?? "policy"), policy_decision: result, attempts: Number(n.attempts ?? 0) + 1 }).eq("id", id);
          await recordAttempt(n,'skipped',String(result.reason ?? "policy"));
          skipped++;
        } else if (res.ok && (result.outcome === "defer" || result.outcome === "deferred")) {
          await sb.from("academy_notifications").update({ status: "queued", scheduled_at: result.deliver_at ?? result.retry_at ?? new Date(Date.now() + 3600000).toISOString(), policy_decision: result, attempts: Number(n.attempts ?? 0) + 1 }).eq("id", id);
        } else {
          const detail = String(result.error ?? result.reason ?? `Gateway HTTP ${res.status}`);
          await sb.from("academy_notifications").update({ status: Number(n.attempts ?? 0) >= 2 ? "failed" : "queued", error: detail.slice(0, 400), attempts: Number(n.attempts ?? 0) + 1 }).eq("id", id);
          await recordAttempt(n,'failed',detail);
          failed++;
        }
      } catch (e) {
        await sb.from("academy_notifications").update({ status: "queued", error: String(e instanceof Error ? e.message : e).slice(0, 400), attempts: Number(n.attempts ?? 0) + 1 }).eq("id", id);
        await recordAttempt(n,'failed',String(e instanceof Error ? e.message : e));
        failed++;
      }
    } else if (n.channel === "inapp") {
      await sb.from("academy_notifications").update({ status: "sent", sent_at: new Date().toISOString(), attempts: Number(n.attempts ?? 0) + 1, error: null }).eq("id", id);
      await recordAttempt(n, "sent", null, `inapp:${id}`);
      sent++;
    } else if (n.channel === "email") {
      if (!mailer || !smtpEmail) {
        await sb.from("academy_notifications").update({ status: "skipped", error: "Academy email delivery is not configured", attempts: Number(n.attempts ?? 0) + 1 }).eq("id", id);
        await recordAttempt(n, "skipped", "Academy email delivery is not configured");
        skipped++;
        continue;
      }
      if (!normalizeEmail(target)) {
        await sb.from("academy_notifications").update({ status: "skipped", error: "No valid email target", attempts: Number(n.attempts ?? 0) + 1 }).eq("id", id);
        await recordAttempt(n, "skipped", "No valid email target");
        skipped++;
        continue;
      }
      try {
        const result = await mailer.sendMail({
          from: `Schood Academy <${smtpEmail}>`,
          to: target,
          subject: normalizeText(n.title, 300) || "Academy update",
          text: String(n.body ?? ""),
          headers: {
            "X-Schood-Notification": id,
            "X-Schood-Category": String(n.category ?? "academic_required"),
          },
        });
        await sb.from("academy_notifications").update({ status: "sent", sent_at: new Date().toISOString(), attempts: Number(n.attempts ?? 0) + 1, error: null }).eq("id", id);
        await recordAttempt(n, "sent", null, normalizeText(result.messageId, 500) || null);
        sent++;
      } catch (emailError) {
        const detail = String(emailError instanceof Error ? emailError.message : emailError).slice(0, 400);
        const attempts = Number(n.attempts ?? 0) + 1;
        await sb.from("academy_notifications").update({ status: attempts >= 3 ? "failed" : "queued", error: detail, attempts, scheduled_at: attempts >= 3 ? n.scheduled_at : new Date(Date.now() + Math.min(24, 2 ** attempts) * 60 * 60_000).toISOString() }).eq("id", id);
        await recordAttempt(n, "failed", detail);
        failed++;
      }
    } else {
      await sb.from("academy_notifications").update({ status: "skipped", error: `Channel ${String(n.channel)} not enabled` }).eq("id", id);
      await recordAttempt(n,'skipped',`Channel ${String(n.channel)} not enabled`);
      skipped++;
    }
  }
  mailer?.close();
  return { sent, failed, skipped, processed: (queued ?? []).length };
};

// Queue reminders for assignments due in the next 24h (one per student, deduped).
const queueDueReminders = async (sb: SupabaseClientLike, academyIdFilter: string | null = null): Promise<number> => {
  const nowIso = new Date().toISOString();
  const in24hIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  let assignmentQuery = sb.from("academy_assignments")
    .select("id, academy_id, classroom_id, title, due_at")
    .eq("status", "active").gte("due_at", nowIso).lte("due_at", in24hIso).limit(2000);
  if (academyIdFilter) assignmentQuery = assignmentQuery.eq("academy_id", academyIdFilter);
  const { data: asgnRows } = await assignmentQuery;
  const assignments = (asgnRows ?? []) as Array<Record<string, unknown>>;
  if (assignments.length === 0) return 0;

  let queued = 0;
  for (const a of assignments) {
    const academyId = String(a.academy_id);
    const rules = await loadEducationAutomationRules(sb, academyId, null);
    if (!ruleIsActive(rules, "assignment_due_reminder")) continue;
    const channel = ruleChannel(rules, "assignment_due_reminder", "telegram");
    const classroomId = String(a.classroom_id);
    const assignmentId = String(a.id);

    const [{ data: members }, { data: subs }, { data: existing }] = await Promise.all([
      sb.from("academy_classroom_memberships").select("contact_id, academy_contacts!academy_memberships_contact_tenant_fk(id, first_name, email, telegram_id, notify_enabled)").eq("academy_id", academyId).eq("classroom_id", classroomId).in("role", ["student", "observer"]).limit(1000),
      sb.from("academy_submissions").select("contact_id, status").eq("assignment_id", assignmentId).limit(2000),
      sb.from("academy_notifications").select("contact_id").eq("academy_id", academyId).eq("type", "assignment_due").eq("metadata->>assignment_id", assignmentId).limit(5000),
    ]);
    const submitted = new Set(((subs ?? []) as Array<Record<string, unknown>>).filter((s) => s.status !== "missing").map((s) => String(s.contact_id)));
    const reminded = new Set(((existing ?? []) as Array<Record<string, unknown>>).map((e) => String(e.contact_id)));

    for (const m of (members ?? []) as Array<Record<string, unknown>>) {
      const c = (m.academy_contacts as any) ?? {};
      const contactId = String(c.id ?? m.contact_id ?? "");
      if (!contactId || submitted.has(contactId) || reminded.has(contactId)) continue;
      const target = channel === "email" ? normalizeEmail(c.email) : normalizeText(c.telegram_id, 120);
      if ((!target && channel !== "inapp") || c.notify_enabled === false) continue;
      await sb.from("academy_notifications").insert({
        academy_id: academyId, contact_id: contactId, channel, type: "assignment_due",
        title: "Assignment due soon", body: `Reminder: "${String(a.title)}" is due ${new Date(String(a.due_at)).toLocaleString()}.`,
        target: target || null, status: "queued", scheduled_at: nowIso, metadata: { assignment_id: assignmentId, automation_rule: "assignment_due_reminder" },
      });
      queued++;
    }
  }
  return queued;
};

// Queue reminders for class sessions scheduled today (one per student per slot, deduped).
const queueClassReminders = async (sb: SupabaseClientLike, academyIdFilter: string | null = null): Promise<number> => {
  const now = new Date();
  const dow = now.getUTCDay();
  const today = now.toISOString().slice(0, 10);
  const nowIso = now.toISOString();

  let slotQuery = sb.from("academy_classroom_schedules")
    .select("id, academy_id, classroom_id, start_time, label").eq("is_active", true).eq("day_of_week", dow).limit(1000);
  if (academyIdFilter) slotQuery = slotQuery.eq("academy_id", academyIdFilter);
  const { data: slotRows } = await slotQuery;
  const slots = (slotRows ?? []) as Array<Record<string, unknown>>;
  if (slots.length === 0) return 0;

  let queued = 0;
  for (const slot of slots) {
    const academyId = String(slot.academy_id);
    const rules = await loadEducationAutomationRules(sb, academyId, null);
    if (!ruleIsActive(rules, "class_reminder")) continue;
    const channel = ruleChannel(rules, "class_reminder", "telegram");
    const classroomId = String(slot.classroom_id);
    const slotId = String(slot.id);

    const [{ data: members }, { data: existing }, { data: cl }] = await Promise.all([
      sb.from("academy_classroom_memberships").select("contact_id, academy_contacts!academy_memberships_contact_tenant_fk(id, email, telegram_id, notify_enabled)").eq("academy_id", academyId).eq("classroom_id", classroomId).in("role", ["student", "observer"]).limit(1000),
      sb.from("academy_notifications").select("contact_id").eq("academy_id", academyId).eq("type", "class_reminder").eq("metadata->>slot_id", slotId).eq("metadata->>date", today).limit(5000),
      sb.from("academy_classrooms").select("name").eq("id", classroomId).maybeSingle(),
    ]);
    const reminded = new Set(((existing ?? []) as Array<Record<string, unknown>>).map((e) => String(e.contact_id)));
    const className = cl?.name ? `"${String(cl.name)}"` : "class";

    for (const m of (members ?? []) as Array<Record<string, unknown>>) {
      const c = (m.academy_contacts as any) ?? {};
      const contactId = String(c.id ?? m.contact_id ?? "");
      if (!contactId || reminded.has(contactId)) continue;
      const target = channel === "email" ? normalizeEmail(c.email) : normalizeText(c.telegram_id, 120);
      if ((!target && channel !== "inapp") || c.notify_enabled === false) continue;
      await sb.from("academy_notifications").insert({
        academy_id: academyId, contact_id: contactId, channel, type: "class_reminder",
        title: "Class today", body: `You have ${className} today at ${String(slot.start_time)}${slot.label ? ` (${String(slot.label)})` : ""}.`,
        target: target || null, status: "queued", scheduled_at: nowIso, metadata: { slot_id: slotId, date: today, automation_rule: "class_reminder" },
      });
      queued++;
    }
  }
  return queued;
};

const queueAttendanceFollowupsForAcademy = async (
  sb: SupabaseClientLike,
  academyId: string,
  rules: Array<Record<string, unknown>>,
): Promise<number> => {
  if (!ruleIsActive(rules, "attendance_follow_up")) return 0;
  const threshold = Math.max(1, ruleThreshold(rules, "attendance_follow_up", 2));
  const channel = ruleChannel(rules, "attendance_follow_up", "telegram");
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const period = `${since}:${new Date().toISOString().slice(0, 10)}`;
  const nowIso = new Date().toISOString();
  const [{ data: attendanceRows }, { data: existing }] = await Promise.all([
    sb.from("academy_attendance").select("contact_id, status").eq("academy_id", academyId).gte("session_date", since).limit(20000),
    sb.from("academy_notifications").select("contact_id").eq("academy_id", academyId).eq("type", "attendance_follow_up").eq("metadata->>period", period).limit(10000),
  ]);
  const existingContacts = new Set(((existing ?? []) as Array<Record<string, unknown>>).map((item) => String(item.contact_id)));
  const absences = new Map<string, number>();
  for (const record of (attendanceRows ?? []) as Array<Record<string, unknown>>) {
    if (String(record.status) !== "absent") continue;
    const contactId = String(record.contact_id ?? "");
    if (contactId) absences.set(contactId, (absences.get(contactId) ?? 0) + 1);
  }
  const contactIds = Array.from(absences.entries()).filter(([, count]) => count >= threshold).map(([contactId]) => contactId);
  if (contactIds.length === 0) return 0;

  const { data: contacts } = await sb.from("academy_contacts")
    .select("id, first_name, email, telegram_id, notify_enabled")
    .eq("academy_id", academyId)
    .in("id", contactIds)
    .limit(1000);

  let queued = 0;
  for (const contact of (contacts ?? []) as Array<Record<string, unknown>>) {
    const contactId = String(contact.id);
    if (existingContacts.has(contactId) || contact.notify_enabled === false) continue;
    const target = channel === "email" ? normalizeEmail(contact.email) : normalizeText(contact.telegram_id, 120);
    if (!target && channel !== "inapp") continue;
    const count = absences.get(contactId) ?? threshold;
    await sb.from("academy_notifications").insert({
      academy_id: academyId,
      contact_id: contactId,
      channel,
      type: "attendance_follow_up",
      title: "Attendance follow-up",
      body: `Hi ${String(contact.first_name ?? "") || "there"}, we noticed ${count} missed class sessions recently. Please contact your teacher so we can help you catch up.`,
      target: target || null,
      status: "queued",
      scheduled_at: nowIso,
      metadata: { period, absence_count: count, automation_rule: "attendance_follow_up" },
    });
    queued++;
  }
  return queued;
};

const runEducationAutomationRules = async (
  sb: SupabaseClientLike,
  academyId: string,
  userId: string | null = null,
): Promise<Record<string, unknown>> => {
  const rules = await loadEducationAutomationRules(sb, academyId, userId);
  const dueQueued = await queueDueReminders(sb, academyId);
  const classQueued = await queueClassReminders(sb, academyId);
  const attendanceQueued = await queueAttendanceFollowupsForAcademy(sb, academyId, rules);
  const riskResult = ruleIsActive(rules, "at_risk_scan")
    ? await computeAtRiskForAcademy(sb, academyId)
    : { atRisk: [], scanned: 0 };
  await buildEducationOS(sb, academyId, userId);

  const summary = {
    due_queued: dueQueued,
    class_queued: classQueued,
    attendance_queued: attendanceQueued,
    at_risk_flagged: riskResult.atRisk.length,
    at_risk_scanned: riskResult.scanned,
  };
  await sb.from("academy_automation_rules")
    .update({ last_run_at: new Date().toISOString(), last_run_summary: summary })
    .eq("academy_id", academyId);
  return summary;
};

const isAcademyTenant = (tenant: Record<string, unknown>): boolean => {
  const meta = toJsonObject(tenant.metadata);
  return String(tenant.type ?? "").toLowerCase() === "team" ||
    String(meta.service_family ?? "").toLowerCase() === "academy" ||
    meta.academy_service === true || meta.center_owned === true;
};

const queueAcademyMorningBrief = async (
  sb: SupabaseClientLike,
  academyId: string,
): Promise<{ queued: number; metrics: Record<string, number>; body: string }> => {
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [tenantResult, enrollmentsResult, alertsResult, submissionsResult, attendanceResult, leadsResult, ownersResult] = await Promise.all([
    sb.from("tenants").select("name").eq("id", academyId).maybeSingle(),
    sb.from("academy_classroom_memberships").select("contact_id").eq("academy_id", academyId).in("role", ["student", "observer"]).limit(20000),
    sb.from("academy_alerts").select("id", { count: "exact", head: true }).eq("academy_id", academyId).eq("resolved", false),
    sb.from("academy_submissions").select("id", { count: "exact", head: true }).eq("academy_id", academyId).in("status", ["submitted", "resubmitted", "late"]).is("score", null),
    sb.from("academy_attendance").select("contact_id").eq("academy_id", academyId).eq("status", "absent").gte("session_date", since).limit(20000),
    sb.from("sales_leads").select("id", { count: "exact", head: true }).eq("tenant_id", academyId).in("status", ["new", "contacted", "qualified", "demo_scheduled"]),
    sb.from("tenant_memberships").select("user_id,users(telegram_chat_id)").eq("tenant_id", academyId).eq("status", "active").in("role", ["owner", "admin"]),
  ]);
  const queryFailure = [tenantResult, enrollmentsResult, alertsResult, submissionsResult, attendanceResult, leadsResult, ownersResult]
    .map((result) => result.error)
    .find(Boolean);
  if (queryFailure) throw new Error(`Failed to build academy morning brief: ${queryFailure.message}`);
  const absenceCounts = new Map<string, number>();
  for (const row of (attendanceResult.data ?? []) as Array<Record<string, unknown>>) {
    const contactId = String(row.contact_id ?? "");
    if (contactId) absenceCounts.set(contactId, (absenceCounts.get(contactId) ?? 0) + 1);
  }
  const metrics = {
    active_students: new Set(((enrollmentsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.contact_id ?? "")).filter(Boolean)).size,
    repeat_absences_7d: [...absenceCounts.values()].filter((count) => count >= 2).length,
    grading_backlog: submissionsResult.count ?? 0,
    unresolved_alerts: alertsResult.count ?? 0,
    open_sales_leads: leadsResult.count ?? 0,
  };
  const academyName = normalizeText((tenantResult.data as Record<string, unknown> | null)?.name, 160) || "Your academy";
  const body = [
    `Morning brief — ${academyName}`,
    "",
    `${metrics.active_students} active students`,
    `${metrics.repeat_absences_7d} students absent twice this week`,
    `${metrics.grading_backlog} submissions awaiting grading`,
    `${metrics.unresolved_alerts} unresolved operational alerts`,
    `${metrics.open_sales_leads} sales leads awaiting resolution`,
  ].join("\n");
  const day = new Date().toISOString().slice(0, 10);
  let queued = 0;
  for (const membership of (ownersResult.data ?? []) as Array<Record<string, unknown>>) {
    const chatId = normalizeText((membership.users as Record<string, unknown> | null)?.telegram_chat_id, 80);
    const ownerUserId = normalizeText(membership.user_id, 80);
    if (!chatId || !ownerUserId) continue;
    const { error } = await sb.from("academy_notifications").insert({
      academy_id: academyId,
      user_id: ownerUserId,
      channel: "telegram",
      type: "academy_morning_brief",
      category: "academic_required",
      title: `Morning brief — ${academyName}`,
      body: body.split("\n").slice(2).join("\n"),
      target: chatId,
      status: "queued",
      dedupe_key: `academy_morning_brief:${academyId}:${ownerUserId}:${day}`,
      cta_url: `${Deno.env.get("SITE_URL") ?? "https://schood.online"}/academy?academy_id=${encodeURIComponent(academyId)}&source=telegram_brief`,
      metadata: { metrics, generated_at: new Date().toISOString(), schedule_timezone: "UTC" },
    });
    if (!error) queued += 1;
    else if (error.code !== "23505") throw new Error(error.message);
  }
  return { queued, metrics, body };
};

const runAcademyMaintenance = async (
  sb: SupabaseClientLike,
  cycle: string,
): Promise<Record<string, unknown>> => {
  if (cycle === "morning_brief") {
    const { data: tenants, error } = await sb.from("tenants").select("id, type, metadata").limit(10000);
    if (error) throw new Error(`Failed to load academy tenants: ${error.message}`);
    let academies = 0;
    let queued = 0;
    for (const tenant of (tenants ?? []) as Array<Record<string, unknown>>) {
      if (!isAcademyTenant(tenant)) continue;
      academies += 1;
      const result = await queueAcademyMorningBrief(sb, String(tenant.id));
      queued += result.queued;
    }
    const dispatch = await dispatchQueuedNotifications(sb, null);
    return { cycle: "morning_brief", timezone: "UTC", academies, queued, ...dispatch };
  }
  if (cycle === "automation_events") return await runAcademyAutomationEvents(sb);
  if (cycle === "at_risk") {
    const { data: tenants } = await sb.from("tenants").select("id, type, metadata").limit(10000);
    let scanned = 0, flagged = 0, academies = 0;
    for (const t of (tenants ?? []) as Array<Record<string, unknown>>) {
      if (!isAcademyTenant(t)) continue;
      academies++;
      const r = await computeAtRiskForAcademy(sb, String(t.id));
      scanned += r.scanned;
      flagged += r.atRisk.length;
    }
    return { cycle: "at_risk", academies, scanned, flagged };
  }

  // Default "dispatch" cycle: queue reminders, then send everything pending.
  const dueQueued = await queueDueReminders(sb);
  const classQueued = await queueClassReminders(sb);
  const journeyDispatch = await advanceCommunicationJourneys(sb, null, null, 100).catch((error) => ({
    processed: 0,
    queued: 0,
    paused: 0,
    completed: 0,
    failed: 0,
    error: error instanceof Error ? error.message : String(error),
  }));
  const dispatch = await dispatchQueuedNotifications(sb, null);
  const integrationDispatch = await dispatchIntegrationEvents(sb, null, 50).catch((error) => ({
    processed: 0,
    delivered: 0,
    retrying: 0,
    failed: 0,
    error: error instanceof Error ? error.message : String(error),
  }));
  return { cycle: "dispatch", due_queued: dueQueued, class_queued: classQueued, ...dispatch, journeys: journeyDispatch, integrations: integrationDispatch };
};

const sha256Hex = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const createOpaqueToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const academyInvitationRedirect = (token: string): string =>
  `https://academy.schood.online/invitations/accept?token=${encodeURIComponent(token)}`;

const academyWebhookUrlIsPublic = (rawUrl: string): boolean => {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (["0.0.0.0", "127.0.0.1", "::1"].includes(host)) return false;
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
    const private172 = host.match(/^172\.(\d+)\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    return true;
  } catch {
    return false;
  }
};

const academyWebhookAddressIsPublic = (address: string): boolean => {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return false;
  const ipv4 = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ipv4)) return true;
  const parts = ipv4.split(".").map(Number);
  return !(parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
};

const academyWebhookUrlResolvesPublicly = async (rawUrl: string): Promise<boolean> => {
  if (!academyWebhookUrlIsPublic(rawUrl)) return false;
  const host = new URL(rawUrl).hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return academyWebhookAddressIsPublic(host);
  try {
    const [ipv4, ipv6] = await Promise.all([
      Deno.resolveDns(host, "A").catch(() => [] as string[]),
      Deno.resolveDns(host, "AAAA").catch(() => [] as string[]),
    ]);
    const addresses = [...ipv4, ...ipv6];
    return addresses.length > 0 && addresses.every(academyWebhookAddressIsPublic);
  } catch {
    return false;
  }
};

const renderJourneyTemplate = (template: string, values: Record<string, string>): string =>
  template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");

async function advanceCommunicationJourneys(
  sb: SupabaseClientLike,
  academyId: string | null,
  actorUserId: string | null,
  limit = 50,
  academyName = "Academy",
): Promise<{ processed: number; queued: number; paused: number; completed: number; failed: number }> {
  const nowIso = new Date().toISOString();
  let query = sb.from("academy_communication_enrollments").select("*").eq("status", "active").lte("next_step_at", nowIso).order("next_step_at").limit(limit);
  if (academyId) query = query.eq("academy_id", academyId);
  const { data: dueRows, error } = await query;
  if (error) throw new Error(`Failed to load due communication journeys: ${error.message}`);
  let queued = 0, paused = 0, completed = 0, failed = 0;
  for (const enrollment of (dueRows ?? []) as Array<Record<string, unknown>>) {
    const rowAcademyId = String(enrollment.academy_id ?? academyId ?? "");
    if (!rowAcademyId) { failed++; continue; }
    const { data: journey } = await sb.from("academy_communication_journeys").select("id,name,audience,status").eq("academy_id", rowAcademyId).eq("id", enrollment.journey_id).maybeSingle();
    const { data: step } = await sb.from("academy_communication_journey_steps").select("*").eq("academy_id", rowAcademyId).eq("journey_id", enrollment.journey_id).eq("position", enrollment.current_position).eq("is_active", true).maybeSingle();
    if (!journey?.id || journey.status !== "active" || !step?.id) {
      await sb.from("academy_communication_enrollments").update({ status: "failed", metadata: { ...toJsonObject(enrollment.metadata), error: "Journey or active step unavailable" } }).eq("academy_id", rowAcademyId).eq("id", enrollment.id);
      failed++;
      continue;
    }
    let recipient: Record<string, unknown> | null = null;
    if (enrollment.contact_id) recipient = (await sb.from("academy_contacts").select("id,first_name,last_name,email,telegram_id").eq("academy_id", rowAcademyId).eq("id", enrollment.contact_id).maybeSingle()).data;
    else if (enrollment.guardian_id) recipient = (await sb.from("academy_guardians").select("id,full_name,email,telegram_chat_id").eq("academy_id", rowAcademyId).eq("id", enrollment.guardian_id).maybeSingle()).data;
    else if (enrollment.staff_id) recipient = (await sb.from("academy_staff").select("id,display_name,email").eq("academy_id", rowAcademyId).eq("id", enrollment.staff_id).maybeSingle()).data;
    if (!recipient?.id) {
      await sb.from("academy_communication_enrollments").update({ status: "failed", metadata: { ...toJsonObject(enrollment.metadata), error: "Recipient unavailable" } }).eq("academy_id", rowAcademyId).eq("id", enrollment.id);
      failed++;
      continue;
    }
    const displayName = normalizeText(recipient.full_name ?? recipient.display_name ?? `${String(recipient.first_name ?? "")} ${String(recipient.last_name ?? "")}`, 180) || "there";
    const values = { name: displayName, academy_name: academyName };
    const title = step.title_template ? renderJourneyTemplate(String(step.title_template), values) : String(journey.name);
    const message = renderJourneyTemplate(String(step.body_template), values);
    if (step.requires_review === true) {
      await sb.from("academy_action_items").insert({ academy_id: rowAcademyId, dedupe_key: `journey-review:${String(enrollment.id)}:${String(step.position)}`, source_type: "communication_journey", category: "operations", priority: "medium", title: `Review message for ${displayName}`, description: message, recommended_action: "Review and send the communication, then resume the journey.", contact_id: enrollment.contact_id ?? null, due_at: nowIso, status: "open", created_by: actorUserId, metadata: { journey_id: journey.id, enrollment_id: enrollment.id, step_id: step.id, channel: step.channel, title } });
      await sb.from("academy_communication_enrollments").update({ status: "paused", last_step_at: nowIso }).eq("academy_id", rowAcademyId).eq("id", enrollment.id);
      paused++;
      continue;
    }
    const channel = String(step.channel);
    const target = channel === "email" ? normalizeEmail(recipient.email) : channel === "telegram" ? normalizeText(recipient.telegram_chat_id ?? recipient.telegram_id, 120) : null;
    if (channel !== "inapp" && !target) {
      await sb.from("academy_communication_enrollments").update({ status: "failed", metadata: { ...toJsonObject(enrollment.metadata), error: `No ${channel} destination` } }).eq("academy_id", rowAcademyId).eq("id", enrollment.id);
      failed++;
      continue;
    }
    const { error: notificationError } = await sb.from("academy_notifications").insert({ academy_id: rowAcademyId, contact_id: enrollment.contact_id ?? null, guardian_id: enrollment.guardian_id ?? null, channel, type: "communication_journey", event_key: "communication_journey", dedupe_key: `journey:${String(enrollment.id)}:${String(step.position)}`, title, body: message, target, status: "queued", scheduled_at: nowIso, metadata: { journey_id: journey.id, enrollment_id: enrollment.id, step_id: step.id, staff_id: enrollment.staff_id ?? null } });
    if (notificationError) {
      await sb.from("academy_communication_enrollments").update({ status: "failed", metadata: { ...toJsonObject(enrollment.metadata), error: notificationError.message } }).eq("academy_id", rowAcademyId).eq("id", enrollment.id);
      failed++;
      continue;
    }
    queued++;
    const { data: nextStep } = await sb.from("academy_communication_journey_steps").select("position,delay_minutes").eq("academy_id", rowAcademyId).eq("journey_id", journey.id).eq("is_active", true).gt("position", step.position).order("position").limit(1).maybeSingle();
    if (nextStep?.position) {
      await sb.from("academy_communication_enrollments").update({ current_position: nextStep.position, next_step_at: new Date(Date.now() + Number(nextStep.delay_minutes ?? 0) * 60_000).toISOString(), last_step_at: nowIso }).eq("academy_id", rowAcademyId).eq("id", enrollment.id);
    } else {
      await sb.from("academy_communication_enrollments").update({ status: "completed", last_step_at: nowIso }).eq("academy_id", rowAcademyId).eq("id", enrollment.id);
      completed++;
    }
  }
  return { processed: dueRows?.length ?? 0, queued, paused, completed, failed };
}

async function dispatchIntegrationEvents(
  sb: SupabaseClientLike,
  academyId: string | null,
  limit = 20,
): Promise<{ processed: number; delivered: number; retrying: number; failed: number }> {
  let query = sb.from("academy_integration_deliveries").select("*").in("status", ["queued", "retrying"]).lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
  if (academyId) query = query.eq("academy_id", academyId);
  const { data: dueRows, error } = await query;
  if (error) throw new Error(`Failed to load integration queue: ${error.message}`);
  let delivered = 0, retrying = 0, failed = 0;
  for (const delivery of (dueRows ?? []) as Array<Record<string, unknown>>) {
    const rowAcademyId = String(delivery.academy_id ?? academyId ?? "");
    const { data: endpoint } = await sb.from("academy_integration_endpoints").select("*").eq("academy_id", rowAcademyId).eq("id", delivery.endpoint_id).eq("status", "active").maybeSingle();
    if (!endpoint?.id || !(await academyWebhookUrlResolvesPublicly(String(endpoint.endpoint_url)))) {
      await sb.from("academy_integration_deliveries").update({ status: "failed", error: "Endpoint unavailable or unsafe" }).eq("academy_id", rowAcademyId).eq("id", delivery.id);
      failed++;
      continue;
    }
    const payloadText = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(endpoint.signing_secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payloadText}`));
    const signature = Array.from(new Uint8Array(signatureBytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    await sb.from("academy_integration_deliveries").update({ status: "delivering", attempts: Number(delivery.attempts ?? 0) + 1 }).eq("academy_id", rowAcademyId).eq("id", delivery.id);
    try {
      const response = await fetch(String(endpoint.endpoint_url), { method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/json", "user-agent": "Schood-Academy-Webhook/1.0", "x-schood-event": String(delivery.event_type), "x-schood-delivery": String(delivery.id), "x-schood-timestamp": timestamp, "x-schood-signature": `sha256=${signature}` }, body: payloadText });
      const excerpt = (await response.text()).slice(0, 500);
      if (response.ok) {
        await sb.from("academy_integration_deliveries").update({ status: "delivered", response_status: response.status, response_excerpt: excerpt, error: null, delivered_at: new Date().toISOString() }).eq("academy_id", rowAcademyId).eq("id", delivery.id);
        await sb.from("academy_integration_endpoints").update({ consecutive_failures: 0, last_success_at: new Date().toISOString() }).eq("academy_id", rowAcademyId).eq("id", endpoint.id);
        delivered++;
      } else {
        const attempts = Number(delivery.attempts ?? 0) + 1;
        const terminal = attempts >= 5 || response.status === 410;
        await sb.from("academy_integration_deliveries").update({ status: terminal ? "failed" : "retrying", response_status: response.status, response_excerpt: excerpt, error: `HTTP ${response.status}`, next_attempt_at: new Date(Date.now() + Math.min(24 * 60, 2 ** attempts * 5) * 60_000).toISOString() }).eq("academy_id", rowAcademyId).eq("id", delivery.id);
        await sb.from("academy_integration_endpoints").update({ consecutive_failures: Number(endpoint.consecutive_failures ?? 0) + 1, last_failure_at: new Date().toISOString(), ...(response.status === 410 ? { status: "paused" } : {}) }).eq("academy_id", rowAcademyId).eq("id", endpoint.id);
        terminal ? failed++ : retrying++;
      }
    } catch (dispatchError) {
      const attempts = Number(delivery.attempts ?? 0) + 1;
      const terminal = attempts >= 5;
      await sb.from("academy_integration_deliveries").update({ status: terminal ? "failed" : "retrying", error: String(dispatchError instanceof Error ? dispatchError.message : dispatchError).slice(0, 500), next_attempt_at: new Date(Date.now() + Math.min(24 * 60, 2 ** attempts * 5) * 60_000).toISOString() }).eq("academy_id", rowAcademyId).eq("id", delivery.id);
      await sb.from("academy_integration_endpoints").update({ consecutive_failures: Number(endpoint.consecutive_failures ?? 0) + 1, last_failure_at: new Date().toISOString() }).eq("academy_id", rowAcademyId).eq("id", endpoint.id);
      terminal ? failed++ : retrying++;
    }
  }
  return { processed: dueRows?.length ?? 0, delivered, retrying, failed };
}

const localDateTimeToIso = (date: string, time: string, timeZone: string): string => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) throw new Error("Invalid local date or time");
  const wanted = Date.UTC(year, month - 1, day, hour, minute, Number.isFinite(second) ? second : 0);
  let utcGuess = wanted;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(utcGuess)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    utcGuess += wanted - represented;
  }
  return new Date(utcGuess).toISOString();
};

const dateRange = (startsOn: string, endsOn: string): string[] => {
  const start = new Date(`${startsOn}T00:00:00Z`);
  const end = new Date(`${endsOn}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) throw new Error("Invalid timetable date range");
  const dates: string[] = [];
  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += 86_400_000) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    if (dates.length > 370) throw new Error("A timetable generation window cannot exceed 370 days");
  }
  return dates;
};

export const __academyAccessTest = {
  normalizeAcademyRole,
  buildAcademyPermissions,
  academyAccessProfile,
  academyAccessHas,
};

export const handleAcademyRequest = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const anonKey = getEnv("SUPABASE_ANON_KEY");
    const serviceRole = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

    // Public verification is token-addressed and opt-in. Never expose private report notes,
    // contacts, tokens for other certificates, or the reason for an investigation.
    const verificationUrl = new URL(req.url);
    if (req.method === 'GET' && verificationUrl.searchParams.get('action') === 'assessment_verify_certificate') {
      const certificateToken = verificationUrl.searchParams.get('token') ?? '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(certificateToken)) return json(404,{error:'Certificate not found'});
      const {data:certificate,error}=await sb.from('academy_assessment_certificates').select('snapshot,issued_at,revoked_at,public_consent,version').eq('public_token',certificateToken).maybeSingle();
      if(error)return json(503,{error:'Certificate verification is temporarily unavailable'});
      if(!certificate)return json(404,{error:'Certificate not found'});
      const snapshot=certificate.snapshot as Record<string,unknown>;
      return new Response(JSON.stringify({
        status:certificate.revoked_at ? 'withdrawn' : certificate.public_consent ? 'verified' : 'private',
        issued_at:certificate.issued_at,version:certificate.version,
        ...(certificate.public_consent && !certificate.revoked_at ? {
          academy:snapshot.academy,name:snapshot.name,title:snapshot.title,assessed_at:snapshot.assessed_at,
          score:(snapshot.summary as Record<string,unknown>)?.percent,
          classification:'Schood mock assessment — not an official IELTS result or CEFR certificate',
        } : {}),
      }),{status:200,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
    }

    // ── Cron worker path: authenticated via x-worker-secret ────────────────
    const workerSecret = req.headers.get("x-worker-secret");
    if (workerSecret) {
      const envWorkerSecret = getOptionalEnv("ACADEMY_WORKER_SECRET");
      const dbWorkerSecret = envWorkerSecret
        ? null
        : await sb
          .from("internal_runtime_secrets")
          .select("secret")
          .eq("key", "academy_worker_secret")
          .maybeSingle();
      const expectedWorkerSecret = envWorkerSecret ?? String(dbWorkerSecret?.data?.secret ?? "").trim();
      if (!expectedWorkerSecret || expectedWorkerSecret !== workerSecret) {
        return json(401, { error: "Unauthorized" });
      }
      const cronBody = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      const cycle = normalizeText((cronBody as Record<string, unknown>)?.worker_cycle, 30).toLowerCase() || "dispatch";
      const result = await runAcademyMaintenance(sb, cycle);
      return json(200, { ok: true, ...result });
    }

    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Unauthorized" });

    const authSb = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

    const { data: authData, error: authError } = await authSb.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { error: "Unauthorized" });

    const userId = authData.user.id;
    const userEmail = authData.user.email_confirmed_at ? (authData.user.email ?? null) : null;
    const url = new URL(req.url);
    const actionQuery = normalizeText(url.searchParams.get("action"), 64).toLowerCase();
    const contentType = req.headers.get("content-type") ?? "";
    const body = req.method === "POST"
      ? actionQuery==='audio_upload'
        ? await readAudioUploadRequest(req) as StudioBody
        : studentImportActions.has(actionQuery)
        ? (await readStudentImportRequest(req)) as StudioBody
        : contentType.includes("multipart/form-data")
        ? formDataToStudioBody(await req.formData())
        : (await req.json()) as StudioBody
      : null;
    const rawActionBody = normalizeText(body?.action, 64).toLowerCase();
    const nestedCommand=normalizeText(body?.command,64).toLowerCase();
    if(rawActionBody==='staff_access_command'&&!staffAccessActions.has(nestedCommand))throw new StaffAccessError(400,"Choose a valid staff command.");
    if(rawActionBody==='access_invitation_command'&&!["create_access_invitation","resend_access_invitation","revoke_access_invitation"].includes(nestedCommand))throw new StaffInvitationError(400,"Choose a valid invitation command.");
    if(rawActionBody==='finance_read_command'&&!['commercial_core','operations_finance'].includes(nestedCommand))throw new LegacyImportCommandError(400,'Choose a valid financial workspace.');
    if(rawActionBody==='finance_command'&&!financeActions.has(nestedCommand))throw new LegacyImportCommandError(400,'Choose a valid financial action.');
    if(rawActionBody==='staff_guardian_command'&&!staffGuardianActions.has(nestedCommand))throw new LegacyImportCommandError(400,'Choose a valid parent action.');
    if(rawActionBody==='legacy_import_command'&&!['create_import_job','add_import_row','commit_import_job','rollback_import_job'].includes(nestedCommand))throw new LegacyImportCommandError(400,'Choose a valid import command.');
    if(rawActionBody==='staff_import_command'&&!['commit_import_job','rollback_import_job'].includes(nestedCommand))throw new LegacyStaffImportError(400,'Choose a valid staff import command.');
    if(rawActionBody==='invitation_link_command'&&!['invitation_status','accept_access_invitation'].includes(nestedCommand))throw new LearnerInvitationError(400,'Choose a valid invitation action.');
    if(rawActionBody==='guardian_portal_read_command'&&!['guardian_dashboard','guardian_service_requests','guardian_history'].includes(nestedCommand))throw new GuardianPortalError(400,'Choose a valid parent portal page.');
    if(rawActionBody==='guardian_link_command'&&nestedCommand!=='guardian_claim_link')throw new GuardianPortalError(400,'Review and confirm the parent invitation.');
    if(rawActionBody==='guardian_portal_write_command'&&!guardianWriteActions.has(nestedCommand))throw new GuardianPortalError(400,'Choose a valid parent command.');
    const actionBody = ['finance_read_command','finance_command','guardian_portal_write_command','staff_access_command','access_invitation_command','staff_import_command','staff_guardian_command','legacy_import_command','invitation_link_command','guardian_portal_read_command','guardian_link_command'].includes(rawActionBody)?nestedCommand:rawActionBody;
    const requestedAction = actionBody || actionQuery;
    if(audioActions.has(requestedAction)){
      if(req.method!=='POST')return json(405,{error:'Method not allowed'});
      const result=await runAssignmentAudio(sb,{
        upload:async(key,file,mime)=>{const {error}=await sb.storage.from(audioBucket).upload(key,file,{contentType:mime,upsert:true,cacheControl:'0'});if(error)throw Error('Private audio upload unavailable');},
        download:async key=>{const {data,error}=await sb.storage.from(audioBucket).download(key);if(error||!data)throw Error('Private audio download unavailable');return new Uint8Array(await data.arrayBuffer());},
      },userId,requestedAction,body??{},Deno.env.get('ACADEMY_AUDIO_ENCRYPTION_KEY')??'');
      if('bytes' in result&&result.bytes instanceof Uint8Array){
        const headers=new Headers(json(200,{}).headers);headers.set('Content-Type',String(result.mime));headers.set('X-Schood-Actor',userId);headers.set('X-Schood-Audio',String(result.audio_id));
        headers.set('Access-Control-Expose-Headers','X-Schood-Actor,X-Schood-Audio');headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');
        return new Response(result.bytes,{status:200,headers});
      }
      return json(200,result);
    }

    if (requestedAction === "invitation_status") {
      const invitationToken = normalizeText(req.method === "POST" ? body?.token : url.searchParams.get("token"), 240);
      if (!invitationToken) return json(400, { error: "token is required" });
      const tokenHash = await sha256Hex(invitationToken);
      const { data: invitation, error } = await sb.from("academy_access_invitations")
        .select("id,academy_id,invite_kind,email,role,token_expires_at,status,delivery_status,created_at,accepted_by")
        .eq("token_hash", tokenHash).maybeSingle();
      if (error) return json(500, { error: "Failed to inspect invitation", detail: error.message });
      if (!invitation?.id) return json(404, { error: "Invitation not found" });
      if (['student','guardian'].includes(String(invitation.invite_kind))) {
        const result=await inspectLearnerInvitation(sb,userId,tokenHash);
        const row=result.invitation as Record<string,unknown>;
        const {data:academy}=await sb.from('tenants').select('id,name,slug').eq('id',row.academy_id).maybeSingle();
        return json(200,{invitation:{...row,academy}});
      }
      if(invitation.status==='accepted'&&String(invitation.accepted_by)!==userId)throw new LearnerInvitationError(403,'This invitation belongs to another account.');
      const { data: academy } = await sb.from("tenants").select("id,name,slug").eq("id", invitation.academy_id).maybeSingle();
      const email = String(invitation.email ?? "");
      const [localPart, domain] = email.split("@");
      const maskedEmail = domain ? `${localPart.slice(0, 2)}***@${domain}` : "***";
      return json(200, {
        invitation: {
          id: invitation.id,
          academy_id: invitation.academy_id,
          academy,
          invite_kind: invitation.invite_kind,
          role: invitation.role,
          email: maskedEmail,
          token_expires_at: invitation.token_expires_at,
          status: invitation.status,
          delivery_status: invitation.delivery_status,
          created_at: invitation.created_at,
        },
      });
    }

    if (requestedAction === "accept_access_invitation" && req.method === "POST") {
      const invitationToken = normalizeText(body?.token, 240);
      if (!invitationToken) return json(400, { error: "token is required" });
      const tokenHash = await sha256Hex(invitationToken);
      const { data: invitation, error } = await sb.from("academy_access_invitations").select("*")
        .eq("token_hash", tokenHash).maybeSingle();
      if (error) return json(500, { error: "Failed to load invitation", detail: error.message });
      if (!invitation?.id) return json(404, { error: "Invitation not found" });
      if (String(invitation.invite_kind) === "staff") {
        const accepted = await acceptStaffAccess(sb,userId,{tokenHash});
        return json(200,{invitation:accepted.invitation,replayed:accepted.replayed});
      }

      const accepted=await acceptLearnerInvitation(sb,userId,tokenHash,body?.review_hash);
      return json(200,accepted);
    }

    if (requestedAction === "student_service_requests" || requestedAction === "student_learning_plans") {
      const contacts = await loadStudentContacts(sb, userId, userEmail);
      const academyId = normalizeText(req.method === "POST" ? body?.academy_id : url.searchParams.get("academy_id"), 64);
      const contact = contacts.find((row) => !academyId || String(row.academy_id) === academyId);
      if (!contact?.id) return json(403, { error: "No student record is linked to this academy" });
      const contactAcademyId = String(contact.academy_id);
      const contactId = String(contact.id);
      if (requestedAction === "student_service_requests") {
        const { data: requests, error } = await sb.from("academy_service_requests").select("*")
          .eq("academy_id", contactAcademyId).eq("requester_user_id", userId).eq("contact_id", contactId)
          .order("created_at", { ascending: false }).limit(200);
        if (error) return json(500, { error: "Failed to load your requests", detail: error.message });
        const ids = ((requests ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
        const events = ids.length
          ? await sb.from("academy_service_request_events").select("*").eq("academy_id", contactAcademyId).in("request_id", ids).eq("visible_to_requester", true).order("created_at").limit(1000)
          : { data: [], error: null };
        return json(200, { requests: requests ?? [], events: events.data ?? [], contact_id: contactId, academy_id: contactAcademyId });
      }
      const { data: plans, error } = await sb.from("academy_learning_plans").select("*")
        .eq("academy_id", contactAcademyId).eq("contact_id", contactId).not("published_at", "is", null).order("created_at", { ascending: false }).limit(100);
      if (error) return json(500, { error: "Failed to load learning plans", detail: error.message });
      const planIds = ((plans ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
      const frameworkIds = Array.from(new Set(((plans ?? []) as Array<Record<string, unknown>>).map((row) => String(row.framework_id))));
      const [items, frameworks, competencies] = await Promise.all([
        planIds.length ? sb.from("academy_learning_plan_items").select("*").eq("academy_id", contactAcademyId).in("plan_id", planIds).order("created_at") : Promise.resolve({ data: [], error: null }),
        frameworkIds.length ? sb.from("academy_competency_frameworks").select("id,code,name,description,status").eq("academy_id", contactAcademyId).in("id", frameworkIds) : Promise.resolve({ data: [], error: null }),
        frameworkIds.length ? sb.from("academy_competencies").select("id,framework_id,parent_id,code,title,description,level_scale,position,status").eq("academy_id", contactAcademyId).in("framework_id", frameworkIds).order("position") : Promise.resolve({ data: [], error: null }),
      ]);
      const itemIds = ((items.data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
      const evidence = itemIds.length ? await sb.from("academy_competency_evidence").select("*").eq("academy_id", contactAcademyId).in("plan_item_id", itemIds).order("observed_at", { ascending: false }).limit(1000) : { data: [], error: null };
      const failed = [items, frameworks, competencies, evidence].find((result) => result.error);
      if (failed?.error) return json(500, { error: "Failed to load learning plan details", detail: failed.error.message });
      return json(200, { plans: plans ?? [], items: items.data ?? [], frameworks: frameworks.data ?? [], competencies: competencies.data ?? [], evidence: evidence.data ?? [], contact_id: contactId, academy_id: contactAcademyId });
    }

    if (requestedAction === "student_service_request_create" && req.method === "POST") {
      const contacts = await loadStudentContacts(sb, userId, userEmail);
      const academyId = normalizeText(body?.academy_id, 64);
      const contact = contacts.find((row) => String(row.academy_id) === academyId);
      if (!contact?.id) return json(403, { error: "No student record is linked to this academy" });
      const requestType = normalizeText(body?.request_type, 40).toLowerCase();
      const allowedTypes = ["make_up", "freeze", "transfer", "refund", "schedule_change", "document", "support", "other"];
      const subject = normalizeText(body?.subject, 200);
      const details = normalizeText(body?.details, 5000);
      if (!allowedTypes.includes(requestType) || !subject || !details) return json(400, { error: "request_type, subject, and details are required" });
      const classroomId = normalizeText(body?.classroom_id, 64) || null;
      if (classroomId) {
        const { data: membership } = await sb.from("academy_classroom_memberships").select("id").eq("academy_id", academyId).eq("classroom_id", classroomId).eq("contact_id", contact.id).in("status", ["active", "paused", "completed"]).maybeSingle();
        if (!membership?.id) return json(403, { error: "This classroom is not part of your student record" });
      }
      const { data: request, error } = await sb.from("academy_service_requests").insert({ academy_id: academyId, branch_id: contact.primary_branch_id ?? null, requester_kind: "student", requester_user_id: userId, contact_id: contact.id, classroom_id: classroomId, charge_id: normalizeText(body?.charge_id, 64) || null, request_type: requestType, subject, details, priority: "normal", desired_date: normalizeText(body?.desired_date, 20) || null, sla_due_at: new Date(Date.now() + 2 * 86_400_000).toISOString(), metadata: { source: "student_workspace" } }).select("*").single();
      if (error) return json(400, { error: "Failed to submit request", detail: error.message });
      await sb.from("academy_service_request_events").insert({ academy_id: academyId, request_id: request.id, event_type: "submitted", to_status: "submitted", actor_user_id: userId, note: "Submitted by student", visible_to_requester: true });
      await logAcademyAuditEvent(sb, { academyId, actorUserId: userId, actorRole: "student", action: "service_request.submitted", targetType: "academy_service_request", targetId: String(request.id), contactId: String(contact.id), classroomId, metadata: { request_type: requestType } });
      return json(200, { request });
    }

    if (requestedAction === "submit_sensitive_report" && req.method === "POST") {
      const reporterKind = normalizeText(body?.reporter_kind, 20).toLowerCase();
      const academyId = normalizeText(body?.academy_id, 64);
      const caseType = normalizeText(body?.case_type, 40).toLowerCase();
      const title = normalizeText(body?.title, 240);
      const description = normalizeText(body?.description, 10000);
      const severity = normalizeText(body?.severity, 20).toLowerCase() || "medium";
      if (!academyId || !["student", "guardian"].includes(reporterKind) || !["complaint", "safeguarding", "harassment", "conduct", "privacy", "academic_integrity", "other"].includes(caseType) || !title || !description || !["low", "medium", "high", "critical"].includes(severity)) {
        return json(400, { error: "academy_id, reporter_kind, case_type, title, description, and severity are required" });
      }
      let reporterContactId: string | null = null;
      if (reporterKind === "student") {
        const contacts = await loadStudentContacts(sb, userId, userEmail);
        const contact = contacts.find((row) => String(row.academy_id) === academyId);
        if (!contact?.id) return json(403, { error: "No student record is linked to this academy" });
        reporterContactId = String(contact.id);
      } else {
        const relationshipId = normalizeText(body?.relationship_id, 64);
        const { data: relationship } = await sb.from("academy_student_guardian_relationships").select("id,guardian_id,contact_id,status,consent_status").eq("academy_id", academyId).eq("id", relationshipId).eq("status", "active").eq("consent_status", "granted").maybeSingle();
        if (!relationship?.id) return json(403, { error: "Guardian relationship is not active" });
        const { data: guardian } = await sb.from("academy_guardians").select("id").eq("academy_id", academyId).eq("id", relationship.guardian_id).eq("user_id", userId).eq("status", "verified").maybeSingle();
        if (!guardian?.id) return json(403, { error: "Forbidden" });
        reporterContactId = String(relationship.contact_id);
      }
      const requestedSubjectContactId = normalizeText(body?.subject_contact_id, 64) || reporterContactId;
      if (requestedSubjectContactId !== reporterContactId) return json(403, { error: "You can only submit a private report for the linked learner" });
      const { data: sensitiveCase, error } = await sb.from("academy_sensitive_cases").insert({ academy_id: academyId, case_type: caseType, title, description, severity, confidentiality: "restricted", status: "open", reporter_user_id: userId, reporter_contact_id: reporterContactId, subject_contact_id: reporterContactId, created_by: userId, metadata: { source: `${reporterKind}_workspace`, reporter_kind: reporterKind } }).select("id,case_number,case_type,severity,status,created_at").single();
      if (error) return json(400, { error: "Failed to submit restricted report", detail: error.message });
      await sb.from("academy_sensitive_case_events").insert({ academy_id: academyId, case_id: sensitiveCase.id, event_type: "created", to_status: "open", note: `Submitted by ${reporterKind}`, actor_user_id: userId });
      return json(200, { report: sensitiveCase });
    }

    if (requestedAction === "student-feed") {
      return await loadStudentFeed(sb, userId, userEmail);
    }
    if (requestedAction === "student-dashboard") {
      return await loadStudentDashboard(sb, userId, userEmail);
    }

    if (requestedAction === "guardian_claim_link" && req.method === "POST") {
      return json(200,await claimGuardianFromTelegram(sb,userId,body as Record<string,unknown>,getOptionalEnv('ACADEMY_TELEGRAM_BOT_TOKEN')??''));
    }

    if (requestedAction === "guardian_dashboard") {
      return json(200,rawActionBody==='guardian_portal_read_command'
        ? await readGuardianPortal(sb,userId,body as Record<string,unknown>)
        : await readLegacyGuardianPortal(sb,userId));
    }

    if (requestedAction === "guardian_history" && req.method === "POST") {
      return json(200,await readGuardianHistory(sb,userId,body as Record<string,unknown>));
    }

    if (requestedAction === "guardian_update_preferences" && req.method === "POST") {
      return json(200,await writeGuardianPortal(sb,userId,requestedAction,body as Record<string,unknown>,rawActionBody==='guardian_portal_write_command'));
    }

    if (requestedAction === "guardian_send_message" && req.method === "POST") {
      return json(200,await writeGuardianPortal(sb,userId,requestedAction,body as Record<string,unknown>,rawActionBody==='guardian_portal_write_command'));
    }

    if (requestedAction === "guardian_service_requests") {
      return json(200,rawActionBody==='guardian_portal_read_command'
        ? await readGuardianRequests(sb,userId,body?.relationship_id)
        : await readLegacyGuardianRequests(sb,userId,normalizeText(req.method==='POST'?body?.academy_id:url.searchParams.get('academy_id'),64)||undefined));
    }

    if (requestedAction === "guardian_service_request_create" && req.method === "POST") {
      return json(200,await writeGuardianPortal(sb,userId,requestedAction,body as Record<string,unknown>,rawActionBody==='guardian_portal_write_command'));
    }

    const memberships = await loadMemberships(sb, userId, userEmail);

    if (studentImportActions.has(requestedAction)) {
      if (req.method !== "POST") return json(405,{error:"Use POST for student imports."});
      if (actionQuery !== requestedAction) return json(400,{error:"Use the bounded student import endpoint."});
      try{return json(200,await handleStudentImportService(sb,requestedAction,body,userId));}
      catch(error){if(error instanceof StudentImportServiceError)return json(error.status,{error:error.message,retryable:error.retryable});throw error;}
    }

    if (assessmentActions.has(requestedAction)) {
      if (req.method !== 'POST') return json(405, { error: 'Use POST for assessment requests.' });
      try {
        const contacts = requestedAction.startsWith('assessment_student_')
          ? await loadStudentContacts(sb, userId, authData.user.email_confirmed_at ? userEmail : null)
          : [];
        const result = await handleAssessmentService(sb, requestedAction, body ?? {}, userId, memberships, contacts);
        if (!['assessment_workspace','assessment_student_list','assessment_student_resume','assessment_student_save'].includes(requestedAction)) {
          await logAcademyAuditEvent(sb, { academyId: String(body?.academy_id ?? ''), actorUserId: userId, action: requestedAction, targetType: 'assessment', targetId: String(body?.candidate_id ?? body?.run_id ?? ''), metadata: {} });
        }
        return json(200, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Assessment request failed.';
        if (message === 'Forbidden') return json(403, { error: message });
        if (/does not exist|schema cache/.test(message)) return json(503, { error: 'Assessment tools are not available yet. Ask your academy administrator to complete setup.' });
        return json(400, { error: message });
      }
    }

    if (requestedAction === "student_curriculum") {
      const enrollment = await loadStudentClassroomEnrollment(
        sb,
        userId,
        userEmail,
        body?.academy_id ?? url.searchParams.get("academy_id"),
        body?.classroom_id ?? url.searchParams.get("classroom_id"),
      );
      const { data: classroomCourses, error: classroomCoursesError } = await sb.from("academy_classroom_courses")
        .select("id, academy_id, classroom_id, course_id, status, starts_at, ends_at, assigned_at")
        .eq("academy_id", enrollment.academy_id)
        .eq("classroom_id", enrollment.classroom_id)
        .in("status", ["scheduled", "active", "completed"])
        .order("assigned_at", { ascending: true })
        .limit(100);
      if (classroomCoursesError) return json(500, { error: "Failed to load classroom curriculum", detail: classroomCoursesError.message });
      const courseIds = ((classroomCourses ?? []) as Array<{ course_id: string }>).map((row) => String(row.course_id));
      const now = Date.now();
      const unavailableCourseIds = new Set(
        ((classroomCourses ?? []) as Array<Record<string, unknown>>)
          .filter((row) =>
            Boolean(row.starts_at && new Date(String(row.starts_at)).getTime() > now) ||
            Boolean(row.ends_at && new Date(String(row.ends_at)).getTime() < now) ||
            String(row.status) === "archived"
          )
          .map((row) => String(row.course_id)),
      );
      if (courseIds.length === 0) {
        return json(200, { ...enrollment, courses: [], modules: [], lessons: [], progress: [], quizzes: [], questions: [], attempts: [], media: [] });
      }

      const [coursesResult, modulesResult, lessonsResult, progressResult, quizzesResult] = await Promise.all([
        sb.from("academy_courses")
          .select("id, academy_id, code, title, description, level, estimated_minutes, status, published_at, metadata")
          .eq("academy_id", enrollment.academy_id).in("id", courseIds).eq("status", "published").limit(100),
        sb.from("academy_course_modules")
          .select("id, academy_id, course_id, title, description, position, status, unlock_rule, metadata")
          .eq("academy_id", enrollment.academy_id).in("course_id", courseIds).eq("status", "published")
          .order("position", { ascending: true }).limit(1000),
        sb.from("academy_lessons")
          .select("id, academy_id, course_id, module_id, prerequisite_lesson_id, title, summary, content, position, estimated_minutes, status, available_from, completion_rule, metadata")
          .eq("academy_id", enrollment.academy_id).in("course_id", courseIds).eq("status", "published")
          .order("position", { ascending: true }).limit(5000),
        sb.from("academy_lesson_progress")
          .select("id, classroom_id, course_id, lesson_id, contact_id, status, started_at, completed_at, time_spent_seconds, updated_at")
          .eq("academy_id", enrollment.academy_id).eq("classroom_id", enrollment.classroom_id).eq("contact_id", enrollment.contact_id).limit(5000),
        sb.from("academy_quizzes")
          .select("id, academy_id, course_id, lesson_id, title, instructions, status, passing_score, attempts_allowed, time_limit_seconds, shuffle_questions, show_answers_after, metadata")
          .eq("academy_id", enrollment.academy_id).in("course_id", courseIds).eq("status", "published").limit(1000),
      ]);
      const firstError = coursesResult.error ?? modulesResult.error ?? lessonsResult.error ?? progressResult.error ?? quizzesResult.error;
      if (firstError) return json(500, { error: "Failed to load student curriculum", detail: firstError.message });

      const quizIds = ((quizzesResult.data ?? []) as Array<{ id: string }>).map((row) => String(row.id));
      const [questionsResult, attemptsResult] = quizIds.length > 0
        ? await Promise.all([
          sb.from("academy_quiz_questions")
            .select("id, quiz_id, question_type, prompt, options, points, position, metadata")
            .eq("academy_id", enrollment.academy_id).in("quiz_id", quizIds).order("position", { ascending: true }).limit(10000),
          sb.from("academy_quiz_attempts")
            .select("id, classroom_id, course_id, quiz_id, contact_id, attempt_number, status, score, max_score, percentage, passed, feedback, started_at, submitted_at, graded_at, result")
            .eq("academy_id", enrollment.academy_id).eq("classroom_id", enrollment.classroom_id).eq("contact_id", enrollment.contact_id)
            .in("quiz_id", quizIds).order("attempt_number", { ascending: false }).limit(5000),
        ])
        : [{ data: [], error: null }, { data: [], error: null }];
      if (questionsResult.error) return json(500, { error: "Failed to load quiz questions", detail: questionsResult.error.message });
      if (attemptsResult.error) return json(500, { error: "Failed to load quiz attempts", detail: attemptsResult.error.message });

      const completedLessonIds = new Set(
        ((progressResult.data ?? []) as Array<Record<string, unknown>>)
          .filter((row) => String(row.status) === "completed")
          .map((row) => String(row.lesson_id)),
      );
      const lessons = ((lessonsResult.data ?? []) as Array<Record<string, unknown>>).map((lesson): Record<string, unknown> & { locked: boolean } => ({
        ...lesson,
        locked: unavailableCourseIds.has(String(lesson.course_id)) ||
          Boolean(lesson.prerequisite_lesson_id && !completedLessonIds.has(String(lesson.prerequisite_lesson_id))) ||
          Boolean(lesson.available_from && new Date(String(lesson.available_from)).getTime() > now),
      }));
      const lockedLessonIds = new Set(
        lessons.filter((lesson) => lesson.locked).map((lesson) => String(lesson.id)),
      );
      const quizzes = ((quizzesResult.data ?? []) as Array<Record<string, unknown>>).map((quiz) => ({
        ...quiz,
        locked: Boolean(quiz.lesson_id && lockedLessonIds.has(String(quiz.lesson_id))),
      }));
      const lessonIds = lessons.map((lesson) => String(lesson.id));
      let media: Array<Record<string, unknown>> = [];
      if (lessonIds.length > 0) {
        const { data: mediaRows, error: mediaError } = await sb.from("academy_lesson_media")
          .select("id,lesson_id,video_asset_id,position")
          .eq("academy_id", enrollment.academy_id).in("lesson_id", lessonIds)
          .order("position", { ascending: true }).limit(5000);
        if (mediaError) return json(500, { error: "Failed to load lesson media", detail: mediaError.message });
        const assetIds = ((mediaRows ?? []) as Array<Record<string, unknown>>).map((row) => String(row.video_asset_id));
        if (assetIds.length > 0) {
          const { data: assets, error: assetsError } = await sb.from("academy_video_assets")
            .select("id,title,status,duration_seconds")
            .eq("academy_id", enrollment.academy_id).in("id", assetIds).eq("status", "ready").limit(5000);
          if (assetsError) return json(500, { error: "Failed to load playable lesson media", detail: assetsError.message });
          const assetById = new Map(((assets ?? []) as Array<Record<string, unknown>>).map((asset) => [String(asset.id), asset]));
          media = ((mediaRows ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
            const asset = assetById.get(String(row.video_asset_id));
            return asset ? [{ ...row, title: asset.title, status: asset.status, duration_seconds: asset.duration_seconds }] : [];
          });
        }
      }
      return json(200, {
        ...enrollment,
        courses: coursesResult.data ?? [],
        modules: modulesResult.data ?? [],
        lessons,
        progress: progressResult.data ?? [],
        quizzes,
        questions: questionsResult.data ?? [],
        attempts: attemptsResult.data ?? [],
        media,
        classroom_courses: classroomCourses ?? [],
      });
    }

    if (requestedAction === "student_session_join") {
      const enrollment = await loadStudentClassroomEnrollment(
        sb,
        userId,
        userEmail,
        body?.academy_id ?? url.searchParams.get("academy_id"),
        body?.classroom_id ?? url.searchParams.get("classroom_id"),
      );
      const sessionId = normalizeText(body?.session_id ?? url.searchParams.get("session_id"), 64);
      if (!sessionId) return json(400, { error: "session_id is required" });
      const { data: session, error: sessionError } = await sb.from("academy_lesson_sessions")
        .select("id, academy_id, classroom_id, title, starts_at, ends_at, status, delivery_mode")
        .eq("academy_id", enrollment.academy_id)
        .eq("classroom_id", enrollment.classroom_id)
        .eq("id", sessionId)
        .maybeSingle();
      if (sessionError || !session?.id) return json(404, { error: "Session not found" });
      const { data: delivery, error: deliveryError } = await sb.from("academy_session_delivery")
        .select("provider, attendee_url, join_opens_at, join_closes_at, status")
        .eq("academy_id", enrollment.academy_id)
        .eq("session_id", sessionId)
        .eq("status", "active")
        .maybeSingle();
      if (deliveryError) return json(500, { error: "Failed to load session delivery", detail: deliveryError.message });
      if (!delivery) return json(404, { error: "This session does not have an online room" });
      const now = Date.now();
      const opensAt = Date.parse(String(delivery.join_opens_at));
      const closesAt = Date.parse(String(delivery.join_closes_at));
      if (!Number.isFinite(opensAt) || !Number.isFinite(closesAt) || now < opensAt || now > closesAt) {
        return json(403, {
          error: "The room is not open",
          join_opens_at: delivery.join_opens_at,
          join_closes_at: delivery.join_closes_at,
        });
      }
      return json(200, {
        session: {
          ...session,
          meeting_provider: delivery.provider,
          join_url: delivery.attendee_url,
          join_opens_at: delivery.join_opens_at,
          join_closes_at: delivery.join_closes_at,
        },
      });
    }

    if (requestedAction === "set_lesson_progress" && req.method === "POST") {
      const enrollment = await loadStudentClassroomEnrollment(sb, userId, userEmail, body?.academy_id, body?.classroom_id);
      const lessonId = normalizeText(body?.lesson_id, 64);
      const nextStatus = normalizeText(body?.status, 30).toLowerCase() || "completed";
      if (!lessonId) return json(400, { error: "lesson_id is required" });
      if (!["in_progress", "completed"].includes(nextStatus)) return json(400, { error: "Invalid lesson progress status" });
      const { data: lesson, error: lessonError } = await sb.from("academy_lessons")
        .select("id, academy_id, course_id, prerequisite_lesson_id, status, available_from")
        .eq("id", lessonId).eq("academy_id", enrollment.academy_id).eq("status", "published").maybeSingle();
      if (lessonError) return json(500, { error: "Failed to load lesson", detail: lessonError.message });
      if (!lesson?.id) return json(404, { error: "Lesson not found" });
      const { data: classroomCourse } = await sb.from("academy_classroom_courses")
        .select("id, status, starts_at, ends_at").eq("academy_id", enrollment.academy_id).eq("classroom_id", enrollment.classroom_id)
        .eq("course_id", lesson.course_id).in("status", ["scheduled", "active", "completed"]).maybeSingle();
      if (!classroomCourse?.id) return json(403, { error: "Course is not assigned to this classroom" });
      if (
        (classroomCourse.starts_at && new Date(String(classroomCourse.starts_at)).getTime() > Date.now()) ||
        (classroomCourse.ends_at && new Date(String(classroomCourse.ends_at)).getTime() < Date.now())
      ) return json(409, { error: "Course is outside its classroom availability window" });
      if (lesson.available_from && new Date(String(lesson.available_from)).getTime() > Date.now()) {
        return json(409, { error: "Lesson is not available yet" });
      }
      if (lesson.prerequisite_lesson_id) {
        const { data: prerequisite } = await sb.from("academy_lesson_progress")
          .select("id").eq("academy_id", enrollment.academy_id).eq("classroom_id", enrollment.classroom_id)
          .eq("contact_id", enrollment.contact_id).eq("lesson_id", lesson.prerequisite_lesson_id).eq("status", "completed").maybeSingle();
        if (!prerequisite?.id) return json(409, { error: "Complete the prerequisite lesson first" });
      }
      const nowIso = new Date().toISOString();
      const payload = {
        academy_id: enrollment.academy_id,
        classroom_id: enrollment.classroom_id,
        course_id: String(lesson.course_id),
        lesson_id: lessonId,
        contact_id: enrollment.contact_id,
        user_id: userId,
        status: nextStatus,
        started_at: nowIso,
        completed_at: nextStatus === "completed" ? nowIso : null,
        time_spent_seconds: Math.max(0, toIntOrNull(body?.time_spent_seconds) ?? 0),
      };
      const { data, error } = await sb.from("academy_lesson_progress")
        .upsert(payload, { onConflict: "classroom_id,lesson_id,contact_id" })
        .select("id, classroom_id, course_id, lesson_id, contact_id, status, started_at, completed_at, time_spent_seconds, updated_at")
        .maybeSingle();
      if (error) return json(500, { error: "Failed to save lesson progress", detail: error.message });
      await logAcademyAuditEvent(sb, {
        academyId: enrollment.academy_id,
        actorUserId: userId,
        actorRole: "student",
        action: "lesson.progress_changed",
        targetType: "academy_lesson_progress",
        targetId: data?.id ? String(data.id) : null,
        contactId: enrollment.contact_id,
        classroomId: enrollment.classroom_id,
        metadata: { lesson_id: lessonId, status: nextStatus },
      });
      return json(200, { progress: data });
    }

    if (requestedAction === "start_quiz" && req.method === "POST") {
      const enrollment = await loadStudentClassroomEnrollment(sb, userId, userEmail, body?.academy_id, body?.classroom_id);
      const quizId = normalizeText(body?.quiz_id, 64);
      if (!quizId) return json(400, { error: "quiz_id is required" });
      const { data: quiz, error: quizError } = await sb.from("academy_quizzes")
        .select("id, academy_id, course_id, lesson_id, title, instructions, passing_score, attempts_allowed, time_limit_seconds, shuffle_questions, show_answers_after, status")
        .eq("id", quizId).eq("academy_id", enrollment.academy_id).eq("status", "published").maybeSingle();
      if (quizError) return json(500, { error: "Failed to load quiz", detail: quizError.message });
      if (!quiz?.id) return json(404, { error: "Quiz not found" });
      const { data: classroomCourse } = await sb.from("academy_classroom_courses")
        .select("id, status, starts_at, ends_at").eq("academy_id", enrollment.academy_id).eq("classroom_id", enrollment.classroom_id)
        .eq("course_id", quiz.course_id).in("status", ["scheduled", "active", "completed"]).maybeSingle();
      if (!classroomCourse?.id) return json(403, { error: "Quiz course is not assigned to this classroom" });
      if (
        (classroomCourse.starts_at && new Date(String(classroomCourse.starts_at)).getTime() > Date.now()) ||
        (classroomCourse.ends_at && new Date(String(classroomCourse.ends_at)).getTime() < Date.now())
      ) return json(409, { error: "Course is outside its classroom availability window" });
      if (quiz.lesson_id) {
        const { data: quizLesson, error: quizLessonError } = await sb.from("academy_lessons")
          .select("id, prerequisite_lesson_id, available_from, status")
          .eq("academy_id", enrollment.academy_id).eq("course_id", quiz.course_id)
          .eq("id", quiz.lesson_id).eq("status", "published").maybeSingle();
        if (quizLessonError) return json(500, { error: "Failed to load quiz lesson", detail: quizLessonError.message });
        if (!quizLesson?.id) return json(409, { error: "Quiz lesson is not published" });
        if (quizLesson.available_from && new Date(String(quizLesson.available_from)).getTime() > Date.now()) {
          return json(409, { error: "Complete the available lessons before starting this quiz" });
        }
        if (quizLesson.prerequisite_lesson_id) {
          const { data: prerequisite } = await sb.from("academy_lesson_progress")
            .select("id").eq("academy_id", enrollment.academy_id).eq("classroom_id", enrollment.classroom_id)
            .eq("contact_id", enrollment.contact_id).eq("lesson_id", quizLesson.prerequisite_lesson_id)
            .eq("status", "completed").maybeSingle();
          if (!prerequisite?.id) return json(409, { error: "Complete the prerequisite lesson before starting this quiz" });
        }
      }
      const { data: previousAttempts, error: attemptsError } = await sb.from("academy_quiz_attempts")
        .select("id, attempt_number, status").eq("academy_id", enrollment.academy_id).eq("quiz_id", quizId)
        .eq("contact_id", enrollment.contact_id).order("attempt_number", { ascending: false }).limit(100);
      if (attemptsError) return json(500, { error: "Failed to load quiz attempts", detail: attemptsError.message });
      const inProgress = ((previousAttempts ?? []) as Array<Record<string, unknown>>).find((row) => String(row.status) === "in_progress");
      if (inProgress?.id) {
        const { data: existingAttempt } = await sb.from("academy_quiz_attempts")
          .select("id, classroom_id, course_id, quiz_id, contact_id, attempt_number, status, started_at")
          .eq("id", inProgress.id).maybeSingle();
        return json(200, { quiz, attempt: existingAttempt, resumed: true });
      }
      const nextAttempt = Math.max(0, ...((previousAttempts ?? []) as Array<Record<string, unknown>>).map((row) => Number(row.attempt_number) || 0)) + 1;
      if (nextAttempt > Number(quiz.attempts_allowed ?? 1)) return json(409, { error: "No quiz attempts remaining" });
      const { data: attempt, error } = await sb.from("academy_quiz_attempts").insert({
        academy_id: enrollment.academy_id,
        classroom_id: enrollment.classroom_id,
        course_id: String(quiz.course_id),
        quiz_id: quizId,
        contact_id: enrollment.contact_id,
        user_id: userId,
        attempt_number: nextAttempt,
        status: "in_progress",
      }).select("id, classroom_id, course_id, quiz_id, contact_id, attempt_number, status, started_at").maybeSingle();
      if (error) return json(500, { error: "Failed to start quiz", detail: error.message });
      await logAcademyAuditEvent(sb, {
        academyId: enrollment.academy_id,
        actorUserId: userId,
        actorRole: "student",
        action: "quiz.attempt_started",
        targetType: "academy_quiz_attempt",
        targetId: attempt?.id ? String(attempt.id) : null,
        contactId: enrollment.contact_id,
        classroomId: enrollment.classroom_id,
        metadata: { quiz_id: quizId, attempt_number: nextAttempt },
      });
      return json(200, { quiz, attempt, resumed: false });
    }

    if (requestedAction === "submit_quiz" && req.method === "POST") {
      const enrollment = await loadStudentClassroomEnrollment(sb, userId, userEmail, body?.academy_id, body?.classroom_id);
      const attemptId = normalizeText(body?.attempt_id ?? body?.id, 64);
      if (!attemptId) return json(400, { error: "attempt_id is required" });
      if (!isJsonObject(body?.answers)) return json(400, { error: "answers object is required" });
      const { data: attempt, error: attemptError } = await sb.from("academy_quiz_attempts")
        .select("id, academy_id, classroom_id, course_id, quiz_id, contact_id, status, started_at")
        .eq("id", attemptId).eq("academy_id", enrollment.academy_id).eq("classroom_id", enrollment.classroom_id)
        .eq("contact_id", enrollment.contact_id).eq("user_id", userId).maybeSingle();
      if (attemptError) return json(500, { error: "Failed to load quiz attempt", detail: attemptError.message });
      if (!attempt?.id) return json(404, { error: "Quiz attempt not found" });
      if (attempt.status !== "in_progress") return json(409, { error: "Quiz attempt has already been submitted" });
      const { data: quiz, error: quizError } = await sb.from("academy_quizzes")
        .select("id, passing_score, time_limit_seconds, show_answers_after")
        .eq("id", attempt.quiz_id).eq("academy_id", enrollment.academy_id).maybeSingle();
      if (quizError || !quiz?.id) return json(500, { error: "Failed to load quiz configuration", detail: quizError?.message });
      if (quiz.time_limit_seconds) {
        const elapsedSeconds = Math.floor((Date.now() - new Date(String(attempt.started_at)).getTime()) / 1000);
        if (elapsedSeconds > Number(quiz.time_limit_seconds) + 30) {
          await sb.from("academy_quiz_attempts").update({ status: "expired", submitted_at: new Date().toISOString() }).eq("id", attemptId);
          return json(409, { error: "Quiz time limit has expired" });
        }
      }
      const { data: questions, error: questionsError } = await sb.from("academy_quiz_questions")
        .select("id, question_type, correct_answer, points, explanation")
        .eq("academy_id", enrollment.academy_id).eq("quiz_id", attempt.quiz_id).order("position", { ascending: true }).limit(1000);
      if (questionsError) return json(500, { error: "Failed to load quiz questions", detail: questionsError.message });
      if (!questions?.length) return json(409, { error: "Quiz has no questions" });
      const grade = gradeAcademyQuiz(
        (questions as Array<Record<string, unknown>>).map((question) => ({
          id: String(question.id),
          question_type: String(question.question_type) as AcademyQuizQuestionType,
          correct_answer: question.correct_answer,
          points: Number(question.points ?? 1),
          explanation: question.explanation ? String(question.explanation) : null,
        })),
        body.answers,
      );
      const nowIso = new Date().toISOString();
      const passed = grade.pending_manual_grade ? null : grade.percentage >= Number(quiz.passing_score ?? 60);
      const publicResults = grade.results.map((result) => ({
        ...result,
        explanation: quiz.show_answers_after ? result.explanation : null,
      }));
      const { data, error } = await sb.from("academy_quiz_attempts").update({
        answers: body.answers,
        result: { ...grade, results: publicResults },
        score: grade.score,
        max_score: grade.max_score,
        percentage: grade.percentage,
        passed,
        status: grade.pending_manual_grade ? "submitted" : "graded",
        submitted_at: nowIso,
        graded_at: grade.pending_manual_grade ? null : nowIso,
      }).eq("id", attemptId).select("id, classroom_id, course_id, quiz_id, contact_id, attempt_number, status, result, score, max_score, percentage, passed, feedback, started_at, submitted_at, graded_at").maybeSingle();
      if (error) return json(500, { error: "Failed to submit quiz", detail: error.message });
      await logAcademyAuditEvent(sb, {
        academyId: enrollment.academy_id,
        actorUserId: userId,
        actorRole: "student",
        action: "quiz.attempt_submitted",
        targetType: "academy_quiz_attempt",
        targetId: attemptId,
        contactId: enrollment.contact_id,
        classroomId: enrollment.classroom_id,
        metadata: { quiz_id: attempt.quiz_id, status: data?.status ?? null, percentage: data?.percentage ?? null },
      });
      return json(200, { attempt: data });
    }

    if (requestedAction === "classroom-chat") {
      const academyId =
        req.method === "POST"
          ? normalizeText(body?.academy_id, 64) || null
          : normalizeText(url.searchParams.get("academy_id"), 64) || null;
      const classroomId =
        req.method === "POST"
          ? normalizeText(body?.classroom_id, 64) || null
          : normalizeText(url.searchParams.get("classroom_id"), 64) || null;
      return await loadClassroomChat(sb, memberships, userId, userEmail, academyId, classroomId);
    }

    if (requestedAction === "classroom-chat-send") {
      if (req.method !== "POST") return json(405, { error: "Method not allowed" });
      return await sendClassroomChatMessage(
        sb,
        memberships,
        userId,
        userEmail,
        normalizeText(body?.academy_id, 64) || null,
        normalizeText(body?.classroom_id, 64) || null,
        normalizeText(body?.content ?? body?.description, 6000) || null,
      );
    }

    if (requestedAction === "classroom-resource-upsert") {
      if (req.method !== "POST") return json(405, { error: "Method not allowed" });
      return await upsertClassroomResource(
        sb,
        memberships,
        userId,
        userEmail,
        normalizeText(body?.academy_id, 64) || null,
        normalizeText(body?.classroom_id, 64) || null,
        normalizeText(body?.id, 64) || null,
        normalizeText(body?.title ?? body?.name, 220) || null,
        normalizeText(body?.type, 20) || null,
        normalizeText(body?.url, 2000) || null,
        normalizeText(body?.description ?? body?.content, 4000) || null,
        body?.sort_order,
        body?.is_published,
        body?.metadata,
        body?.file instanceof File ? body.file : null,
      );
    }

    if (requestedAction === "classroom-resource-delete") {
      if (req.method !== "POST") return json(405, { error: "Method not allowed" });
      return await deleteClassroomResource(
        sb,
        memberships,
        userId,
        userEmail,
        normalizeText(body?.academy_id, 64) || null,
        normalizeText(body?.classroom_id, 64) || null,
        normalizeText(body?.id, 64) || null,
      );
    }

    if (requestedAction === "classroom-resource-progress-set") {
      if (req.method !== "POST") return json(405, { error: "Method not allowed" });
      return await setClassroomResourceProgress(
        sb,
        memberships,
        userId,
        userEmail,
        normalizeText(body?.academy_id, 64) || null,
        normalizeText(body?.classroom_id, 64) || null,
        normalizeText(body?.resource_id, 64) || null,
        body?.completed,
        normalizeText(body?.contact_id, 64) || null,
      );
    }

    // ── Student: list assignments + submission status ────────────────────────
    if (requestedAction === "student_assignments") {
      let contacts: Array<Record<string, unknown>> = [];
      try { contacts = await loadStudentContacts(sb, userId, userEmail); } catch { return json(500, { error: "Failed to load contacts" }); }
      if (contacts.length === 0) return json(200, { assignments: [] });

      const academyIdParam = normalizeText(req.method === "POST" ? body?.academy_id : url.searchParams.get("academy_id"), 64);
      const classroomIdParam = normalizeText(req.method === "POST" ? body?.classroom_id : url.searchParams.get("classroom_id"), 64);
      const contact = contacts.find((c) => !academyIdParam || String(c.academy_id) === academyIdParam) ?? contacts[0];
      const contactAcademyId = String(contact.academy_id);
      const contactId = String(contact.id);

      let assignmentsQuery = sb.from("academy_assignments")
        .select("id, academy_id, classroom_id, course_id, module_id, lesson_id, grade_category_id, rubric_id, title, description, assignment_type, experience_url, due_at, released_at, max_score, score_weight, attempts_allowed, allow_late_submission, status, metadata, created_at")
        .eq("academy_id", contactAcademyId).eq("status", "active").order("position", { ascending: true }).limit(500);
      if (classroomIdParam) assignmentsQuery = assignmentsQuery.eq("classroom_id", classroomIdParam);

      const [assignmentsRes, submissionsRes, membershipsRes] = await Promise.all([
        assignmentsQuery,
        sb.from("academy_submissions")
          .select("id, assignment_id, score, max_score, status, attempt_number, submitted_at, graded_at, notes, feedback, submission_content, submission_url, metadata")
          .eq("academy_id", contactAcademyId).eq("contact_id", contactId).limit(1000),
        sb.from("academy_classroom_memberships").select("classroom_id").eq("academy_id", contactAcademyId).eq("contact_id", contactId).in("status", ["active", "completed"]).limit(100),
      ]);

      if (assignmentsRes.error) return json(500, { error: "Failed to load assignments" });
      const enrolledClassrooms = new Set((membershipsRes.data ?? []).map((m: any) => String(m.classroom_id)));
      const subMap = new Map<string, Record<string, unknown>>();
      for (const s of (submissionsRes.data ?? []) as Array<Record<string, unknown>>) {
        subMap.set(String(s.assignment_id), await attachSignedStorageUrl(sb, s, userId));
      }

      const assignments = ((assignmentsRes.data ?? []) as Array<Record<string, unknown>>)
        .filter((a) => enrolledClassrooms.has(String(a.classroom_id)))
        .map((a) => ({ ...a, submission: subMap.get(String(a.id)) ?? null }));

      return json(200, { assignments, contact_id: contactId, academy_id: contactAcademyId });
    }

    if (requestedAction === "student_attendance") {
      let contacts: Array<Record<string, unknown>> = [];
      try { contacts = await loadStudentContacts(sb, userId, userEmail); } catch { return json(500, { error: "Failed to load contacts" }); }
      if (contacts.length === 0) return json(200, { attendance: [] });

      const academyIdParam = normalizeText(req.method === "POST" ? body?.academy_id : url.searchParams.get("academy_id"), 64);
      const classroomIdParam = normalizeText(req.method === "POST" ? body?.classroom_id : url.searchParams.get("classroom_id"), 64);
      const contact = academyIdParam
        ? contacts.find((c) => String(c.academy_id) === academyIdParam)
        : contacts[0];
      if (!contact) return json(403, { error: "No enrollment found for this academy" });
      const contactAcademyId = String(contact.academy_id);
      const contactId = String(contact.id);

      if (classroomIdParam) {
        const { data: membership, error: membershipError } = await sb
          .from("academy_classroom_memberships")
          .select("id")
          .eq("academy_id", contactAcademyId)
          .eq("classroom_id", classroomIdParam)
          .eq("contact_id", contactId)
          .in("status", ["active", "completed"])
          .maybeSingle();
        if (membershipError) return json(500, { error: "Failed to verify classroom enrollment", detail: membershipError.message });
        if (!membership?.id) return json(403, { error: "Not enrolled in this classroom" });
      }

      let attendanceQuery = sb
        .from("academy_attendance")
        .select("id, classroom_id, contact_id, session_date, status, notes, marked_at")
        .eq("academy_id", contactAcademyId)
        .eq("contact_id", contactId)
        .order("session_date", { ascending: false })
        .limit(200);
      if (classroomIdParam) attendanceQuery = attendanceQuery.eq("classroom_id", classroomIdParam);
      const { data, error } = await attendanceQuery;
      if (error) return json(500, { error: "Failed to load attendance", detail: error.message });
      return json(200, { attendance: data ?? [], contact_id: contactId, academy_id: contactAcademyId });
    }

    // ── Student: submit an assignment ────────────────────────────────────────
    if (requestedAction === "submit_assignment" && req.method === "POST" && !normalizeText(body?.contact_id, 64)) {
      let contacts: Array<Record<string, unknown>> = [];
      try { contacts = await loadStudentContacts(sb, userId, userEmail); } catch { return json(500, { error: "Failed to load contacts" }); }
      if (contacts.length === 0) return json(403, { error: "No academy enrollment found" });

      const assignmentId = normalizeText(body?.assignment_id, 64);
      if (!assignmentId) return json(400, { error: "assignment_id is required" });

      const { data: asgn } = await sb.from("academy_assignments")
        .select("id, academy_id, classroom_id, max_score, due_at, attempts_allowed, allow_late_submission, status")
        .eq("id", assignmentId).maybeSingle();
      if (!asgn?.id) return json(404, { error: "Assignment not found" });
      if (asgn.status !== "active") return json(400, { error: "Assignment is not open for submission" });

      const contact = contacts.find((c) => String(c.academy_id) === String(asgn.academy_id));
      if (!contact) return json(403, { error: "Not enrolled in this academy" });
      const contactId = String(contact.id);

      // Verify classroom membership
      const { data: membership } = await sb.from("academy_classroom_memberships")
        .select("id").eq("classroom_id", asgn.classroom_id).eq("contact_id", contactId).in("status", ["active", "completed"]).maybeSingle();
      if (!membership?.id) return json(403, { error: "Not enrolled in this classroom" });

      const { data: existingSubmission } = await sb.from("academy_submissions")
        .select("id, attempt_number, status, metadata").eq("assignment_id", assignmentId).eq("contact_id", contactId).maybeSingle();
      const nextAttempt = existingSubmission?.id ? Number(existingSubmission.attempt_number ?? 1) + 1 : 1;
      if (nextAttempt > Number(asgn.attempts_allowed ?? 1)) return json(409, { error: "No assignment attempts remaining" });
      const isLate = Boolean(asgn.due_at && new Date(String(asgn.due_at)).getTime() < Date.now());
      if (isLate && asgn.allow_late_submission === false) return json(409, { error: "The late-submission window is closed" });

      const submissionContent = normalizeText(body?.content ?? body?.submission_content, 10000) || null;
      const submissionUrl = normalizeText(body?.url ?? body?.submission_url, 2000) || null;
      const submissionMetadata: Json = { response_kind: body?.file instanceof File ? "file" : "text" };
      if (body?.file instanceof File) {
        try {
          const storage = await uploadAcademyFile("submission", String(asgn.academy_id), String(asgn.classroom_id), userId, body.file);
          submissionMetadata.storage = storage;
          submissionMetadata.storage_kind = "student_submission";
        } catch (err) {
          return json(400, { error: err instanceof Error ? err.message : "Failed to upload submission file" });
        }
      }

      const payload = {
        academy_id: String(asgn.academy_id),
        assignment_id: assignmentId,
        classroom_id: String(asgn.classroom_id),
        contact_id: contactId,
        user_id: userId,
        submission_content: submissionContent,
        submission_url: submissionUrl,
        status: isLate ? "late" : existingSubmission?.id ? "resubmitted" : "submitted",
        attempt_number: nextAttempt,
        submitted_at: new Date().toISOString(),
        notes: normalizeText(body?.notes, 500) || null,
        ...(Object.keys(submissionMetadata).length > 0 ? { metadata: submissionMetadata } : {}),
      };

      const { data, error } = await sb.rpc("academy_assignment_written_command", {
        p_academy: String(asgn.academy_id), p_actor: userId, p_assignment: assignmentId,
        p_payload: payload,
      });
      if (error) return json(error.code === "42501" ? 403 : error.code === "23505" ? 409 : 503, { error: error.code === "42501" ? "Current enrollment does not cover this assignment" : error.code === "23505" ? "No assignment attempts remaining" : "The response could not be confirmed. Check its current status before retrying." });
      const signedSubmission = data ? await attachSignedStorageUrl(sb, data as Record<string, unknown>, userId) : data;
      return json(200, { submission: signedSubmission });
    }

    // ── Student: tuition / billing status ────────────────────────────────────
    if (requestedAction === "student_billing") {
      let contacts: Array<Record<string, unknown>> = [];
      try { contacts = await loadStudentContacts(sb, userId, userEmail); } catch { return json(500, { error: "Failed to load contacts" }); }
      if (contacts.length === 0) return json(200, { items: [] });

      const academyIdParam = normalizeText(body?.academy_id, 64);
      const scopedContacts = academyIdParam
        ? contacts.filter((c) => String(c.academy_id) === academyIdParam)
        : contacts;
      if (scopedContacts.length === 0) return json(403, { error: "No enrollment found for this academy" });

      const academyIds = Array.from(new Set(scopedContacts.map((c) => String(c.academy_id)).filter(Boolean)));
      const contactIds = scopedContacts.map((c) => String(c.id));

      const [membershipsRes, offersRes, entRes, paymentsRes, subscriptionsRes, chargesRes, ledgerRes, balancesRes] = await Promise.all([
        sb.from("academy_classroom_memberships").select("classroom_id, contact_id, academy_id").in("contact_id", contactIds).in("status", ["active", "completed"]).limit(2000),
        sb.from("academy_offers").select("id, academy_id, classroom_id, name, price_amount, currency, duration_days, description, is_active").in("academy_id", academyIds).eq("is_active", true).not("classroom_id", "is", null).limit(1000),
        sb.from("academy_entitlements").select("contact_id, resource_id, status, expires_at, resource_type").in("contact_id", contactIds).eq("resource_type", "classroom").limit(2000),
        sb.from("academy_payments").select("id, contact_id, offer_id, amount, currency, status, created_at").in("contact_id", contactIds).order("created_at", { ascending: false }).limit(2000),
        sb.from("academy_subscriptions").select("id, academy_id, contact_id, branch_id, classroom_id, pricing_plan_id, entitlement_id, status, starts_on, ends_on, billing_cycle, billing_anchor_day, list_amount, discount_amount, agreed_amount, currency, auto_renew, renewal_notice_days, cancelled_at, cancellation_reason, completed_at, metadata, created_at, updated_at").in("contact_id", contactIds).order("created_at", { ascending: false }).limit(2000),
        sb.from("academy_charge_balances").select("id, academy_id, contact_id, subscription_id, branch_id, classroom_id, charge_number, cycle_key, charge_type, service_period_start, service_period_end, issued_on, due_on, original_amount, discount_amount, net_amount, currency, status, description, metadata, created_at, updated_at, allocated_amount, adjustment_amount, effective_amount, outstanding_amount, calculated_status, days_overdue, aging_bucket").in("contact_id", contactIds).order("issued_on", { ascending: false }).limit(5000),
        sb.from("academy_account_ledger_entries").select("id, academy_id, contact_id, subscription_id, charge_id, payment_id, entry_type, amount, currency, effective_at, reason, metadata, created_at").in("contact_id", contactIds).order("effective_at", { ascending: false }).limit(5000),
        sb.from("academy_account_balances").select("academy_id, contact_id, currency, balance, debits, credits, last_entry_at").in("contact_id", contactIds),
      ]);

      const commercialError = [subscriptionsRes, chargesRes, ledgerRes, balancesRes].find((result) => result.error)?.error;
      if (commercialError) return json(500, { error: "Failed to load student commercial account", detail: commercialError.message });

      const memberships = (membershipsRes.data ?? []) as Array<Record<string, unknown>>;
      const offers = (offersRes.data ?? []) as Array<Record<string, unknown>>;
      const activeClassroomEnt = new Set(
        ((entRes.data ?? []) as Array<Record<string, unknown>>)
          .filter((e) => String(e.status) === "active" && (!e.expires_at || new Date(String(e.expires_at)) > new Date()))
          .map((e) => `${e.contact_id}__${e.resource_id}`),
      );
      const lastPaymentByOffer = new Map<string, Record<string, unknown>>();
      for (const p of (paymentsRes.data ?? []) as Array<Record<string, unknown>>) {
        const key = `${p.contact_id}__${p.offer_id}`;
        if (!lastPaymentByOffer.has(key)) lastPaymentByOffer.set(key, p);
      }

      // For each (contact, classroom) the student is enrolled in that has a tuition offer.
      const items: Array<Record<string, unknown>> = [];
      for (const m of memberships) {
        const classroomId = String(m.classroom_id);
        const contactId = String(m.contact_id);
        const academyId = String(m.academy_id);
        const offer = offers.find((o) => String(o.classroom_id) === classroomId && String(o.academy_id) === academyId);
        if (!offer) continue; // free classroom, no billing
        const paid = activeClassroomEnt.has(`${contactId}__${classroomId}`);
        items.push({
          academy_id: academyId,
          classroom_id: classroomId,
          contact_id: contactId,
          offer,
          paid,
          last_payment: lastPaymentByOffer.get(`${contactId}__${offer.id}`) ?? null,
        });
      }

      const accounts = scopedContacts.map((contact) => {
        const contactId = String(contact.id);
        const contactAcademyId = String(contact.academy_id);
        return {
          academy_id: contactAcademyId,
          contact_id: contactId,
          subscriptions: (subscriptionsRes.data ?? []).filter((row) => String(row.academy_id) === contactAcademyId && String(row.contact_id) === contactId),
          charges: (chargesRes.data ?? []).filter((row) => String(row.academy_id) === contactAcademyId && String(row.contact_id) === contactId),
          ledger_entries: (ledgerRes.data ?? []).filter((row) => String(row.academy_id) === contactAcademyId && String(row.contact_id) === contactId),
          balances: (balancesRes.data ?? []).filter((row) => String(row.academy_id) === contactAcademyId && String(row.contact_id) === contactId),
        };
      });

      return json(200, { items, accounts });
    }

    // ── Student: referral code + referrals ───────────────────────────────────
    if (requestedAction === "student_referral") {
      let contacts: Array<Record<string, unknown>> = [];
      try { contacts = await loadStudentContacts(sb, userId, userEmail); } catch { return json(500, { error: "Failed to load contacts" }); }
      if (contacts.length === 0) return json(200, { code: null, referrals: [] });

      const academyIdParam = normalizeText(req.method === "POST" ? body?.academy_id : url.searchParams.get("academy_id"), 64);
      const contact = academyIdParam
        ? contacts.find((c) => String(c.academy_id) === academyIdParam)
        : contacts[0];
      if (!contact) return json(403, { error: "No enrollment found for this academy" });
      const contactAcademyId = String(contact.academy_id);
      const contactId = String(contact.id);

      // Find an existing self-code (referred_contact_id null), else create one.
      const { data: existing } = await sb.from("academy_referrals")
        .select("code").eq("academy_id", contactAcademyId).eq("referrer_contact_id", contactId).is("referred_contact_id", null).maybeSingle();

      let code = existing?.code ? String(existing.code) : "";
      if (!code) {
        const base = (String(contact.first_name ?? "").slice(0, 4) || "REF").toUpperCase().replace(/[^A-Z0-9]/g, "");
        for (let attempt = 0; attempt < 8 && !code; attempt++) {
          const candidate = `${base}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          const { error: insErr } = await sb.from("academy_referrals").insert({
            academy_id: contactAcademyId, referrer_contact_id: contactId, code: candidate, status: "pending",
          });
          if (!insErr) code = candidate;
        }
        if (!code) return json(500, { error: "Could not generate referral code" });
      }

      const { data: referrals } = await sb.from("academy_referrals")
        .select("id, referred_email, status, created_at, joined_at, referred_contact_id")
        .eq("academy_id", contactAcademyId).eq("referrer_contact_id", contactId).not("referred_contact_id", "is", null)
        .order("created_at", { ascending: false }).limit(100);

      return json(200, { code, academy_id: contactAcademyId, referrals: referrals ?? [] });
    }

    // ── Student: claim a referral code they were invited with ────────────────
    if (requestedAction === "claim_referral" && req.method === "POST") {
      let contacts: Array<Record<string, unknown>> = [];
      try { contacts = await loadStudentContacts(sb, userId, userEmail); } catch { return json(500, { error: "Failed to load contacts" }); }
      if (contacts.length === 0) return json(403, { error: "No academy enrollment found" });

      const code = normalizeText(body?.referral_code, 40).toUpperCase();
      if (!code) return json(400, { error: "referral_code is required" });

      // Find the referrer's self-code in any of the student's academies.
      for (const contact of contacts) {
        const contactAcademyId = String(contact.academy_id);
        const contactId = String(contact.id);
        const { data: referrer } = await sb.from("academy_referrals")
          .select("referrer_contact_id").eq("academy_id", contactAcademyId).eq("code", code).is("referred_contact_id", null).maybeSingle();
        if (!referrer?.referrer_contact_id) continue;
        if (String(referrer.referrer_contact_id) === contactId) return json(400, { error: "You cannot refer yourself" });

        const { error: insErr } = await sb.from("academy_referrals").insert({
          academy_id: contactAcademyId,
          referrer_contact_id: referrer.referrer_contact_id,
          code,
          referred_contact_id: contactId,
          referred_email: contact.email ?? null,
          status: "joined",
          joined_at: new Date().toISOString(),
        });
        if (insErr) return json(500, { error: "Failed to record referral", detail: insErr.message });
        return json(200, { ok: true, academy_id: contactAcademyId });
      }
      return json(404, { error: "Referral code not found in your academy" });
    }

    // A signed-in user must be able to create their first academy before any
    // membership exists. Every other staff action remains membership-gated.
    if (memberships.length === 0 && actionBody !== "create_academy") {
      return json(403, { error: "No active academy membership" });
    }

    if (req.method === "GET") {
      const readResponse = await handleReadAction(
        sb,
        memberships,
        actionQuery,
        normalizeText(url.searchParams.get("academy_id"), 64) || null,
        normalizeText(url.searchParams.get("offer_id"), 64) || null,
        normalizeText(url.searchParams.get("classroom_id"), 64) || null,
        normalizeText(url.searchParams.get("contact_id"), 64) || null,
        normalizeText(url.searchParams.get("conversation_id"), 64) || null,
        normalizeText(url.searchParams.get("assignment_id"), 64) || null,
        normalizeText(url.searchParams.get("course_id"), 64) || null,
        normalizeText(url.searchParams.get("quiz_id"), 64) || null,
        normalizeText(url.searchParams.get("query"), 200) || null,
        normalizeText(url.searchParams.get("limit"), 10) || null,
        normalizeText(url.searchParams.get("date"), 10) || null,
        { branch_id: url.searchParams.get("branch_id"), from: url.searchParams.get("from"), days: url.searchParams.get("days") ?? undefined },
        {actorId:userId,before_time:url.searchParams.get("before_time"),before_id:url.searchParams.get("before_id"),after_source:url.searchParams.get("after_source"),after_id:url.searchParams.get("after_id"),reference_mode:url.searchParams.get("reference_mode")},
      );
      if (readResponse) return readResponse;
    }

    if (req.method === "POST") {
      const readResponse = await handleReadAction(
        sb,
        memberships,
        actionBody,
        normalizeText(body?.academy_id, 64) || null,
        normalizeText(body?.offer_id, 64) || null,
        normalizeText(body?.classroom_id, 64) || null,
        normalizeText(body?.contact_id, 64) || null,
        normalizeText(body?.conversation_id, 64) || null,
        normalizeText(body?.assignment_id, 64) || null,
        normalizeText(body?.course_id, 64) || null,
        normalizeText(body?.quiz_id, 64) || null,
        normalizeText(body?.query, 200) || null,
        normalizeText(body?.limit, 10) || null,
        normalizeText(body?.date, 10) || null,
        { branch_id: body?.branch_id, from: body?.from, days: body?.days },
        {actorId:userId,before_time:body?.before_time,before_id:body?.before_id,after_source:body?.after_source,after_id:body?.after_id,reference_mode:body?.reference_mode},
      );
      if (readResponse) return readResponse;

      if (actionBody === "create_academy") {
        const academyName = normalizeText(body?.name, 160);
        const explicitSlug = normalizeText(body?.slug, 120);
        if (!academyName) return json(400, { error: "name is required" });

        const baseSlug = slugify(explicitSlug || academyName, `academy-${String(userId).slice(0, 8)}`);
        let slugCandidate = baseSlug;
        let suffix = 0;
        let existingSlug = true;

        while (existingSlug && suffix < 100) {
          const { data: slugRow, error: slugError } = await sb
            .from("tenants")
            .select("id")
            .eq("slug", slugCandidate)
            .maybeSingle();
          if (slugError) return json(500, { error: "Failed to check academy slug", detail: slugError.message });
          existingSlug = !!slugRow?.id;
          if (!existingSlug) break;
          suffix += 1;
          slugCandidate = `${baseSlug}-${suffix}`;
        }

        if (existingSlug) return json(500, { error: "Could not reserve a unique academy slug" });

        const { data: academyRow, error: academyError } = await sb.rpc(
          "academy_create_organization",
          { p_name: academyName, p_slug: slugCandidate, p_actor_id: userId },
        );
        if (academyError || !academyRow?.id) {
          const status = academyError?.code === "23505" ? 409 : 500;
          return json(status, { error: "Failed to create academy", detail: academyError?.message ?? "Unknown error" });
        }

        return json(200, {
          academy: {
            id: String(academyRow.id),
            name: String(academyRow.name ?? academyName),
            slug: String(academyRow.slug ?? slugCandidate),
            type: String(academyRow.type ?? "team"),
            metadata: toJsonObject(academyRow.metadata),
            created_at: String(academyRow.created_at ?? ""),
            role: "owner",
            status: "active",
            access: academyAccessProfile({
              tenant_id: String(academyRow.id),
              role: "owner",
              status: "active",
              source: "tenant",
              classroom_ids: [],
            }),
          },
        });
      }

      const academyId = resolveAcademyId(memberships, normalizeText(body?.academy_id, 64) || null);
      if(financeActions.has(actionBody))return json(200,await runFinanceCommand(sb,academyId,userId,actionBody,body??{}));
      const access = requireAcademyAccess(memberships, academyId);
      const teacherFlowAccess: AcademyTeacherFlowAccess = {
        ...access,
        permissions: academyAccessProfile(access).permissions as Record<string, boolean>,
      };
      if (actionBody === "teacher_lesson_start") {
        const result = await startAcademyTeacherLesson(sb, teacherFlowAccess, userId, body ?? {});
        return json(200, result);
      }
      if (actionBody === "teacher_lesson_attendance") {
        const result = await recordAcademyTeacherAttendance(sb, teacherFlowAccess, userId, body ?? {});
        return json(200, result);
      }
      if (actionBody === "teacher_lesson_finish") {
        const result = await finishAcademyTeacherLesson(sb, teacherFlowAccess, userId, body ?? {});
        return json(200, result);
      }
      if (staffAccessActions.has(actionBody)) {
        const result = await runAcademyStaffCommand(sb,userId,academyId,actionBody,body ?? {});
        if (actionBody === "upsert_staff") return json(200,{staff:{...formatRoleGrantAsStaff(result.grant as Record<string,unknown>),staff_id:(result.staff_profile as Record<string,unknown>).id},replayed:result.replayed});
        if (actionBody === "remove_staff") return json(200,{ok:true,replayed:result.replayed});
        if (actionBody === "upsert_staff_branch_assignment") return json(200,{assignment:result.assignment,replayed:result.replayed});
        throw new StaffAccessError(400,"Choose a valid staff command.");
      }
      if (["create_access_invitation", "resend_access_invitation", "revoke_access_invitation"].includes(actionBody)) {
        let inviteKind=normalizeText(body?.invite_kind,20).toLowerCase();
        if(actionBody!=="create_access_invitation"){
          const {data:existing,error}=await sb.from("academy_access_invitations").select("invite_kind")
            .eq("academy_id",academyId).eq("id",normalizeText(body?.invitation_id??body?.id,64)).maybeSingle();
          if(error)throw new StaffInvitationError(503,"Invitation lookup is temporarily unavailable.",true);
          if(!existing)throw new StaffInvitationError(404,"Invitation not found.");
          inviteKind=String(existing.invite_kind);
        }
        if(inviteKind==="staff"){
          const result=await runStaffInvitation(sb,userId,academyId,actionBody,body??{},async(email,redirectTo)=>{
            const {error}=await authSb.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo,shouldCreateUser:true}});
            return !error;
          },academyInvitationRedirect);
          return json(result.retryable===true?202:200,result);
        }
        if(!['student','guardian'].includes(inviteKind))throw new LearnerInvitationError(400,'Choose a student, parent or staff invitation.');
        const result=await runLearnerInvitation(sb,userId,academyId,actionBody,body??{},async(email,redirectTo)=>{
          const {error}=await authSb.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo,shouldCreateUser:true}});
          return !error;
        },academyInvitationRedirect);
        return json(result.retryable===true?202:200,result);
      }
      const requiredPermission = ACADEMY_ACTION_PERMISSIONS[actionBody as keyof typeof ACADEMY_ACTION_PERMISSIONS];
      if (requiredPermission) requireAcademyPermission(access, requiredPermission);
      const explicitBranchId = normalizeText(body?.branch_id ?? body?.primary_branch_id, 64);
      if (explicitBranchId && !accessCanUseBranch(access, explicitBranchId)) return json(403, { error: "Forbidden" });
      if (actionBody !== "upsert_contact" && academyAccessBranchIds(access) !== null && !(await validateBranchScopedMutation(sb, academyId, access, body ?? {}, actionBody))) {
        return json(403, { error: "A branch-scoped role may only mutate records in an assigned branch" });
      }

      if (actionBody === "student_preview") {
        if (!["owner", "admin", "center_admin"].includes(access.role)) return json(403, { error: "Only academy administrators can preview a learner workspace" });
        const contactId = normalizeText(body?.contact_id, 64);
        if (!contactId) return json(400, { error: "contact_id is required" });
        const { data: contact, error: contactError } = await sb.from("academy_contacts").select("id,academy_id,first_name,last_name,email,status,placement_level,placement_score,lifecycle_stage").eq("academy_id", academyId).eq("id", contactId).maybeSingle();
        if (contactError) return json(500, { error: "Failed to load student preview", detail: contactError.message });
        if (!contact?.id) return json(404, { error: "Student not found" });
        const { data: memberships } = await sb.from("academy_classroom_memberships").select("id,classroom_id,role,status,joined_at,academy_classrooms(id,name,description,is_active)").eq("academy_id", academyId).eq("contact_id", contactId).in("status", ["active", "paused", "completed"]).limit(200);
        const classroomIds = ((memberships ?? []) as Array<Record<string, unknown>>).map((row) => String(row.classroom_id));
        const none = Promise.resolve({ data: [], error: null });
        const [announcements, assignments, submissions, attendance, sessions, plans, requests] = await Promise.all([
          classroomIds.length ? sb.from("academy_announcements").select("id,classroom_id,title,body,created_at").eq("academy_id", academyId).in("classroom_id", classroomIds).order("created_at", { ascending: false }).limit(100) : none,
          classroomIds.length ? sb.from("academy_assignments").select("id,classroom_id,title,description,due_at,status,max_score").eq("academy_id", academyId).in("classroom_id", classroomIds).eq("status", "active").order("due_at").limit(300) : none,
          sb.from("academy_submissions").select("id,assignment_id,classroom_id,status,score,max_score,submitted_at,graded_at").eq("academy_id", academyId).eq("contact_id", contactId).order("submitted_at", { ascending: false }).limit(300),
          sb.from("academy_attendance").select("id,classroom_id,session_date,status,notes").eq("academy_id", academyId).eq("contact_id", contactId).order("session_date", { ascending: false }).limit(300),
          classroomIds.length ? sb.from("academy_lesson_sessions").select("id,classroom_id,title,session_type,delivery_mode,starts_at,ends_at,status").eq("academy_id", academyId).in("classroom_id", classroomIds).gte("ends_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).order("starts_at").limit(300) : none,
          sb.from("academy_learning_plans").select("id,framework_id,title,goal,starts_on,target_date,status,published_at").eq("academy_id", academyId).eq("contact_id", contactId).not("published_at", "is", null).order("created_at", { ascending: false }).limit(100),
          sb.from("academy_service_requests").select("id,request_type,subject,priority,status,desired_date,resolution,created_at,updated_at").eq("academy_id", academyId).eq("contact_id", contactId).order("created_at", { ascending: false }).limit(100),
        ]);
        const failed = [announcements, assignments, submissions, attendance, sessions, plans, requests].find((result) => result.error);
        if (failed?.error) return json(500, { error: "Failed to assemble student preview", detail: failed.error.message });
        await logAcademyAuditEvent(sb, { academyId, actorUserId: userId, actorRole: access.role, action: "student.preview_opened", targetType: "academy_contact", targetId: contactId, contactId, metadata: { read_only: true } });
        return json(200, { preview: true, read_only: true, contact, memberships: memberships ?? [], announcements: announcements.data ?? [], assignments: assignments.data ?? [], submissions: submissions.data ?? [], attendance: attendance.data ?? [], sessions: sessions.data ?? [], learning_plans: plans.data ?? [], service_requests: requests.data ?? [] });
      }

      if (actionBody === "upsert_timetable_term") {
        const termId = normalizeText(body?.id ?? body?.term_id, 64);
        const name = normalizeText(body?.name, 180);
        const startsOn = normalizeText(body?.starts_on, 20);
        const endsOn = normalizeText(body?.ends_on, 20);
        const status = normalizeText(body?.status, 20).toLowerCase() || "draft";
        if (!name || !startsOn || !endsOn) return json(400, { error: "name, starts_on, and ends_on are required" });
        if (!["draft", "active", "completed", "archived"].includes(status)) return json(400, { error: "Invalid term status" });
        if (dateRange(startsOn, endsOn).length > 370) return json(400, { error: "Term cannot exceed 370 days" });
        const payload = { academy_id: academyId, branch_id: normalizeText(body?.branch_id, 64) || null, academic_calendar_id: normalizeText(body?.academic_calendar_id, 64) || null, name, starts_on: startsOn, ends_on: endsOn, timezone: normalizeText(body?.timezone, 80) || "Asia/Tashkent", status, created_by: userId, metadata: isJsonObject(body?.metadata) ? body.metadata : {} };
        const result = termId
          ? await sb.from("academy_timetable_terms").update(payload).eq("academy_id", academyId).eq("id", termId).select("*").maybeSingle()
          : await sb.from("academy_timetable_terms").insert(payload).select("*").single();
        if (result.error) return json(400, { error: "Failed to save timetable term", detail: result.error.message });
        if (!result.data?.id) return json(404, { error: "Timetable term not found" });
        return json(200, { term: result.data });
      }

      if (actionBody === "upsert_timetable_series") {
        const seriesId = normalizeText(body?.id ?? body?.series_id, 64);
        const termId = normalizeText(body?.term_id, 64);
        const classroomId = normalizeText(body?.classroom_id, 64);
        const sourceScheduleId = normalizeText(body?.source_schedule_id, 64);
        const branchId = normalizeText(body?.branch_id, 64);
        const primaryStaffId = normalizeText(body?.primary_staff_id, 64);
        const title = normalizeText(body?.title, 220);
        const status = normalizeText(body?.status, 20).toLowerCase() || "draft";
        const deliveryMode = normalizeText(body?.delivery_mode, 20).toLowerCase() || "physical";
        if (!termId || !classroomId || !sourceScheduleId || !branchId || !primaryStaffId || !title) return json(400, { error: "term_id, classroom_id, source_schedule_id, branch_id, primary_staff_id, and title are required" });
        if (!["draft", "active", "paused", "completed", "archived"].includes(status) || !["physical", "online", "hybrid"].includes(deliveryMode)) return json(400, { error: "Invalid timetable series status or delivery mode" });
        if (!accessCanUseClassroom(access, classroomId) || !accessCanUseBranch(access, branchId)) return json(403, { error: "Forbidden" });
        const [{ data: term }, { data: schedule }, { data: staffRow }, { data: room }] = await Promise.all([
          sb.from("academy_timetable_terms").select("id,starts_on,ends_on,branch_id").eq("academy_id", academyId).eq("id", termId).maybeSingle(),
          sb.from("academy_classroom_schedules").select("id,classroom_id").eq("academy_id", academyId).eq("id", sourceScheduleId).eq("is_active", true).maybeSingle(),
          sb.from("academy_staff").select("id,is_active").eq("academy_id", academyId).eq("id", primaryStaffId).eq("is_active", true).maybeSingle(),
          normalizeText(body?.room_id, 64) ? sb.from("academy_rooms").select("id,branch_id,is_active").eq("academy_id", academyId).eq("id", normalizeText(body?.room_id, 64)).eq("is_active", true).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        if (!term?.id || !schedule?.id || String(schedule.classroom_id) !== classroomId || !staffRow?.id) return json(409, { error: "Term, schedule, classroom, or staff selection is invalid" });
        if (term.branch_id && String(term.branch_id) !== branchId) return json(409, { error: "Term belongs to another branch" });
        const roomId = room?.id ? String(room.id) : null;
        if (deliveryMode === "physical" && !roomId) return json(400, { error: "Physical timetable series require a room" });
        if (room?.branch_id && String(room.branch_id) !== branchId) return json(409, { error: "Room belongs to a different branch" });
        const startsOn = normalizeText(body?.starts_on, 20) || String(term.starts_on);
        const endsOn = normalizeText(body?.ends_on, 20) || String(term.ends_on);
        if (startsOn < String(term.starts_on) || endsOn > String(term.ends_on) || endsOn < startsOn) return json(400, { error: "Series dates must stay inside the term" });
        const payload = { academy_id: academyId, term_id: termId, classroom_id: classroomId, source_schedule_id: sourceScheduleId, branch_id: branchId, room_id: roomId, primary_staff_id: primaryStaffId, title, session_type: normalizeText(body?.session_type, 30).toLowerCase() || "regular", delivery_mode: deliveryMode, starts_on: startsOn, ends_on: endsOn, status, skip_calendar_closures: body?.skip_calendar_closures !== false, created_by: userId, metadata: isJsonObject(body?.metadata) ? body.metadata : {} };
        const result = seriesId
          ? await sb.from("academy_timetable_series").update(payload).eq("academy_id", academyId).eq("id", seriesId).select("*").maybeSingle()
          : await sb.from("academy_timetable_series").insert(payload).select("*").single();
        if (result.error) return json(400, { error: "Failed to save timetable series", detail: result.error.message });
        if (!result.data?.id) return json(404, { error: "Timetable series not found" });
        return json(200, { series: result.data });
      }

      if (actionBody === "generate_timetable") {
        try {
          return json(200, await generateAcademyTimetable(sb, access, userId, body as Record<string, unknown>));
        } catch (error) {
          if (error instanceof TimetableGenerationError) return json(error.status, { error: error.message, ...(error.run ? { run: error.run } : {}) });
          throw error;
        }
      }

      if (actionBody === "update_service_request") {
        const requestId = normalizeText(body?.request_id ?? body?.id, 64);
        if (!requestId) return json(400, { error: "request_id is required" });
        const { data: request, error: loadError } = await sb.from("academy_service_requests").select("*").eq("academy_id", academyId).eq("id", requestId).maybeSingle();
        if (loadError) return json(500, { error: "Failed to load service request", detail: loadError.message });
        if (!request?.id) return json(404, { error: "Service request not found" });
        const financeRequest = String(request.request_type) === "refund";
        const allowed = financeRequest
          ? academyAccessHas(access, "refundFinance")
          : academyAccessHas(access, "manageRetention") || academyAccessHas(access, "manageAcademicOperations");
        if (!allowed) return json(403, { error: "Forbidden" });
        const nextStatus = normalizeText(body?.status, 40).toLowerCase() || String(request.status);
        const allowedStatuses = ["submitted", "triaged", "in_review", "waiting_for_requester", "approved", "rejected", "completed", "cancelled"];
        if (!allowedStatuses.includes(nextStatus)) return json(400, { error: "Invalid request status" });
        const nowIso = new Date().toISOString();
        const patch: Record<string, unknown> = { status: nextStatus, assigned_to: normalizeText(body?.assigned_to, 64) || (request.assigned_to ?? userId) };
        if (typeof body?.resolution === "string") patch.resolution = normalizeText(body.resolution, 5000) || null;
        if (["rejected", "completed", "cancelled"].includes(nextStatus)) {
          patch.resolved_by = userId;
          patch.resolved_at = nowIso;
        }
        const { data: updated, error } = await sb.from("academy_service_requests").update(patch).eq("academy_id", academyId).eq("id", requestId).select("*").single();
        if (error) return json(400, { error: "Failed to update service request", detail: error.message });
        const note = normalizeText(body?.note ?? body?.resolution, 5000) || null;
        await sb.from("academy_service_request_events").insert({ academy_id: academyId, request_id: requestId, event_type: ["rejected", "completed", "cancelled"].includes(nextStatus) ? "resolved" : "status_changed", from_status: request.status, to_status: nextStatus, note, actor_user_id: userId, visible_to_requester: body?.visible_to_requester !== false });
        if (nextStatus === "approved") {
          await sb.from("academy_action_items").insert({ academy_id: academyId, dedupe_key: `service-request:${requestId}:fulfillment`, source_type: "service_request", category: financeRequest ? "finance" : "operations", priority: request.priority === "urgent" ? "critical" : request.priority === "high" ? "high" : "medium", title: `Fulfill approved ${String(request.request_type).replaceAll("_", " ")} request`, description: request.subject, recommended_action: financeRequest ? "Review the charge and use the governed refund workflow." : "Complete the approved operational change and record the resolution.", contact_id: request.contact_id, classroom_id: request.classroom_id, due_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), status: "open", created_by: userId, metadata: { service_request_id: requestId } }).then(() => undefined);
        }
        return json(200, { request: updated });
      }

      if (actionBody === "upsert_collection_case") {
        const caseId = normalizeText(body?.id ?? body?.case_id, 64);
        const contactId = normalizeText(body?.contact_id, 64);
        if (!contactId) return json(400, { error: "contact_id is required" });
        await ensureContactInAccessScope(sb, academyId, access, contactId);
        const chargeId = normalizeText(body?.charge_id, 64) || null;
        let outstandingAmount = toIntOrNull(body?.outstanding_amount);
        let currency = normalizeText(body?.currency, 10).toUpperCase() || "UZS";
        if (chargeId) {
          const { data: charge } = await sb.from("academy_charge_balances").select("id,outstanding_amount,currency").eq("academy_id", academyId).eq("id", chargeId).maybeSingle();
          if (!charge?.id) return json(404, { error: "Charge not found" });
          outstandingAmount = outstandingAmount ?? Number(charge.outstanding_amount ?? 0);
          currency = String(charge.currency ?? currency);
        }
        const stage = normalizeText(body?.stage, 30).toLowerCase() || "reminder";
        const status = normalizeText(body?.status, 20).toLowerCase() || "open";
        if (!["reminder", "promise", "escalated", "disputed", "settled", "written_off", "closed"].includes(stage) || !["open", "waiting", "resolved", "cancelled"].includes(status)) return json(400, { error: "Invalid collection stage or status" });
        const payload = { academy_id: academyId, branch_id: normalizeText(body?.branch_id, 64) || null, contact_id: contactId, charge_id: chargeId, owner_user_id: normalizeText(body?.owner_user_id, 64) || userId, stage, priority: normalizeText(body?.priority, 20).toLowerCase() || "normal", outstanding_amount: Math.max(0, outstandingAmount ?? 0), currency, next_action_at: normalizeText(body?.next_action_at, 80) || null, status, resolved_at: status === "resolved" ? new Date().toISOString() : null, created_by: userId, metadata: isJsonObject(body?.metadata) ? body.metadata : {} };
        const result = caseId
          ? await sb.from("academy_collection_cases").update(payload).eq("academy_id", academyId).eq("id", caseId).select("*").maybeSingle()
          : await sb.from("academy_collection_cases").insert(payload).select("*").single();
        if (result.error) return json(400, { error: "Failed to save collection case", detail: result.error.message });
        if (!result.data?.id) return json(404, { error: "Collection case not found" });
        return json(200, { case: result.data });
      }

      if (actionBody === "record_collection_attempt") {
        const caseId = normalizeText(body?.case_id, 64);
        const attemptType = normalizeText(body?.attempt_type, 30).toLowerCase();
        const outcome = normalizeText(body?.outcome, 30).toLowerCase();
        if (!caseId || !["call", "telegram", "email", "sms", "inapp", "meeting", "payment_link", "promise", "note"].includes(attemptType) || !["queued", "sent", "delivered", "contacted", "no_answer", "promised", "paid", "disputed", "failed", "not_applicable"].includes(outcome)) return json(400, { error: "case_id, attempt_type, and outcome are required" });
        const { data: collectionCase } = await sb.from("academy_collection_cases").select("*").eq("academy_id", academyId).eq("id", caseId).maybeSingle();
        if (!collectionCase?.id) return json(404, { error: "Collection case not found" });
        let notificationId: string | null = null;
        if (["telegram", "email", "inapp", "sms", "payment_link"].includes(attemptType)) {
          const channel = attemptType === "payment_link" ? normalizeText(body?.channel, 20).toLowerCase() || "inapp" : attemptType;
          if (!["telegram", "email", "inapp", "sms"].includes(channel)) return json(400, { error: "Invalid reminder channel" });
          const { data: contact } = await sb.from("academy_contacts").select("id,first_name,email,telegram_id").eq("academy_id", academyId).eq("id", collectionCase.contact_id).maybeSingle();
          if (!contact?.id) return json(404, { error: "Collection contact not found" });
          const target = channel === "email" ? normalizeEmail(contact.email) : channel === "telegram" ? normalizeText(contact.telegram_id, 120) : null;
          if (channel !== "inapp" && !target) return json(409, { error: `No ${channel} destination is available` });
          const paymentLink = normalizeText(body?.payment_link, 2000);
          const message = normalizeText(body?.message, 5000) || `Hello ${String(contact.first_name ?? "") || "there"}, your academy account has ${Number(collectionCase.outstanding_amount ?? 0)} ${String(collectionCase.currency ?? "UZS")} outstanding.${paymentLink ? ` Pay securely: ${paymentLink}` : ""}`;
          const { data: notification, error } = await sb.from("academy_notifications").insert({ academy_id: academyId, contact_id: collectionCase.contact_id, channel, type: "collection_reminder", title: "Academy payment reminder", body: message, target, status: "queued", scheduled_at: normalizeText(body?.scheduled_at, 80) || new Date().toISOString(), metadata: { collection_case_id: caseId, payment_link: paymentLink || null } }).select("id").single();
          if (error) return json(400, { error: "Failed to queue collection reminder", detail: error.message });
          notificationId = String(notification.id);
        }
        const { data: attempt, error } = await sb.from("academy_collection_attempts").insert({ academy_id: academyId, case_id: caseId, attempt_type: attemptType, outcome, notification_id: notificationId, payment_promise_id: normalizeText(body?.payment_promise_id, 64) || null, note: normalizeText(body?.note, 3000) || null, next_action_at: normalizeText(body?.next_action_at, 80) || null, actor_user_id: userId, metadata: isJsonObject(body?.metadata) ? body.metadata : {} }).select("*").single();
        if (error) return json(400, { error: "Failed to record collection attempt", detail: error.message });
        const casePatch: Record<string, unknown> = { next_action_at: attempt.next_action_at ?? collectionCase.next_action_at };
        if (outcome === "promised") casePatch.stage = "promise";
        if (outcome === "disputed") casePatch.stage = "disputed";
        if (outcome === "paid") Object.assign(casePatch, { stage: "settled", status: "resolved", resolved_at: new Date().toISOString(), outstanding_amount: 0 });
        await sb.from("academy_collection_cases").update(casePatch).eq("academy_id", academyId).eq("id", caseId);
        return json(200, { attempt, notification_id: notificationId });
      }

      if (actionBody === "create_workforce_request") {
        let { data: staffRow } = await sb.from("academy_staff").select("id,user_id,email,role,is_active").eq("academy_id", academyId).eq("user_id", userId).eq("is_active", true).limit(1).maybeSingle();
        if (!staffRow?.id && userEmail) {
          const fallback = await sb.from("academy_staff").select("id,user_id,email,role,is_active").eq("academy_id", academyId).eq("email", normalizeEmail(userEmail)).eq("is_active", true).limit(1).maybeSingle();
          staffRow = fallback.data;
        }
        if (!staffRow?.id) return json(403, { error: "Your account is not linked to an active Academy staff record" });
        const requestType = normalizeText(body?.request_type, 40).toLowerCase();
        const reason = normalizeText(body?.reason, 5000);
        if (!["leave", "availability", "schedule_change", "substitution", "payroll_question", "document", "other"].includes(requestType) || !reason) return json(400, { error: "request_type and reason are required" });
        const scopedBranches = academyAccessBranchIds(access);
        const requestBranchId = normalizeText(body?.branch_id, 64) || (scopedBranches?.length === 1 ? scopedBranches[0] : null);
        if (scopedBranches !== null && !requestBranchId) return json(400, { error: "Choose a branch for this staff request" });
        const { data: request, error } = await sb.from("academy_staff_requests").insert({ academy_id: academyId, branch_id: requestBranchId, staff_id: staffRow.id, request_type: requestType, starts_at: normalizeText(body?.starts_at, 80) || null, ends_at: normalizeText(body?.ends_at, 80) || null, reason, status: "submitted", replacement_staff_id: normalizeText(body?.replacement_staff_id, 64) || null, created_by: userId, metadata: { ...(isJsonObject(body?.metadata) ? body.metadata : {}), source: "staff_workspace", session_id: normalizeText(body?.session_id, 64) || null } }).select("*").single();
        if (error) return json(400, { error: "Failed to submit workforce request", detail: error.message });
        return json(200, { request });
      }

      if (actionBody === "update_workforce_request") {
        const requestId = normalizeText(body?.request_id ?? body?.id, 64);
        if (!requestId) return json(400, { error: "request_id is required" });
        const { data: request } = await sb.from("academy_staff_requests").select("*").eq("academy_id", academyId).eq("id", requestId).maybeSingle();
        if (!request?.id) return json(404, { error: "Workforce request not found" });
        const canDecide = academyAccessHas(access, "manageStaff") || academyAccessHas(access, "manageAcademicOperations") || (String(request.request_type) === "payroll_question" && academyAccessHas(access, "viewPayroll"));
        if (!canDecide) return json(403, { error: "Forbidden" });
        const status = normalizeText(body?.status, 30).toLowerCase();
        if (!["submitted", "in_review", "approved", "rejected", "fulfilled", "cancelled"].includes(status)) return json(400, { error: "Invalid workforce request status" });
        const replacementStaffId = normalizeText(body?.replacement_staff_id, 64) || (request.replacement_staff_id ?? null);
        const { data: updated, error } = await sb.from("academy_staff_requests").update({ status, replacement_staff_id: replacementStaffId, assigned_to: normalizeText(body?.assigned_to, 64) || userId, decision_note: normalizeText(body?.decision_note, 5000) || null, decided_by: ["approved", "rejected", "fulfilled"].includes(status) ? userId : null, decided_at: ["approved", "rejected", "fulfilled"].includes(status) ? new Date().toISOString() : null }).eq("academy_id", academyId).eq("id", requestId).select("*").single();
        if (error) return json(400, { error: "Failed to update workforce request", detail: error.message });
        if (status === "approved" && String(request.request_type) === "substitution") {
          const sessionId = normalizeText(toJsonObject(request.metadata).session_id, 64);
          if (!sessionId || !replacementStaffId) return json(409, { error: "Approved substitution requires a session and replacement staff member" });
          const { error: substituteError } = await sb.rpc("academy_assign_session_substitute", { p_academy_id: academyId, p_session_id: sessionId, p_staff_id: replacementStaffId, p_actor_id: userId, p_reason: request.reason, p_idempotency_key: `workforce:${requestId}:substitution` });
          if (substituteError) return json(409, { error: "Request approved but substitute assignment failed", detail: substituteError.message, request: updated });
          await sb.from("academy_staff_requests").update({ status: "fulfilled" }).eq("academy_id", academyId).eq("id", requestId);
        }
        if (status === "approved" && String(request.request_type) === "leave" && request.starts_at && request.ends_at) {
          const startDate = String(request.starts_at).slice(0, 10);
          const endDate = String(request.ends_at).slice(0, 10);
          const unavailableRows = dateRange(startDate, endDate).map((date) => ({ academy_id: academyId, staff_id: request.staff_id, day_of_week: new Date(`${date}T00:00:00Z`).getUTCDay(), starts_at: "00:00", ends_at: "23:59", timezone: "Asia/Tashkent", available: false, effective_from: date, effective_to: date, reason: `Approved leave request ${requestId}`, is_active: true, created_by: userId }));
          const { error: availabilityError } = await sb.from("academy_staff_availability").insert(unavailableRows);
          if (availabilityError) return json(409, { error: "Request approved but leave calendar update failed", detail: availabilityError.message, request: updated });
          await sb.from("academy_staff_requests").update({ status: "fulfilled" }).eq("academy_id", academyId).eq("id", requestId);
        }
        return json(200, { request: updated });
      }

      if (actionBody === "upsert_communication_journey") {
        const journeyId = normalizeText(body?.id ?? body?.journey_id, 64);
        const journeyKey = normalizeText(body?.journey_key, 100).toLowerCase();
        const name = normalizeText(body?.name, 180);
        const audience = normalizeText(body?.audience, 30).toLowerCase();
        const triggerKey = normalizeText(body?.trigger_key, 80).toLowerCase();
        const status = normalizeText(body?.status, 20).toLowerCase() || "draft";
        const steps = Array.isArray(body?.steps) ? body.steps as Array<Record<string, unknown>> : [];
        if (!journeyKey || !name || !["student", "guardian", "staff"].includes(audience) || !["manual", "student.enrolled", "student.absent", "payment.due_soon", "payment.overdue", "schedule.changed", "assignment.missing", "course.completed"].includes(triggerKey) || !["draft", "active", "paused", "retired"].includes(status) || !steps.length) {
          return json(400, { error: "journey_key, name, audience, trigger_key, status, and at least one step are required" });
        }
        const normalizedSteps = steps.map((step, index) => {
          const channel = normalizeText(step.channel, 20).toLowerCase();
          const bodyTemplate = normalizeText(step.body_template, 5000);
          if (!["inapp", "telegram", "email", "sms"].includes(channel) || !bodyTemplate) throw new Error(`Step ${index + 1} requires a supported channel and message`);
          return { academy_id: academyId, position: index + 1, delay_minutes: Math.max(0, toIntOrNull(step.delay_minutes) ?? 0), channel, title_template: normalizeText(step.title_template, 300) || null, body_template: bodyTemplate, requires_review: step.requires_review === true, is_active: step.is_active !== false, metadata: isJsonObject(step.metadata) ? step.metadata : {} };
        });
        const payload = { academy_id: academyId, branch_id: normalizeText(body?.branch_id, 64) || null, journey_key: journeyKey, name, audience, trigger_key: triggerKey, status, quiet_hours_policy: normalizeText(body?.quiet_hours_policy, 30).toLowerCase() || "recipient", created_by: userId, metadata: isJsonObject(body?.metadata) ? body.metadata : {} };
        let journeyResult;
        if (journeyId) journeyResult = await sb.from("academy_communication_journeys").update(payload).eq("academy_id", academyId).eq("id", journeyId).select("*").maybeSingle();
        else journeyResult = await sb.from("academy_communication_journeys").upsert(payload, { onConflict: "academy_id,journey_key" }).select("*").single();
        if (journeyResult.error) return json(400, { error: "Failed to save communication journey", detail: journeyResult.error.message });
        if (!journeyResult.data?.id) return json(404, { error: "Communication journey not found" });
        const savedJourneyId = String(journeyResult.data.id);
        const { error: deleteError } = await sb.from("academy_communication_journey_steps").delete().eq("academy_id", academyId).eq("journey_id", savedJourneyId);
        if (deleteError) return json(409, { error: "Journey saved but previous steps could not be replaced", detail: deleteError.message });
        const { data: savedSteps, error: stepError } = await sb.from("academy_communication_journey_steps").insert(normalizedSteps.map((step) => ({ ...step, journey_id: savedJourneyId }))).select("*");
        if (stepError) return json(409, { error: "Journey saved but steps could not be added", detail: stepError.message });
        return json(200, { journey: journeyResult.data, steps: savedSteps ?? [] });
      }

      if (actionBody === "enroll_communication_journey") {
        const journeyId = normalizeText(body?.journey_id, 64);
        if (!journeyId) return json(400, { error: "journey_id is required" });
        const { data: journey } = await sb.from("academy_communication_journeys").select("*").eq("academy_id", academyId).eq("id", journeyId).eq("status", "active").maybeSingle();
        if (!journey?.id) return json(404, { error: "Active communication journey not found" });
        const contactId = normalizeText(body?.contact_id, 64) || null;
        const guardianId = normalizeText(body?.guardian_id, 64) || null;
        const staffId = normalizeText(body?.staff_id, 64) || null;
        const subjectCount = [contactId, guardianId, staffId].filter(Boolean).length;
        if (subjectCount !== 1) return json(400, { error: "Exactly one contact_id, guardian_id, or staff_id is required" });
        if ((journey.audience === "student" && !contactId) || (journey.audience === "guardian" && !guardianId) || (journey.audience === "staff" && !staffId)) return json(400, { error: "Recipient does not match journey audience" });
        if (contactId) await ensureContactInAccessScope(sb, academyId, access, contactId);
        const { data: firstStep } = await sb.from("academy_communication_journey_steps").select("position,delay_minutes").eq("academy_id", academyId).eq("journey_id", journeyId).eq("is_active", true).order("position").limit(1).maybeSingle();
        if (!firstStep?.position) return json(409, { error: "Journey has no active steps" });
        const idempotencyKey = normalizeText(body?.idempotency_key, 180) || `${journeyId}:${contactId ?? guardianId ?? staffId}:${crypto.randomUUID()}`;
        const { data: enrollment, error } = await sb.from("academy_communication_enrollments").insert({ academy_id: academyId, journey_id: journeyId, contact_id: contactId, guardian_id: guardianId, staff_id: staffId, status: "active", current_position: firstStep.position, next_step_at: new Date(Date.now() + Number(firstStep.delay_minutes ?? 0) * 60_000).toISOString(), idempotency_key: idempotencyKey, created_by: userId, metadata: isJsonObject(body?.metadata) ? body.metadata : {} }).select("*").single();
        if (error) return json(400, { error: "Failed to enroll communication recipient", detail: error.message });
        return json(200, { enrollment });
      }

      if (actionBody === "advance_communication_journeys") {
        const limit = Math.min(100, Math.max(1, toIntOrNull(body?.limit) ?? 50));
        const nowIso = new Date().toISOString();
        const { data: dueRows, error } = await sb.from("academy_communication_enrollments").select("*").eq("academy_id", academyId).eq("status", "active").lte("next_step_at", nowIso).order("next_step_at").limit(limit);
        if (error) return json(500, { error: "Failed to load due communication journeys", detail: error.message });
        let queued = 0, paused = 0, completed = 0, failed = 0;
        for (const enrollment of (dueRows ?? []) as Array<Record<string, unknown>>) {
          const { data: journey } = await sb.from("academy_communication_journeys").select("id,name,audience,status").eq("academy_id", academyId).eq("id", enrollment.journey_id).maybeSingle();
          const { data: step } = await sb.from("academy_communication_journey_steps").select("*").eq("academy_id", academyId).eq("journey_id", enrollment.journey_id).eq("position", enrollment.current_position).eq("is_active", true).maybeSingle();
          if (!journey?.id || journey.status !== "active" || !step?.id) {
            await sb.from("academy_communication_enrollments").update({ status: "failed", metadata: { ...toJsonObject(enrollment.metadata), error: "Journey or active step unavailable" } }).eq("academy_id", academyId).eq("id", enrollment.id);
            failed++;
            continue;
          }
          let recipient: Record<string, unknown> | null = null;
          if (enrollment.contact_id) recipient = (await sb.from("academy_contacts").select("id,first_name,last_name,email,telegram_id").eq("academy_id", academyId).eq("id", enrollment.contact_id).maybeSingle()).data;
          else if (enrollment.guardian_id) recipient = (await sb.from("academy_guardians").select("id,full_name,email,telegram_chat_id").eq("academy_id", academyId).eq("id", enrollment.guardian_id).maybeSingle()).data;
          else if (enrollment.staff_id) recipient = (await sb.from("academy_staff").select("id,display_name,email").eq("academy_id", academyId).eq("id", enrollment.staff_id).maybeSingle()).data;
          if (!recipient?.id) {
            await sb.from("academy_communication_enrollments").update({ status: "failed", metadata: { ...toJsonObject(enrollment.metadata), error: "Recipient unavailable" } }).eq("academy_id", academyId).eq("id", enrollment.id);
            failed++;
            continue;
          }
          const displayName = normalizeText(recipient.full_name ?? recipient.display_name ?? `${String(recipient.first_name ?? "")} ${String(recipient.last_name ?? "")}`, 180) || "there";
          const values = { name: displayName, academy_name: normalizeText(body?.academy_name, 180) || "Academy" };
          const title = step.title_template ? renderJourneyTemplate(String(step.title_template), values) : String(journey.name);
          const message = renderJourneyTemplate(String(step.body_template), values);
          if (step.requires_review === true) {
            await sb.from("academy_action_items").insert({ academy_id: academyId, dedupe_key: `journey-review:${String(enrollment.id)}:${String(step.position)}`, source_type: "communication_journey", category: "operations", priority: "medium", title: `Review message for ${displayName}`, description: message, recommended_action: "Review and send the communication, then resume the journey.", contact_id: enrollment.contact_id ?? null, due_at: nowIso, status: "open", created_by: userId, metadata: { journey_id: journey.id, enrollment_id: enrollment.id, step_id: step.id, channel: step.channel, title } });
            await sb.from("academy_communication_enrollments").update({ status: "paused", last_step_at: nowIso }).eq("academy_id", academyId).eq("id", enrollment.id);
            paused++;
            continue;
          }
          const channel = String(step.channel);
          const target = channel === "email" ? normalizeEmail(recipient.email) : channel === "telegram" ? normalizeText(recipient.telegram_chat_id ?? recipient.telegram_id, 120) : null;
          if (channel !== "inapp" && !target) {
            await sb.from("academy_communication_enrollments").update({ status: "failed", metadata: { ...toJsonObject(enrollment.metadata), error: `No ${channel} destination` } }).eq("academy_id", academyId).eq("id", enrollment.id);
            failed++;
            continue;
          }
          const { error: notificationError } = await sb.from("academy_notifications").insert({ academy_id: academyId, contact_id: enrollment.contact_id ?? null, guardian_id: enrollment.guardian_id ?? null, channel, type: "communication_journey", event_key: "communication_journey", dedupe_key: `journey:${String(enrollment.id)}:${String(step.position)}`, title, body: message, target, status: "queued", scheduled_at: nowIso, metadata: { journey_id: journey.id, enrollment_id: enrollment.id, step_id: step.id, staff_id: enrollment.staff_id ?? null } });
          if (notificationError) {
            await sb.from("academy_communication_enrollments").update({ status: "failed", metadata: { ...toJsonObject(enrollment.metadata), error: notificationError.message } }).eq("academy_id", academyId).eq("id", enrollment.id);
            failed++;
            continue;
          }
          queued++;
          const { data: nextStep } = await sb.from("academy_communication_journey_steps").select("position,delay_minutes").eq("academy_id", academyId).eq("journey_id", journey.id).eq("is_active", true).gt("position", step.position).order("position").limit(1).maybeSingle();
          if (nextStep?.position) {
            await sb.from("academy_communication_enrollments").update({ current_position: nextStep.position, next_step_at: new Date(Date.now() + Number(nextStep.delay_minutes ?? 0) * 60_000).toISOString(), last_step_at: nowIso }).eq("academy_id", academyId).eq("id", enrollment.id);
          } else {
            await sb.from("academy_communication_enrollments").update({ status: "completed", last_step_at: nowIso }).eq("academy_id", academyId).eq("id", enrollment.id);
            completed++;
          }
        }
        return json(200, { processed: dueRows?.length ?? 0, queued, paused, completed, failed });
      }

      if (actionBody === "create_sensitive_case") {
        if (!["owner", "admin", "center_admin", "manager", "counselor"].includes(access.role)) return json(403, { error: "Forbidden" });
        const caseType = normalizeText(body?.case_type, 40).toLowerCase();
        const title = normalizeText(body?.title, 240);
        const description = normalizeText(body?.description, 10000);
        const confidentiality = normalizeText(body?.confidentiality, 30).toLowerCase() || "restricted";
        if (!["complaint", "safeguarding", "harassment", "conduct", "privacy", "academic_integrity", "other"].includes(caseType) || !title || !description || !["restricted", "owner_only"].includes(confidentiality)) return json(400, { error: "case_type, title, description, and confidentiality are required" });
        if (confidentiality === "owner_only" && !["owner", "admin"].includes(access.role)) return json(403, { error: "Only owners and administrators can create owner-only cases" });
        const { data: sensitiveCase, error } = await sb.from("academy_sensitive_cases").insert({ academy_id: academyId, branch_id: normalizeText(body?.branch_id, 64) || null, case_type: caseType, title, description, severity: normalizeText(body?.severity, 20).toLowerCase() || "medium", confidentiality, status: "open", reporter_user_id: normalizeText(body?.reporter_user_id, 64) || userId, reporter_contact_id: normalizeText(body?.reporter_contact_id, 64) || null, subject_contact_id: normalizeText(body?.subject_contact_id, 64) || null, subject_staff_id: normalizeText(body?.subject_staff_id, 64) || null, assigned_to: normalizeText(body?.assigned_to, 64) || userId, due_at: normalizeText(body?.due_at, 80) || null, created_by: userId, metadata: isJsonObject(body?.metadata) ? body.metadata : {} }).select("*").single();
        if (error) return json(400, { error: "Failed to create restricted case", detail: error.message });
        await sb.from("academy_sensitive_case_events").insert({ academy_id: academyId, case_id: sensitiveCase.id, event_type: "created", to_status: "open", note: "Restricted case opened", actor_user_id: userId });
        await logAcademyAuditEvent(sb, { academyId, actorUserId: userId, actorRole: access.role, action: "sensitive_case.created", targetType: "academy_sensitive_case", targetId: String(sensitiveCase.id), contactId: sensitiveCase.subject_contact_id ? String(sensitiveCase.subject_contact_id) : null, status: "ok", metadata: { case_type: caseType, severity: sensitiveCase.severity, confidentiality } });
        return json(200, { case: sensitiveCase });
      }

      if (actionBody === "update_sensitive_case") {
        const caseId = normalizeText(body?.case_id ?? body?.id, 64);
        if (!caseId || !["owner", "admin", "center_admin", "manager", "counselor"].includes(access.role)) return json(403, { error: "Forbidden" });
        const { data: current } = await sb.from("academy_sensitive_cases").select("*").eq("academy_id", academyId).eq("id", caseId).maybeSingle();
        if (!current?.id) return json(404, { error: "Restricted case not found" });
        if (current.confidentiality === "owner_only" && !["owner", "admin"].includes(access.role)) return json(403, { error: "Forbidden" });
        const status = normalizeText(body?.status, 30).toLowerCase() || String(current.status);
        if (!["open", "triage", "investigating", "action_required", "resolved", "closed"].includes(status)) return json(400, { error: "Invalid case status" });
        const patch: Record<string, unknown> = { status, severity: normalizeText(body?.severity, 20).toLowerCase() || current.severity, assigned_to: normalizeText(body?.assigned_to, 64) || current.assigned_to };
        if (typeof body?.resolution_summary === "string") patch.resolution_summary = normalizeText(body.resolution_summary, 10000) || null;
        if (["resolved", "closed"].includes(status)) Object.assign(patch, { resolved_by: userId, resolved_at: new Date().toISOString() });
        const { data: updated, error } = await sb.from("academy_sensitive_cases").update(patch).eq("academy_id", academyId).eq("id", caseId).select("*").single();
        if (error) return json(400, { error: "Failed to update restricted case", detail: error.message });
        await sb.from("academy_sensitive_case_events").insert({ academy_id: academyId, case_id: caseId, event_type: ["resolved", "closed"].includes(status) ? "resolution" : "status_changed", from_status: current.status, to_status: status, note: normalizeText(body?.note ?? body?.resolution_summary, 10000) || null, actor_user_id: userId, metadata: isJsonObject(body?.metadata) ? body.metadata : {} });
        return json(200, { case: updated });
      }

      if (actionBody === "upsert_competency_framework") {
        const frameworkId = normalizeText(body?.id ?? body?.framework_id, 64);
        const code = normalizeText(body?.code, 80).toUpperCase();
        const name = normalizeText(body?.name, 200);
        const status = normalizeText(body?.status, 20).toLowerCase() || "draft";
        if (!code || !name || !["draft", "published", "archived"].includes(status)) return json(400, { error: "code, name, and a valid status are required" });
        const payload = { academy_id: academyId, code, name, description: normalizeText(body?.description, 3000) || null, status, created_by: userId, metadata: isJsonObject(body?.metadata) ? body.metadata : {} };
        const result = frameworkId
          ? await sb.from("academy_competency_frameworks").update(payload).eq("academy_id", academyId).eq("id", frameworkId).select("*").maybeSingle()
          : await sb.from("academy_competency_frameworks").upsert(payload, { onConflict: "academy_id,code" }).select("*").single();
        if (result.error) return json(400, { error: "Failed to save competency framework", detail: result.error.message });
        if (!result.data?.id) return json(404, { error: "Competency framework not found" });
        return json(200, { framework: result.data });
      }

      if (actionBody === "upsert_competency") {
        const competencyId = normalizeText(body?.id ?? body?.competency_id, 64);
        const frameworkId = normalizeText(body?.framework_id, 64);
        const code = normalizeText(body?.code, 80).toUpperCase();
        const title = normalizeText(body?.title, 240);
        if (!frameworkId || !code || !title) return json(400, { error: "framework_id, code, and title are required" });
        const { data: framework } = await sb.from("academy_competency_frameworks").select("id").eq("academy_id", academyId).eq("id", frameworkId).neq("status", "archived").maybeSingle();
        if (!framework?.id) return json(404, { error: "Competency framework not found" });
        const payload = { academy_id: academyId, framework_id: frameworkId, parent_id: normalizeText(body?.parent_id, 64) || null, code, title, description: normalizeText(body?.description, 3000) || null, level_scale: Array.isArray(body?.level_scale) ? body.level_scale : undefined, position: Math.max(1, toIntOrNull(body?.position) ?? 1), status: normalizeText(body?.status, 20).toLowerCase() || "active" };
        if (payload.level_scale === undefined) delete (payload as Record<string, unknown>).level_scale;
        const result = competencyId
          ? await sb.from("academy_competencies").update(payload).eq("academy_id", academyId).eq("id", competencyId).select("*").maybeSingle()
          : await sb.from("academy_competencies").upsert(payload, { onConflict: "academy_id,framework_id,code" }).select("*").single();
        if (result.error) return json(400, { error: "Failed to save competency", detail: result.error.message });
        if (!result.data?.id) return json(404, { error: "Competency not found" });
        return json(200, { competency: result.data });
      }

      if (actionBody === "upsert_learning_plan") {
        const planId = normalizeText(body?.id ?? body?.plan_id, 64);
        const contactId = normalizeText(body?.contact_id, 64);
        const frameworkId = normalizeText(body?.framework_id, 64);
        const title = normalizeText(body?.title, 240);
        const goal = normalizeText(body?.goal, 5000);
        const status = normalizeText(body?.status, 20).toLowerCase() || "draft";
        if (!contactId || !frameworkId || !title || !goal || !["draft", "active", "completed", "paused", "cancelled"].includes(status)) return json(400, { error: "contact_id, framework_id, title, goal, and a valid status are required" });
        await ensureContactInAccessScope(sb, academyId, access, contactId);
        const publish = body?.published === true || Boolean(body?.published_at);
        const payload = { academy_id: academyId, contact_id: contactId, framework_id: frameworkId, title, goal, starts_on: normalizeText(body?.starts_on, 20) || new Date().toISOString().slice(0, 10), target_date: normalizeText(body?.target_date, 20) || null, status, coach_user_id: normalizeText(body?.coach_user_id, 64) || userId, published_at: publish ? new Date().toISOString() : null, created_by: userId, metadata: isJsonObject(body?.metadata) ? body.metadata : {} };
        const result = planId
          ? await sb.from("academy_learning_plans").update(payload).eq("academy_id", academyId).eq("id", planId).select("*").maybeSingle()
          : await sb.from("academy_learning_plans").insert(payload).select("*").single();
        if (result.error) return json(400, { error: "Failed to save learning plan", detail: result.error.message });
        if (!result.data?.id) return json(404, { error: "Learning plan not found" });
        const savedPlanId = String(result.data.id);
        const items = Array.isArray(body?.items) ? body.items as Array<Record<string, unknown>> : [];
        const savedItems: Array<Record<string, unknown>> = [];
        for (const item of items) {
          const competencyId = normalizeText(item.competency_id, 64);
          const targetLevel = Number(item.target_level);
          if (!competencyId || !Number.isFinite(targetLevel)) return json(400, { error: "Each learning plan item requires competency_id and target_level" });
          const { data: savedItem, error } = await sb.from("academy_learning_plan_items").upsert({ academy_id: academyId, plan_id: savedPlanId, competency_id: competencyId, baseline_level: typeof item.baseline_level === "number" ? item.baseline_level : null, target_level: targetLevel, current_level: typeof item.current_level === "number" ? item.current_level : null, status: normalizeText(item.status, 30).toLowerCase() || "not_started", target_date: normalizeText(item.target_date, 20) || null, notes: normalizeText(item.notes, 3000) || null, updated_by: userId }, { onConflict: "academy_id,plan_id,competency_id" }).select("*").single();
          if (error) return json(409, { error: "Learning plan saved but an item failed", detail: error.message });
          savedItems.push(savedItem as Record<string, unknown>);
        }
        return json(200, { plan: result.data, items: savedItems });
      }

      if (actionBody === "record_competency_evidence") {
        const planItemId = normalizeText(body?.plan_item_id, 64);
        const evidenceType = normalizeText(body?.evidence_type, 30).toLowerCase();
        if (!planItemId || !["assignment", "quiz", "observation", "attendance", "external", "note"].includes(evidenceType)) return json(400, { error: "plan_item_id and evidence_type are required" });
        const { data: item } = await sb.from("academy_learning_plan_items").select("*").eq("academy_id", academyId).eq("id", planItemId).maybeSingle();
        if (!item?.id) return json(404, { error: "Learning plan item not found" });
        const observedLevel = typeof body?.observed_level === "number" ? body.observed_level : null;
        const { data: evidence, error } = await sb.from("academy_competency_evidence").insert({ academy_id: academyId, plan_item_id: planItemId, evidence_type: evidenceType, source_id: normalizeText(body?.source_id, 64) || null, observed_level: observedLevel, note: normalizeText(body?.note, 5000) || null, observed_by: userId, observed_at: normalizeText(body?.observed_at, 80) || new Date().toISOString(), metadata: isJsonObject(body?.metadata) ? body.metadata : {} }).select("*").single();
        if (error) return json(400, { error: "Failed to record competency evidence", detail: error.message });
        if (observedLevel !== null) {
          const achieved = observedLevel >= Number(item.target_level);
          await sb.from("academy_learning_plan_items").update({ current_level: observedLevel, status: achieved ? "achieved" : "in_progress", updated_by: userId }).eq("academy_id", academyId).eq("id", planItemId);
        }
        return json(200, { evidence });
      }

      if (actionBody === "upsert_integration_endpoint") {
        if (!["owner", "admin", "center_admin"].includes(access.role)) return json(403, { error: "Only academy administrators can manage outbound integrations" });
        const endpointId = normalizeText(body?.id ?? body?.endpoint_id, 64);
        const name = normalizeText(body?.name, 180);
        const endpointUrl = normalizeText(body?.endpoint_url, 2000);
        const status = normalizeText(body?.status, 20).toLowerCase() || "active";
        const eventTypes = Array.isArray(body?.event_types) ? Array.from(new Set((body.event_types as unknown[]).map((item) => normalizeText(item, 100)).filter(Boolean))) : [];
        if (!name || !(await academyWebhookUrlResolvesPublicly(endpointUrl)) || !["active", "paused", "revoked"].includes(status) || !eventTypes.length) return json(400, { error: "name, a public HTTPS endpoint_url, event_types, and valid status are required" });
        const rotateSecret = !endpointId || body?.rotate_secret === true;
        const signingSecret = rotateSecret ? createOpaqueToken() : null;
        const payload: Record<string, unknown> = { academy_id: academyId, name, endpoint_url: endpointUrl, event_types: eventTypes, status, created_by: userId, metadata: isJsonObject(body?.metadata) ? body.metadata : {} };
        if (signingSecret) Object.assign(payload, { signing_secret: signingSecret, signing_secret_last4: signingSecret.slice(-4) });
        const result = endpointId
          ? await sb.from("academy_integration_endpoints").update(payload).eq("academy_id", academyId).eq("id", endpointId).select("id,academy_id,name,endpoint_url,signing_secret_last4,event_types,status,consecutive_failures,last_success_at,last_failure_at,created_at,updated_at,metadata").maybeSingle()
          : await sb.from("academy_integration_endpoints").insert(payload).select("id,academy_id,name,endpoint_url,signing_secret_last4,event_types,status,consecutive_failures,last_success_at,last_failure_at,created_at,updated_at,metadata").single();
        if (result.error) return json(400, { error: "Failed to save integration endpoint", detail: result.error.message });
        if (!result.data?.id) return json(404, { error: "Integration endpoint not found" });
        return json(200, { endpoint: result.data, signing_secret: signingSecret });
      }

      if (actionBody === "queue_integration_event") {
        if (!["owner", "admin", "center_admin"].includes(access.role)) return json(403, { error: "Forbidden" });
        const endpointId = normalizeText(body?.endpoint_id, 64);
        const eventType = normalizeText(body?.event_type, 100);
        const eventPayload = isJsonObject(body?.payload) ? body.payload : null;
        if (!endpointId || !eventType || !eventPayload) return json(400, { error: "endpoint_id, event_type, and payload are required" });
        const serialized = JSON.stringify(eventPayload);
        if (serialized.length > 262_144) return json(413, { error: "Webhook payload exceeds 256 KiB" });
        const { data: endpoint } = await sb.from("academy_integration_endpoints").select("id,event_types,status").eq("academy_id", academyId).eq("id", endpointId).eq("status", "active").maybeSingle();
        if (!endpoint?.id || !Array.isArray(endpoint.event_types) || !endpoint.event_types.map(String).includes(eventType)) return json(409, { error: "Endpoint does not accept this event type" });
        const idempotencyKey = normalizeText(body?.idempotency_key, 180) || `${endpointId}:${eventType}:${normalizeText(body?.event_id, 64) || crypto.randomUUID()}`;
        const { data: delivery, error } = await sb.from("academy_integration_deliveries").insert({ academy_id: academyId, endpoint_id: endpointId, event_type: eventType, event_id: normalizeText(body?.event_id, 64) || null, payload: eventPayload, status: "queued", next_attempt_at: new Date().toISOString(), idempotency_key: idempotencyKey }).select("id,academy_id,endpoint_id,event_type,event_id,status,attempts,next_attempt_at,idempotency_key,created_at").single();
        if (error) return json(error.code === "23505" ? 409 : 400, { error: "Failed to queue integration event", detail: error.message });
        return json(200, { delivery });
      }

      if (actionBody === "dispatch_integration_events") {
        if (!["owner", "admin", "center_admin"].includes(access.role)) return json(403, { error: "Forbidden" });
        const limit = Math.min(50, Math.max(1, toIntOrNull(body?.limit) ?? 20));
        const { data: dueRows, error } = await sb.from("academy_integration_deliveries").select("*").eq("academy_id", academyId).in("status", ["queued", "retrying"]).lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
        if (error) return json(500, { error: "Failed to load integration queue", detail: error.message });
        let deliveredCount = 0, retrying = 0, failed = 0;
        for (const delivery of (dueRows ?? []) as Array<Record<string, unknown>>) {
          const { data: endpoint } = await sb.from("academy_integration_endpoints").select("*").eq("academy_id", academyId).eq("id", delivery.endpoint_id).eq("status", "active").maybeSingle();
          if (!endpoint?.id || !(await academyWebhookUrlResolvesPublicly(String(endpoint.endpoint_url)))) {
            await sb.from("academy_integration_deliveries").update({ status: "failed", error: "Endpoint unavailable or unsafe" }).eq("academy_id", academyId).eq("id", delivery.id);
            failed++;
            continue;
          }
          const payloadText = JSON.stringify(delivery.payload);
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(endpoint.signing_secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
          const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payloadText}`));
          const signature = Array.from(new Uint8Array(signatureBytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
          await sb.from("academy_integration_deliveries").update({ status: "delivering", attempts: Number(delivery.attempts ?? 0) + 1 }).eq("academy_id", academyId).eq("id", delivery.id);
          try {
            const response = await fetch(String(endpoint.endpoint_url), { method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/json", "user-agent": "Schood-Academy-Webhook/1.0", "x-schood-event": String(delivery.event_type), "x-schood-delivery": String(delivery.id), "x-schood-timestamp": timestamp, "x-schood-signature": `sha256=${signature}` }, body: payloadText });
            const excerpt = (await response.text()).slice(0, 500);
            if (response.ok) {
              await sb.from("academy_integration_deliveries").update({ status: "delivered", response_status: response.status, response_excerpt: excerpt, error: null, delivered_at: new Date().toISOString() }).eq("academy_id", academyId).eq("id", delivery.id);
              await sb.from("academy_integration_endpoints").update({ consecutive_failures: 0, last_success_at: new Date().toISOString() }).eq("academy_id", academyId).eq("id", endpoint.id);
              deliveredCount++;
            } else {
              const attempts = Number(delivery.attempts ?? 0) + 1;
              const terminal = attempts >= 5 || response.status === 410;
              await sb.from("academy_integration_deliveries").update({ status: terminal ? "failed" : "retrying", response_status: response.status, response_excerpt: excerpt, error: `HTTP ${response.status}`, next_attempt_at: new Date(Date.now() + Math.min(24 * 60, 2 ** attempts * 5) * 60_000).toISOString() }).eq("academy_id", academyId).eq("id", delivery.id);
              await sb.from("academy_integration_endpoints").update({ consecutive_failures: Number(endpoint.consecutive_failures ?? 0) + 1, last_failure_at: new Date().toISOString(), ...(response.status === 410 ? { status: "paused" } : {}) }).eq("academy_id", academyId).eq("id", endpoint.id);
              terminal ? failed++ : retrying++;
            }
          } catch (dispatchError) {
            const attempts = Number(delivery.attempts ?? 0) + 1;
            const terminal = attempts >= 5;
            await sb.from("academy_integration_deliveries").update({ status: terminal ? "failed" : "retrying", error: String(dispatchError instanceof Error ? dispatchError.message : dispatchError).slice(0, 500), next_attempt_at: new Date(Date.now() + Math.min(24 * 60, 2 ** attempts * 5) * 60_000).toISOString() }).eq("academy_id", academyId).eq("id", delivery.id);
            await sb.from("academy_integration_endpoints").update({ consecutive_failures: Number(endpoint.consecutive_failures ?? 0) + 1, last_failure_at: new Date().toISOString() }).eq("academy_id", academyId).eq("id", endpoint.id);
            terminal ? failed++ : retrying++;
          }
        }
        return json(200, { processed: dueRows?.length ?? 0, delivered: deliveredCount, retrying, failed });
      }

      if (actionBody === "create_export") {
        const exportType = normalizeText(body?.export_type, 40).toLowerCase();
        const format = normalizeText(body?.format, 10).toLowerCase() || "csv";
        const allowedTypes = ["contacts", "students", "attendance", "balances", "payments", "payroll", "service_requests", "learning_plans"];
        if (!allowedTypes.includes(exportType) || !["csv", "json"].includes(format)) return json(400, { error: "A supported export_type and format are required" });
        const financeExport = ["balances", "payments", "payroll"].includes(exportType);
        const allowed = financeExport ? academyAccessHas(access, "viewFinancialReports") || academyAccessHas(access, "viewPayroll") : academyAccessHas(access, "viewReports") || academyAccessHas(access, "viewAcademicReports") || academyAccessHas(access, "manageContacts");
        if (!allowed) return json(403, { error: "Forbidden" });
        const { data: job, error: jobError } = await sb.from("academy_export_jobs").insert({ academy_id: academyId, export_type: exportType, format, status: "running", filters: isJsonObject(body?.filters) ? body.filters : {}, requested_by: userId }).select("*").single();
        if (jobError) return json(400, { error: "Failed to create export", detail: jobError.message });
        const exportQueries: Record<string, () => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>> = {
          contacts: () => sb.from("academy_contacts").select("id,first_name,last_name,email,phone,status,lifecycle_stage,placement_level,created_at").eq("academy_id", academyId).order("created_at").limit(10000),
          students: () => sb.from("academy_classroom_memberships").select("id,classroom_id,contact_id,role,status,joined_at,started_at,completed_at,expires_at").eq("academy_id", academyId).order("joined_at").limit(10000),
          attendance: () => sb.from("academy_attendance").select("id,classroom_id,contact_id,session_id,session_date,status,notes,marked_at").eq("academy_id", academyId).order("session_date", { ascending: false }).limit(10000),
          balances: () => sb.from("academy_charge_balances").select("id,contact_id,charge_number,charge_type,due_on,currency,effective_amount,outstanding_amount,calculated_status,days_overdue,aging_bucket").eq("academy_id", academyId).order("due_on", { ascending: false }).limit(10000),
          payments: () => sb.from("academy_payments").select("id,contact_id,provider,amount,currency,status,provider_transaction_id,paid_at,created_at").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(10000),
          payroll: () => sb.from("academy_payroll_row_totals").select("*").eq("academy_id", academyId).limit(10000),
          service_requests: () => sb.from("academy_service_requests").select("id,requester_kind,contact_id,guardian_id,staff_id,classroom_id,request_type,subject,priority,status,desired_date,assigned_to,resolution,resolved_at,created_at").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(10000),
          learning_plans: () => sb.from("academy_learning_plans").select("id,contact_id,framework_id,title,goal,starts_on,target_date,status,coach_user_id,published_at,created_at").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(10000),
        };
        const result = await exportQueries[exportType]();
        if (result.error) {
          await sb.from("academy_export_jobs").update({ status: "failed", error: result.error.message, completed_at: new Date().toISOString() }).eq("id", job.id);
          return json(500, { error: "Export failed", detail: result.error.message });
        }
        const rows = result.data ?? [];
        const { data: completedJob } = await sb.from("academy_export_jobs").update({ status: "ready", row_count: rows.length, result_data: rows, completed_at: new Date().toISOString(), expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString() }).eq("id", job.id).select("id,academy_id,export_type,format,status,row_count,requested_at,completed_at,expires_at").single();
        return json(200, { export: completedJob });
      }

      if (actionBody === "download_export") {
        const exportId = normalizeText(body?.export_id ?? body?.id, 64);
        if (!exportId) return json(400, { error: "export_id is required" });
        const { data: job, error } = await sb.from("academy_export_jobs").select("*").eq("academy_id", academyId).eq("id", exportId).maybeSingle();
        if (error) return json(500, { error: "Failed to load export", detail: error.message });
        if (!job?.id || (String(job.requested_by) !== userId && !["owner", "admin", "center_admin"].includes(access.role))) return json(404, { error: "Export not found" });
        if (job.status !== "ready" || (job.expires_at && Date.parse(String(job.expires_at)) <= Date.now())) return json(410, { error: "Export is not available" });
        return json(200, { export: { id: job.id, export_type: job.export_type, format: job.format, row_count: job.row_count, result_data: job.result_data, completed_at: job.completed_at, expires_at: job.expires_at } });
      }

      if (actionBody === "convert_lead_full") {
        const leadId = normalizeText(body?.lead_id, 64);
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        if (!leadId || !idempotencyKey) return json(400, { error: "lead_id and idempotency_key are required" });
        const { data: lead, error: leadError } = await sb.from("academy_leads").select("id,branch_id").eq("academy_id",academyId).eq("id",leadId).maybeSingle();
        if (leadError || !lead?.id) return json(404, { error: "Lead not found", detail: leadError?.message });
        if (!accessCanUseBranch(access, lead.branch_id)) return json(403, { error: "Forbidden" });
        const payload = {
          classroom_id: normalizeText(body?.classroom_id,64) || null,
          existing_contact_id: normalizeText(body?.existing_contact_id,64) || null,
          trial_id: normalizeText(body?.trial_id,64) || null,
          guardian: toJsonObject(body?.guardian), subscription: toJsonObject(body?.subscription), charge: toJsonObject(body?.charge),
        };
        const { data, error } = await sb.rpc("academy_convert_lead_full", { p_academy_id:academyId,p_lead_id:leadId,p_actor_id:userId,p_payload:payload,p_idempotency_key:idempotencyKey });
        if (error) return json(400,{error:"Failed to complete lead conversion",detail:error.message});
        return json(200,{result:data});
      }

      if (actionBody === "upsert_campaign") {
        const campaignKey=normalizeText(body?.campaign_key,100).toLowerCase().replace(/[^a-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"");
        const name=normalizeText(body?.name,220);if(!campaignKey||!name)return json(400,{error:"campaign_key and name are required"});
        const payload={academy_id:academyId,source_id:normalizeText(body?.source_id,64)||null,campaign_key:campaignKey,name_i18n:isJsonObject(body?.name_i18n)?body.name_i18n:{en:name,uz:name,ru:name},starts_on:normalizeText(body?.starts_on,20)||null,ends_on:normalizeText(body?.ends_on,20)||null,budget_amount:toIntOrNull(body?.budget_amount),currency:normalizeText(body?.currency,10).toUpperCase()||"UZS",external_provider:normalizeText(body?.external_provider,80)||null,external_campaign_id:normalizeText(body?.external_campaign_id,160)||null,status:normalizeText(body?.status,30)||"active",metadata:toJsonObject(body?.metadata),created_by:userId,updated_at:new Date().toISOString()};
        const {data,error}=await sb.from("academy_marketing_campaigns").upsert(payload,{onConflict:"academy_id,campaign_key"}).select("*").single();if(error)return json(400,{error:"Failed to save campaign",detail:error.message});return json(200,{campaign:data});
      }

      if (actionBody === "upsert_localization") {
        const defaultLocale=normalizeText(body?.default_locale,10).toLowerCase()||"uz";const enabledLocales=toStringArray(body?.enabled_locales).map((locale)=>locale.toLowerCase());
        if(!["uz","ru","en"].includes(defaultLocale)||enabledLocales.some((locale)=>!["uz","ru","en"].includes(locale)))return json(400,{error:"Locales must be uz, ru, or en"});
        const locales=enabledLocales.length?Array.from(new Set(enabledLocales)):["uz","ru","en"];if(!locales.includes(defaultLocale))return json(400,{error:"Default locale must be enabled"});
        const {data:settings,error}=await sb.from("academy_localization_settings").upsert({academy_id:academyId,default_locale:defaultLocale,enabled_locales:locales,timezone:normalizeText(body?.timezone,80)||"Asia/Tashkent",currency:normalizeText(body?.currency,10).toUpperCase()||"UZS",phone_country_code:normalizeText(body?.phone_country_code,10)||"+998",date_format:normalizeText(body?.date_format,30)||"DD.MM.YYYY",time_format:normalizeText(body?.time_format,10)||"24h",updated_by:userId,updated_at:new Date().toISOString()},{onConflict:"academy_id"}).select("*").single();
        if(error)return json(400,{error:"Failed to save localization",detail:error.message});
        const translations=Array.isArray(body?.translations)?body.translations:[];const saved=[];
        for(const itemRaw of translations){const item=toJsonObject(itemRaw);const key=normalizeText(item.translation_key,180);const locale=normalizeText(item.locale,10).toLowerCase();const value=normalizeText(item.translated_value,4000);if(!key||!["uz","ru","en"].includes(locale)||!value)continue;const {data,error:translationError}=await sb.from("academy_translation_overrides").upsert({academy_id:academyId,translation_key:key,locale,translated_value:value,updated_by:userId,updated_at:new Date().toISOString()},{onConflict:"academy_id,translation_key,locale"}).select("*").single();if(translationError)return json(400,{error:"Failed to save translation",detail:translationError.message});saved.push(data);}
        return json(200,{localization:settings,translations:saved});
      }


      if (actionBody === "create_automation_version") {
        const triggerKey=normalizeText(body?.trigger_key,80).toLowerCase();const safeguardMode=normalizeText(body?.safeguard_mode,40).toLowerCase()||"standard";const conditionTree=isJsonObject(body?.condition_tree)?body.condition_tree:{all:[]};const actions=Array.isArray(body?.actions)?body.actions:[];const validationError=validateAutomationDefinition(conditionTree,actions,safeguardMode);if(validationError)return json(400,{error:validationError});
        const idempotencyKey=normalizeText(body?.idempotency_key,180);if(!triggerKey||!idempotencyKey)return json(400,{error:"trigger_key and idempotency_key are required"});
        let ruleId=normalizeText(body?.rule_id,64);if(!ruleId){const ruleKey=normalizeText(body?.rule_key,100).toLowerCase().replace(/[^a-z0-9_.-]+/g,"-");const name=normalizeText(body?.name,220);if(!ruleKey||!name)return json(400,{error:"rule_key and name are required for a new rule"});const {data:rule,error:ruleError}=await sb.from("academy_automation_rules").upsert({academy_id:academyId,rule_key:ruleKey,name,description:normalizeText(body?.description,1000),channel:"inapp",threshold:null,is_active:true,branch_id:normalizeText(body?.branch_id,64)||null,lifecycle_status:"draft",created_by:userId,updated_by:userId,updated_at:new Date().toISOString()},{onConflict:"academy_id,rule_key"}).select("id").single();if(ruleError)return json(400,{error:"Failed to save automation rule",detail:ruleError.message});ruleId=String(rule.id);}
        const {data,error}=await sb.rpc("academy_create_automation_version",{p_academy_id:academyId,p_rule_id:ruleId,p_actor_id:userId,p_payload:{trigger_key:triggerKey,condition_tree:conditionTree,actions,safeguard_mode:safeguardMode,status:normalizeText(body?.status,20)||"draft"},p_idempotency_key:idempotencyKey});if(error)return json(400,{error:"Failed to create automation version",detail:error.message});return json(200,{automation_version:data});
      }

      if (actionBody === "execute_automation_event") {
        const versionId=normalizeText(body?.rule_version_id,64);const idempotencyKey=normalizeText(body?.idempotency_key,180);const triggerKey=normalizeText(body?.trigger_key,80).toLowerCase();if(!versionId||!idempotencyKey||!triggerKey)return json(400,{error:"rule_version_id, trigger_key, and idempotency_key are required"});
        const {data:version,error:versionError}=await sb.from("academy_automation_rule_versions").select("*").eq("academy_id",academyId).eq("id",versionId).eq("status","active").maybeSingle();if(versionError||!version?.id)return json(404,{error:"Active automation version not found",detail:versionError?.message});if(version.branch_id&&!accessCanUseBranch(access,version.branch_id))return json(403,{error:"Forbidden"});
        const inputSnapshot=toJsonObject(body?.input_snapshot);const {data:execution,error}=await sb.rpc("academy_begin_automation_execution",{p_academy_id:academyId,p_rule_version_id:versionId,p_actor_id:userId,p_payload:{source_event_id:normalizeText(body?.source_event_id,64)||null,trigger_key:triggerKey,subject_type:normalizeText(body?.subject_type,40)||null,subject_id:normalizeText(body?.subject_id,64)||null,input_snapshot:inputSnapshot},p_idempotency_key:idempotencyKey});if(error||!execution?.id)return json(400,{error:"Failed to start automation",detail:error?.message});
        if(execution.status==="awaiting_review"){const effects=[];for(let index=0;index<(Array.isArray(version.actions)?version.actions.length:0);index+=1){const action=toJsonObject(version.actions[index]);const {data:effect,error:effectError}=await sb.from("academy_automation_effects").upsert({academy_id:academyId,execution_id:execution.id,branch_id:version.branch_id??null,action_index:index,action_type:normalizeText(action.type,40),status:"awaiting_review",payload_snapshot:toJsonObject(action.payload),idempotency_key:`${idempotencyKey}:effect:${index}`},{onConflict:"academy_id,execution_id,action_index"}).select("*").single();if(effectError)return json(400,{error:"Failed to stage automation review",detail:effectError.message});effects.push(effect);}return json(200,{execution,effects,requires_review:true});}
        try{return json(200,await executeAcademyAutomation(sb,academyId,userId,version as Record<string,unknown>,execution as Record<string,unknown>));}catch(error){return json(400,{error:"Automation execution failed",detail:error instanceof Error?error.message:String(error)});}
      }

      if (actionBody === "review_automation_execution") {
        const executionId=normalizeText(body?.execution_id,64);const decision=normalizeText(body?.decision,20).toLowerCase();if(!executionId||!["approved","rejected"].includes(decision))return json(400,{error:"execution_id and approved or rejected decision are required"});const {data:execution,error:executionError}=await sb.from("academy_automation_executions").select("*").eq("academy_id",academyId).eq("id",executionId).eq("status","awaiting_review").maybeSingle();if(executionError||!execution?.id)return json(404,{error:"Reviewable automation execution not found",detail:executionError?.message});if(execution.branch_id&&!accessCanUseBranch(access,execution.branch_id))return json(403,{error:"Forbidden"});
        if(decision==="rejected"){const now=new Date().toISOString();await sb.from("academy_automation_effects").update({status:"skipped",error_code:"human_rejected",error_detail:normalizeText(body?.note,1000),completed_at:now}).eq("academy_id",academyId).eq("execution_id",executionId);const {data,error}=await sb.from("academy_automation_executions").update({status:"cancelled",reviewed_by:userId,reviewed_at:now,finished_at:now,output_summary:{decision:"rejected",note:normalizeText(body?.note,1000)}}).eq("academy_id",academyId).eq("id",executionId).select("*").single();if(error)return json(400,{error:"Failed to reject automation",detail:error.message});return json(200,{execution:data});}
        const {data:version,error:versionError}=await sb.from("academy_automation_rule_versions").select("*").eq("academy_id",academyId).eq("id",execution.rule_version_id).single();if(versionError)return json(400,{error:"Automation version unavailable",detail:versionError.message});await sb.from("academy_automation_effects").update({status:"pending"}).eq("academy_id",academyId).eq("execution_id",executionId);const approvedExecution={...execution,reviewed_by:userId,reviewed_at:new Date().toISOString(),status:"pending"};await sb.from("academy_automation_executions").update({reviewed_by:userId,reviewed_at:approvedExecution.reviewed_at,status:"pending"}).eq("academy_id",academyId).eq("id",executionId);try{return json(200,await executeAcademyAutomation(sb,academyId,userId,version as Record<string,unknown>,approvedExecution));}catch(error){return json(400,{error:"Approved automation failed",detail:error instanceof Error?error.message:String(error)});}
      }

      if (actionBody === "request_ai_assistance") {
        const requestKinds=["operations_summary","student_progress_summary","parent_report_draft","lead_history_summary","follow_up_draft","classroom_performance_summary","unusual_change_explanation","risk_explanation","announcement_draft","owner_question"];
        const requestKind=normalizeText(body?.request_kind,80).toLowerCase();const idempotencyKey=normalizeText(body?.idempotency_key,180);if(!requestKinds.includes(requestKind)||!idempotencyKey)return json(400,{error:"Valid request_kind and idempotency_key are required"});if(requestKind==="risk_explanation"&&!academyAccessHas(access,"viewRisk"))return json(403,{error:"Forbidden"});
        const {data:existing}=await sb.from("academy_ai_assistance_requests").select("*").eq("academy_id",academyId).eq("idempotency_key",idempotencyKey).maybeSingle();if(existing?.id)return json(200,{ai_request:existing,idempotent_replay:true});
        const branchId=normalizeText(body?.branch_id,64)||null;if(branchId&&!accessCanUseBranch(access,branchId))return json(403,{error:"Forbidden"});if(academyAccessBranchIds(access)!==null&&!branchId)return json(400,{error:"branch_id is required for branch-scoped AI assistance"});
        const subjectType=normalizeText(body?.subject_type,40).toLowerCase()||null;const subjectId=normalizeText(body?.subject_id,64)||null;const evidence:Json={academy_id:academyId,branch_id:branchId,request_kind:requestKind,generated_at:new Date().toISOString(),governance:{human_review_required:true,may_not_execute_actions:true}};
        if(subjectType==="contact"&&subjectId){let q=sb.from("academy_unified_student_intelligence").select("contact_id,primary_branch_id,student_name,status,lifecycle_stage,active_enrollments,attendance_30d_percent,academic_90d_percent,homework_activity_30d,outstanding_balance,last_payment_at,guardian_interactions_30d,latest_risk_level,latest_risk_score,open_interventions,open_actions,last_engagement_at").eq("academy_id",academyId).eq("contact_id",subjectId);if(branchId)q=q.eq("primary_branch_id",branchId);const {data,error}=await q.maybeSingle();if(error||!data)return json(404,{error:"Student evidence not found",detail:error?.message});evidence.student=data;}
        else if(subjectType==="lead"&&subjectId){let q=sb.from("academy_leads").select("id,branch_id,status,current_stage_id,source_id,campaign_id,interested_course_id,assigned_user_id,expected_value,currency,last_activity_at,created_at").eq("academy_id",academyId).eq("id",subjectId);if(branchId)q=q.eq("branch_id",branchId);const {data,error}=await q.maybeSingle();if(error||!data)return json(404,{error:"Lead evidence not found",detail:error?.message});const {data:activities}=await sb.from("academy_lead_activities").select("activity_type,outcome,next_action_at,occurred_at").eq("academy_id",academyId).eq("lead_id",subjectId).order("occurred_at",{ascending:false}).limit(30);evidence.lead=data;evidence.activities=activities??[];}
        else if(subjectType==="classroom"&&subjectId){let q=sb.from("academy_classrooms").select("id,branch_id,name,student_capacity,is_active").eq("academy_id",academyId).eq("id",subjectId);if(branchId)q=q.eq("branch_id",branchId);const {data,error}=await q.maybeSingle();if(error||!data)return json(404,{error:"Classroom evidence not found",detail:error?.message});const [{data:metrics},{data:capacity}]=await Promise.all([sb.from("academy_unit_economics_metrics").select("*").eq("academy_id",academyId).eq("entity_id",subjectId).maybeSingle(),sb.from("academy_classroom_capacity_summary").select("*").eq("academy_id",academyId).eq("classroom_id",subjectId).maybeSingle()]);evidence.classroom=data;evidence.metrics=metrics??{};evidence.capacity=capacity??{};}
        else if(branchId){const {data}=await sb.from("academy_branch_comparison_v2").select("*").eq("academy_id",academyId).eq("branch_id",branchId).maybeSingle();evidence.branch=data??{};}
        else{const {data}=await sb.from("academy_business_dashboard_v2").select("*").eq("academy_id",academyId).maybeSingle();evidence.dashboard=data??{};}
        const question=normalizeText(body?.question,2000)||null;const {data:request,error:requestError}=await sb.from("academy_ai_assistance_requests").insert({academy_id:academyId,branch_id:branchId,request_kind:requestKind,subject_type:subjectType,subject_id:subjectId,question,status:"generating",evidence_snapshot:evidence,requested_by:userId,idempotency_key:idempotencyKey}).select("*").single();if(requestError||!request?.id)return json(400,{error:"Failed to create AI request",detail:requestError?.message});
        const fallback={title:"Evidence-backed draft",summary:"A governed draft was prepared from the current authorized Academy evidence.",evidence_used:Object.keys(evidence).filter((key)=>!["academy_id","generated_at","governance"].includes(key)),suggested_next_steps:["Review the evidence","Edit the draft for context","Approve or reject the proposal"],caveats:["This is decision support, not an executed action","A human must review before use"],draft_text:question?`Draft response for: ${question}`:"Review the attached operational evidence and choose the next action."};
        const ai=await callOpenRouterJsonWithStatus<Record<string,unknown>>({temperature:0.2,systemPrompt:"You are Schood Education Business OS. Use only supplied evidence. Never invent facts. Never claim an action was executed. Return strict JSON with title, summary, evidence_used, suggested_next_steps, caveats, and draft_text. Mark uncertainty clearly and require human review for consequential decisions.",userPayload:JSON.stringify({request_kind:requestKind,question,evidence})},fallback);
        const finalStatus=ai.status==="failed"?"failed":"ready";const {data:updated,error:updateError}=await sb.from("academy_ai_assistance_requests").update({status:finalStatus,proposed_output:ai.data,provider:ai.status==="unconfigured"?"deterministic_fallback":"openrouter",ai_status:ai.status,ai_error:ai.error??null,generated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("academy_id",academyId).eq("id",request.id).select("*").single();if(updateError)return json(400,{error:"Failed to store AI proposal",detail:updateError.message});return json(200,{ai_request:updated});
      }

      if (actionBody === "review_ai_assistance") {
        const requestId=normalizeText(body?.request_id,64);const decision=normalizeText(body?.decision,20).toLowerCase();if(!requestId||!["reviewed","approved","rejected"].includes(decision))return json(400,{error:"request_id and reviewed, approved, or rejected decision are required"});const {data:request,error:requestError}=await sb.from("academy_ai_assistance_requests").select("*").eq("academy_id",academyId).eq("id",requestId).maybeSingle();if(requestError||!request?.id)return json(404,{error:"AI request not found",detail:requestError?.message});if(request.branch_id&&!accessCanUseBranch(access,request.branch_id))return json(403,{error:"Forbidden"});if(!["ready","reviewed","approved","rejected"].includes(String(request.status)))return json(400,{error:"AI request is not ready for review"});const note=normalizeText(body?.note,2000)||null;const now=new Date().toISOString();const {data:review,error:reviewError}=await sb.from("academy_ai_assistance_reviews").insert({academy_id:academyId,request_id:requestId,decision,note,reviewed_by:userId,reviewed_at:now,output_snapshot:request.proposed_output??{}}).select("*").single();if(reviewError)return json(400,{error:"Failed to record AI review",detail:reviewError.message});const {data:updated,error:updateError}=await sb.from("academy_ai_assistance_requests").update({status:decision,reviewed_by:userId,review_note:note,reviewed_at:now,updated_at:now}).eq("academy_id",academyId).eq("id",requestId).select("*").single();if(updateError)return json(400,{error:"Failed to update AI request",detail:updateError.message});return json(200,{ai_request:updated,review});
      }

      if (actionBody === "upsert_branch") {
        const id = normalizeText(body?.id, 64);
        const branchKey = normalizeText(body?.branch_key, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
        const name = normalizeText(body?.name, 180);
        const capacity = toIntOrNull(body?.capacity);
        if (!branchKey) return json(400, { error: "branch_key is required" });
        if (!name) return json(400, { error: "name is required" });
        if (capacity !== null && capacity < 0) return json(400, { error: "capacity cannot be negative" });
        const payload = {
          academy_id: academyId,
          branch_key: branchKey,
          name,
          address: normalizeText(body?.address, 500) || null,
          phone: normalizeText(body?.phone, 80) || null,
          timezone: normalizeText(body?.timezone, 80) || "Asia/Tashkent",
          currency: normalizeText(body?.currency, 10).toUpperCase() || "UZS",
          capacity,
          is_active: body?.is_active !== false,
          updated_at: new Date().toISOString(),
        };
        const query = id
          ? sb.from("academy_branches").update(payload).eq("academy_id", academyId).eq("id", id)
          : sb.from("academy_branches").insert({ ...payload, created_by: userId });
        const { data, error } = await query
          .select("id, academy_id, branch_key, name, address, phone, timezone, currency, capacity, is_default, is_active, metadata, created_at, updated_at")
          .maybeSingle();
        if (error) return json(400, { error: `Failed to ${id ? "update" : "create"} branch`, detail: error.message });
        if (!data?.id) return json(404, { error: "Branch not found" });
        await logAcademyAuditEvent(sb, {
          academyId, actorUserId: userId, actorRole: access.role,
          action: id ? "branch.updated" : "branch.created", targetType: "academy_branch", targetId: String(data.id),
          metadata: { branch_key: branchKey, capacity },
        });
        return json(200, { branch: data });
      }

      if (actionBody === "upsert_room") {
        const id = normalizeText(body?.id, 64);
        const branchId = normalizeText(body?.branch_id, 64);
        const roomKey = normalizeText(body?.room_key, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
        const name = normalizeText(body?.name, 180);
        const capacity = toIntOrNull(body?.capacity);
        const roomType = normalizeText(body?.room_type, 30).toLowerCase() || "classroom";
        if (!branchId || !roomKey || !name) return json(400, { error: "branch_id, room_key, and name are required" });
        if (capacity === null || capacity < 1) return json(400, { error: "capacity must be at least 1" });
        if (!["classroom", "lab", "meeting", "office", "online", "other"].includes(roomType)) return json(400, { error: "Invalid room_type" });
        const { data: branch } = await sb.from("academy_branches").select("id").eq("academy_id", academyId).eq("id", branchId).eq("is_active", true).maybeSingle();
        if (!branch?.id) return json(404, { error: "Branch not found" });
        const payload = { academy_id: academyId, branch_id: branchId, room_key: roomKey, name, capacity, room_type: roomType, is_active: body?.is_active !== false, updated_at: new Date().toISOString() };
        const query = id
          ? sb.from("academy_rooms").update(payload).eq("academy_id", academyId).eq("id", id)
          : sb.from("academy_rooms").insert({ ...payload, created_by: userId });
        const { data, error } = await query
          .select("id, academy_id, branch_id, room_key, name, capacity, room_type, is_active, features, metadata, created_at, updated_at")
          .maybeSingle();
        if (error) return json(400, { error: `Failed to ${id ? "update" : "create"} room`, detail: error.message });
        if (!data?.id) return json(404, { error: "Room not found" });
        await logAcademyAuditEvent(sb, {
          academyId, actorUserId: userId, actorRole: access.role,
          action: id ? "room.updated" : "room.created", targetType: "academy_room", targetId: String(data.id),
          metadata: { branch_id: branchId, room_key: roomKey, capacity },
        });
        return json(200, { room: data });
      }

      if (actionBody === "create_lead") {
        const fullName = normalizeText(body?.full_name, 180);
        const phone = normalizeText(body?.phone, 80);
        const telegram = normalizeText(body?.telegram, 100);
        const email = normalizeText(body?.email, 240).toLowerCase();
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        if (!fullName) return json(400, { error: "full_name is required" });
        if (!phone && !telegram && !email) return json(400, { error: "phone, Telegram, or email is required" });
        if (!idempotencyKey) return json(400, { error: "idempotency_key is required" });
        const payload = {
          full_name: fullName,
          phone: phone || null,
          telegram: telegram || null,
          email: email || null,
          parent_name: normalizeText(body?.parent_name, 180) || null,
          parent_phone: normalizeText(body?.parent_phone, 80) || null,
          age: toIntOrNull(body?.age),
          interested_course: normalizeText(body?.interested_course, 180) || null,
          branch_id: normalizeText(body?.branch_id, 64) || null,
          preferred_branch_id: normalizeText(body?.preferred_branch_id, 64) || null,
          preferred_schedule: normalizeText(body?.preferred_schedule, 240) || null,
          preferred_lesson_time: normalizeText(body?.preferred_lesson_time, 20) || null,
          expected_price: toIntOrNull(body?.expected_price),
          currency: normalizeText(body?.currency, 10).toUpperCase() || "UZS",
          source_id: normalizeText(body?.source_id, 64) || null,
          source_key: normalizeText(body?.source_key, 80).toLowerCase() || null,
          campaign: normalizeText(body?.campaign, 180) || null,
          referral_source: normalizeText(body?.referral_source, 180) || null,
          notes: normalizeText(body?.notes, 3000) || null,
          tags: Array.isArray(body?.tags) ? body?.tags : [],
          assigned_user_id: normalizeText(body?.assigned_user_id, 64) || null,
          responsible_user_id: normalizeText(body?.responsible_user_id, 64) || null,
          estimated_probability: toIntOrNull(body?.estimated_probability),
          next_follow_up_at: normalizeText(body?.next_follow_up_at, 80) || null,
        };
        const { data, error } = await sb.rpc("academy_create_lead", {
          p_academy_id: academyId, p_actor_id: userId, p_payload: payload, p_idempotency_key: idempotencyKey,
        });
        if (error) return json(400, { error: "Failed to create lead", detail: error.message });
        return json(200, { lead: data });
      }

      if (actionBody === "transition_lead") {
        const leadId = normalizeText(body?.lead_id, 64);
        const toStageId = normalizeText(body?.to_stage_id, 64);
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        if (!leadId || !toStageId || !idempotencyKey) return json(400, { error: "lead_id, to_stage_id, and idempotency_key are required" });
        const { data, error } = await sb.rpc("academy_transition_lead", {
          p_academy_id: academyId, p_lead_id: leadId, p_to_stage_id: toStageId, p_actor_id: userId,
          p_reason: normalizeText(body?.reason, 500) || null, p_notes: normalizeText(body?.notes, 2000) || null,
          p_idempotency_key: idempotencyKey,
        });
        if (error) return json(400, { error: "Failed to transition lead", detail: error.message });
        return json(200, { lead: data });
      }

      if (actionBody === "record_lead_activity") {
        const leadId = normalizeText(body?.lead_id, 64);
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        if (!leadId || !idempotencyKey) return json(400, { error: "lead_id and idempotency_key are required" });
        const payload = {
          activity_type: normalizeText(body?.activity_type, 40).toLowerCase() || "follow_up",
          method: normalizeText(body?.method, 30).toLowerCase() || null,
          status: normalizeText(body?.status, 30).toLowerCase() || "planned",
          assigned_user_id: normalizeText(body?.assigned_user_id, 64) || userId,
          due_at: normalizeText(body?.due_at, 80) || null,
          completed_at: normalizeText(body?.completed_at, 80) || null,
          outcome: normalizeText(body?.outcome, 500) || null,
          notes: normalizeText(body?.notes, 2000) || null,
          next_follow_up_at: normalizeText(body?.next_follow_up_at, 80) || null,
        };
        const { data, error } = await sb.rpc("academy_record_lead_activity", {
          p_academy_id: academyId, p_lead_id: leadId, p_actor_id: userId, p_payload: payload, p_idempotency_key: idempotencyKey,
        });
        if (error) return json(400, { error: "Failed to record lead activity", detail: error.message });
        return json(200, { activity: data });
      }

      if (actionBody === "schedule_trial") {
        const leadId = normalizeText(body?.lead_id, 64);
        const startsAt = normalizeText(body?.starts_at, 80);
        const endsAt = normalizeText(body?.ends_at, 80);
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        const startTime = new Date(startsAt).getTime();
        const endTime = new Date(endsAt).getTime();
        if (!leadId || !idempotencyKey || !Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
          return json(400, { error: "Valid lead_id, starts_at, ends_at, and idempotency_key are required" });
        }
        const payload = {
          branch_id: normalizeText(body?.branch_id, 64) || null,
          room_id: normalizeText(body?.room_id, 64) || null,
          classroom_id: normalizeText(body?.classroom_id, 64) || null,
          teacher_user_id: normalizeText(body?.teacher_user_id, 64) || null,
          starts_at: new Date(startTime).toISOString(), ends_at: new Date(endTime).toISOString(),
        };
        const { data, error } = await sb.rpc("academy_schedule_trial", {
          p_academy_id: academyId, p_lead_id: leadId, p_actor_id: userId, p_payload: payload, p_idempotency_key: idempotencyKey,
        });
        if (error) return json(400, { error: "Failed to schedule trial", detail: error.message });
        return json(200, { trial: data });
      }

      if (actionBody === "set_trial_status") {
        const trialId = normalizeText(body?.trial_id, 64);
        const status = normalizeText(body?.status, 30).toLowerCase();
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        if (!trialId || !status || !idempotencyKey) return json(400, { error: "trial_id, status, and idempotency_key are required" });
        const { data: trialAccess, error: trialAccessError } = await sb.from("academy_trial_lessons")
          .select("id, teacher_user_id, classroom_id").eq("academy_id", academyId).eq("id", trialId).maybeSingle();
        if (trialAccessError) return json(500, { error: "Failed to load trial", detail: trialAccessError.message });
        if (!trialAccess?.id) return json(404, { error: "Trial not found" });
        if (!academyAccessHas(access, "manageAdmissions")) {
          const assignedTeacher = normalizeText(trialAccess.teacher_user_id, 64) === userId;
          const scopedClassroom = trialAccess.classroom_id && accessCanUseClassroom(access, trialAccess.classroom_id);
          if (!assignedTeacher && !scopedClassroom) return json(403, { error: "Forbidden" });
          if (!["attended", "missed"].includes(status)) return json(403, { error: "Teachers may only record trial attendance and feedback" });
        }
        const { data, error } = await sb.rpc("academy_set_trial_status", {
          p_academy_id: academyId, p_trial_id: trialId, p_actor_id: userId, p_status: status,
          p_feedback: normalizeText(body?.feedback, 3000) || null,
          p_recommended_course: normalizeText(body?.recommended_course, 180) || null,
          p_recommended_level: normalizeText(body?.recommended_level, 100) || null,
          p_next_step: normalizeText(body?.next_step, 500) || null,
          p_idempotency_key: idempotencyKey,
        });
        if (error) return json(400, { error: "Failed to update trial", detail: error.message });
        return json(200, { trial: data });
      }

      if (actionBody === "convert_lead") {
        const leadId = normalizeText(body?.lead_id, 64);
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        if (!leadId || !idempotencyKey) return json(400, { error: "lead_id and idempotency_key are required" });
        const { data, error } = await sb.rpc("academy_convert_lead", {
          p_academy_id: academyId, p_lead_id: leadId, p_actor_id: userId,
          p_classroom_id: normalizeText(body?.classroom_id, 64) || null,
          p_existing_contact_id: normalizeText(body?.existing_contact_id, 64) || null,
          p_trial_id: normalizeText(body?.trial_id, 64) || null,
          p_idempotency_key: idempotencyKey,
        });
        if (error) return json(400, { error: "Failed to convert lead", detail: error.message });
        return json(200, data ?? {});
      }

      if (actionBody === "create_pricing_plan") {
        const planKey = normalizeText(body?.plan_key, 100).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
        const name = normalizeText(body?.name, 180);
        const pricingModel = normalizeText(body?.pricing_model, 50).toLowerCase();
        const billingCycle = normalizeText(body?.billing_cycle, 40).toLowerCase() || "monthly";
        const baseAmount = toIntOrNull(body?.base_amount);
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        const pricingModels = ["monthly_fixed", "calendar_month", "per_lesson", "per_teaching_hour", "lesson_package", "module_fee", "course_fee", "upfront_course", "installment_plan", "individual_lesson", "custom", "scholarship", "free"];
        const billingCycles = ["weekly", "monthly", "calendar_month", "quarterly", "term", "course", "package", "one_time", "custom"];
        if (!planKey || !name || !pricingModels.includes(pricingModel)) return json(400, { error: "plan_key, name, and a valid pricing_model are required" });
        if (!billingCycles.includes(billingCycle)) return json(400, { error: "Invalid billing_cycle" });
        if (baseAmount === null || baseAmount < 0 || !idempotencyKey) return json(400, { error: "A non-negative base_amount and idempotency_key are required" });
        const payload = {
          plan_key: planKey, name, pricing_model: pricingModel, billing_cycle: billingCycle,
          base_amount: baseAmount, currency: normalizeText(body?.currency, 10).toUpperCase() || "UZS",
          branch_id: normalizeText(body?.branch_id, 64) || null, classroom_id: normalizeText(body?.classroom_id, 64) || null,
          legacy_offer_id: normalizeText(body?.legacy_offer_id, 64) || null,
          lessons_included: normalizeText(body?.lessons_included, 40) ? safeNumber(body?.lessons_included) : null,
          teaching_hours_included: normalizeText(body?.teaching_hours_included, 40) ? safeNumber(body?.teaching_hours_included) : null,
          duration_days: toIntOrNull(body?.duration_days), installment_count: toIntOrNull(body?.installment_count),
        };
        const { data, error } = await sb.rpc("academy_create_pricing_plan", {
          p_academy_id: academyId, p_actor_id: userId, p_payload: payload, p_idempotency_key: idempotencyKey,
        });
        if (error) return json(400, { error: "Failed to create pricing plan", detail: error.message });
        return json(200, { pricing_plan: data });
      }

      if (actionBody === "create_subscription") {
        const contactId = normalizeText(body?.contact_id, 64);
        const pricingPlanId = normalizeText(body?.pricing_plan_id, 64);
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        const listAmount = toIntOrNull(body?.list_amount);
        const discountAmount = toIntOrNull(body?.discount_amount) ?? 0;
        if (!contactId || !pricingPlanId || !idempotencyKey) return json(400, { error: "contact_id, pricing_plan_id, and idempotency_key are required" });
        if (listAmount !== null && listAmount < 0) return json(400, { error: "list_amount cannot be negative" });
        if (discountAmount < 0 || (listAmount !== null && discountAmount > listAmount)) return json(400, { error: "Invalid discount_amount" });
        if (discountAmount > 0 && !normalizeText(body?.discount_reason, 500)) return json(400, { error: "discount_reason is required when applying a discount" });
        const payload = {
          pricing_plan_id: pricingPlanId, branch_id: normalizeText(body?.branch_id, 64) || null,
          classroom_id: normalizeText(body?.classroom_id, 64) || null, status: normalizeText(body?.status, 30).toLowerCase() || "active",
          starts_on: normalizeText(body?.starts_on, 20) || new Date().toISOString().slice(0, 10), ends_on: normalizeText(body?.ends_on, 20) || null,
          billing_cycle: normalizeText(body?.billing_cycle, 40).toLowerCase() || null, billing_anchor_day: toIntOrNull(body?.billing_anchor_day),
          list_amount: listAmount, discount_amount: discountAmount, discount_type: normalizeText(body?.discount_type, 40).toLowerCase() || "negotiated",
          discount_reason: normalizeText(body?.discount_reason, 500) || null, auto_renew: body?.auto_renew === true,
          renewal_notice_days: toIntOrNull(body?.renewal_notice_days) ?? 7,
        };
        const { data, error } = await sb.rpc("academy_create_subscription", {
          p_academy_id: academyId, p_contact_id: contactId, p_actor_id: userId, p_payload: payload, p_idempotency_key: idempotencyKey,
        });
        if (error) return json(400, { error: "Failed to create subscription", detail: error.message });
        return json(200, { subscription: data });
      }

      if (actionBody === "manage_subscription") {
        const subscriptionId = normalizeText(body?.subscription_id, 64);
        const operation = normalizeText(body?.operation, 30).toLowerCase();
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        const allowedOperations = ["freeze", "resume", "cancel", "complete", "renew"];
        const reason = normalizeText(body?.reason, 1000) || null;
        const startsOn = normalizeText(body?.starts_on, 20) || null;
        const endsOn = normalizeText(body?.ends_on, 20) || null;
        if (!subscriptionId || !allowedOperations.includes(operation) || !idempotencyKey) {
          return json(400, { error: "subscription_id, valid operation, and idempotency_key are required" });
        }
        if (["freeze", "cancel"].includes(operation) && !reason) {
          return json(400, { error: "A reason is required for this subscription operation" });
        }
        if (operation === "freeze" && (!startsOn || !endsOn)) {
          return json(400, { error: "Freeze start and end dates are required" });
        }
        const { data, error } = await sb.rpc("academy_manage_subscription", {
          p_academy_id: academyId, p_subscription_id: subscriptionId, p_actor_id: userId,
          p_action: operation, p_payload: { reason, starts_on: startsOn, ends_on: endsOn },
          p_idempotency_key: idempotencyKey,
        });
        if (error) return json(400, { error: "Failed to manage subscription", detail: error.message });
        return json(200, data ?? {});
      }

      if (staffGuardianActions.has(actionBody)) {
        const result=await staffGuardianCommand(sb,academyId,userId,actionBody,body as Record<string,unknown>);
        if(actionBody==='issue_guardian_link'){
          const link=result.link as Record<string,unknown>;const bot=getOptionalEnv('ACADEMY_TELEGRAM_BOT_NAME')??getOptionalEnv('TELEGRAM_BOT_USERNAME');
          return json(200,{...result,telegram_link:bot&&link?.token?`https://t.me/${bot.replace(/^@/,'')}?start=guardian_${String(link.token)}`:null});
        }
        return json(200,result);
      }

      if (actionBody === "upsert_risk_definition") {
        const id=normalizeText(body?.id,64);const key=normalizeText(body?.definition_key,80).toLowerCase();const name=normalizeText(body?.name,180);const version=toIntOrNull(body?.version)??1;const status=normalizeText(body?.status,20).toLowerCase()||'draft';if(!key||!name||version<1||!['draft','active','retired'].includes(status))return json(400,{error:'definition_key, name, positive version, and valid status are required'});if(status==='active')await sb.from('academy_risk_definitions').update({status:'retired',effective_to:new Date().toISOString()}).eq('academy_id',academyId).eq('definition_key',key).eq('status','active').neq('id',id||'00000000-0000-0000-0000-000000000000');const payload={academy_id:academyId,definition_key:key,version,name,status,weights:typeof body?.weights==='object'&&body.weights?body.weights:{attendance:30,homework:20,debt:30,engagement:20},thresholds:typeof body?.thresholds==='object'&&body.thresholds?body.thresholds:{low:25,medium:50,high:70,critical:85},explanation:normalizeText(body?.explanation,2000),effective_from:status==='active'?new Date().toISOString():null,created_by:userId};const query=id?sb.from('academy_risk_definitions').update(payload).eq('academy_id',academyId).eq('id',id):sb.from('academy_risk_definitions').insert(payload);const {data,error}=await query.select('*').single();if(error)return json(400,{error:'Failed to save risk definition',detail:error.message});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:'risk_definition.saved',targetType:'academy_risk_definition',targetId:String(data.id),metadata:{version,status}});return json(200,{risk_definition:data});
      }

      if (actionBody === "evaluate_retention_risk") {
        const contactId=normalizeText(body?.contact_id,64);const definitionId=normalizeText(body?.definition_id,64);const key=normalizeText(body?.idempotency_key,180);if(!contactId||!definitionId||!key)return json(400,{error:'contact_id, definition_id, and idempotency_key are required'});await ensureContactInAccessScope(sb,academyId,access,contactId);const {data,error}=await sb.rpc('academy_evaluate_retention_risk',{p_academy_id:academyId,p_contact_id:contactId,p_definition_id:definitionId,p_actor_id:userId,p_idempotency_key:key});if(error)return json(400,{error:'Risk evaluation failed',detail:error.message});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:'retention.risk_evaluated',targetType:'academy_risk_evaluation',targetId:String(data?.id??''),contactId,metadata:{risk_level:data?.risk_level,score:data?.score}});return json(200,{risk_evaluation:data});
      }

      if (actionBody === "create_intervention") {
        const contactId=normalizeText(body?.contact_id,64);const evaluationId=normalizeText(body?.risk_evaluation_id,64);if(!contactId)return json(400,{error:'contact_id is required'});await ensureContactInAccessScope(sb,academyId,access,contactId);const {data,error}=await sb.rpc('academy_create_intervention',{p_academy_id:academyId,p_contact_id:contactId,p_risk_evaluation_id:evaluationId||null,p_actor_id:userId,p_payload:{priority:normalizeText(body?.priority,20)||'high',assigned_to:normalizeText(body?.assigned_to,64)||null,next_follow_up_at:normalizeText(body?.next_follow_up_at,80)||null}});if(error)return json(400,{error:'Failed to create intervention',detail:error.message});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:'retention.intervention_opened',targetType:'academy_intervention_case',targetId:String(data?.id??''),contactId});return json(200,{intervention:data});
      }

      if (actionBody === "update_intervention") {
        const id=normalizeText(body?.id,64);const status=normalizeText(body?.status,30).toLowerCase();if(!id||!['open','contacting','plan_agreed','monitoring','resolved','closed_unsuccessful'].includes(status))return json(400,{error:'id and valid status are required'});const payload={status,priority:normalizeText(body?.priority,20)||undefined,assigned_to:normalizeText(body?.assigned_to,64)||null,next_follow_up_at:normalizeText(body?.next_follow_up_at,80)||null,outcome:normalizeText(body?.outcome,500)||null,outcome_reason:normalizeText(body?.outcome_reason,2000)||null,closed_at:['resolved','closed_unsuccessful'].includes(status)?new Date().toISOString():null,updated_at:new Date().toISOString()};const {data,error}=await sb.from('academy_intervention_cases').update(payload).eq('academy_id',academyId).eq('id',id).select('*').single();if(error)return json(400,{error:'Failed to update intervention',detail:error.message});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:'retention.intervention_updated',targetType:'academy_intervention_case',targetId:id,contactId:String(data.contact_id),metadata:{status,outcome:payload.outcome}});return json(200,{intervention:data});
      }

      if (actionBody === "record_intervention_activity") {
        const caseId=normalizeText(body?.case_id,64);const activityType=normalizeText(body?.activity_type,30).toLowerCase();const note=normalizeText(body?.note,5000);if(!caseId||!note||!['call','telegram','meeting','academic_plan','payment_plan','schedule_change','guardian_contact','note','follow_up'].includes(activityType))return json(400,{error:'case_id, valid activity_type, and note are required'});const next=normalizeText(body?.next_follow_up_at,80)||null;const {data,error}=await sb.from('academy_intervention_activities').insert({academy_id:academyId,case_id:caseId,activity_type:activityType,note,outcome:normalizeText(body?.outcome,1000)||null,next_follow_up_at:next,performed_by:userId}).select('*').single();if(error)return json(400,{error:'Failed to record intervention activity',detail:error.message});if(next)await sb.from('academy_intervention_cases').update({next_follow_up_at:next,updated_at:new Date().toISOString()}).eq('academy_id',academyId).eq('id',caseId);await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:'retention.intervention_activity_recorded',targetType:'academy_intervention_activity',targetId:String(data.id),metadata:{case_id:caseId,activity_type:activityType}});return json(200,{activity:data});
      }

      if (actionBody === "upsert_renewal_opportunity") {
        const id=normalizeText(body?.id,64);const contactId=normalizeText(body?.contact_id,64);const dueOn=normalizeText(body?.renewal_due_on,20);const status=normalizeText(body?.status,20).toLowerCase()||'identified';if(!contactId||!dueOn||!['identified','contacting','offered','accepted','renewed','declined','expired'].includes(status))return json(400,{error:'contact_id, renewal_due_on, and valid status are required'});await ensureContactInAccessScope(sb,academyId,access,contactId);const payload={academy_id:academyId,contact_id:contactId,subscription_id:normalizeText(body?.subscription_id,64)||null,classroom_id:normalizeText(body?.classroom_id,64)||null,renewal_due_on:dueOn,status,likelihood:toNumber(body?.likelihood),expected_amount:Math.max(toIntOrNull(body?.expected_amount)??0,0),currency:normalizeText(body?.currency,10).toUpperCase()||'UZS',assigned_to:normalizeText(body?.assigned_to,64)||null,next_action_at:normalizeText(body?.next_action_at,80)||null,offer_notes:normalizeText(body?.offer_notes,3000)||null,outcome_reason:normalizeText(body?.outcome_reason,2000)||null,renewed_subscription_id:normalizeText(body?.renewed_subscription_id,64)||null,created_by:userId,updated_at:new Date().toISOString()};const query=id?sb.from('academy_renewal_opportunities').update(payload).eq('academy_id',academyId).eq('id',id):sb.from('academy_renewal_opportunities').insert(payload);const {data,error}=await query.select('*').single();if(error)return json(400,{error:'Failed to save renewal opportunity',detail:error.message});await sb.from('academy_action_items').upsert({academy_id:academyId,dedupe_key:`renewal:${data.id}`,source_type:'renewal_opportunity',category:'renewal',priority:status==='accepted'?'medium':'high',title:'Learner renewal follow-up',description:`Renewal due ${dueOn}`,recommended_action:'Contact the learner or guardian, record the offer, next action, and outcome.',contact_id:contactId,assigned_to:payload.assigned_to,due_at:payload.next_action_at,sla_due_at:payload.next_action_at,status:['renewed','declined','expired'].includes(status)?'resolved':'open',created_by:userId,metadata:{renewal_opportunity_id:data.id}},{onConflict:'academy_id,dedupe_key'});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:'renewal.opportunity_saved',targetType:'academy_renewal_opportunity',targetId:String(data.id),contactId,metadata:{status}});return json(200,{renewal:data});
      }

      if (actionBody === "record_renewal_activity") {
        const opportunityId=normalizeText(body?.opportunity_id,64);const activityType=normalizeText(body?.activity_type,30).toLowerCase();const note=normalizeText(body?.note,5000);if(!opportunityId||!note||!['call','telegram','meeting','offer','follow_up','status_change','note'].includes(activityType))return json(400,{error:'opportunity_id, valid activity_type, and note are required'});const {data,error}=await sb.from('academy_renewal_activities').insert({academy_id:academyId,opportunity_id:opportunityId,activity_type:activityType,note,next_action_at:normalizeText(body?.next_action_at,80)||null,performed_by:userId}).select('*').single();if(error)return json(400,{error:'Failed to record renewal activity',detail:error.message});return json(200,{activity:data});
      }

      if (actionBody === "update_operational_action") {
        const id=normalizeText(body?.id,64);const status=normalizeText(body?.status,20).toLowerCase();if(!id||!['open','snoozed','resolved','dismissed'].includes(status))return json(400,{error:'id and valid status are required'});const note=normalizeText(body?.resolution_note,3000)||null;const {data,error}=await sb.from('academy_action_items').update({status,assigned_to:normalizeText(body?.assigned_to,64)||null,sla_due_at:normalizeText(body?.sla_due_at,80)||null,outcome:normalizeText(body?.outcome,1000)||null,resolution_note:note,resolved_by:['resolved','dismissed'].includes(status)?userId:null,resolved_at:['resolved','dismissed'].includes(status)?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('academy_id',academyId).eq('id',id).select('*').single();if(error)return json(400,{error:'Failed to update action',detail:error.message});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:'operational_action.updated',targetType:'academy_action_item',targetId:id,metadata:{status,outcome:data.outcome}});return json(200,{action_item:data});
      }

      if (actionBody === "create_import_job") {
        const importType=normalizeText(body?.import_type,20).toLowerCase();
        if(!canUseLegacyImport(access,importType))return json(403,{error:'Forbidden'});
        return json(200,await legacyImportCommand(sb,userId,academyId,'create',null,{...body,import_type:importType}));
      }

      if (actionBody === "add_import_row") {
        const jobId=normalizeText(body?.import_job_id,64);let rowNumber:number;try{rowNumber=legacyImportRowNumber(body?.row_number);}catch(error){if(error instanceof LegacyImportInputError)return json(400,{error:error.message});throw error;}let mapped=typeof body?.mapped_data==='object'&&body.mapped_data?body.mapped_data as Record<string,unknown>:{};if(!jobId||!rowNumber||rowNumber<1)return json(400,{error:'import_job_id, positive row_number, and mapped_data are required'});
        const {data:job}=await sb.from('academy_import_jobs').select('id,import_type,status,duplicate_strategy').eq('academy_id',academyId).eq('id',jobId).maybeSingle();if(!job?.id||!['draft','validating','ready'].includes(job.status))return json(400,{error:'Editable import job not found'});if(!canUseLegacyImport(access,job.import_type))return json(403,{error:'Forbidden'});try{mapped=normalizedLegacyImportMapped(String(job.import_type),mapped);}catch(error){if(error instanceof LegacyImportInputError)return json(400,{error:error.message});throw error;}
        if(job.import_type!=='staff')return json(200,await legacyImportCommand(sb,userId,academyId,'stage',jobId,{row_number:rowNumber,raw_data:body?.raw_data??{},mapped_data:mapped}));
        const errors:string[]=[];const importType=String(job.import_type);const email=normalizeEmail(mapped.email);const phone=normalizeAcademyPhone(mapped.phone);const branchId=normalizeText(mapped.branch_id??mapped.primary_branch_id,64);let duplicateKey='';let duplicate=false;
        if(importType==='staff'){const role=normalizeAcademyRole(mapped.role);if(!email)errors.push('email is required');if(!STAFF_GRANT_ROLES.includes(role))errors.push('valid role is required');duplicateKey=`email:${email}`;if(email)duplicate=!!(await sb.from('academy_staff').select('id').eq('academy_id',academyId).eq('email',email).maybeSingle()).data;}
        const validationStatus=errors.length?'invalid':duplicate?'duplicate':'valid';const duplicateError=duplicate?`Duplicate found (${job.duplicate_strategy})`:null;const validationErrors=duplicateError?[...errors,duplicateError]:errors;
        const {data,error}=await sb.from('academy_import_rows').upsert({academy_id:academyId,import_job_id:jobId,row_number:rowNumber,raw_data:typeof body?.raw_data==='object'&&body.raw_data?body.raw_data:{},mapped_data:mapped,duplicate_key:duplicateKey||null,validation_status:validationStatus,validation_errors:validationErrors},{onConflict:'academy_id,import_job_id,row_number'}).select('*').single();if(error)return json(400,{error:'Failed to add import row',detail:error.message});
        const {data:counts}=await sb.from('academy_import_rows').select('validation_status').eq('academy_id',academyId).eq('import_job_id',jobId);const blocking=(counts??[]).some(row=>row.validation_status==='invalid'||(row.validation_status==='duplicate'&&job.duplicate_strategy==='reject'));await sb.from('academy_import_jobs').update({status:blocking?'validating':'ready',total_rows:(counts??[]).length,valid_rows:(counts??[]).filter(row=>row.validation_status==='valid').length,invalid_rows:(counts??[]).filter(row=>row.validation_status==='invalid'||row.validation_status==='duplicate').length}).eq('academy_id',academyId).eq('id',jobId);return json(200,{import_row:data});
      }

      if (actionBody === "commit_import_job" || actionBody === "rollback_import_job") {
        const jobId=normalizeText(body?.import_job_id,64);if(!jobId)return json(400,{error:'import_job_id is required'});
        const {data:job}=await sb.from('academy_import_jobs').select('id,import_type,status,rollback_status,duplicate_strategy').eq('academy_id',academyId).eq('id',jobId).maybeSingle();
        if(!job?.id)return json(404,{error:'Import job not found'});
        if(!canUseLegacyImport(access,job.import_type)||(body?.action==='staff_import_command'&&job.import_type!=='staff'))return json(403,{error:'Forbidden'});
        const recovery=actionBody==='rollback_import_job';
        if(job.import_type!=='staff'){
          const saved=await legacyImportCommand(sb,userId,academyId,recovery?'recover':'commit',jobId,body??{});
          return json(Number(saved.pending_rows)>0&&!recovery?207:200,saved);
        }
        if(!['ready','committing','failed','completed'].includes(String(job.status)))return json(409,{error:'Review the staff import before continuing'});
        if(recovery){
          const reason=normalizeText(body?.reason,1000);if(!reason)return json(400,{error:'A correction reason is required'});
          const {data:effects,error}=await sb.from('academy_import_effects').select('*').eq('academy_id',academyId).eq('import_job_id',jobId).in('rollback_status',['pending','failed']).order('created_at',{ascending:false}).limit(25);
          if(error)return json(503,{error:'Import history could not load. Retry the same job.',retryable:true});
          for(const effect of effects??[])await legacyStaffCommand(sb,userId,academyId,'recover',String(effect.id),{reason});
          return json(200,await legacyStaffCommand(sb,userId,academyId,'finish',jobId,{recovery:true,reason}));
        }
        let query=sb.from('academy_import_rows').select('*').eq('academy_id',academyId).eq('import_job_id',jobId);
        query=job.duplicate_strategy==='update_safe_fields'?query.in('validation_status',['valid','duplicate']):query.eq('validation_status','valid');
        const {data:rows,error}=await query.order('row_number').limit(25);
        if(error)return json(503,{error:'Import rows could not load. Retry the same job.',retryable:true});
        for(const row of rows??[])await legacyStaffCommand(sb,userId,academyId,'commit',String(row.id),{confirm:body?.confirm_commit===true});
        const saved=await legacyStaffCommand(sb,userId,academyId,'finish',jobId);
        return json(Number(saved.failed_rows)>0||Number(saved.pending_rows)>0?207:200,saved);
      }

      if (actionBody === "upsert_academic_calendar") {
        const id=normalizeText(body?.id,64);const name=normalizeText(body?.name,180);const startsOn=normalizeText(body?.starts_on,20);const endsOn=normalizeText(body?.ends_on,20);const status=normalizeText(body?.status,30).toLowerCase()||"draft";
        if(!name||!startsOn||!endsOn||!['draft','active','closed','cancelled'].includes(status))return json(400,{error:"name, starts_on, ends_on, and valid status are required"});
        const payload={academy_id:academyId,branch_id:normalizeText(body?.branch_id,64)||null,name,starts_on:startsOn,ends_on:endsOn,status,timezone:normalizeText(body?.timezone,80)||"Asia/Tashkent",metadata:typeof body?.metadata==='object'&&body.metadata!==null?body.metadata:{},created_by:userId,updated_at:new Date().toISOString()};
        const query=id?sb.from("academy_academic_calendars").update(payload).eq("academy_id",academyId).eq("id",id):sb.from("academy_academic_calendars").insert(payload);const {data,error}=await query.select("*").single();
        if(error)return json(400,{error:"Failed to save academic calendar",detail:error.message});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:id?"academic_calendar.updated":"academic_calendar.created",targetType:"academy_academic_calendar",targetId:String(data.id)});return json(200,{calendar:data});
      }

      if (actionBody === "upsert_calendar_event") {
        const id=normalizeText(body?.id,64);const calendarId=normalizeText(body?.calendar_id,64);const name=normalizeText(body?.name,180);const eventType=normalizeText(body?.event_type,40).toLowerCase();const startsAt=normalizeText(body?.starts_at,80);const endsAt=normalizeText(body?.ends_at,80);
        if(!calendarId||!name||!startsAt||!endsAt||!['holiday','closure','exam','term_break','special_schedule','other'].includes(eventType))return json(400,{error:"calendar_id, name, dates, and valid event_type are required"});
        const payload={academy_id:academyId,calendar_id:calendarId,event_type:eventType,name,starts_at:startsAt,ends_at:endsAt,affects_billing:body?.affects_billing===true,affects_schedule:body?.affects_schedule!==false,reason:normalizeText(body?.reason,1000)||null,metadata:typeof body?.metadata==='object'&&body.metadata!==null?body.metadata:{},created_by:userId};
        const query=id?sb.from("academy_calendar_events").update(payload).eq("academy_id",academyId).eq("id",id):sb.from("academy_calendar_events").insert(payload);const {data,error}=await query.select("*").single();if(error)return json(400,{error:"Failed to save calendar event",detail:error.message});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:id?"calendar_event.updated":"calendar_event.created",targetType:"academy_calendar_event",targetId:String(data.id),metadata:{event_type:eventType}});return json(200,{calendar_event:data});
      }

      if (actionBody === "upsert_staff_availability" || actionBody === "upsert_room_availability") {
        const isStaff=actionBody==='upsert_staff_availability';const id=normalizeText(body?.id,64);const resourceId=normalizeText(isStaff?body?.staff_id:body?.room_id,64);const day=toIntOrNull(body?.day_of_week);const startsAt=normalizeText(body?.starts_at,20);const endsAt=normalizeText(body?.ends_at,20);
        if(!resourceId||day===null||day<0||day>6||!startsAt||!endsAt)return json(400,{error:"resource, day_of_week, starts_at, and ends_at are required"});
        const table=isStaff?'academy_staff_availability':'academy_room_availability';const payload:Record<string,unknown>={academy_id:academyId,[isStaff?'staff_id':'room_id']:resourceId,day_of_week:day,starts_at:startsAt,ends_at:endsAt,timezone:normalizeText(body?.timezone,80)||'Asia/Tashkent',available:body?.available!==false,effective_from:normalizeText(body?.effective_from,20)||new Date().toISOString().slice(0,10),effective_to:normalizeText(body?.effective_to,20)||null,reason:normalizeText(body?.reason,1000)||null,is_active:body?.is_active!==false,created_by:userId,updated_at:new Date().toISOString()};
        const query=id?sb.from(table).update(payload).eq('academy_id',academyId).eq('id',id):sb.from(table).insert(payload);const {data,error}=await query.select('*').single();if(error)return json(400,{error:"Failed to save availability",detail:error.message});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:isStaff?'staff_availability.saved':'room_availability.saved',targetType:table,targetId:String(data.id),metadata:{day_of_week:day,available:payload.available}});return json(200,{availability:data});
      }

      if (actionBody === "create_lesson_session") {
        const classroomId=normalizeText(body?.classroom_id,64);const branchId=normalizeText(body?.branch_id,64);const staffId=normalizeText(body?.primary_staff_id,64);const title=normalizeText(body?.title,180);const startsAt=normalizeText(body?.starts_at,80);const endsAt=normalizeText(body?.ends_at,80);const key=normalizeText(body?.idempotency_key,180);
        if(!classroomId||!branchId||!staffId||!title||!startsAt||!endsAt||!key)return json(400,{error:"branch_id, classroom_id, primary_staff_id, title, dates, and idempotency_key are required"});if(!accessCanUseClassroom(access,classroomId))return json(403,{error:"Forbidden"});
        const payload={branch_id:branchId,classroom_id:classroomId,room_id:normalizeText(body?.room_id,64)||null,primary_staff_id:staffId,calendar_id:normalizeText(body?.calendar_id,64)||null,title,session_type:normalizeText(body?.session_type,30).toLowerCase()||'regular',delivery_mode:normalizeText(body?.delivery_mode,30).toLowerCase()||'physical',starts_at:startsAt,ends_at:endsAt,timezone:normalizeText(body?.timezone,80)||'Asia/Tashkent',status:normalizeText(body?.status,30).toLowerCase()||'scheduled',source_schedule_id:normalizeText(body?.source_schedule_id,64)||null,metadata:typeof body?.metadata==='object'&&body.metadata!==null?body.metadata:{}};
        const {data,error}=await sb.rpc('academy_create_lesson_session',{p_academy_id:academyId,p_actor_id:userId,p_payload:payload,p_idempotency_key:key});if(error)return json(400,{error:"Failed to create lesson session",detail:error.message});return json(200,{session:data});
      }

      if (actionBody === "upsert_session_delivery") {
        const sessionId = normalizeText(body?.session_id, 64);
        const provider = normalizeText(body?.provider, 40).toLowerCase() || "other";
        const attendeeUrl = normalizeText(body?.attendee_url, 2000);
        if (!sessionId || !["zoom", "google_meet", "microsoft_teams", "other"].includes(provider)) {
          return json(400, { error: "session_id and a valid provider are required" });
        }
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(attendeeUrl);
        } catch {
          return json(400, { error: "attendee_url must be a valid HTTPS URL" });
        }
        if (parsedUrl.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname.toLowerCase())) {
          return json(400, { error: "attendee_url must be a public HTTPS URL" });
        }
        const { data: session, error: sessionError } = await sb.from("academy_lesson_sessions")
          .select("id, classroom_id, starts_at, ends_at")
          .eq("academy_id", academyId)
          .eq("id", sessionId)
          .maybeSingle();
        if (sessionError || !session?.id) return json(404, { error: "Session not found" });
        if (!accessCanUseClassroom(access, String(session.classroom_id))) return json(403, { error: "Forbidden" });
        const defaultOpen = new Date(Date.parse(String(session.starts_at)) - 15 * 60_000).toISOString();
        const defaultClose = new Date(Date.parse(String(session.ends_at)) + 30 * 60_000).toISOString();
        const joinOpensAt = normalizeText(body?.join_opens_at, 80) || defaultOpen;
        const joinClosesAt = normalizeText(body?.join_closes_at, 80) || defaultClose;
        const opens = Date.parse(joinOpensAt);
        const closes = Date.parse(joinClosesAt);
        if (!Number.isFinite(opens) || !Number.isFinite(closes) || closes <= opens) {
          return json(400, { error: "The join window is invalid" });
        }
        const { data, error } = await sb.from("academy_session_delivery").upsert({
          academy_id: academyId,
          session_id: sessionId,
          provider,
          attendee_url: parsedUrl.toString(),
          join_opens_at: joinOpensAt,
          join_closes_at: joinClosesAt,
          status: body?.status === "disabled" ? "disabled" : "active",
          created_by: userId,
          updated_by: userId,
        }, { onConflict: "academy_id,session_id" }).select("*").single();
        if (error) return json(400, { error: "Failed to save session delivery", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: "session.delivery_saved",
          targetType: "academy_session_delivery",
          targetId: String(data.id),
          classroomId: String(session.classroom_id),
          metadata: { session_id: sessionId, provider, status: data.status },
        });
        return json(200, { delivery: data });
      }

      if (actionBody === "transition_lesson_session") {
        const sessionId=normalizeText(body?.session_id,64);const status=normalizeText(body?.status,30).toLowerCase();const key=normalizeText(body?.idempotency_key,180);if(!sessionId||!['confirmed','in_progress','completed','cancelled','rescheduled','missed'].includes(status)||!key)return json(400,{error:"session_id, valid status, and idempotency_key are required"});
        const payload={reason:normalizeText(body?.reason,1000)||null,starts_at:normalizeText(body?.starts_at,80)||null,ends_at:normalizeText(body?.ends_at,80)||null,room_id:normalizeText(body?.room_id,64)||null,primary_staff_id:normalizeText(body?.primary_staff_id,64)||null};const {data,error}=await sb.rpc('academy_transition_lesson_session',{p_academy_id:academyId,p_session_id:sessionId,p_actor_id:userId,p_next_status:status,p_payload:payload,p_idempotency_key:key});if(error)return json(400,{error:"Failed to transition lesson session",detail:error.message});return json(200,data??{});
      }

      if (actionBody === "assign_session_substitute") {
        const sessionId=normalizeText(body?.session_id,64);const staffId=normalizeText(body?.staff_id,64);const reason=normalizeText(body?.reason,1000);const key=normalizeText(body?.idempotency_key,180);if(!sessionId||!staffId||!reason||!key)return json(400,{error:"session_id, staff_id, reason, and idempotency_key are required"});const {data,error}=await sb.rpc('academy_assign_session_substitute',{p_academy_id:academyId,p_session_id:sessionId,p_staff_id:staffId,p_actor_id:userId,p_reason:reason,p_idempotency_key:key});if(error)return json(400,{error:"Failed to assign substitute",detail:error.message});return json(200,data??{});
      }

      if (actionBody === "record_session_attendance") {
        const sessionId=normalizeText(body?.session_id,64);const contactId=normalizeText(body?.contact_id,64);const status=normalizeText(body?.status,30).toLowerCase();if(!sessionId||!contactId||!['present','absent','late','excused'].includes(status))return json(400,{error:"session_id, contact_id, and valid status are required"});const {data:session,error:sessionError}=await sb.from('academy_lesson_sessions').select('classroom_id').eq('academy_id',academyId).eq('id',sessionId).maybeSingle();if(sessionError||!session?.classroom_id)return json(404,{error:"Session not found"});if(!accessCanUseClassroom(access,String(session.classroom_id)))return json(403,{error:"Forbidden"});const {data,error}=await sb.rpc('academy_record_session_attendance',{p_academy_id:academyId,p_session_id:sessionId,p_contact_id:contactId,p_actor_id:userId,p_status:status,p_notes:normalizeText(body?.notes,1000)||null});if(error)return json(400,{error:"Failed to record session attendance",detail:error.message});return json(200,{attendance:data});
      }

      if (actionBody === "record_attendance_exception") {
        const attendanceId=normalizeText(body?.attendance_id,64);const exceptionType=normalizeText(body?.exception_type,40).toLowerCase();const effect=normalizeText(body?.effect,40).toLowerCase();const reason=normalizeText(body?.reason,1000);if(!attendanceId||!['illness','approved_absence','late_excused','technical_issue','academy_cancelled','holiday','other'].includes(exceptionType)||!['none','make_up_eligible','credit_eligible','transferred_lesson','attendance_override'].includes(effect)||!reason)return json(400,{error:"attendance_id, valid exception_type/effect, and reason are required"});const {data,error}=await sb.from('academy_attendance_exceptions').insert({academy_id:academyId,attendance_id:attendanceId,exception_type:exceptionType,effect,reason,status:normalizeText(body?.status,30).toLowerCase()||'approved',approved_by:userId,created_by:userId,metadata:typeof body?.metadata==='object'&&body.metadata!==null?body.metadata:{}}).select('*').single();if(error)return json(400,{error:"Failed to record attendance exception",detail:error.message});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:'attendance.exception_recorded',targetType:'academy_attendance_exception',targetId:String(data.id),metadata:{attendance_id:attendanceId,exception_type:exceptionType,effect,reason}});return json(200,{attendance_exception:data});
      }

      if (actionBody === "upsert_make_up_lesson") {
        const id=normalizeText(body?.id,64);const contactId=normalizeText(body?.contact_id,64);const originalSessionId=normalizeText(body?.original_session_id,64);const makeUpType=normalizeText(body?.make_up_type,40).toLowerCase()||'make_up';const reason=normalizeText(body?.reason,1000);const key=normalizeText(body?.idempotency_key,180);if(!contactId||!originalSessionId||!['make_up','transferred_lesson','holiday_extension','manual_credit'].includes(makeUpType)||!reason||!key)return json(400,{error:"contact_id, original_session_id, valid make_up_type, reason, and idempotency_key are required"});const payload={academy_id:academyId,contact_id:contactId,original_session_id:originalSessionId,replacement_session_id:normalizeText(body?.replacement_session_id,64)||null,attendance_exception_id:normalizeText(body?.attendance_exception_id,64)||null,make_up_type:makeUpType,status:normalizeText(body?.status,30).toLowerCase()||'requested',expires_on:normalizeText(body?.expires_on,20)||null,reason,approved_by:body?.approved===true?userId:null,idempotency_key:key,created_by:userId,updated_at:new Date().toISOString()};const query=id?sb.from('academy_make_up_lessons').update(payload).eq('academy_id',academyId).eq('id',id):sb.from('academy_make_up_lessons').upsert(payload,{onConflict:'academy_id,idempotency_key'});const {data,error}=await query.select('*').single();if(error)return json(400,{error:"Failed to save make-up lesson",detail:error.message});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:'make_up_lesson.saved',targetType:'academy_make_up_lesson',targetId:String(data.id),contactId,metadata:{make_up_type:makeUpType,status:payload.status,reason}});return json(200,{make_up_lesson:data});
      }

      if (actionBody === "record_session_quality_review") {
        const sessionId=normalizeText(body?.session_id,64);const reviewType=normalizeText(body?.review_type,40).toLowerCase()||'observation';const score=toIntOrNull(body?.score);if(!sessionId||!['observation','student_feedback','parent_feedback','academic_audit','incident_review'].includes(reviewType)||score!==null&&(score<0||score>100))return json(400,{error:"session_id, valid review_type, and score from 0 to 100 are required"});const {data,error}=await sb.from('academy_session_quality_reviews').insert({academy_id:academyId,session_id:sessionId,reviewer_user_id:userId,review_type:reviewType,score,strengths:normalizeText(body?.strengths,3000)||null,improvements:normalizeText(body?.improvements,3000)||null,action_required:body?.action_required===true,action_owner_user_id:normalizeText(body?.action_owner_user_id,64)||null,action_due_on:normalizeText(body?.action_due_on,20)||null,status:normalizeText(body?.status,30).toLowerCase()||'completed',metadata:typeof body?.metadata==='object'&&body.metadata!==null?body.metadata:{}}).select('*').single();if(error)return json(400,{error:"Failed to record quality review",detail:error.message});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:'session.quality_reviewed',targetType:'academy_session_quality_review',targetId:String(data.id),metadata:{session_id:sessionId,review_type:reviewType,score,action_required:body?.action_required===true}});return json(200,{quality_review:data});
      }

      if (actionBody === "create_cashbox") {
        const branchId=normalizeText(body?.branch_id,64);const name=normalizeText(body?.name,180);const currency=normalizeText(body?.currency,10).toUpperCase()||"UZS";
        if(!branchId||!name)return json(400,{error:"branch_id and name are required"});
        const {data,error}=await sb.from("academy_cashboxes").insert({academy_id:academyId,branch_id:branchId,name,currency,created_by:userId}).select("*").single();
        if(error)return json(400,{error:"Failed to create cashbox",detail:error.message});
        await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:"cashbox.created",targetType:"academy_cashbox",targetId:String(data.id),metadata:{branch_id:branchId,currency}});
        return json(200,{cashbox:data});
      }

      if (actionBody === "open_cashier_shift") {
        const cashboxId=normalizeText(body?.cashbox_id,64);const opening=toIntOrNull(body?.opening_balance);const key=normalizeText(body?.idempotency_key,180);
        if(!cashboxId||opening===null||opening<0||!key)return json(400,{error:"cashbox_id, non-negative opening_balance, and idempotency_key are required"});
        const {data,error}=await sb.rpc("academy_open_cashier_shift",{p_academy_id:academyId,p_cashbox_id:cashboxId,p_actor_id:userId,p_opening_balance:opening,p_note:normalizeText(body?.note,1000)||null,p_idempotency_key:key});
        if(error)return json(400,{error:"Failed to open cashier shift",detail:error.message});return json(200,{cashier_shift:data});
      }

      if (actionBody === "record_cash_movement") {
        const shiftId=normalizeText(body?.shift_id,64);const amount=toIntOrNull(body?.amount);const key=normalizeText(body?.idempotency_key,180);const direction=normalizeText(body?.direction,20).toLowerCase();const reason=normalizeText(body?.reason,1000);
        if(!shiftId||!['incoming','outgoing'].includes(direction)||amount===null||amount<=0||!reason||!key)return json(400,{error:"shift_id, direction, positive amount, reason, and idempotency_key are required"});
        const payload={direction,movement_type:normalizeText(body?.movement_type,40).toLowerCase()||"other",payment_method:normalizeText(body?.payment_method,40).toLowerCase()||"cash",amount,currency:normalizeText(body?.currency,10).toUpperCase()||"UZS",academy_payment_id:normalizeText(body?.academy_payment_id,64)||null,expense_id:normalizeText(body?.expense_id,64)||null,counterparty:normalizeText(body?.counterparty,180)||null,reason};
        const {data,error}=await sb.rpc("academy_record_cash_movement",{p_academy_id:academyId,p_shift_id:shiftId,p_actor_id:userId,p_payload:payload,p_idempotency_key:key});
        if(error)return json(400,{error:"Failed to record cash movement",detail:error.message});return json(200,{cash_movement:data});
      }

      if (actionBody === "close_cashier_shift") {
        const shiftId=normalizeText(body?.shift_id,64);const counted=toIntOrNull(body?.counted_closing_balance);const key=normalizeText(body?.idempotency_key,180);
        if(!shiftId||counted===null||counted<0||!key)return json(400,{error:"shift_id, non-negative counted_closing_balance, and idempotency_key are required"});
        const {data,error}=await sb.rpc("academy_close_cashier_shift",{p_academy_id:academyId,p_shift_id:shiftId,p_actor_id:userId,p_counted:counted,p_reason:normalizeText(body?.reason,1000)||null,p_idempotency_key:key});
        if(error)return json(400,{error:"Failed to close cashier shift",detail:error.message});return json(200,data??{});
      }

      if (actionBody === "upsert_expense_category") {
        const id=normalizeText(body?.id,64);const key=normalizeText(body?.category_key,80).toLowerCase().replace(/[^a-z0-9_-]+/g,"-");const name=normalizeText(body?.name,180);const kind=normalizeText(body?.kind,40).toLowerCase()||"operating";
        if(!key||!name)return json(400,{error:"category_key and name are required"});
        const payload={academy_id:academyId,category_key:key,name,kind,parent_id:normalizeText(body?.parent_id,64)||null,is_active:body?.is_active!==false,updated_at:new Date().toISOString()};
        const query=id?sb.from("academy_expense_categories").update(payload).eq("academy_id",academyId).eq("id",id):sb.from("academy_expense_categories").insert({...payload,created_by:userId});const {data,error}=await query.select("*").single();if(error)return json(400,{error:"Failed to save expense category",detail:error.message});
        await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:id?"expense_category.updated":"expense_category.created",targetType:"academy_expense_category",targetId:String(data.id)});return json(200,{expense_category:data});
      }

      if (actionBody === "record_expense") {
        const categoryId=normalizeText(body?.category_id,64);const amount=toIntOrNull(body?.amount);const description=normalizeText(body?.description,1000);const key=normalizeText(body?.idempotency_key,180);
        if(!categoryId||amount===null||amount<=0||!description||!key)return json(400,{error:"category_id, positive amount, description, and idempotency_key are required"});
        const payload={category_id:categoryId,branch_id:normalizeText(body?.branch_id,64)||null,classroom_id:normalizeText(body?.classroom_id,64)||null,expense_date:normalizeText(body?.expense_date,20)||null,amount,currency:normalizeText(body?.currency,10).toUpperCase()||"UZS",vendor:normalizeText(body?.vendor,180)||null,description,payment_method:normalizeText(body?.payment_method,40).toLowerCase()||"cash",status:"approved",receipt_ref:normalizeText(body?.receipt_ref,500)||null};
        const {data,error}=await sb.rpc("academy_record_expense",{p_academy_id:academyId,p_actor_id:userId,p_payload:payload,p_idempotency_key:key});if(error)return json(400,{error:"Failed to record expense",detail:error.message});return json(200,{expense:data});
      }

      if (actionBody === "upsert_budget") {
        const id=normalizeText(body?.id,64);const amount=toIntOrNull(body?.amount);const start=normalizeText(body?.period_start,20);const end=normalizeText(body?.period_end,20);if(amount===null||amount<0||!start||!end)return json(400,{error:"Non-negative amount and period dates are required"});
        const payload={academy_id:academyId,branch_id:normalizeText(body?.branch_id,64)||null,category_id:normalizeText(body?.category_id,64)||null,period_start:start,period_end:end,amount,currency:normalizeText(body?.currency,10).toUpperCase()||"UZS",status:normalizeText(body?.status,20).toLowerCase()||"active",notes:normalizeText(body?.notes,1000)||null,updated_at:new Date().toISOString()};const query=id?sb.from("academy_budgets").update(payload).eq("academy_id",academyId).eq("id",id):sb.from("academy_budgets").insert({...payload,created_by:userId});const {data,error}=await query.select("*").single();if(error)return json(400,{error:"Failed to save budget",detail:error.message});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:id?"budget.updated":"budget.created",targetType:"academy_budget",targetId:String(data.id),metadata:{amount,start,end}});return json(200,{budget:data});
      }

      if (actionBody === "upsert_compensation_rule") {
        const id=normalizeText(body?.id,64);const staffId=normalizeText(body?.staff_id,64);const ruleType=normalizeText(body?.rule_type,50).toLowerCase();const name=normalizeText(body?.name,180);const types=['fixed_monthly','per_lesson','per_teaching_hour','per_student','percentage_group_revenue','fixed_commission','fixed_performance_bonus','tiered_rate','manual_custom_adjustment'];if(!staffId||!types.includes(ruleType)||!name)return json(400,{error:"staff_id, valid rule_type, and name are required"});
        const payload={academy_id:academyId,staff_id:staffId,branch_id:normalizeText(body?.branch_id,64)||null,rule_type:ruleType,name,currency:normalizeText(body?.currency,10).toUpperCase()||"UZS",fixed_amount:toIntOrNull(body?.fixed_amount)??0,unit_rate:toIntOrNull(body?.unit_rate)??0,percentage_basis_points:toIntOrNull(body?.percentage_basis_points)??0,performance_bonus:toIntOrNull(body?.performance_bonus)??0,tiers:Array.isArray(body?.tiers)?body?.tiers:[],effective_from:normalizeText(body?.effective_from,20)||new Date().toISOString().slice(0,10),effective_to:normalizeText(body?.effective_to,20)||null,is_active:body?.is_active!==false,notes:normalizeText(body?.notes,1000)||null,updated_at:new Date().toISOString()};const query=id?sb.from("academy_compensation_rules").update({...payload,version:toIntOrNull(body?.version)?(toIntOrNull(body?.version)??1)+1:1}).eq("academy_id",academyId).eq("id",id):sb.from("academy_compensation_rules").insert({...payload,created_by:userId});const {data,error}=await query.select("*").single();if(error)return json(400,{error:"Failed to save compensation rule",detail:error.message});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:id?"compensation_rule.updated":"compensation_rule.created",targetType:"academy_compensation_rule",targetId:String(data.id),metadata:{rule_type:ruleType,staff_id:staffId}});return json(200,{compensation_rule:data});
      }

      if (actionBody === "record_lesson_delivery") {
        const staffId=normalizeText(body?.staff_id,64);const classroomId=normalizeText(body?.classroom_id,64);const minutes=toIntOrNull(body?.duration_minutes);const key=normalizeText(body?.idempotency_key,180);if(!staffId||!classroomId||minutes===null||minutes<=0||!key)return json(400,{error:"staff_id, classroom_id, positive duration_minutes, and idempotency_key are required"});
        const payload={academy_id:academyId,staff_id:staffId,classroom_id:classroomId,branch_id:normalizeText(body?.branch_id,64)||null,delivered_on:normalizeText(body?.delivered_on,20)||new Date().toISOString().slice(0,10),duration_minutes:minutes,delivery_status:normalizeText(body?.delivery_status,30).toLowerCase()||"delivered",student_count:toIntOrNull(body?.student_count)??0,substitute_for_staff_id:normalizeText(body?.substitute_for_staff_id,64)||null,verified_by:userId,idempotency_key:key};const {data,error}=await sb.from("academy_lesson_deliveries").upsert(payload,{onConflict:"academy_id,idempotency_key",ignoreDuplicates:true}).select("*").single();if(error)return json(400,{error:"Failed to record lesson delivery",detail:error.message});await logAcademyAuditEvent(sb,{academyId,actorUserId:userId,actorRole:access.role,action:"lesson_delivery.recorded",targetType:"academy_lesson_delivery",targetId:String(data.id),classroomId,metadata:{staff_id:staffId,minutes,status:payload.delivery_status}});return json(200,{lesson_delivery:data});
      }

      if (actionBody === "create_payroll_period") {
        const start=normalizeText(body?.period_start,20);const end=normalizeText(body?.period_end,20);const key=normalizeText(body?.idempotency_key,180);if(!start||!end||!key)return json(400,{error:"period_start, period_end, and idempotency_key are required"});const {data,error}=await sb.rpc("academy_create_payroll_period",{p_academy_id:academyId,p_actor_id:userId,p_payload:{branch_id:normalizeText(body?.branch_id,64)||null,period_start:start,period_end:end,currency:normalizeText(body?.currency,10).toUpperCase()||"UZS"},p_idempotency_key:key});if(error)return json(400,{error:"Failed to create payroll period",detail:error.message});return json(200,{payroll_period:data});
      }

      if (actionBody === "calculate_payroll") {
        const periodId=normalizeText(body?.payroll_period_id,64);const key=normalizeText(body?.idempotency_key,180);if(!periodId||!key)return json(400,{error:"payroll_period_id and idempotency_key are required"});const {data,error}=await sb.rpc("academy_calculate_payroll",{p_academy_id:academyId,p_period_id:periodId,p_actor_id:userId,p_idempotency_key:key});if(error)return json(400,{error:"Failed to calculate payroll",detail:error.message});return json(200,data??{});
      }

      if (actionBody === "post_payroll_adjustment") {
        const rowId=normalizeText(body?.payroll_row_id,64);const type=normalizeText(body?.adjustment_type,30).toLowerCase();let amount=toIntOrNull(body?.amount);const reason=normalizeText(body?.reason,1000);const key=normalizeText(body?.idempotency_key,180);if(type==='deduction'&&amount!==null&&amount>0)amount=-amount;if(!rowId||!['bonus','deduction','correction'].includes(type)||amount===null||amount===0||!reason||!key)return json(400,{error:"payroll_row_id, valid type, non-zero amount, reason, and idempotency_key are required"});const {data,error}=await sb.rpc("academy_post_payroll_adjustment",{p_academy_id:academyId,p_row_id:rowId,p_actor_id:userId,p_type:type,p_amount:amount,p_reason:reason,p_idempotency_key:key});if(error)return json(400,{error:"Failed to post payroll adjustment",detail:error.message});return json(200,{payroll_adjustment:data});
      }

      if (actionBody === "transition_payroll") {
        const periodId=normalizeText(body?.payroll_period_id,64);const next=normalizeText(body?.status,30).toLowerCase();const key=normalizeText(body?.idempotency_key,180);if(!periodId||!['reviewed','approved','paid','cancelled'].includes(next)||!key)return json(400,{error:"payroll_period_id, valid status, and idempotency_key are required"});if(next==='reviewed'&&!academyAccessHas(access,'calculatePayroll'))return json(403,{error:"Payroll calculation permission required"});if(['approved','cancelled'].includes(next)&&!academyAccessHas(access,'approvePayroll'))return json(403,{error:"Payroll approval permission required"});if(next==='paid'&&!academyAccessHas(access,'payPayroll'))return json(403,{error:"Payroll payment permission required"});const payload={reason:normalizeText(body?.reason,1000)||null,payment_method:normalizeText(body?.payment_method,50).toLowerCase()||null,payment_reference:normalizeText(body?.payment_reference,180)||null};const {data,error}=await sb.rpc("academy_transition_payroll",{p_academy_id:academyId,p_period_id:periodId,p_actor_id:userId,p_next_status:next,p_payload:payload,p_idempotency_key:key});if(error)return json(400,{error:"Failed to transition payroll",detail:error.message});return json(200,{payroll_period:data});
      }

      if (actionBody === "create_charge") {
        const subscriptionId = normalizeText(body?.subscription_id, 64);
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        const originalAmount = toIntOrNull(body?.original_amount);
        const discountAmount = toIntOrNull(body?.discount_amount);
        if (!subscriptionId || !idempotencyKey) return json(400, { error: "subscription_id and idempotency_key are required" });
        if (originalAmount !== null && originalAmount < 0) return json(400, { error: "original_amount cannot be negative" });
        if (discountAmount !== null && discountAmount < 0) return json(400, { error: "discount_amount cannot be negative" });
        const payload = {
          charge_number: normalizeText(body?.charge_number, 100) || null, cycle_key: normalizeText(body?.cycle_key, 100) || null,
          charge_type: normalizeText(body?.charge_type, 40).toLowerCase() || "tuition",
          service_period_start: normalizeText(body?.service_period_start, 20) || null,
          service_period_end: normalizeText(body?.service_period_end, 20) || null,
          issued_on: normalizeText(body?.issued_on, 20) || null, due_on: normalizeText(body?.due_on, 20) || new Date().toISOString().slice(0, 10),
          original_amount: originalAmount, discount_amount: discountAmount,
          description: normalizeText(body?.description, 1000) || null,
        };
        const { data, error } = await sb.rpc("academy_create_charge", {
          p_academy_id: academyId, p_subscription_id: subscriptionId, p_actor_id: userId, p_payload: payload, p_idempotency_key: idempotencyKey,
        });
        if (error) return json(400, { error: "Failed to create charge", detail: error.message });
        return json(200, { charge: data });
      }

      if (actionBody === "allocate_payment") {
        const paymentId = normalizeText(body?.payment_id, 64);
        const chargeId = normalizeText(body?.charge_id, 64);
        const amount = toIntOrNull(body?.amount);
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        if (!paymentId || !chargeId || amount === null || amount <= 0 || !idempotencyKey) {
          return json(400, { error: "payment_id, charge_id, a positive amount, and idempotency_key are required" });
        }
        const { data, error } = await sb.rpc("academy_allocate_payment", {
          p_academy_id: academyId, p_payment_id: paymentId, p_charge_id: chargeId, p_amount: amount,
          p_actor_id: userId, p_idempotency_key: idempotencyKey,
        });
        if (error) return json(400, { error: "Failed to allocate payment", detail: error.message });
        return json(200, { allocation: data });
      }

      if (actionBody === "post_account_adjustment") {
        const contactId = normalizeText(body?.contact_id, 64);
        const entryType = normalizeText(body?.entry_type, 40).toLowerCase();
        const amount = toIntOrNull(body?.amount);
        const reason = normalizeText(body?.reason, 1000);
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        const allowedTypes = ["account_credit", "discount", "write_off", "refund", "debit_adjustment", "credit_adjustment", "transferred_credit"];
        if (!contactId || !allowedTypes.includes(entryType) || amount === null || amount <= 0 || !reason || !idempotencyKey) {
          return json(400, { error: "contact_id, valid entry_type, positive amount, reason, and idempotency_key are required" });
        }
        if (["write_off", "refund", "transferred_credit"].includes(entryType) && !["owner", "admin"].includes(normalizeAcademyRole(access.role))) {
          return json(403, { error: "Only an academy owner or administrator may post this adjustment" });
        }
        const payload = {
          entry_type: entryType, amount, reason, currency: normalizeText(body?.currency, 10).toUpperCase() || "UZS",
          subscription_id: normalizeText(body?.subscription_id, 64) || null, charge_id: normalizeText(body?.charge_id, 64) || null,
          payment_id: normalizeText(body?.payment_id, 64) || null,
        };
        const { data, error } = await sb.rpc("academy_post_account_adjustment", {
          p_academy_id: academyId, p_contact_id: contactId, p_actor_id: userId, p_payload: payload, p_idempotency_key: idempotencyKey,
        });
        if (error) return json(400, { error: "Failed to post account adjustment", detail: error.message });
        return json(200, { ledger_entry: data });
      }

      if (actionBody === "record_payment_reconciliation") {
        const paymentId = normalizeText(body?.payment_id, 64) || null;
        const provider = normalizeText(body?.provider, 50).toLowerCase();
        const providerTransactionId = normalizeText(body?.provider_transaction_id, 180);
        const providerEventId = normalizeText(body?.provider_event_id, 180);
        const payloadHash = normalizeText(body?.payload_hash, 256);
        const status = normalizeText(body?.status, 40).toLowerCase();
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        if (!provider || !providerTransactionId || !providerEventId || !payloadHash || !status || !idempotencyKey) {
          return json(400, { error: "Provider reconciliation identifiers, status, payload_hash, and idempotency_key are required" });
        }
        const payload = { provider, provider_transaction_id: providerTransactionId, provider_event_id: providerEventId,
          event_type: normalizeText(body?.event_type, 80).toLowerCase() || "status", amount: toIntOrNull(body?.amount),
          currency: normalizeText(body?.currency, 10).toUpperCase() || null, status, payload_hash: payloadHash };
        const { data, error } = await sb.rpc("academy_record_payment_reconciliation", {
          p_academy_id: academyId, p_payment_id: paymentId, p_actor_id: userId, p_payload: payload, p_idempotency_key: idempotencyKey,
        });
        if (error) return json(400, { error: "Failed to record payment reconciliation", detail: error.message });
        return json(200, { reconciliation: data });
      }

      if (actionBody === "record_payment_promise") {
        const contactId = normalizeText(body?.contact_id, 64);
        const amount = toIntOrNull(body?.amount);
        const promisedFor = normalizeText(body?.promised_for, 20);
        const idempotencyKey = normalizeText(body?.idempotency_key, 180);
        if (!contactId || amount === null || amount <= 0 || !promisedFor || !idempotencyKey) {
          return json(400, { error: "contact_id, positive amount, promised_for, and idempotency_key are required" });
        }
        const payload = { amount, promised_for: promisedFor, currency: normalizeText(body?.currency, 10).toUpperCase() || "UZS",
          subscription_id: normalizeText(body?.subscription_id, 64) || null, branch_id: normalizeText(body?.branch_id, 64) || null,
          restriction_state: normalizeText(body?.restriction_state, 30).toLowerCase() || "none", notes: normalizeText(body?.notes, 2000) || null };
        const { data, error } = await sb.rpc("academy_record_payment_promise", {
          p_academy_id: academyId, p_contact_id: contactId, p_actor_id: userId, p_payload: payload, p_idempotency_key: idempotencyKey,
        });
        if (error) return json(400, { error: "Failed to record payment promise", detail: error.message });
        return json(200, data ?? {});
      }

      if (actionBody === "resolve_action_item") {
        const actionItemId = normalizeText(body?.id, 64);
        const nextStatus = normalizeText(body?.status, 20).toLowerCase() || "resolved";
        if (!actionItemId) return json(400, { error: "id is required" });
        if (!["resolved", "dismissed", "snoozed", "open"].includes(nextStatus)) return json(400, { error: "Invalid action item status" });

        const { data: existingAction, error: existingActionError } = await sb.from("academy_action_items")
          .select("id, source_type, contact_id, classroom_id")
          .eq("academy_id", academyId)
          .eq("id", actionItemId)
          .maybeSingle();
        if (existingActionError) return json(500, { error: "Failed to load action item", detail: existingActionError.message });
        if (!existingAction?.id) return json(404, { error: "Action item not found" });
        const sourceType = normalizeText(existingAction.source_type, 80);
        if (!academyAccessHas(access, "manageFinance") && ["renewal", "payment", "payment_due"].includes(sourceType)) {
          return json(403, { error: "Forbidden" });
        }
        if (!academyAccessHas(access, "issueCertificates") && sourceType === "certificate_ready") {
          return json(403, { error: "Forbidden" });
        }
        if (existingAction.classroom_id && !accessCanUseClassroom(access, existingAction.classroom_id)) {
          return json(403, { error: "Forbidden" });
        }
        if (existingAction.contact_id) {
          await ensureContactInAccessScope(sb, academyId, access, existingAction.contact_id);
        }
        if (!existingAction.classroom_id && !existingAction.contact_id && academyAccessClassroomIds(access) !== null) {
          return json(403, { error: "Forbidden" });
        }

        const patch: Record<string, unknown> = {
          status: nextStatus,
          resolution_note: normalizeText(body?.resolution_note, 500) || null,
        };
        if (["resolved", "dismissed"].includes(nextStatus)) {
          patch.resolved_at = new Date().toISOString();
          patch.resolved_by = userId;
        } else {
          patch.resolved_at = null;
          patch.resolved_by = null;
        }

        const { data, error } = await sb.from("academy_action_items")
          .update(patch)
          .eq("academy_id", academyId)
          .eq("id", actionItemId)
          .select("id, academy_id, dedupe_key, source_type, priority, title, description, recommended_action, contact_id, classroom_id, due_at, status, metadata, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to update action item", detail: error.message });
        if (!data?.id) return json(404, { error: "Action item not found" });
        return json(200, { action_item: data });
      }

      if (actionBody === "set_lifecycle_stage") {
        const contactId = normalizeText(body?.contact_id, 64);
        const lifecycleStage = normalizeText(body?.lifecycle_stage, 30).toLowerCase();
        if (!contactId) return json(400, { error: "contact_id is required" });
        if (!["lead", "placement", "enrolled", "learning", "attention", "renewal", "completion"].includes(lifecycleStage)) {
          return json(400, { error: "Invalid lifecycle_stage" });
        }

        const { data, error } = await sb.from("academy_contacts")
          .update({ lifecycle_stage: lifecycleStage })
          .eq("academy_id", academyId)
          .eq("id", contactId)
          .select("id, academy_id, user_id, first_name, last_name, email, phone, telegram_id, status, last_activity_at, placement_level, placement_score, lifecycle_stage, notify_enabled, metadata, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to update lifecycle stage", detail: error.message });
        if (!data?.id) return json(404, { error: "Contact not found" });
        return json(200, { contact: data });
      }

      if (actionBody === "upsert_automation_rule") {
        const ruleKey = normalizeText(body?.rule_key, 80);
        if (!ruleKey) return json(400, { error: "rule_key is required" });
        await ensureDefaultAutomationRules(sb, academyId, userId);

        const patch: Record<string, unknown> = {};
        if (typeof body?.name === "string") patch.name = normalizeText(body.name, 160);
        if (typeof body?.description === "string") patch.description = normalizeText(body.description, 1000);
        if (typeof body?.channel === "string") {
          const channel = normalizeText(body.channel, 20).toLowerCase();
          if (!["telegram", "email", "inapp"].includes(channel)) return json(400, { error: "Invalid channel" });
          patch.channel = channel;
        }
        if (typeof body?.threshold !== "undefined") patch.threshold = toIntOrNull(body.threshold);
        if (typeof body?.is_active === "boolean") patch.is_active = body.is_active;
        if (typeof body?.metadata === "object" && body.metadata !== null && !Array.isArray(body.metadata)) patch.metadata = body.metadata;

        if (Object.keys(patch).length === 0) return json(400, { error: "No rule fields to update" });

        const { data, error } = await sb.from("academy_automation_rules")
          .update(patch)
          .eq("academy_id", academyId)
          .eq("rule_key", ruleKey)
          .select("id, academy_id, rule_key, name, description, channel, threshold, is_active, metadata, last_run_at, last_run_summary, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to update automation rule", detail: error.message });
        if (!data?.id) return json(404, { error: "Automation rule not found" });
        return json(200, { automation_rule: data });
      }

      if (actionBody === "run_automation_rules") {
        const result = await runEducationAutomationRules(sb, academyId, userId);
        return json(200, result);
      }

      if (actionBody === "update_academy_landing") {
        const requestedName = normalizeText(body?.name, 160);
        const landingPatch = toJsonObject(body?.landing);
        const hasLandingPatch = isJsonObject(body?.landing);

        if (!requestedName && !hasLandingPatch) {
          return json(400, { error: "name or landing is required" });
        }

        const { data: academyRow, error: academyError } = await sb
          .from("tenants")
          .select("id, name, slug, type, metadata, created_at")
          .eq("id", academyId)
          .maybeSingle();
        if (academyError) return json(500, { error: "Failed to load academy", detail: academyError.message });
        if (!academyRow?.id) return json(404, { error: "Academy not found" });

        const currentMetadata = toJsonObject(academyRow.metadata);
        const currentLanding = toJsonObject(currentMetadata.landing);
        const nextLanding: Json = { ...currentLanding };
        let landingTouched = false;

        if (hasLandingPatch) {
          if (Object.prototype.hasOwnProperty.call(landingPatch, "headline")) {
            nextLanding.headline = normalizeText(landingPatch.headline, 200);
            landingTouched = true;
          }
          if (Object.prototype.hasOwnProperty.call(landingPatch, "subheadline")) {
            nextLanding.subheadline = normalizeText(landingPatch.subheadline, 1200);
            landingTouched = true;
          }
          if (Object.prototype.hasOwnProperty.call(landingPatch, "primary_cta_label")) {
            nextLanding.primary_cta_label = normalizeText(landingPatch.primary_cta_label, 80);
            landingTouched = true;
          }
          if (Object.prototype.hasOwnProperty.call(landingPatch, "secondary_cta_label")) {
            nextLanding.secondary_cta_label = normalizeText(landingPatch.secondary_cta_label, 80);
            landingTouched = true;
          }
        }

        const payload: Record<string, unknown> = {};
        if (requestedName) payload.name = requestedName;
        if (landingTouched) payload.metadata = { ...currentMetadata, landing: nextLanding };

        if (Object.keys(payload).length === 0) {
          return json(400, { error: "No academy landing fields to update" });
        }

        const { data: updatedAcademy, error: updateError } = await sb
          .from("tenants")
          .update(payload)
          .eq("id", academyId)
          .select("id, name, slug, type, metadata, created_at")
          .maybeSingle();
        if (updateError) {
          return json(500, { error: "Failed to update academy landing", detail: updateError.message });
        }
        if (!updatedAcademy?.id) return json(404, { error: "Academy not found" });

        const membership = memberships.find((item) => item.tenant_id === academyId);

        return json(200, {
          academy: {
            id: String(updatedAcademy.id),
            name: String(updatedAcademy.name ?? academyRow.name ?? ""),
            slug: String(updatedAcademy.slug ?? academyRow.slug ?? ""),
            type: String(updatedAcademy.type ?? academyRow.type ?? "team"),
            metadata: toJsonObject(updatedAcademy.metadata),
            created_at: String(updatedAcademy.created_at ?? academyRow.created_at ?? ""),
            role: String(membership?.role ?? "member"),
            status: String(membership?.status ?? "active"),
            access: academyAccessProfile(access),
          },
        });
      }

      if (actionBody === "update_classroom_landing") {
        const classroomId = normalizeText(body?.classroom_id, 64);
        if (!classroomId) return json(400, { error: "classroom_id is required" });

        const landingPatch = toJsonObject(body?.landing);
        const hasLandingPatch = isJsonObject(body?.landing);
        const hasDescriptionPatch = typeof body?.description !== "undefined";

        if (!hasLandingPatch && !hasDescriptionPatch) {
          return json(400, { error: "landing or description is required" });
        }

        const { data: classroomRow, error: classroomLoadError } = await sb
          .from("academy_classrooms")
          .select("id, academy_id, name, description, is_active, metadata, created_at, updated_at")
          .eq("academy_id", academyId)
          .eq("id", classroomId)
          .maybeSingle();
        if (classroomLoadError) return json(500, { error: "Failed to load classroom", detail: classroomLoadError.message });
        if (!classroomRow?.id) return json(404, { error: "Classroom not found" });

        const currentMetadata = toJsonObject(classroomRow.metadata);
        const currentLanding = toJsonObject(currentMetadata.landing);
        const nextLanding: Json = { ...currentLanding };
        let landingTouched = false;

        if (hasLandingPatch) {
          if (Object.prototype.hasOwnProperty.call(landingPatch, "headline")) {
            nextLanding.headline = normalizeText(landingPatch.headline, 200);
            landingTouched = true;
          }
          if (Object.prototype.hasOwnProperty.call(landingPatch, "subheadline")) {
            nextLanding.subheadline = normalizeText(landingPatch.subheadline, 1200);
            landingTouched = true;
          }
          if (Object.prototype.hasOwnProperty.call(landingPatch, "teacher_cta_label")) {
            nextLanding.teacher_cta_label = normalizeText(landingPatch.teacher_cta_label, 80);
            landingTouched = true;
          }
          if (Object.prototype.hasOwnProperty.call(landingPatch, "student_cta_label")) {
            nextLanding.student_cta_label = normalizeText(landingPatch.student_cta_label, 80);
            landingTouched = true;
          }
          if (Object.prototype.hasOwnProperty.call(landingPatch, "card_summary")) {
            nextLanding.card_summary = normalizeText(landingPatch.card_summary, 600);
            landingTouched = true;
          }
        }

        const payload: Record<string, unknown> = {};
        if (landingTouched) payload.metadata = { ...currentMetadata, landing: nextLanding };
        if (hasDescriptionPatch) payload.description = normalizeText(body?.description, 2000) || null;

        if (Object.keys(payload).length === 0) {
          return json(400, { error: "No classroom landing fields to update" });
        }

        const { data: classroom, error: classroomUpdateError } = await sb
          .from("academy_classrooms")
          .update(payload)
          .eq("academy_id", academyId)
          .eq("id", classroomId)
          .select("id, academy_id, name, description, is_active, metadata, created_at, updated_at")
          .maybeSingle();
        if (classroomUpdateError) {
          return json(500, { error: "Failed to update classroom landing", detail: classroomUpdateError.message });
        }
        if (!classroom?.id) return json(404, { error: "Classroom not found" });
        return json(200, { classroom });
      }

      if (actionBody === "upsert_contact") {
        const id = normalizeText(body?.id, 64);
        const firstName = normalizeText(body?.first_name, 120);
        const lastName = normalizeText(body?.last_name, 120);
        const email = normalizeEmail(body?.email) || null;
        const phone = normalizeText(body?.phone, 40) || null;
        const telegramId = normalizeText(body?.telegram_id, 120) || null;
        const status = normalizeText(body?.status, 20).toLowerCase() || "active";
        const metadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : {};

        if (!email && !phone) return json(400, { error: "email or phone is required" });
        if (!["active", "inactive", "trial", "paused"].includes(status)) return json(400, { error: "Invalid status" });

        let target;
        try {
          target = await resolveAcademyContactSaveTarget(sb as unknown as Parameters<typeof resolveAcademyContactSaveTarget>[0], academyId, id, email, phone);
        } catch (error) {
          if (error instanceof ContactSaveTargetError) return json(error.status, {error: error.message});
          throw error;
        }
        const assignedBranches = academyAccessBranchIds(access);
        const selectedBranch = normalizeText(body?.primary_branch_id ?? body?.branch_id, 64)
          || (!target && assignedBranches?.length === 1 ? assignedBranches[0] : null);
        if (!(await validateBranchScopedMutation(sb, academyId, access, {
          ...body, ...(target ? {contact_id: target.id} : {}),
          ...(selectedBranch ? {primary_branch_id: selectedBranch} : {}),
        }, actionBody))) return json(403, {error: "Forbidden"});
        if (target && assignedBranches === null) await ensureContactInAccessScope(sb, academyId, access, target.id);

        let linkedUserId: string | null = null;
        if (email && !target?.user_id) {
          const {data: userRow, error: userError} = await sb.from("users").select("id").eq("email", email).maybeSingle();
          if (userError) return json(503, {error: "Contact verification is temporarily unavailable. Try again."});
          linkedUserId = userRow?.id ? String(userRow.id) : null;
        }
        const payload = academyContactSavePayload({
          academy_id: academyId, first_name: firstName, last_name: lastName,
          email, phone, telegram_id: telegramId, status, metadata,
        }, target, userId, linkedUserId, selectedBranch);
        const columns = "id, academy_id, user_id, first_name, last_name, email, phone, telegram_id, status, primary_branch_id, metadata, created_at, updated_at";
        if (target) {
          let update = sb.from("academy_contacts").update(payload).eq("academy_id", academyId).eq("id", target.id);
          // Do not overwrite a newly bound login or a record moved outside the
          // reviewed scope while this request was resolving its identity.
          update = target.user_id ? update.eq("user_id", target.user_id) : update.is("user_id", null);
          update = target.primary_branch_id ? update.eq("primary_branch_id", target.primary_branch_id) : update.is("primary_branch_id", null);
          const {data, error} = await update.select(columns).maybeSingle();
          if (error) return json(error.code === "23505" ? 409 : 500, {error: "Failed to update contact"});
          if (!data) return json(409, {error: "This contact changed while you were saving. Refresh it before trying again."});
          return json(200, {contact: data, ...(id ? {} : {upserted: true})});
        }
        const {data, error} = await sb.from("academy_contacts").insert(payload).select(columns).maybeSingle();
        if (error) return json(error.code === "23505" ? 409 : 500, {error: "Failed to create contact"});
        return json(200, {contact: data, created: true});
      }

      if (actionBody === "create_classroom") {
        const name = normalizeText(body?.name, 180);
        if (!name) return json(400, { error: "name is required" });

        const payload = {
          academy_id: academyId,
          name,
          description: normalizeText(body?.description, 2000) || null,
          is_active: body?.is_active !== false,
          metadata: body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata
            : {},
          created_by: userId,
        };

        const { data, error } = await sb
          .from("academy_classrooms")
          .insert(payload)
          .select("id, academy_id, name, description, is_active, metadata, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to create classroom", detail: error.message });
        return json(200, { classroom: data });
      }

      if (actionBody === "upsert_classroom_membership") {
        const classroomId = normalizeText(body?.classroom_id, 64);
        const contactId = normalizeText(body?.contact_id, 64);
        const role = normalizeText(body?.role, 20).toLowerCase() || "student";
        const membershipStatus = normalizeText(body?.membership_status ?? body?.status, 30).toLowerCase() || "active";
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!contactId) return json(400, { error: "contact_id is required" });
        if (!["student", "assistant"].includes(role)) return json(400, { error: "role must be student or assistant" });
        if (!["invited", "active", "paused", "completed", "withdrawn", "expired", "transferred"].includes(membershipStatus)) {
          return json(400, { error: "Invalid enrollment status" });
        }
        if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

        const { data: classroomRow } = await sb
          .from("academy_classrooms")
          .select("id")
          .eq("academy_id", academyId)
          .eq("id", classroomId)
          .maybeSingle();
        if (!classroomRow?.id) return json(404, { error: "Classroom not found" });

        const { data: contactRow } = await sb
          .from("academy_contacts")
          .select("id")
          .eq("academy_id", academyId)
          .eq("id", contactId)
          .maybeSingle();
        if (!contactRow?.id) return json(404, { error: "Contact not found" });

        const metadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? { ...body.metadata, source: "manual" }
          : { source: "manual" };

        const payload = {
          academy_id: academyId,
          classroom_id: classroomId,
          contact_id: contactId,
          role,
          status: membershipStatus,
          started_at: membershipStatus === "active" ? new Date().toISOString() : null,
          metadata,
        };

        const { data, error } = await sb
          .from("academy_classroom_memberships")
          .upsert(payload, { onConflict: "classroom_id,contact_id" })
          .select("id, academy_id, classroom_id, contact_id, role, status, joined_at, started_at, completed_at, paused_at, withdrawn_at, expires_at, metadata")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to save classroom membership", detail: error.message });
        return json(200, { classroom_membership: data });
      }

      if (actionBody === "remove_classroom_membership") {
        const membershipId = normalizeText(body?.id, 64);
        const classroomId = normalizeText(body?.classroom_id, 64);
        const contactId = normalizeText(body?.contact_id, 64);

        if (membershipId) {
          const { data: existingMembership, error: existingMembershipError } = await sb
            .from("academy_classroom_memberships")
            .select("id, classroom_id, contact_id")
            .eq("academy_id", academyId)
            .eq("id", membershipId)
            .maybeSingle();
          if (existingMembershipError) return json(500, { error: "Failed to load classroom membership", detail: existingMembershipError.message });
          if (!existingMembership?.id) return json(404, { error: "Classroom membership not found" });
          if (!accessCanUseClassroom(access, existingMembership.classroom_id)) return json(403, { error: "Forbidden" });
        } else {
          if (!classroomId || !contactId) return json(400, { error: "id or both classroom_id and contact_id are required" });
          if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
        }

        let query = sb
          .from("academy_classroom_memberships")
          .delete()
          .eq("academy_id", academyId);

        if (membershipId) {
          query = query.eq("id", membershipId);
        } else {
          query = query.eq("classroom_id", classroomId).eq("contact_id", contactId);
        }

        const { data, error } = await query.select("id, classroom_id, contact_id");
        if (error) return json(500, { error: "Failed to remove classroom membership", detail: error.message });
        return json(200, { removed: data ?? [] });
      }

      if (actionBody === "send_message") {
        const conversationIdRaw = normalizeText(body?.conversation_id, 64) || null;
        const contactIdRaw = normalizeText(body?.contact_id, 64) || null;
        const content = normalizeText(body?.content ?? body?.description, 6000);
        if (!content) return json(400, { error: "content is required" });

        let conversationId = conversationIdRaw;
        let contactId = contactIdRaw;

        if (conversationId) {
          const { data: conversationRow, error: conversationError } = await sb
            .from("academy_conversations")
            .select("id, contact_id")
            .eq("academy_id", academyId)
            .eq("id", conversationId)
            .maybeSingle();
          if (conversationError) return json(500, { error: "Failed to load conversation", detail: conversationError.message });
          if (!conversationRow?.id) return json(404, { error: "Conversation not found" });
          conversationId = String(conversationRow.id);
          contactId = String(conversationRow.contact_id);
        }

        if (!conversationId) {
          if (!contactId) return json(400, { error: "conversation_id or contact_id is required" });
          const { data: contactRow, error: contactError } = await sb
            .from("academy_contacts")
            .select("id")
            .eq("academy_id", academyId)
            .eq("id", contactId)
            .maybeSingle();
          if (contactError) return json(500, { error: "Failed to load contact", detail: contactError.message });
          if (!contactRow?.id) return json(404, { error: "Contact not found" });
          conversationId = await ensureConversationId(sb, academyId, contactId);
        }
        if (contactId) await ensureContactInAccessScope(sb, academyId, access, contactId);

        const metadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : {};

        const { data, error } = await sb
          .from("academy_messages")
          .insert({
            academy_id: academyId,
            conversation_id: conversationId,
            contact_id: contactId ?? null,
            sender_type: "teacher",
            message_type: "message",
            content,
            metadata,
          })
          .select("id, academy_id, conversation_id, contact_id, sender_type, message_type, content, metadata, created_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to send message", detail: error.message });

        await sb.from("academy_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

        return json(200, { message: data, conversation_id: conversationId });
      }

      if (actionBody === "send_announcement") {
        const title = normalizeText(body?.title ?? body?.name, 180);
        const announcementBody = normalizeText(body?.content ?? body?.description, 6000);
        const classroomId = normalizeText(body?.classroom_id, 64) || null;
        if (!title) return json(400, { error: "title is required" });
        if (!announcementBody) return json(400, { error: "content is required" });
        if (!classroomId && !academyAccessHas(access, "sendGlobalAnnouncements")) {
          return json(403, { error: "Forbidden" });
        }
        if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

        if (classroomId) {
          const { data: classroomRow, error: classroomError } = await sb
            .from("academy_classrooms")
            .select("id")
            .eq("academy_id", academyId)
            .eq("id", classroomId)
            .maybeSingle();
          if (classroomError) return json(500, { error: "Failed to load classroom", detail: classroomError.message });
          if (!classroomRow?.id) return json(404, { error: "Classroom not found" });
        }

        const announcementMetadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : {};

        const { data: announcementRow, error: announcementError } = await sb
          .from("academy_announcements")
          .insert({
            academy_id: academyId,
            classroom_id: classroomId,
            title,
            body: announcementBody,
            metadata: announcementMetadata,
            created_by: userId,
          })
          .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
          .maybeSingle();
        if (announcementError) {
          return json(500, { error: "Failed to create announcement", detail: announcementError.message });
        }

        let targetContactIds: string[] = [];
        if (classroomId) {
          const { data: memberRows, error: memberError } = await sb
            .from("academy_classroom_memberships")
            .select("contact_id")
            .eq("academy_id", academyId)
            .eq("classroom_id", classroomId)
            .limit(5000);
          if (memberError) return json(500, { error: "Failed to load classroom members", detail: memberError.message });
          targetContactIds = Array.from(
            new Set(
              ((memberRows ?? []) as Array<{ contact_id: string | null }>)
                .map((row) => (row.contact_id ? String(row.contact_id) : ""))
                .filter((id) => id.length > 0),
            ),
          );
        } else {
          const { data: contactRows, error: contactError } = await sb
            .from("academy_contacts")
            .select("id")
            .eq("academy_id", academyId)
            .neq("status", "inactive")
            .limit(5000);
          if (contactError) return json(500, { error: "Failed to load contacts", detail: contactError.message });
          targetContactIds = Array.from(
            new Set(
              ((contactRows ?? []) as Array<{ id: string | null }>)
                .map((row) => (row.id ? String(row.id) : ""))
                .filter((id) => id.length > 0),
            ),
          );
        }

        if (targetContactIds.length === 0) {
          return json(200, { announcement: announcementRow, recipient_count: 0, messages_created: 0 });
        }

        const upsertConversations = targetContactIds.map((contactId) => ({
          academy_id: academyId,
          contact_id: contactId,
        }));
        const { error: conversationUpsertError } = await sb
          .from("academy_conversations")
          .upsert(upsertConversations, { onConflict: "academy_id,contact_id" });
        if (conversationUpsertError) {
          return json(500, { error: "Failed to prepare announcement conversations", detail: conversationUpsertError.message });
        }

        const { data: conversationRows, error: conversationLoadError } = await sb
          .from("academy_conversations")
          .select("id, contact_id")
          .eq("academy_id", academyId)
          .in("contact_id", targetContactIds);
        if (conversationLoadError) {
          return json(500, { error: "Failed to load announcement conversations", detail: conversationLoadError.message });
        }

        const conversationByContact = new Map<string, string>();
        for (const row of (conversationRows ?? []) as Array<{ id: string; contact_id: string }>) {
          conversationByContact.set(String(row.contact_id), String(row.id));
        }

        const messageMetadata = {
          ...announcementMetadata,
          announcement_id: announcementRow?.id ?? null,
          title,
          classroom_id: classroomId,
        };

        const messageRows = targetContactIds
          .map((contactId) => {
            const conversationId = conversationByContact.get(contactId);
            if (!conversationId) return null;
            return {
              academy_id: academyId,
              conversation_id: conversationId,
              contact_id: contactId,
              sender_type: "teacher",
              message_type: "announcement",
              content: announcementBody,
              metadata: messageMetadata,
            };
          })
          .filter((row): row is NonNullable<typeof row> => !!row);

        if (messageRows.length > 0) {
          const { error: messageInsertError } = await sb.from("academy_messages").insert(messageRows);
          if (messageInsertError) {
            return json(500, { error: "Failed to deliver announcement", detail: messageInsertError.message });
          }

          await sb
            .from("academy_conversations")
            .update({ updated_at: new Date().toISOString() })
            .in("id", messageRows.map((row) => String(row.conversation_id)));
        }

        return json(200, {
          announcement: announcementRow,
          recipient_count: targetContactIds.length,
          messages_created: messageRows.length,
        });
      }

      if (actionBody === "create_alert") {
        const contactId = normalizeText(body?.contact_id, 64) || null;
        const alertType = normalizeText(body?.type, 120);
        const severity = normalizeText(body?.severity, 20).toLowerCase() || "medium";
        const alertMessage = normalizeText(body?.content ?? body?.description, 2000);

        if (!alertType) return json(400, { error: "type is required" });
        if (!alertMessage) return json(400, { error: "content is required" });
        if (!["low", "medium", "high", "critical"].includes(severity)) {
          return json(400, { error: "severity must be low, medium, high, or critical" });
        }
        if (contactId) await ensureContactInAccessScope(sb, academyId, access, contactId);

        if (contactId) {
          const { data: contactRow, error: contactError } = await sb
            .from("academy_contacts")
            .select("id")
            .eq("academy_id", academyId)
            .eq("id", contactId)
            .maybeSingle();
          if (contactError) return json(500, { error: "Failed to load contact", detail: contactError.message });
          if (!contactRow?.id) return json(404, { error: "Contact not found" });
        }

        const alertMetadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : {};
        const alertClassroomId = normalizeText((alertMetadata as Record<string, unknown>).classroom_id, 64);
        if (alertClassroomId) {
          if (!accessCanUseClassroom(access, alertClassroomId)) return json(403, { error: "Forbidden" });
          const { data: classroomRow, error: classroomError } = await sb
            .from("academy_classrooms")
            .select("id")
            .eq("academy_id", academyId)
            .eq("id", alertClassroomId)
            .maybeSingle();
          if (classroomError) return json(500, { error: "Failed to load classroom", detail: classroomError.message });
          if (!classroomRow?.id) return json(404, { error: "Classroom not found" });
        }
        if (!contactId && !alertClassroomId && !academyAccessHas(access, "sendGlobalAnnouncements")) {
          return json(403, { error: "Forbidden" });
        }

        const { data: alertRow, error: alertError } = await sb
          .from("academy_alerts")
          .insert({
            academy_id: academyId,
            contact_id: contactId,
            type: alertType,
            severity,
            message: alertMessage,
            metadata: alertMetadata,
          })
          .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
          .maybeSingle();
        if (alertError) return json(500, { error: "Failed to create alert", detail: alertError.message });

        if (alertRow?.id) {
          if (contactId) {
            const conversationId = await ensureConversationId(sb, academyId, contactId);
            await sb.from("academy_messages").insert({
              academy_id: academyId,
              conversation_id: conversationId,
              contact_id: contactId,
              sender_type: "system",
              message_type: "alert",
              content: alertMessage,
              metadata: {
                alert_id: alertRow.id,
                type: alertType,
                severity,
              },
            });
            await sb.from("academy_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
          } else {
            const contactRowsResult = alertClassroomId
              ? await sb
                .from("academy_classroom_memberships")
                .select("contact_id")
                .eq("academy_id", academyId)
                .eq("classroom_id", alertClassroomId)
                .in("role", ["student", "observer"])
                .limit(5000)
              : await sb
                .from("academy_contacts")
                .select("id")
                .eq("academy_id", academyId)
                .neq("status", "inactive")
                .limit(5000);
            const { data: contactRows, error: contactRowsError } = contactRowsResult;
            if (contactRowsError) {
              return json(500, { error: "Failed to load alert contacts", detail: contactRowsError.message });
            }

            const contactIds = Array.from(
              new Set(
                ((contactRows ?? []) as Array<{ id?: string | null; contact_id?: string | null }>)
                  .map((row) => String(row.contact_id ?? row.id ?? ""))
                  .filter((id) => id.length > 0),
              ),
            );

            if (contactIds.length > 0) {
              const upsertConversations = contactIds.map((targetContactId) => ({
                academy_id: academyId,
                contact_id: targetContactId,
              }));
              const { error: conversationUpsertError } = await sb
                .from("academy_conversations")
                .upsert(upsertConversations, { onConflict: "academy_id,contact_id" });
              if (conversationUpsertError) {
                return json(500, { error: "Failed to prepare alert conversations", detail: conversationUpsertError.message });
              }

              const { data: conversationRows, error: conversationLoadError } = await sb
                .from("academy_conversations")
                .select("id, contact_id")
                .eq("academy_id", academyId)
                .in("contact_id", contactIds);
              if (conversationLoadError) {
                return json(500, { error: "Failed to load alert conversations", detail: conversationLoadError.message });
              }

              const conversationByContact = new Map<string, string>();
              for (const row of (conversationRows ?? []) as Array<{ id: string; contact_id: string }>) {
                conversationByContact.set(String(row.contact_id), String(row.id));
              }

              const messageRows = contactIds
                .map((targetContactId) => {
                  const conversationId = conversationByContact.get(targetContactId);
                  if (!conversationId) return null;
                  return {
                    academy_id: academyId,
                    conversation_id: conversationId,
                    contact_id: targetContactId,
                    sender_type: "system",
                    message_type: "alert",
                    content: alertMessage,
                    metadata: {
                      alert_id: alertRow.id,
                      type: alertType,
                      severity,
                      scope: alertClassroomId ? "classroom" : "academy",
                      classroom_id: alertClassroomId || null,
                    },
                  };
                })
                .filter((row): row is NonNullable<typeof row> => !!row);

              if (messageRows.length > 0) {
                const { error: messageInsertError } = await sb.from("academy_messages").insert(messageRows);
                if (messageInsertError) {
                  return json(500, { error: "Failed to fan out alert message", detail: messageInsertError.message });
                }
                await sb
                  .from("academy_conversations")
                  .update({ updated_at: new Date().toISOString() })
                  .in("id", messageRows.map((row) => String(row.conversation_id)));
              }
            }
          }
        }

        return json(200, { alert: alertRow });
      }

      if (actionBody === "resolve_alert") {
        const alertId = normalizeText(body?.id, 64);
        if (!alertId) return json(400, { error: "id is required" });

        const { data: existingAlert, error: loadAlertError } = await sb
          .from("academy_alerts")
          .select("id, contact_id, metadata")
          .eq("academy_id", academyId)
          .eq("id", alertId)
          .maybeSingle();
        if (loadAlertError) return json(500, { error: "Failed to load alert", detail: loadAlertError.message });
        if (!existingAlert?.id) return json(404, { error: "Alert not found" });
        if (existingAlert.contact_id) await ensureContactInAccessScope(sb, academyId, access, existingAlert.contact_id);
        const existingAlertClassroomId = normalizeText(toJsonObject(existingAlert.metadata).classroom_id, 64);
        if (existingAlertClassroomId && !accessCanUseClassroom(access, existingAlertClassroomId)) {
          return json(403, { error: "Forbidden" });
        }
        if (!existingAlert.contact_id && !existingAlertClassroomId && academyAccessClassroomIds(access) !== null) {
          return json(403, { error: "Forbidden" });
        }

        const { data: alertRow, error: alertError } = await sb
          .from("academy_alerts")
          .update({
            resolved: true,
            resolved_at: new Date().toISOString(),
          })
          .eq("academy_id", academyId)
          .eq("id", alertId)
          .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
          .maybeSingle();
        if (alertError) return json(500, { error: "Failed to resolve alert", detail: alertError.message });
        if (!alertRow?.id) return json(404, { error: "Alert not found" });

        const contactId = alertRow.contact_id ? String(alertRow.contact_id) : null;
        if (contactId) {
          const conversationId = await ensureConversationId(sb, academyId, contactId);
          await sb.from("academy_messages").insert({
            academy_id: academyId,
            conversation_id: conversationId,
            contact_id: contactId,
            sender_type: "system",
            message_type: "event",
            content: `Alert resolved: ${String(alertRow.message ?? "")}`,
            metadata: { alert_id: alertRow.id, resolved: true },
          });
          await sb.from("academy_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
        }

        return json(200, { alert: alertRow });
      }

      if (actionBody === "create_offer") {
        const name = normalizeText(body?.name, 180);
        const type = normalizeText(body?.type, 30).toLowerCase();
        const priceAmount = toIntOrNull(body?.price_amount);
        const currency = normalizeText(body?.currency, 10).toUpperCase() || "UZS";
        const durationDays = positiveIntOrNull(body?.duration_days);

        if (!name) return json(400, { error: "name is required" });
        if (!["subscription", "cohort", "product", "credits"].includes(type)) {
          return json(400, { error: "type must be one of subscription, cohort, product, credits" });
        }
        if (priceAmount === null || priceAmount < 0) return json(400, { error: "price_amount is required" });

        const offerClassroomId = normalizeText(body?.classroom_id, 64) || null;
        if (offerClassroomId) {
          const { data: classroomRow } = await sb
            .from("academy_classrooms").select("id").eq("academy_id", academyId).eq("id", offerClassroomId).maybeSingle();
          if (!classroomRow?.id) return json(404, { error: "Classroom not found" });
        }

        const payload = {
          academy_id: academyId,
          name,
          type,
          price_amount: priceAmount,
          currency,
          duration_days: durationDays,
          classroom_id: offerClassroomId,
          description: normalizeText(body?.description, 2000) || null,
          is_active: body?.is_active !== false,
          metadata: body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata
            : {},
          created_by: userId,
        };

        const { data, error } = await sb
          .from("academy_offers")
          .insert(payload)
          .select("id, academy_id, name, type, price_amount, currency, duration_days, classroom_id, description, is_active, metadata, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to create offer", detail: error.message });

        // For a classroom-linked tuition offer, auto-create the access grant so a
        // completed payment unlocks the classroom via apply_academy_payment.
        if (data?.id && offerClassroomId) {
          await sb.from("academy_offer_grants").insert({
            academy_id: academyId,
            offer_id: data.id,
            grant_type: "classroom_access",
            resource_type: "classroom",
            resource_id: offerClassroomId,
            quantity: 1,
            duration_days: durationDays,
            metadata: { auto_created: true },
          });
        }
        return json(200, { offer: data });
      }

      if (actionBody === "upsert_offer_grant") {
        const id = normalizeText(body?.id, 64);
        const offerId = normalizeText(body?.offer_id, 64);
        const grantType = normalizeText(body?.grant_type, 60);
        if (!offerId) return json(400, { error: "offer_id is required" });
        if (!grantType) return json(400, { error: "grant_type is required" });

        const { data: offerRow } = await sb
          .from("academy_offers")
          .select("id")
          .eq("academy_id", academyId)
          .eq("id", offerId)
          .maybeSingle();
        if (!offerRow?.id) return json(404, { error: "Offer not found" });

        const resourceType = normalizeText(body?.resource_type, 60) || null;
        const resourceId = normalizeText(body?.resource_id, 64) || null;
        if (resourceType?.toLowerCase() === "classroom") {
          if (!resourceId) return json(400, { error: "resource_id is required for classroom grants" });
          const validClassroomIds = await loadValidAcademyClassroomIds(sb, academyId, [resourceId]);
          if (!validClassroomIds.has(resourceId)) return json(404, { error: "Classroom not found" });
        }

        const payload = {
          academy_id: academyId,
          offer_id: offerId,
          grant_type: grantType,
          resource_type: resourceType,
          resource_id: resourceId,
          capability_key: normalizeText(body?.capability_key, 100) || null,
          quantity: positiveIntOrNull(body?.quantity),
          duration_days: positiveIntOrNull(body?.duration_days),
          metadata: body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata
            : {},
        };

        if (id) {
          const { data, error } = await sb
            .from("academy_offer_grants")
            .update(payload)
            .eq("academy_id", academyId)
            .eq("id", id)
            .select("id, academy_id, offer_id, grant_type, resource_type, resource_id, capability_key, quantity, duration_days, metadata, created_at")
            .maybeSingle();
          if (error) return json(500, { error: "Failed to update offer grant", detail: error.message });
          return json(200, { offer_grant: data });
        }

        const { data, error } = await sb
          .from("academy_offer_grants")
          .insert(payload)
          .select("id, academy_id, offer_id, grant_type, resource_type, resource_id, capability_key, quantity, duration_days, metadata, created_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to create offer grant", detail: error.message });
        return json(200, { offer_grant: data });
      }

      if (actionBody === "create_payment") {
        return json(410, {
          error: "Manual Academy payment creation has been retired. Use Click checkout for new academy payments.",
          error_code: "academy_manual_payment_retired",
        });
      }

      if (actionBody === "mark_payment_paid") {
        const paymentId = normalizeText(body?.id, 64);
        if (!paymentId) return json(400, { error: "payment id is required" });

        const { data: paymentRow, error: paymentLoadErr } = await sb
          .from("academy_payments")
          .select("id, academy_id, contact_id, provider, status")
          .eq("id", paymentId)
          .eq("academy_id", academyId)
          .maybeSingle();
        if (paymentLoadErr) return json(500, { error: "Failed to load payment", detail: paymentLoadErr.message });
        if (!paymentRow?.id) return json(404, { error: "Payment not found" });
        if (normalizeText(paymentRow.provider, 60).toLowerCase() === "click") {
          return json(400, { error: "Click payments settle through Click checkout and webhook confirmation." });
        }
        await ensureContactInAccessScope(sb, academyId, access, paymentRow.contact_id);

        const { data: applyResult, error: applyErr } = await sb.rpc("apply_academy_payment", {
          p_payment_id: paymentId,
          p_actor_id: userId,
        });

        if (applyErr) return json(500, { error: "Failed to apply payment", detail: applyErr.message });

        const { data: updatedPayment } = await sb
          .from("academy_payments")
          .select("id, academy_id, contact_id, offer_id, provider, provider_transaction_id, amount, currency, status, metadata, created_by, created_at, updated_at")
          .eq("id", paymentId)
          .maybeSingle();

        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: "payment.manual_settlement_applied",
          targetType: "academy_payment",
          targetId: paymentId,
          contactId: String(paymentRow.contact_id ?? ""),
          status: "ok",
          metadata: {
            provider: paymentRow.provider,
            previous_status: paymentRow.status,
            apply_result: applyResult ?? null,
          },
        });

        return json(200, { payment: updatedPayment ?? null, result: applyResult ?? null });
      }

      if (actionBody === "grant_contact") {
        const contactId = normalizeText(body?.contact_id, 64);
        const grantType = normalizeText(body?.grant_type, 80);
        const resourceType = normalizeText(body?.resource_type, 80) || null;
        const resourceId = normalizeText(body?.resource_id, 64) || null;
        const capabilityKey = normalizeText(body?.capability_key, 100) || null;
        const quantity = toIntOrNull(body?.quantity);

        if (!contactId) return json(400, { error: "contact_id is required" });
        if (!grantType) return json(400, { error: "grant_type is required" });
        if (resourceType?.toLowerCase() === "classroom") {
          if (!resourceId) return json(400, { error: "resource_id is required for classroom entitlements" });
          const validClassroomIds = await loadValidAcademyClassroomIds(sb, academyId, [resourceId]);
          if (!validClassroomIds.has(resourceId)) return json(404, { error: "Classroom not found" });
        }

        const { data: contactRow } = await sb
          .from("academy_contacts")
          .select("id, user_id")
          .eq("academy_id", academyId)
          .eq("id", contactId)
          .maybeSingle();

        if (!contactRow?.id) return json(404, { error: "Contact not found" });
        await ensureContactInAccessScope(sb, academyId, access, contactId);

        const durationDays = positiveIntOrNull(body?.duration_days);
        const startsAt = new Date();
        const expiresAt = durationDays ? new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString() : null;

        const payload = {
          academy_id: academyId,
          contact_id: contactId,
          user_id: contactRow.user_id ?? null,
          grant_type: grantType,
          resource_type: resourceType,
          resource_id: resourceId,
          capability_key: capabilityKey,
          quantity,
          remaining: quantity,
          starts_at: startsAt.toISOString(),
          expires_at: expiresAt,
          status: "active",
          source: "manual",
          metadata: body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata
            : {},
        };

        const { data, error } = await sb
          .from("academy_entitlements")
          .insert(payload)
          .select("id, academy_id, contact_id, user_id, grant_type, resource_type, resource_id, capability_key, quantity, remaining, starts_at, expires_at, status, source, metadata, created_at, updated_at")
          .maybeSingle();

        if (error) return json(500, { error: "Failed to create entitlement", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: "entitlement.manual_grant_created",
          targetType: "academy_entitlement",
          targetId: data?.id ? String(data.id) : null,
          contactId,
          classroomId: resourceType?.toLowerCase() === "classroom" ? resourceId : null,
          status: "ok",
          metadata: { grant_type: grantType, resource_type: resourceType, resource_id: resourceId, quantity },
        });
        return json(200, { entitlement: data });
      }

      if (actionBody === "generate_classroom_lesson_plan") {
        let classroomId = normalizeText(body?.classroom_id, 64);
        const scopedIds = academyAccessClassroomIds(access);
        if (!classroomId && scopedIds !== null && scopedIds.length === 1) classroomId = scopedIds[0];
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

        const centerTenantId = await loadAcademyParentCenterId(sb, academyId, access);
        const context = await loadAcademyClassroomLessonContext(sb, academyId, classroomId, centerTenantId);
        if (!context) return json(404, { error: "Classroom not found" });

        const generated = await generateAcademyClassroomLessonPlan(context);
        return json(200, {
          classroom_id: context.classroom.id,
          classroom_name: context.classroom.name,
          evidence: {
            classroom: context.classroom,
            lms: context.lms,
            focus_areas: context.focus_areas,
            center_voucher_heatmap: context.center_voucher_heatmap,
          },
          heatmap: context.center_voucher_heatmap,
          ...generated,
        });
      }

      // ── LMS Write Actions ─────────────────────────────────────────────────

      if (actionBody === "upsert_course") {
        const courseId = normalizeText(body?.course_id ?? body?.id, 64);
        const classroomId = normalizeText(body?.classroom_id, 64);
        const title = normalizeText(body?.title ?? body?.name, 220);
        const scopedClassroomIds = academyAccessClassroomIds(access);
        if (!courseId && !title) return json(400, { error: "title is required" });
        if (!courseId && scopedClassroomIds !== null && !classroomId) return json(400, { error: "classroom_id is required" });
        if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
        if (classroomId) {
          const { data: classroom } = await sb.from("academy_classrooms").select("id")
            .eq("academy_id", academyId).eq("id", classroomId).maybeSingle();
          if (!classroom?.id) return json(404, { error: "Classroom not found" });
        }

        const requestedStatus = normalizeText(body?.status, 20).toLowerCase();
        if (requestedStatus && !["draft", "published", "archived"].includes(requestedStatus)) {
          return json(400, { error: "Invalid course status" });
        }
        if (requestedStatus === "published") {
          return json(409, { error: "Use publish_course after the course has at least one module and lesson" });
        }
        const coursePayload: Record<string, unknown> = {};
        if (typeof body?.code !== "undefined") coursePayload.code = normalizeText(body.code, 80) || null;
        if (title) coursePayload.title = title;
        if (typeof body?.description !== "undefined") coursePayload.description = normalizeText(body.description, 6000) || null;
        if (typeof body?.level !== "undefined") coursePayload.level = normalizeText(body.level, 80) || null;
        if (typeof body?.estimated_minutes !== "undefined") coursePayload.estimated_minutes = Math.max(0, toIntOrNull(body.estimated_minutes) ?? 0);
        if (requestedStatus) coursePayload.status = requestedStatus;
        if (isJsonObject(body?.metadata)) coursePayload.metadata = body.metadata;

        let course: Record<string, unknown> | null = null;
        if (courseId) {
          const existing = await loadCourseForAccess(sb, academyId, access, courseId, classroomId || null);
          if (!existing) return json(404, { error: "Course not found" });
          if (Object.keys(coursePayload).length === 0) return json(400, { error: "No course fields to update" });
          const { data, error } = await sb.from("academy_courses").update(coursePayload)
            .eq("academy_id", academyId).eq("id", courseId)
            .select("id, academy_id, code, title, description, level, estimated_minutes, status, published_at, metadata, created_by, created_at, updated_at").maybeSingle();
          if (error) return json(500, { error: "Failed to update course", detail: error.message });
          course = data as Record<string, unknown> | null;
        } else {
          const { data, error } = await sb.from("academy_courses").insert({
            academy_id: academyId,
            title,
            code: coursePayload.code ?? null,
            description: coursePayload.description ?? null,
            level: coursePayload.level ?? null,
            estimated_minutes: coursePayload.estimated_minutes ?? 0,
            status: requestedStatus || "draft",
            metadata: coursePayload.metadata ?? {},
            created_by: userId,
          }).select("id, academy_id, code, title, description, level, estimated_minutes, status, published_at, metadata, created_by, created_at, updated_at").maybeSingle();
          if (error) return json(500, { error: "Failed to create course", detail: error.message });
          course = data as Record<string, unknown> | null;
        }
        if (!course?.id) return json(500, { error: "Failed to save course" });
        if (classroomId) {
          const { error } = await sb.from("academy_classroom_courses").upsert({
            academy_id: academyId,
            classroom_id: classroomId,
            course_id: String(course.id),
            status: "active",
            assigned_by: userId,
          }, { onConflict: "classroom_id,course_id" });
          if (error) return json(500, { error: "Course saved, but classroom assignment failed", detail: error.message });
        }
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: courseId ? "course.updated" : "course.created",
          targetType: "academy_course",
          targetId: String(course.id),
          classroomId: classroomId || null,
          metadata: { title: course.title, status: course.status },
        });
        return json(200, { course });
      }

      if (actionBody === "assign_course") {
        const courseId = normalizeText(body?.course_id, 64);
        const classroomId = normalizeText(body?.classroom_id, 64);
        if (!courseId) return json(400, { error: "course_id is required" });
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
        const { data: course } = await sb.from("academy_courses").select("id")
          .eq("academy_id", academyId).eq("id", courseId).maybeSingle();
        if (!course?.id) return json(404, { error: "Course not found" });
        const status = normalizeText(body?.status, 20).toLowerCase() || "active";
        if (!["scheduled", "active", "completed", "archived"].includes(status)) return json(400, { error: "Invalid classroom course status" });
        const { data, error } = await sb.from("academy_classroom_courses").upsert({
          academy_id: academyId,
          classroom_id: classroomId,
          course_id: courseId,
          status,
          starts_at: body?.starts_at ? String(body.starts_at) : null,
          ends_at: body?.ends_at ? String(body.ends_at) : null,
          assigned_by: userId,
          metadata: isJsonObject(body?.metadata) ? body.metadata : {},
        }, { onConflict: "classroom_id,course_id" })
          .select("id, academy_id, classroom_id, course_id, status, starts_at, ends_at, assigned_by, assigned_at, metadata").maybeSingle();
        if (error) return json(500, { error: "Failed to assign course", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: "course.assigned",
          targetType: "academy_classroom_course",
          targetId: data?.id ? String(data.id) : null,
          classroomId,
          metadata: { course_id: courseId, status },
        });
        return json(200, { classroom_course: data });
      }

      if (actionBody === "publish_course") {
        const courseId = normalizeText(body?.course_id ?? body?.id, 64);
        const classroomId = normalizeText(body?.classroom_id, 64);
        const course = await loadCourseForAccess(sb, academyId, access, courseId, classroomId || null);
        if (!course) return json(404, { error: "Course not found" });
        const [{ count: moduleCount }, { count: lessonCount }] = await Promise.all([
          sb.from("academy_course_modules").select("id", { count: "exact", head: true }).eq("academy_id", academyId).eq("course_id", courseId).neq("status", "archived"),
          sb.from("academy_lessons").select("id", { count: "exact", head: true }).eq("academy_id", academyId).eq("course_id", courseId).neq("status", "archived"),
        ]);
        if (!moduleCount || !lessonCount) return json(409, { error: "A course needs at least one module and one lesson before publishing" });
        const nowIso = new Date().toISOString();
        const [modulesUpdate, lessonsUpdate, courseUpdate] = await Promise.all([
          sb.from("academy_course_modules").update({ status: "published" }).eq("academy_id", academyId).eq("course_id", courseId).neq("status", "archived"),
          sb.from("academy_lessons").update({ status: "published" }).eq("academy_id", academyId).eq("course_id", courseId).neq("status", "archived"),
          sb.from("academy_courses").update({ status: "published", published_at: nowIso }).eq("academy_id", academyId).eq("id", courseId)
            .select("id, academy_id, code, title, description, level, estimated_minutes, status, published_at, metadata, created_by, created_at, updated_at").maybeSingle(),
        ]);
        const publishError = modulesUpdate.error ?? lessonsUpdate.error ?? courseUpdate.error;
        if (publishError) return json(500, { error: "Failed to publish course", detail: publishError.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: "course.published",
          targetType: "academy_course",
          targetId: courseId,
          classroomId: classroomId || null,
          metadata: { modules: moduleCount, lessons: lessonCount },
        });
        return json(200, { course: courseUpdate.data });
      }

      if (actionBody === "upsert_module") {
        const moduleId = normalizeText(body?.module_id ?? body?.id, 64);
        const courseId = normalizeText(body?.course_id, 64);
        const classroomId = normalizeText(body?.classroom_id, 64);
        const title = normalizeText(body?.title ?? body?.name, 220);
        if (!courseId) return json(400, { error: "course_id is required" });
        if (!moduleId && !title) return json(400, { error: "title is required" });
        const course = await loadCourseForAccess(sb, academyId, access, courseId, classroomId || null);
        if (!course) return json(404, { error: "Course not found" });
        const status = normalizeText(body?.status, 20).toLowerCase();
        if (status && !["draft", "published", "archived"].includes(status)) return json(400, { error: "Invalid module status" });
        const payload: Record<string, unknown> = {
          title: title || undefined,
          description: typeof body?.description === "undefined" ? undefined : normalizeText(body.description, 4000) || null,
          position: typeof body?.position === "number" ? Math.max(0, Math.floor(body.position)) : undefined,
          status: status || undefined,
          unlock_rule: isJsonObject(body?.unlock_rule) ? body.unlock_rule : undefined,
          metadata: isJsonObject(body?.metadata) ? body.metadata : undefined,
        };
        for (const key of Object.keys(payload)) if (typeof payload[key] === "undefined") delete payload[key];
        let query;
        if (moduleId) {
          query = sb.from("academy_course_modules").update(payload).eq("academy_id", academyId).eq("course_id", courseId).eq("id", moduleId);
        } else {
          const { count } = await sb.from("academy_course_modules").select("id", { count: "exact", head: true }).eq("course_id", courseId).neq("status", "archived");
          query = sb.from("academy_course_modules").insert({ academy_id: academyId, course_id: courseId, title, position: count ?? 0, status: status || "draft", unlock_rule: body?.unlock_rule ?? {}, metadata: body?.metadata ?? {}, created_by: userId });
        }
        const { data, error } = await query.select("id, academy_id, course_id, title, description, position, status, unlock_rule, metadata, created_by, created_at, updated_at").maybeSingle();
        if (error) return json(500, { error: "Failed to save module", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: moduleId ? "course.module_updated" : "course.module_created",
          targetType: "academy_course_module",
          targetId: data?.id ? String(data.id) : null,
          classroomId: classroomId || null,
          metadata: { course_id: courseId, title: data?.title ?? title, status: data?.status ?? status ?? "draft" },
        });
        return json(200, { module: data });
      }

      if (actionBody === "upsert_lesson") {
        const lessonId = normalizeText(body?.lesson_id ?? body?.id, 64);
        const courseId = normalizeText(body?.course_id, 64);
        const moduleId = normalizeText(body?.module_id, 64);
        const classroomId = normalizeText(body?.classroom_id, 64);
        const title = normalizeText(body?.title ?? body?.name, 220);
        if (!courseId) return json(400, { error: "course_id is required" });
        if (!moduleId) return json(400, { error: "module_id is required" });
        if (!lessonId && !title) return json(400, { error: "title is required" });
        const course = await loadCourseForAccess(sb, academyId, access, courseId, classroomId || null);
        if (!course) return json(404, { error: "Course not found" });
        const { data: moduleRow } = await sb.from("academy_course_modules").select("id")
          .eq("academy_id", academyId).eq("course_id", courseId).eq("id", moduleId).maybeSingle();
        if (!moduleRow?.id) return json(404, { error: "Module not found" });
        const prerequisiteId = normalizeText(body?.prerequisite_lesson_id, 64) || null;
        if (prerequisiteId) {
          const { data: prerequisite } = await sb.from("academy_lessons").select("id")
            .eq("academy_id", academyId).eq("course_id", courseId).eq("id", prerequisiteId).maybeSingle();
          if (!prerequisite?.id || prerequisiteId === lessonId) return json(400, { error: "Invalid prerequisite lesson" });
        }
        const status = normalizeText(body?.status, 20).toLowerCase();
        if (status && !["draft", "published", "archived"].includes(status)) return json(400, { error: "Invalid lesson status" });
        const rawContent = body?.lesson_content ?? body?.content;
        const lessonContent = Array.isArray(rawContent) || isJsonObject(rawContent)
          ? rawContent
          : rawContent ? [{ type: "rich_text", text: normalizeText(rawContent, 30000) }] : undefined;
        const payload: Record<string, unknown> = {
          title: title || undefined,
          summary: typeof body?.summary === "undefined" ? undefined : normalizeText(body.summary, 4000) || null,
          content: lessonContent,
          position: typeof body?.position === "number" ? Math.max(0, Math.floor(body.position)) : undefined,
          estimated_minutes: typeof body?.estimated_minutes === "undefined" ? undefined : Math.max(0, toIntOrNull(body.estimated_minutes) ?? 0),
          status: status || undefined,
          available_from: typeof body?.available_from === "undefined" ? undefined : body.available_from ? String(body.available_from) : null,
          prerequisite_lesson_id: typeof body?.prerequisite_lesson_id === "undefined" ? undefined : prerequisiteId,
          completion_rule: isJsonObject(body?.completion_rule) ? body.completion_rule : undefined,
          metadata: isJsonObject(body?.metadata) ? body.metadata : undefined,
        };
        for (const key of Object.keys(payload)) if (typeof payload[key] === "undefined") delete payload[key];
        let query;
        if (lessonId) {
          query = sb.from("academy_lessons").update(payload).eq("academy_id", academyId).eq("course_id", courseId).eq("module_id", moduleId).eq("id", lessonId);
        } else {
          const { count } = await sb.from("academy_lessons").select("id", { count: "exact", head: true }).eq("module_id", moduleId).neq("status", "archived");
          query = sb.from("academy_lessons").insert({ academy_id: academyId, course_id: courseId, module_id: moduleId, title, summary: payload.summary ?? null, content: lessonContent ?? [], position: count ?? 0, estimated_minutes: payload.estimated_minutes ?? 0, status: status || "draft", available_from: payload.available_from ?? null, prerequisite_lesson_id: prerequisiteId, completion_rule: body?.completion_rule ?? { type: "manual" }, metadata: body?.metadata ?? {}, created_by: userId });
        }
        const { data, error } = await query.select("id, academy_id, course_id, module_id, prerequisite_lesson_id, title, summary, content, position, estimated_minutes, status, available_from, completion_rule, metadata, created_by, created_at, updated_at").maybeSingle();
        if (error) return json(500, { error: "Failed to save lesson", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: lessonId ? "course.lesson_updated" : "course.lesson_created",
          targetType: "academy_lesson",
          targetId: data?.id ? String(data.id) : null,
          classroomId: classroomId || null,
          metadata: { course_id: courseId, module_id: moduleId, title: data?.title ?? title, status: data?.status ?? status ?? "draft" },
        });
        return json(200, { lesson: data });
      }

      if (actionBody === "upsert_quiz") {
        const quizId = normalizeText(body?.quiz_id ?? body?.id, 64);
        const courseId = normalizeText(body?.course_id, 64);
        const classroomId = normalizeText(body?.classroom_id, 64);
        const title = normalizeText(body?.title ?? body?.name, 220);
        if (!courseId) return json(400, { error: "course_id is required" });
        if (!quizId && !title) return json(400, { error: "title is required" });
        const course = await loadCourseForAccess(sb, academyId, access, courseId, classroomId || null);
        if (!course) return json(404, { error: "Course not found" });
        const lessonId = normalizeText(body?.lesson_id, 64) || null;
        if (lessonId) {
          const { data: lesson } = await sb.from("academy_lessons").select("id")
            .eq("academy_id", academyId).eq("course_id", courseId).eq("id", lessonId).maybeSingle();
          if (!lesson?.id) return json(404, { error: "Lesson not found" });
        }
        const status = normalizeText(body?.status, 20).toLowerCase();
        if (status && !["draft", "published", "archived"].includes(status)) return json(400, { error: "Invalid quiz status" });
        if (quizId && status === "published") {
          const { count } = await sb.from("academy_quiz_questions").select("id", { count: "exact", head: true }).eq("academy_id", academyId).eq("quiz_id", quizId);
          if (!count) return json(409, { error: "A quiz needs at least one question before publishing" });
        }
        const payload: Record<string, unknown> = {
          title: title || undefined,
          instructions: typeof body?.description === "undefined" ? undefined : normalizeText(body.description, 6000) || null,
          lesson_id: typeof body?.lesson_id === "undefined" ? undefined : lessonId,
          status: status || undefined,
          passing_score: typeof body?.passing_score === "undefined" ? undefined : Math.min(100, Math.max(0, Number(body.passing_score))),
          attempts_allowed: typeof body?.attempts_allowed === "undefined" ? undefined : Math.min(100, Math.max(1, toIntOrNull(body.attempts_allowed) ?? 1)),
          time_limit_seconds: typeof body?.time_limit_seconds === "undefined"
            ? undefined
            : body.time_limit_seconds === null
            ? null
            : Math.max(30, positiveIntOrNull(body.time_limit_seconds) ?? 30),
          shuffle_questions: typeof body?.shuffle_questions === "boolean" ? body.shuffle_questions : undefined,
          show_answers_after: typeof body?.show_answers_after === "boolean" ? body.show_answers_after : undefined,
          metadata: isJsonObject(body?.metadata) ? body.metadata : undefined,
        };
        for (const key of Object.keys(payload)) if (typeof payload[key] === "undefined") delete payload[key];
        let query;
        if (quizId) query = sb.from("academy_quizzes").update(payload).eq("academy_id", academyId).eq("course_id", courseId).eq("id", quizId);
        else query = sb.from("academy_quizzes").insert({ academy_id: academyId, course_id: courseId, lesson_id: lessonId, title, instructions: payload.instructions ?? null, status: status || "draft", passing_score: payload.passing_score ?? 60, attempts_allowed: payload.attempts_allowed ?? 1, time_limit_seconds: payload.time_limit_seconds ?? null, shuffle_questions: payload.shuffle_questions ?? false, show_answers_after: payload.show_answers_after ?? true, metadata: payload.metadata ?? {}, created_by: userId });
        const { data, error } = await query.select("id, academy_id, course_id, lesson_id, title, instructions, status, passing_score, attempts_allowed, time_limit_seconds, shuffle_questions, show_answers_after, metadata, created_by, created_at, updated_at").maybeSingle();
        if (error) return json(500, { error: "Failed to save quiz", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: quizId ? "quiz.updated" : "quiz.created",
          targetType: "academy_quiz",
          targetId: data?.id ? String(data.id) : null,
          classroomId: classroomId || null,
          metadata: { course_id: courseId, lesson_id: lessonId, title: data?.title ?? title, status: data?.status ?? status ?? "draft" },
        });
        return json(200, { quiz: data });
      }

      if (actionBody === "upsert_quiz_question") {
        const questionId = normalizeText(body?.question_id ?? body?.id, 64);
        const quizId = normalizeText(body?.quiz_id, 64);
        const classroomId = normalizeText(body?.classroom_id, 64);
        if (!quizId) return json(400, { error: "quiz_id is required" });
        const { data: quiz } = await sb.from("academy_quizzes").select("id, course_id")
          .eq("academy_id", academyId).eq("id", quizId).maybeSingle();
        if (!quiz?.id) return json(404, { error: "Quiz not found" });
        const course = await loadCourseForAccess(sb, academyId, access, quiz.course_id, classroomId || null);
        if (!course) return json(404, { error: "Course not found" });
        const questionType = normalizeText(body?.question_type, 30) as AcademyQuizQuestionType;
        const prompt = normalizeText(body?.prompt ?? body?.title, 10000);
        const points = typeof body?.points === "number" ? body.points : 1;
        const validationError = validateAcademyQuizQuestion({ question_type: questionType, prompt, options: body?.options, correct_answer: body?.correct_answer, points });
        if (validationError) return json(400, { error: validationError });
        const payload: Record<string, unknown> = {
          question_type: questionType,
          prompt,
          options: Array.isArray(body?.options) ? body.options : [],
          correct_answer: body?.correct_answer ?? null,
          points,
          explanation: normalizeText(body?.explanation, 4000) || null,
          metadata: isJsonObject(body?.metadata) ? body.metadata : {},
        };
        if (typeof body?.position === "number") payload.position = Math.max(0, Math.floor(body.position));
        let query;
        if (questionId) query = sb.from("academy_quiz_questions").update(payload).eq("academy_id", academyId).eq("quiz_id", quizId).eq("id", questionId);
        else {
          const { count } = await sb.from("academy_quiz_questions").select("id", { count: "exact", head: true }).eq("quiz_id", quizId);
          query = sb.from("academy_quiz_questions").insert({ academy_id: academyId, quiz_id: quizId, ...payload, position: payload.position ?? count ?? 0, created_by: userId });
        }
        const { data, error } = await query.select("id, academy_id, quiz_id, question_type, prompt, options, correct_answer, points, position, explanation, metadata, created_by, created_at, updated_at").maybeSingle();
        if (error) return json(500, { error: "Failed to save quiz question", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: questionId ? "quiz.question_updated" : "quiz.question_created",
          targetType: "academy_quiz_question",
          targetId: data?.id ? String(data.id) : null,
          classroomId: classroomId || null,
          metadata: { quiz_id: quizId, question_type: questionType, points },
        });
        return json(200, { question: data });
      }

      if (actionBody === "upsert_grade_category") {
        const categoryId = normalizeText(body?.id, 64);
        const classroomId = normalizeText(body?.classroom_id, 64);
        const name = normalizeText(body?.name ?? body?.title, 120);
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!categoryId && !name) return json(400, { error: "name is required" });
        if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
        const categoryWeight = Number(body?.score_weight ?? body?.weight ?? 1);
        if (!Number.isFinite(categoryWeight) || categoryWeight <= 0) {
          return json(400, { error: "weight must be greater than zero" });
        }
        const payload = {
          academy_id: academyId,
          classroom_id: classroomId,
          name,
          weight: categoryWeight,
          position: Math.max(0, toIntOrNull(body?.position) ?? 0),
          drop_lowest: Math.max(0, toIntOrNull(body?.drop_lowest) ?? 0),
          metadata: isJsonObject(body?.metadata) ? body.metadata : {},
          created_by: userId,
        };
        const query = categoryId
          ? sb.from("academy_grade_categories").update(payload).eq("academy_id", academyId).eq("classroom_id", classroomId).eq("id", categoryId)
          : sb.from("academy_grade_categories").insert(payload);
        const { data, error } = await query.select("id, academy_id, classroom_id, name, weight, position, drop_lowest, metadata, created_by, created_at, updated_at").maybeSingle();
        if (error) return json(500, { error: "Failed to save grade category", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: categoryId ? "grade_category.updated" : "grade_category.created",
          targetType: "academy_grade_category",
          targetId: data?.id ? String(data.id) : null,
          classroomId,
          metadata: { name: data?.name ?? name, weight: data?.weight ?? payload.weight, drop_lowest: data?.drop_lowest ?? payload.drop_lowest },
        });
        return json(200, { grade_category: data });
      }

      if (actionBody === "upsert_rubric") {
        const rubricId = normalizeText(body?.id, 64);
        const title = normalizeText(body?.title ?? body?.name, 220);
        if (!rubricId && !title) return json(400, { error: "title is required" });
        const criteria = Array.isArray(body?.criteria) ? body.criteria : [];
        if (criteria.length === 0) return json(400, { error: "At least one rubric criterion is required" });
        if (criteria.length > 50) return json(400, { error: "Maximum 50 rubric criteria" });
        const invalidCriterion = criteria.some((criterion) => {
          if (!isJsonObject(criterion)) return true;
          const criterionName = normalizeText(criterion.name ?? criterion.title, 220);
          const maxPoints = Number(criterion.max_points ?? criterion.max_score ?? 0);
          return !criterionName || !Number.isFinite(maxPoints) || maxPoints <= 0;
        });
        if (invalidCriterion) return json(400, { error: "Each rubric criterion needs a name and positive max_points" });
        const status = normalizeText(body?.status, 20).toLowerCase() || "active";
        if (!["draft", "active", "archived"].includes(status)) return json(400, { error: "Invalid rubric status" });
        const payload = { academy_id: academyId, title, description: normalizeText(body?.description, 4000) || null, criteria, status, metadata: isJsonObject(body?.metadata) ? body.metadata : {}, created_by: userId };
        const query = rubricId
          ? sb.from("academy_rubrics").update(payload).eq("academy_id", academyId).eq("id", rubricId)
          : sb.from("academy_rubrics").insert(payload);
        const { data, error } = await query.select("id, academy_id, title, description, criteria, status, metadata, created_by, created_at, updated_at").maybeSingle();
        if (error) return json(500, { error: "Failed to save rubric", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: rubricId ? "rubric.updated" : "rubric.created",
          targetType: "academy_rubric",
          targetId: data?.id ? String(data.id) : null,
          metadata: { title: data?.title ?? title, status: data?.status ?? status, criteria_count: criteria.length },
        });
        return json(200, { rubric: data });
      }

      if (actionBody === "grade_quiz_attempt") {
        const attemptId = normalizeText(body?.attempt_id ?? body?.id, 64);
        const score = typeof body?.score === "number" ? body.score : null;
        if (!attemptId) return json(400, { error: "attempt_id is required" });
        if (score === null) return json(400, { error: "score is required" });
        const { data: attempt } = await sb.from("academy_quiz_attempts").select("id, classroom_id, course_id, quiz_id, max_score")
          .eq("academy_id", academyId).eq("id", attemptId).maybeSingle();
        if (!attempt?.id) return json(404, { error: "Quiz attempt not found" });
        if (!accessCanUseClassroom(access, attempt.classroom_id)) return json(403, { error: "Forbidden" });
        const maxScore = typeof body?.max_score === "number" ? body.max_score : Number(attempt.max_score ?? 0);
        if (maxScore <= 0 || score < 0 || score > maxScore) return json(400, { error: "Score must be between zero and max_score" });
        const percentage = Math.round((score / maxScore) * 1000) / 10;
        const { data: quiz } = await sb.from("academy_quizzes").select("passing_score").eq("academy_id", academyId).eq("id", attempt.quiz_id).maybeSingle();
        const { data, error } = await sb.from("academy_quiz_attempts").update({
          score,
          max_score: maxScore,
          percentage,
          passed: percentage >= Number(quiz?.passing_score ?? 60),
          feedback: normalizeText(body?.feedback ?? body?.notes, 6000) || null,
          status: "graded",
          graded_at: new Date().toISOString(),
          graded_by: userId,
        }).eq("academy_id", academyId).eq("id", attemptId)
          .select("id, classroom_id, course_id, quiz_id, contact_id, attempt_number, status, score, max_score, percentage, passed, feedback, started_at, submitted_at, graded_at, graded_by").maybeSingle();
        if (error) return json(500, { error: "Failed to grade quiz attempt", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: "quiz.attempt_graded",
          targetType: "academy_quiz_attempt",
          targetId: attemptId,
          contactId: data?.contact_id ? String(data.contact_id) : null,
          classroomId: String(attempt.classroom_id),
          metadata: { quiz_id: attempt.quiz_id, score, max_score: maxScore, percentage },
        });
        return json(200, { attempt: data });
      }

      if (actionBody === "set_enrollment_status") {
        const membershipId = normalizeText(body?.id, 64);
        const classroomId = normalizeText(body?.classroom_id, 64);
        const contactId = normalizeText(body?.contact_id, 64);
        const status = normalizeText(body?.membership_status ?? body?.status, 30).toLowerCase();
        if (!membershipId && (!classroomId || !contactId)) return json(400, { error: "id or classroom_id and contact_id are required" });
        if (!["invited", "active", "paused", "completed", "withdrawn", "expired"].includes(status)) return json(400, { error: "Invalid enrollment status" });
        let membershipQuery = sb.from("academy_classroom_memberships").select("id, classroom_id, contact_id")
          .eq("academy_id", academyId);
        membershipQuery = membershipId ? membershipQuery.eq("id", membershipId) : membershipQuery.eq("classroom_id", classroomId).eq("contact_id", contactId);
        const { data: membership } = await membershipQuery.maybeSingle();
        if (!membership?.id) return json(404, { error: "Classroom enrollment not found" });
        if (!accessCanUseClassroom(access, membership.classroom_id)) return json(403, { error: "Forbidden" });
        const nowIso = new Date().toISOString();
        const patch: Record<string, unknown> = { status };
        if (status === "active") patch.started_at = nowIso;
        if (status === "paused") patch.paused_at = nowIso;
        if (status === "completed") patch.completed_at = nowIso;
        if (status === "withdrawn") patch.withdrawn_at = nowIso;
        const { data, error } = await sb.from("academy_classroom_memberships").update(patch)
          .eq("academy_id", academyId).eq("id", membership.id)
          .select("id, academy_id, classroom_id, contact_id, role, status, joined_at, started_at, completed_at, paused_at, withdrawn_at, expires_at, metadata").maybeSingle();
        if (error) return json(500, { error: "Failed to update enrollment status", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: "enrollment.status_changed",
          targetType: "academy_classroom_membership",
          targetId: String(membership.id),
          contactId: String(membership.contact_id),
          classroomId: String(membership.classroom_id),
          metadata: { status },
        });
        return json(200, { classroom_membership: data });
      }

      if (actionBody === "create_assignment") {
        const classroomId = normalizeText(body?.classroom_id, 64);
        const title = normalizeText(body?.title, 220);
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!title) return json(400, { error: "title is required" });
        if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

        const { data: classroomRow } = await sb.from("academy_classrooms").select("id").eq("id", classroomId).eq("academy_id", academyId).maybeSingle();
        if (!classroomRow?.id) return json(404, { error: "Classroom not found" });

        const { count: pos } = await sb.from("academy_assignments").select("id", { count: "exact", head: true }).eq("classroom_id", classroomId).neq("status", "archived");

        const courseId = normalizeText(body?.course_id, 64) || null;
        const moduleId = normalizeText(body?.module_id, 64) || null;
        const lessonId = normalizeText(body?.lesson_id, 64) || null;
        const gradeCategoryId = normalizeText(body?.grade_category_id, 64) || null;
        const rubricId = normalizeText(body?.rubric_id, 64) || null;
        if (courseId) {
          const course = await loadCourseForAccess(sb, academyId, access, courseId, classroomId);
          if (!course) return json(404, { error: "Course not found" });
        }
        if (moduleId) {
          const { data: moduleRow } = await sb.from("academy_course_modules").select("id")
            .eq("academy_id", academyId).eq("id", moduleId).eq("course_id", courseId ?? "").maybeSingle();
          if (!moduleRow?.id) return json(400, { error: "Module does not belong to the selected course" });
        }
        if (lessonId) {
          const { data: lessonRow } = await sb.from("academy_lessons").select("id")
            .eq("academy_id", academyId).eq("id", lessonId).eq("course_id", courseId ?? "").eq("module_id", moduleId ?? "").maybeSingle();
          if (!lessonRow?.id) return json(400, { error: "Lesson does not belong to the selected module" });
        }
        if (gradeCategoryId) {
          const { data: categoryRow } = await sb.from("academy_grade_categories").select("id")
            .eq("academy_id", academyId).eq("id", gradeCategoryId).eq("classroom_id", classroomId).maybeSingle();
          if (!categoryRow?.id) return json(400, { error: "Grade category does not belong to this classroom" });
        }
        if (rubricId) {
          const { data: rubricRow } = await sb.from("academy_rubrics").select("id")
            .eq("academy_id", academyId).eq("id", rubricId).neq("status", "archived").maybeSingle();
          if (!rubricRow?.id) return json(400, { error: "Rubric not found" });
        }

        const payload = {
          academy_id: academyId,
          classroom_id: classroomId,
          course_id: courseId,
          module_id: moduleId,
          lesson_id: lessonId,
          grade_category_id: gradeCategoryId,
          rubric_id: rubricId,
          title,
          description: normalizeText(body?.description, 4000) || null,
          assignment_type: normalizeText(body?.assignment_type, 40) || "task",
          experience_id: normalizeText(body?.experience_id, 64) || null,
          due_at: body?.due_at ? String(body.due_at) : null,
          released_at: body?.released_at ? String(body.released_at) : new Date().toISOString(),
          prerequisite_id: normalizeText(body?.prerequisite_id, 64) || null,
          position: typeof body?.position === "number" ? Math.floor(body.position) : (pos ?? 0),
          max_score: typeof body?.max_score === "number" ? body.max_score : null,
          score_weight: typeof body?.score_weight === "number" ? body.score_weight : 1.0,
          attempts_allowed: Math.min(100, Math.max(1, toIntOrNull(body?.attempts_allowed) ?? 1)),
          allow_late_submission: typeof body?.allow_late_submission === "boolean" ? body.allow_late_submission : true,
          status: normalizeText(body?.status, 20) || "active",
          metadata: typeof body?.metadata === "object" && body.metadata !== null && !Array.isArray(body.metadata) ? body.metadata : {},
          created_by: userId,
        };

        const { data, error } = await sb.from("academy_assignments").insert(payload)
          .select("id, academy_id, classroom_id, course_id, module_id, lesson_id, grade_category_id, rubric_id, title, description, assignment_type, experience_id, experience_url, due_at, released_at, prerequisite_id, position, max_score, score_weight, attempts_allowed, allow_late_submission, status, metadata, created_by, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to create assignment", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: "assignment.created",
          targetType: "academy_assignment",
          targetId: data?.id ? String(data.id) : null,
          classroomId,
          status: "ok",
          metadata: { title, assignment_type: payload.assignment_type, due_at: payload.due_at },
        });
        return json(200, { assignment: data });
      }

      if (actionBody === "update_assignment") {
        const assignmentId = normalizeText(body?.assignment_id ?? body?.id, 64);
        if (!assignmentId) return json(400, { error: "assignment_id is required" });

        const { data: existing } = await sb.from("academy_assignments")
          .select("id, classroom_id, course_id, module_id, lesson_id, grade_category_id, rubric_id")
          .eq("id", assignmentId).eq("academy_id", academyId).maybeSingle();
        if (!existing?.id) return json(404, { error: "Assignment not found" });
        if (!accessCanUseClassroom(access, existing.classroom_id)) return json(403, { error: "Forbidden" });

        const patch: Record<string, unknown> = {};
        if (typeof body?.title === "string") patch.title = normalizeText(body.title, 220);
        if (typeof body?.description !== "undefined") patch.description = normalizeText(body.description, 4000) || null;
        if (typeof body?.assignment_type === "string") patch.assignment_type = normalizeText(body.assignment_type, 40);
        if (typeof body?.experience_id !== "undefined") patch.experience_id = normalizeText(body.experience_id, 64) || null;
        if (typeof body?.due_at !== "undefined") patch.due_at = body.due_at ? String(body.due_at) : null;
        if (typeof body?.released_at !== "undefined") patch.released_at = body.released_at ? String(body.released_at) : null;
        if (typeof body?.prerequisite_id !== "undefined") patch.prerequisite_id = normalizeText(body.prerequisite_id, 64) || null;
        if (typeof body?.position === "number") patch.position = Math.floor(body.position);
        if (typeof body?.max_score !== "undefined") patch.max_score = typeof body.max_score === "number" ? body.max_score : null;
        if (typeof body?.score_weight === "number") patch.score_weight = body.score_weight;
        if (typeof body?.course_id !== "undefined") patch.course_id = normalizeText(body.course_id, 64) || null;
        if (typeof body?.module_id !== "undefined") patch.module_id = normalizeText(body.module_id, 64) || null;
        if (typeof body?.lesson_id !== "undefined") patch.lesson_id = normalizeText(body.lesson_id, 64) || null;
        if (typeof body?.grade_category_id !== "undefined") patch.grade_category_id = normalizeText(body.grade_category_id, 64) || null;
        if (typeof body?.rubric_id !== "undefined") patch.rubric_id = normalizeText(body.rubric_id, 64) || null;
        if (typeof body?.attempts_allowed !== "undefined") patch.attempts_allowed = Math.min(100, Math.max(1, toIntOrNull(body.attempts_allowed) ?? 1));
        if (typeof body?.allow_late_submission === "boolean") patch.allow_late_submission = body.allow_late_submission;
        if (typeof body?.status === "string") patch.status = normalizeText(body.status, 20);

        if (Object.keys(patch).length === 0) return json(400, { error: "No fields to update" });

        const curriculumFieldsChanged = [
          "course_id",
          "module_id",
          "lesson_id",
          "grade_category_id",
          "rubric_id",
        ].some((field) => Object.prototype.hasOwnProperty.call(patch, field));
        if (curriculumFieldsChanged) {
          const nextCourseId = Object.prototype.hasOwnProperty.call(patch, "course_id")
            ? patch.course_id as string | null
            : existing.course_id as string | null;
          const nextModuleId = Object.prototype.hasOwnProperty.call(patch, "module_id")
            ? patch.module_id as string | null
            : existing.module_id as string | null;
          const nextLessonId = Object.prototype.hasOwnProperty.call(patch, "lesson_id")
            ? patch.lesson_id as string | null
            : existing.lesson_id as string | null;
          const nextCategoryId = Object.prototype.hasOwnProperty.call(patch, "grade_category_id")
            ? patch.grade_category_id as string | null
            : existing.grade_category_id as string | null;
          const nextRubricId = Object.prototype.hasOwnProperty.call(patch, "rubric_id")
            ? patch.rubric_id as string | null
            : existing.rubric_id as string | null;
          if ((nextModuleId || nextLessonId) && !nextCourseId) {
            return json(400, { error: "A module or lesson assignment requires a course" });
          }
          if (nextLessonId && !nextModuleId) {
            return json(400, { error: "A lesson assignment requires a module" });
          }
          if (nextCourseId) {
            const course = await loadCourseForAccess(sb, academyId, access, nextCourseId, String(existing.classroom_id));
            if (!course) return json(400, { error: "Course does not belong to this classroom scope" });
          }
          if (nextModuleId) {
            const { data: moduleRow } = await sb.from("academy_course_modules").select("id")
              .eq("academy_id", academyId).eq("id", nextModuleId).eq("course_id", nextCourseId ?? "").maybeSingle();
            if (!moduleRow?.id) return json(400, { error: "Module does not belong to the selected course" });
          }
          if (nextLessonId) {
            const { data: lessonRow } = await sb.from("academy_lessons").select("id")
              .eq("academy_id", academyId).eq("id", nextLessonId).eq("course_id", nextCourseId ?? "")
              .eq("module_id", nextModuleId ?? "").maybeSingle();
            if (!lessonRow?.id) return json(400, { error: "Lesson does not belong to the selected module" });
          }
          if (nextCategoryId) {
            const { data: categoryRow } = await sb.from("academy_grade_categories").select("id")
              .eq("academy_id", academyId).eq("id", nextCategoryId).eq("classroom_id", existing.classroom_id).maybeSingle();
            if (!categoryRow?.id) return json(400, { error: "Grade category does not belong to this classroom" });
          }
          if (nextRubricId) {
            const { data: rubricRow } = await sb.from("academy_rubrics").select("id")
              .eq("academy_id", academyId).eq("id", nextRubricId).neq("status", "archived").maybeSingle();
            if (!rubricRow?.id) return json(400, { error: "Rubric not found" });
          }
        }

        const { data, error } = await sb.from("academy_assignments").update(patch).eq("id", assignmentId).eq("academy_id", academyId)
          .select("id, academy_id, classroom_id, course_id, module_id, lesson_id, grade_category_id, rubric_id, title, description, assignment_type, experience_id, experience_url, due_at, released_at, prerequisite_id, position, max_score, score_weight, attempts_allowed, allow_late_submission, status, metadata, created_by, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to update assignment", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: "assignment.updated",
          targetType: "academy_assignment",
          targetId: assignmentId,
          classroomId: String(existing.classroom_id),
          metadata: { fields: Object.keys(patch) },
        });
        return json(200, { assignment: data });
      }

      if (actionBody === "submit_assignment") {
        const assignmentId = normalizeText(body?.assignment_id, 64);
        const contactId = normalizeText(body?.contact_id, 64);
        if (!assignmentId) return json(400, { error: "assignment_id is required" });
        if (!contactId) return json(400, { error: "contact_id is required" });
        const score = typeof body?.score === "number" ? body.score : null;
        const hasGradePatch = score !== null || typeof body?.max_score === "number";
        requireAcademyPermission(access, hasGradePatch ? "gradeSubmissions" : "manageAssignments");

        const { data: asgn } = await sb.from("academy_assignments").select("id, classroom_id, max_score, rubric_id").eq("id", assignmentId).eq("academy_id", academyId).maybeSingle();
        if (!asgn?.id) return json(404, { error: "Assignment not found" });
        if (!accessCanUseClassroom(access, asgn.classroom_id)) return json(403, { error: "Forbidden" });
        await ensureContactInAccessScope(sb, academyId, access, contactId);

        const { data: contact } = await sb.from("academy_contacts").select("id, user_id").eq("id", contactId).eq("academy_id", academyId).maybeSingle();
        if (!contact?.id) return json(404, { error: "Contact not found" });

        const maxScore = typeof body?.max_score === "number" ? body.max_score : (asgn.max_score ?? null);
        const submissionStatus = score !== null ? "graded" : "submitted";
        const feedback: Record<string, unknown> = isJsonObject(body?.feedback) ? body.feedback : {};
        if (score !== null && asgn.rubric_id) {
          if (String(feedback.rubric_id ?? "") !== String(asgn.rubric_id)) {
            return json(400, { error: "Rubric scores are required for this assignment" });
          }
          const { data: rubric, error: rubricError } = await sb.from("academy_rubrics")
            .select("id, criteria").eq("academy_id", academyId).eq("id", asgn.rubric_id).neq("status", "archived").maybeSingle();
          if (rubricError) return json(500, { error: "Failed to load assignment rubric", detail: rubricError.message });
          if (!rubric?.id || !Array.isArray(rubric.criteria)) return json(409, { error: "Assignment rubric is unavailable" });
          const rubricGrade = gradeAcademyRubric(rubric.criteria, feedback.rubric_scores);
          if (!rubricGrade.ok) return json(400, { error: rubricGrade.error });
          if (Math.abs(score - rubricGrade.score) > 0.001 || maxScore === null || Math.abs(Number(maxScore) - rubricGrade.max_score) > 0.001) {
            return json(400, { error: "Score and max_score must match the rubric totals" });
          }
          feedback.rubric_scores = rubricGrade.scores;
        }

        const payload = {
          academy_id: academyId,
          assignment_id: assignmentId,
          classroom_id: asgn.classroom_id,
          contact_id: contactId,
          user_id: (contact.user_id as string | null) ?? null,
          session_id: normalizeText(body?.session_id, 64) || null,
          score,
          max_score: maxScore,
          status: submissionStatus,
          submitted_at: new Date().toISOString(),
          notes: normalizeText(body?.notes, 2000) || null,
          feedback,
          metadata: typeof body?.metadata === "object" && body.metadata !== null && !Array.isArray(body.metadata) ? body.metadata : {},
        };

        const { data, error } = await sb.from("academy_submissions").upsert(payload, { onConflict: "assignment_id,contact_id" })
          .select("id, assignment_id, contact_id, score, max_score, status, attempt_number, submitted_at, graded_at, notes, feedback, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to submit assignment", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: score !== null ? "submission.graded" : "submission.recorded",
          targetType: "academy_submission",
          targetId: data?.id ? String(data.id) : null,
          contactId,
          classroomId: String(asgn.classroom_id),
          metadata: { assignment_id: assignmentId, score, max_score: maxScore },
        });
        return json(200, { submission: data });
      }

      if (actionBody === "grade_submission") {
        const submissionId = normalizeText(body?.submission_id ?? body?.id, 64);
        const assignmentId = normalizeText(body?.assignment_id, 64);
        const contactId = normalizeText(body?.contact_id, 64);
        const score = typeof body?.score === "number" ? body.score : null;

        if (score === null) return json(400, { error: "score is required" });

        let targetId: string | null = submissionId;
        if (!targetId && assignmentId && contactId) {
          const { data: sub } = await sb.from("academy_submissions").select("id").eq("assignment_id", assignmentId).eq("contact_id", contactId).eq("academy_id", academyId).maybeSingle();
          targetId = sub?.id ? String(sub.id) : null;
        }
        if (!targetId) return json(404, { error: "Submission not found" });

        const { data: existingSubmission, error: existingSubmissionError } = await sb.from("academy_submissions")
          .select("id, assignment_id, classroom_id, contact_id, max_score")
          .eq("id", targetId)
          .eq("academy_id", academyId)
          .maybeSingle();
        if (existingSubmissionError) return json(500, { error: "Failed to load submission", detail: existingSubmissionError.message });
        if (!existingSubmission?.id) return json(404, { error: "Submission not found" });
        if (!accessCanUseClassroom(access, existingSubmission.classroom_id)) return json(403, { error: "Forbidden" });
        await ensureContactInAccessScope(sb, academyId, access, existingSubmission.contact_id);

        const feedback: Record<string, unknown> = isJsonObject(body?.feedback) ? body.feedback : {};
        const { data: assignmentForGrade, error: assignmentForGradeError } = await sb.from("academy_assignments")
          .select("id, rubric_id, max_score").eq("academy_id", academyId).eq("id", existingSubmission.assignment_id).maybeSingle();
        if (assignmentForGradeError) return json(500, { error: "Failed to load submission assignment", detail: assignmentForGradeError.message });
        if (assignmentForGrade?.rubric_id) {
          if (String(feedback.rubric_id ?? "") !== String(assignmentForGrade.rubric_id)) {
            return json(400, { error: "Rubric scores are required for this assignment" });
          }
          const { data: rubric, error: rubricError } = await sb.from("academy_rubrics")
            .select("id, criteria").eq("academy_id", academyId).eq("id", assignmentForGrade.rubric_id).neq("status", "archived").maybeSingle();
          if (rubricError) return json(500, { error: "Failed to load assignment rubric", detail: rubricError.message });
          if (!rubric?.id || !Array.isArray(rubric.criteria)) return json(409, { error: "Assignment rubric is unavailable" });
          const rubricGrade = gradeAcademyRubric(rubric.criteria, feedback.rubric_scores);
          if (!rubricGrade.ok) return json(400, { error: rubricGrade.error });
          const requestedMaxScore = typeof body?.max_score === "number"
            ? body.max_score
            : Number(existingSubmission.max_score ?? assignmentForGrade.max_score ?? 0);
          if (Math.abs(score - rubricGrade.score) > 0.001 || Math.abs(requestedMaxScore - rubricGrade.max_score) > 0.001) {
            return json(400, { error: "Score and max_score must match the rubric totals" });
          }
          feedback.rubric_scores = rubricGrade.scores;
        }

        const patch: Record<string, unknown> = {
          score,
          status: "graded",
          graded_at: new Date().toISOString(),
          graded_by: userId,
        };
        if (typeof body?.max_score === "number") patch.max_score = body.max_score;
        if (typeof body?.notes === "string") patch.notes = normalizeText(body.notes, 2000) || null;
        if (isJsonObject(body?.feedback)) patch.feedback = feedback;

        const { data, error } = await sb.from("academy_submissions").update(patch).eq("id", targetId).eq("academy_id", academyId)
          .select("id, assignment_id, contact_id, score, max_score, status, attempt_number, submitted_at, graded_at, graded_by, notes, feedback, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to grade submission", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: "submission.graded",
          targetType: "academy_submission",
          targetId,
          contactId: String(existingSubmission.contact_id ?? ""),
          classroomId: String(existingSubmission.classroom_id ?? ""),
          status: "ok",
          metadata: { score, max_score: patch.max_score ?? null, assignment_id: data?.assignment_id ?? assignmentId ?? null },
        });
        return json(200, { submission: data });
      }

      if (actionBody === "mark_attendance") {
        const classroomId = normalizeText(body?.classroom_id, 64);
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

        const records = Array.isArray(body?.records) ? body.records as Array<Record<string, unknown>> : [];
        if (records.length === 0) return json(400, { error: "records array is required" });
        if (records.length > 200) return json(400, { error: "Maximum 200 attendance records per call" });

        const sessionDate = normalizeText(body?.session_date, 20) || new Date().toISOString().slice(0, 10);

        const rows = records.map((r) => ({
          academy_id: academyId,
          classroom_id: classroomId,
          contact_id: normalizeText(r.contact_id, 64),
          user_id: normalizeText(r.user_id, 64) || null,
          session_date: sessionDate,
          status: (["present", "absent", "late", "excused"].includes(String(r.status ?? "")) ? String(r.status) : "present"),
          notes: normalizeText(r.notes, 500) || null,
          marked_by: userId,
          marked_at: new Date().toISOString(),
        })).filter((r) => r.contact_id);
        const { data: memberRows, error: memberRowsError } = await sb.from("academy_classroom_memberships")
          .select("contact_id")
          .eq("academy_id", academyId)
          .eq("classroom_id", classroomId)
          .in("role", ["student", "observer"])
          .limit(1000);
        if (memberRowsError) return json(500, { error: "Failed to verify classroom members", detail: memberRowsError.message });
        const memberContactIds = new Set(((memberRows ?? []) as Array<{ contact_id: string | null }>).map((row) => String(row.contact_id ?? "")));
        if (rows.some((row) => !memberContactIds.has(row.contact_id))) return json(403, { error: "Forbidden" });

        const { data, error } = await sb.from("academy_attendance")
          .upsert(rows, { onConflict: "classroom_id,contact_id,session_date" })
          .select("id, classroom_id, contact_id, session_date, status, notes");
        if (error) return json(500, { error: "Failed to mark attendance", detail: error.message });
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: "attendance.marked",
          targetType: "academy_attendance",
          targetId: `${classroomId}:${sessionDate}`,
          classroomId,
          status: "ok",
          metadata: {
            session_date: sessionDate,
            count: (data ?? []).length,
            status_counts: rows.reduce<Record<string, number>>((acc, row) => {
              acc[row.status] = (acc[row.status] ?? 0) + 1;
              return acc;
            }, {}),
          },
        });
        return json(200, { attendance: data ?? [], count: (data ?? []).length });
      }

      if (actionBody === "bulk_invite") {
        const classroomId = normalizeText(body?.classroom_id, 64) || null;
        const scopedClassroomIds = academyAccessClassroomIds(access);
        if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
        if (!classroomId && scopedClassroomIds !== null) return json(400, { error: "classroom_id is required" });
        const entries = Array.isArray(body?.contacts) ? body.contacts as Array<Record<string, unknown>> : [];
        if (entries.length === 0) return json(400, { error: "contacts array is required" });
        if (entries.length > 200) return json(400, { error: "Maximum 200 contacts per bulk invite" });

        const results: Array<Record<string, unknown>> = [];

        for (const entry of entries) {
          const email = normalizeEmail(entry.email) || null;
          const firstName = normalizeText(entry.first_name, 120) || "";
          const lastName = normalizeText(entry.last_name, 120) || "";

          if (!email) {
            results.push({ email: entry.email, status: "failed", error: "Invalid email" });
            continue;
          }

          try {
            // Upsert the contact
            let contactId: string | null = null;
            const { data: existingContact } = await sb.from("academy_contacts").select("id").eq("academy_id", academyId).eq("email", email).maybeSingle();
            if (existingContact?.id) {
              contactId = String(existingContact.id);
            } else {
              const { data: userRow } = await sb.from("users").select("id").eq("email", email).maybeSingle();
              const { data: newContact, error: contactErr } = await sb.from("academy_contacts").insert({
                academy_id: academyId,
                first_name: firstName,
                last_name: lastName,
                email,
                user_id: userRow?.id ? String(userRow.id) : null,
                status: "active",
                created_by: userId,
              }).select("id").maybeSingle();
              if (contactErr) { results.push({ email, status: "failed", error: contactErr.message }); continue; }
              contactId = newContact?.id ? String(newContact.id) : null;
            }

            if (classroomId && contactId) {
              await sb.from("academy_classroom_memberships").upsert({
                academy_id: academyId,
                classroom_id: classroomId,
                contact_id: contactId,
                role: "student",
              }, { onConflict: "classroom_id,contact_id", ignoreDuplicates: true });
            }

            await sb.from("academy_bulk_invites").upsert({
              academy_id: academyId,
              classroom_id: classroomId,
              invited_by: userId,
              email,
              first_name: firstName,
              last_name: lastName,
              status: "sent",
              invited_at: new Date().toISOString(),
            }, { onConflict: "academy_id,email" }).select();

            results.push({ email, contact_id: contactId, status: "ok" });
          } catch (e) {
            results.push({ email, status: "failed", error: e instanceof Error ? e.message : String(e) });
          }
        }

        const ok = results.filter((r) => r.status === "ok").length;
        const failed = results.filter((r) => r.status === "failed").length;
        return json(200, { results, summary: { ok, failed, total: results.length } });
      }

      if (actionBody === "update_classroom_settings") {
        const classroomId = normalizeText(body?.classroom_id, 64);
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

        const { data: existing } = await sb.from("academy_classrooms").select("id, metadata, score_weights").eq("id", classroomId).eq("academy_id", academyId).maybeSingle();
        if (!existing?.id) return json(404, { error: "Classroom not found" });

        const patch: Record<string, unknown> = {};
        if (typeof body?.name === "string") patch.name = normalizeText(body.name, 160);
        if (typeof body?.description !== "undefined") patch.description = normalizeText(body.description, 2000) || null;
        if (typeof body?.is_active === "boolean") patch.is_active = body.is_active;
        if (typeof body?.score_weights === "object" && body.score_weights !== null && !Array.isArray(body.score_weights)) {
          patch.score_weights = body.score_weights;
        }

        if (Object.keys(patch).length === 0) return json(400, { error: "No settings to update" });

        const { data, error } = await sb.from("academy_classrooms").update(patch).eq("id", classroomId).eq("academy_id", academyId)
          .select("id, academy_id, name, description, is_active, score_weights, metadata, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to update classroom settings", detail: error.message });
        return json(200, { classroom: data });
      }

      if (actionBody === "export_gradebook") {
        const classroomId = normalizeText(body?.classroom_id, 64);
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

        const [assignmentsResult, submissionsResult, membersResult] = await Promise.all([
          sb.from("academy_assignments").select("id, title, assignment_type, due_at, max_score, position").eq("academy_id", academyId).eq("classroom_id", classroomId).neq("status", "archived").order("position").limit(200),
          sb.from("academy_submissions").select("assignment_id, contact_id, score, max_score, status, submitted_at").eq("academy_id", academyId).eq("classroom_id", classroomId).limit(5000),
          sb.from("academy_classroom_memberships").select("contact_id, academy_contacts!academy_memberships_contact_tenant_fk(id, first_name, last_name, email)").eq("academy_id", academyId).eq("classroom_id", classroomId).in("role", ["student"]).limit(500),
        ]);

        const assignments = (assignmentsResult.data ?? []) as Array<Record<string, unknown>>;
        const subMap = new Map<string, Record<string, unknown>>();
        for (const s of (submissionsResult.data ?? []) as Array<Record<string, unknown>>) {
          subMap.set(`${s.assignment_id}__${s.contact_id}`, s);
        }

        const headers = ["First Name", "Last Name", "Email", ...assignments.map((a) => String(a.title ?? ""))];
        const csvRows = [headers.join(",")];

        for (const m of (membersResult.data ?? []) as Array<Record<string, unknown>>) {
          const c = (m.academy_contacts as Record<string, unknown>) ?? {};
          const contactId = String(c.id ?? "");
          const row = [
            `"${String(c.first_name ?? "")}"`,
            `"${String(c.last_name ?? "")}"`,
            `"${String(c.email ?? "")}"`,
            ...assignments.map((a) => {
              const sub = subMap.get(`${a.id}__${contactId}`);
              return sub?.score !== null && sub?.score !== undefined ? String(sub.score) : "";
            }),
          ];
          csvRows.push(row.join(","));
        }

        return new Response(csvRows.join("\n"), {
          status: 200,
          headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="gradebook.csv"`, ...corsHeaders },
        });
      }

      if (actionBody === "upsert_schedule") {
        const classroomId = normalizeText(body?.classroom_id, 64);
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
        const dayOfWeek = toIntOrNull(body?.day_of_week);
        if (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6) return json(400, { error: "day_of_week 0–6 is required" });
        const startTime = normalizeText(body?.start_time, 10);
        if (!startTime) return json(400, { error: "start_time is required (HH:MM)" });
        const scheduleId = normalizeText(body?.id, 64);
        const payload = {
          academy_id: academyId,
          classroom_id: classroomId,
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: normalizeText(body?.end_time, 10) || null,
          timezone: normalizeText(body?.timezone, 60) || "Asia/Tashkent",
          label: normalizeText(body?.label, 120) || null,
          is_active: body?.is_active !== false,
          created_by: userId,
        };
        if (scheduleId) {
          const { data: existingSchedule, error: existingScheduleError } = await sb
            .from("academy_classroom_schedules")
            .select("id, classroom_id")
            .eq("id", scheduleId)
            .eq("academy_id", academyId)
            .maybeSingle();
          if (existingScheduleError) return json(500, { error: "Failed to load schedule slot", detail: existingScheduleError.message });
          if (!existingSchedule?.id) return json(404, { error: "Schedule slot not found" });
          if (!accessCanUseClassroom(access, existingSchedule.classroom_id)) return json(403, { error: "Forbidden" });

          const { data, error } = await sb.from("academy_classroom_schedules").update(payload).eq("id", scheduleId).eq("academy_id", academyId)
            .select("id, classroom_id, day_of_week, start_time, end_time, timezone, label, is_active").maybeSingle();
          if (error) return json(500, { error: "Failed to update schedule", detail: error.message });
          if (!data?.id) return json(404, { error: "Schedule slot not found" });
          return json(200, { schedule: data });
        }
        const { data, error } = await sb.from("academy_classroom_schedules").insert(payload)
          .select("id, classroom_id, day_of_week, start_time, end_time, timezone, label, is_active").maybeSingle();
        if (error) return json(500, { error: "Failed to create schedule slot", detail: error.message });
        return json(200, { schedule: data });
      }

      if (actionBody === "delete_schedule") {
        const scheduleId = normalizeText(body?.id, 64);
        if (!scheduleId) return json(400, { error: "id is required" });
        const { data: scheduleRow, error: scheduleLoadError } = await sb.from("academy_classroom_schedules")
          .select("id, classroom_id")
          .eq("id", scheduleId)
          .eq("academy_id", academyId)
          .maybeSingle();
        if (scheduleLoadError) return json(500, { error: "Failed to load schedule slot", detail: scheduleLoadError.message });
        if (!scheduleRow?.id) return json(404, { error: "Schedule slot not found" });
        if (!accessCanUseClassroom(access, scheduleRow.classroom_id)) return json(403, { error: "Forbidden" });
        const { error } = await sb.from("academy_classroom_schedules").delete().eq("id", scheduleId).eq("academy_id", academyId);
        if (error) return json(500, { error: "Failed to delete schedule slot", detail: error.message });
        return json(200, { ok: true });
      }

      if (actionBody === "record_placement") {
        const contactId = normalizeText(body?.contact_id, 64);
        if (!contactId) return json(400, { error: "contact_id is required" });
        await ensureContactInAccessScope(sb, academyId, access, contactId);
        const score = typeof body?.diagnostic_score === "number" ? body.diagnostic_score
          : typeof body?.score === "number" ? body.score : null;
        const manualLevel = normalizeText(body?.level, 20).toUpperCase() || null;

        const { data: contactRow } = await sb.from("academy_contacts").select("id").eq("academy_id", academyId).eq("id", contactId).maybeSingle();
        if (!contactRow?.id) return json(404, { error: "Contact not found" });

        // CEFR placement bands (0–100). Manual level overrides.
        const level = manualLevel ?? (score !== null ? placementBand(score) : null);
        if (!level) return json(400, { error: "score or level is required" });

        const { error: updErr } = await sb.from("academy_contacts")
          .update({ placement_level: level, placement_score: score })
          .eq("academy_id", academyId).eq("id", contactId);
        if (updErr) return json(500, { error: "Failed to record placement", detail: updErr.message });

        // Suggest classrooms tagged with this level in metadata.level
        const scopedClassroomIds = academyAccessClassroomIds(access);
        let classroomQuery = sb.from("academy_classrooms")
          .select("id, name, metadata, is_active").eq("academy_id", academyId).eq("is_active", true).limit(500);
        if (scopedClassroomIds !== null) {
          if (scopedClassroomIds.length === 0) return json(200, { contact_id: contactId, level, score, suggested_classrooms: [] });
          classroomQuery = classroomQuery.in("id", scopedClassroomIds);
        }
        const { data: classroomRows } = await classroomQuery;
        const suggested = ((classroomRows ?? []) as Array<Record<string, unknown>>)
          .filter((c) => String((toJsonObject(c.metadata).level) ?? "").toUpperCase() === level)
          .map((c) => ({ id: String(c.id), name: String(c.name ?? "") }));

        return json(200, { contact_id: contactId, level, score, suggested_classrooms: suggested });
      }

      if (actionBody === "issue_academy_certificate") {
        const contactId = normalizeText(body?.contact_id, 64);
        const classroomId = normalizeText(body?.classroom_id, 64);
        const examType = normalizeText(body?.exam_type, 40).toLowerCase() || "academy";

        if (!contactId) return json(400, { error: "contact_id is required" });
        await ensureContactInAccessScope(sb, academyId, access, contactId);
        if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

        const { data: contact } = await sb.from("academy_contacts")
          .select("id, user_id, first_name, last_name, email").eq("id", contactId).eq("academy_id", academyId).maybeSingle();
        if (!contact?.id) return json(404, { error: "Contact not found" });

        const targetUserId = contact.user_id ? String(contact.user_id) : null;
        if (!targetUserId) return json(400, { error: "Student has no linked user account yet" });

        const { data: academyRow } = await sb.from("tenants").select("name, metadata").eq("id", academyId).maybeSingle();
        const centerName = normalizeText(body?.center_name, 120) || String(academyRow?.name ?? "");
        const centerLogoUrl = (academyRow?.metadata as any)?.logo_url ?? null;
        const candidateName = normalizeText(body?.candidate_name, 120) ||
          `${String(contact.first_name ?? "")} ${String(contact.last_name ?? "")}`.trim() ||
          String(contact.email ?? "Student");

        let compositeScore: number | null = typeof body?.overall_score === "number" ? body.overall_score : null;
        if (!compositeScore && classroomId) {
          const [asgnRes, subRes] = await Promise.all([
            sb.from("academy_assignments").select("id, max_score, score_weight").eq("academy_id", academyId).eq("classroom_id", classroomId).neq("status", "archived").limit(200),
            sb.from("academy_submissions").select("assignment_id, score, max_score").eq("academy_id", academyId).eq("contact_id", contactId).eq("classroom_id", classroomId).limit(500),
          ]);
          const subMap = new Map((asgnRes.data ?? []).map((a: any) => [a.id, a]));
          let totalScore = 0, totalWeight = 0;
          for (const s of (subRes.data ?? []) as Array<any>) {
            if (typeof s.score !== "number") continue;
            const asgn = subMap.get(s.assignment_id) as any;
            if (!asgn) continue;
            const maxS = Number(s.max_score ?? asgn.max_score ?? 100);
            if (maxS <= 0) continue;
            const w = Number(asgn.score_weight ?? 1);
            totalScore += (s.score / maxS) * 100 * w;
            totalWeight += w;
          }
          if (totalWeight > 0) compositeScore = Math.round((totalScore / totalWeight) * 10) / 10;
        }

        const { data: cert, error: certErr } = await sb.from("issued_certificates").insert({
          user_id: targetUserId,
          tenant_id: academyId,
          exam_type: examType,
          overall_score: compositeScore,
          candidate_name: candidateName,
          exam_date: new Date().toISOString().slice(0, 10),
          center_name: centerName,
          center_logo_url: centerLogoUrl,
          is_public: true,
          metadata: { academy_id: academyId, contact_id: contactId, classroom_id: classroomId || null, issued_by: userId },
        }).select("id, public_token, candidate_name, overall_score, issued_at").maybeSingle();
        if (certErr) return json(500, { error: "Failed to issue certificate", detail: certErr.message });

        const siteUrl = Deno.env.get("SITE_URL") ?? "https://schood.online";
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: "certificate.issued",
          targetType: "issued_certificate",
          targetId: cert?.id ? String(cert.id) : null,
          contactId,
          classroomId: classroomId || null,
          status: "ok",
          metadata: { exam_type: examType, candidate_name: candidateName, overall_score: compositeScore },
        });
        return json(200, { certificate: cert, share_url: `${siteUrl}/certificate?token=${cert?.public_token}` });
      }

      if (actionBody === "compute_at_risk") {
        let classroomId = normalizeText(body?.classroom_id, 64) || null;
        const scopedClassroomIds = academyAccessClassroomIds(access);
        if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
        if (!classroomId && scopedClassroomIds !== null) {
          if (scopedClassroomIds.length !== 1) return json(400, { error: "classroom_id is required" });
          classroomId = scopedClassroomIds[0];
        }
        const { atRisk, scanned } = await computeAtRiskForAcademy(sb, academyId, classroomId);
        return json(200, { at_risk: atRisk, scanned });
      }

      if (actionBody === "dispatch_notifications") {
        const result = await dispatchQueuedNotifications(sb, academyId);
        return json(200, result);
      }

      if (actionBody === "generate_morning_brief") {
        const brief = await queueAcademyMorningBrief(sb, academyId);
        const dispatch = await dispatchQueuedNotifications(sb, academyId);
        return json(200, { ...brief, ...dispatch, timezone: "UTC" });
      }

      if (actionBody === "generate_parent_report") {
        const contactId = normalizeText(body?.contact_id, 64);
        const label = normalizeText(body?.label, 120) || null;
        const expiresInDays = typeof body?.expires_in_days === "number" ? Math.min(Math.max(1, body.expires_in_days), 365) : 180;

        if (!contactId) return json(400, { error: "contact_id is required" });
        await ensureContactInAccessScope(sb, academyId, access, contactId);

        const { data: contact } = await sb.from("academy_contacts").select("id, first_name, last_name").eq("id", contactId).eq("academy_id", academyId).maybeSingle();
        if (!contact?.id) return json(404, { error: "Contact not found" });

        const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();
        const { data: tokenRow, error: tokenErr } = await sb.from("parent_report_tokens")
          .insert({ academy_id: academyId, contact_id: contactId, created_by: userId, label, expires_at: expiresAt })
          .select("id, token, label, expires_at").maybeSingle();
        if (tokenErr) return json(500, { error: "Failed to generate report link", detail: tokenErr.message });

        const siteUrl = Deno.env.get("SITE_URL") ?? "https://schood.online";
        await logAcademyAuditEvent(sb, {
          academyId,
          actorUserId: userId,
          actorRole: access.role,
          action: "parent_report.generated",
          targetType: "parent_report_token",
          targetId: tokenRow?.id ? String(tokenRow.id) : null,
          contactId,
          status: "ok",
          metadata: { label, expires_at: tokenRow?.expires_at ?? expiresAt },
        });
        return json(200, {
          token: tokenRow,
          share_url: `${siteUrl}/parent-report?token=${tokenRow?.token}`,
          contact: { id: contact.id, name: `${contact.first_name} ${contact.last_name}`.trim() },
        });
      }

      if (actionBody === "upsert_branding") {
        const payload: Record<string, unknown> = { academy_id: academyId, updated_at: new Date().toISOString() };
        const fields = ["display_name", "tagline", "logo_url", "favicon_url", "primary_color", "accent_color", "hide_schood_logo", "custom_domain", "footer_text"];
        for (const field of fields) {
          if (body && Object.prototype.hasOwnProperty.call(body, field)) {
            payload[field] = field === "hide_schood_logo" ? Boolean(body[field]) : normalizeText(body[field], field.includes("url") ? 500 : 300) || null;
          }
        }
        const { data, error } = await sb.from("academy_branding")
          .upsert(payload, { onConflict: "academy_id" })
          .select("id, academy_id, display_name, tagline, logo_url, primary_color, accent_color, hide_schood_logo, custom_domain, footer_text, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to save branding", detail: error.message });
        return json(200, { branding: data });
      }

      return json(400, { error: "Unknown action" });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    if(err instanceof GuardianPortalError)return json(err.status,{error:err.message,retryable:err.retryable});
    if(err instanceof LearnerInvitationError)return json(err.status,{error:err.message,retryable:err.retryable});
    if(err instanceof LegacyImportCommandError)return json(err.status,{error:err.message,retryable:err.retryable});
    if(err instanceof LegacyStaffImportError)return json(err.status,{error:err.message,retryable:err.retryable});
    if(err instanceof StaffInvitationError)return json(err.status,{error:err.message,retryable:err.retryable});
    if(err instanceof StaffAccessError)return json(err.status,{error:err.message,retryable:err.retryable});
    if(err instanceof StudentImportServiceError)return json(err.status,{error:err.message,retryable:err.retryable});
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized"
      ? 401
      : message === "Forbidden" || message.startsWith("No enrollment") || message.startsWith("No active enrollment")
      ? 403
      : message.endsWith("is required") || message.startsWith("Invalid ") || message.startsWith("Step ") ||
          message.startsWith("A timetable generation window")
      ? 400
      : 500;
    return json(status, { error: message });
  }

};

export const academyHandler = handleAcademyRequest;

if (import.meta.main) {
  serve(handleAcademyRequest);
}
