// Workspace roles. A personal workspace has one member, its owner. A centre
// workspace has owners and admins (the office), teachers, students and parents.
// Roles are not ordered: every feature names the roles it serves.

export const ROLES = ['owner', 'admin', 'teacher', 'student', 'parent'] as const;
export type Role = (typeof ROLES)[number];

/** People who run the workspace: seats, budgets, settings, switches. */
export const MANAGER_ROLES: readonly Role[] = ['owner', 'admin'];
/** Staff who teach and may approve material for students. */
export const STAFF_ROLES: readonly Role[] = ['owner', 'admin', 'teacher'];
/** Everyone except parents, who only see their own child's information. */
export const LEARNING_ROLES: readonly Role[] = ['owner', 'admin', 'teacher', 'student'];

export const isRole = (value: unknown): value is Role => typeof value === 'string' && (ROLES as readonly string[]).includes(value);
export const hasRole = (role: Role, allowed: readonly Role[]): boolean => allowed.includes(role);
