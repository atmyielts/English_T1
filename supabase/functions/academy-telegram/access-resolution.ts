import {
  academyRoleRank,
  type MembershipRow,
  normalizeAcademyRole,
} from "../academy/access.ts";

const ACADEMY_MANAGEMENT_ROLES = new Set([
  "owner",
  "admin",
  "center_admin",
  "branch_manager",
  "manager",
  "counselor",
  "receptionist",
  "salesperson",
  "cashier",
  "accountant",
  "payroll_officer",
  "parent_liaison",
  "teacher",
  "assistant",
]);

const uniqueIds = (values: unknown): string[] =>
  Array.isArray(values)
    ? Array.from(
      new Set(
        values.map((value) => String(value ?? "").trim()).filter(Boolean),
      ),
    )
    : [];

const sourcePriority = (access: MembershipRow): number => {
  const role = normalizeAcademyRole(access.role);
  // Tenant ownership and center ownership are authoritative. For ordinary staff,
  // the dedicated Academy grant is the administrator-managed source of truth.
  if (access.source === "tenant" && ["owner", "admin"].includes(role)) {
    return 50;
  }
  if (access.source === "center") return 40;
  if (access.source === "grant") return 30;
  if (access.source === "staff") return 20;
  return 10;
};

const preferAccess = (
  left: MembershipRow,
  right: MembershipRow,
): MembershipRow => {
  const priorityDifference = sourcePriority(right) - sourcePriority(left);
  if (priorityDifference !== 0) return priorityDifference > 0 ? right : left;
  return academyRoleRank(right.role) > academyRoleRank(left.role)
    ? right
    : left;
};

export const isAcademyManagementRole = (roleRaw: unknown): boolean =>
  ACADEMY_MANAGEMENT_ROLES.has(normalizeAcademyRole(roleRaw));

export const isExplicitAcademyTenant = (
  tenant: Record<string, unknown> | null,
): boolean => {
  const metadata = tenant?.metadata && typeof tenant.metadata === "object" &&
      !Array.isArray(tenant.metadata)
    ? tenant.metadata as Record<string, unknown>
    : {};
  return String(metadata.service_family ?? "").trim().toLowerCase() ===
      "academy" ||
    metadata.academy_service === true || metadata.center_owned === true;
};

export const resolveAcademyManagementAccess = (
  rows: MembershipRow[],
): MembershipRow[] => {
  const grouped = new Map<string, MembershipRow[]>();
  for (const row of rows) {
    const tenantId = String(row.tenant_id ?? "").trim();
    if (!tenantId || !isAcademyManagementRole(row.role)) continue;
    const normalized: MembershipRow = {
      ...row,
      tenant_id: tenantId,
      role: normalizeAcademyRole(row.role),
      classroom_ids: uniqueIds(row.classroom_ids),
      branch_ids: uniqueIds(row.branch_ids),
    };
    grouped.set(tenantId, [...(grouped.get(tenantId) ?? []), normalized]);
  }

  const resolved: MembershipRow[] = [];
  for (const candidates of grouped.values()) {
    const winner = candidates.reduce(preferAccess);
    // Combine assignments only when both records grant the same effective role.
    // A stale lower-priority role must not widen the winner's operational scope.
    const matchingRole = candidates.filter((candidate) =>
      candidate.role === winner.role
    );
    resolved.push({
      ...winner,
      classroom_ids: uniqueIds(
        matchingRole.flatMap((candidate) => candidate.classroom_ids ?? []),
      ),
      branch_ids: uniqueIds(
        matchingRole.flatMap((candidate) => candidate.branch_ids ?? []),
      ),
      center_tenant_id: winner.center_tenant_id ??
        matchingRole.find((candidate) => candidate.center_tenant_id)
          ?.center_tenant_id ??
        null,
    });
  }

  return resolved.sort((left, right) =>
    left.tenant_id.localeCompare(right.tenant_id)
  );
};
