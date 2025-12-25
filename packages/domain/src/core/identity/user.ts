/**
 * User Entity
 * 
 * Represents a single source of truth for "who exists" in the system.
 * This entity is completely product-agnostic - it knows nothing about
 * what the user studies, buys, or has access to.
 * 
 * @invariant Users are identified by auth-provider-issued UUIDs
 * @invariant User data is minimal - extended profiles belong elsewhere
 */

/**
 * Core user identity - the "WHO" of the system.
 * 
 * @example
 * ```typescript
 * const user: User = {
 *   id: '123e4567-e89b-12d3-a456-426614174000',
 *   email: 'student@example.com',
 *   createdAt: new Date('2024-01-15'),
 * };
 * ```
 */
export interface User {
    /** UUID from auth provider (Supabase Auth, etc.) */
    readonly id: string;

    /** Primary email address */
    readonly email: string;

    /** Account creation timestamp */
    readonly createdAt: Date;

    /**
     * Extension point for non-domain-specific data.
     * 
     * USE FOR: Display name, avatar URL, locale preferences
     * DO NOT USE FOR: Product progress, scores, entitlements
     */
    readonly metadata?: Record<string, unknown>;
}

/**
 * Minimal input required to create a new user reference.
 */
export type CreateUserInput = Pick<User, 'id' | 'email'>;
