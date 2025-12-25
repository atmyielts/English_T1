/**
 * Entitlement Entity
 * 
 * Represents a FACT about access: "User X may access Product Y until Date Z"
 * 
 * @invariant Entitlements are facts, not logic
 * @invariant No payment/Stripe/pricing information here
 * @invariant Entitlements can be granted manually, by purchase, or by system
 */

/** Source of how entitlement was granted */
export type EntitlementSource = 'manual' | 'purchase' | 'trial' | 'gift' | 'system';

/**
 * Entitlement - the "CAN" of the system.
 * 
 * This answers: "Does user X have permission to access product Y right now?"
 * 
 * @example
 * ```typescript
 * // User has IELTS access for 30 days
 * const entitlement: Entitlement = {
 *   id: 'ent_123',
 *   userId: 'user_456',
 *   productId: 'prod_ielts_academic',
 *   validFrom: new Date('2024-01-01'),
 *   validUntil: new Date('2024-01-31'),
 *   source: 'purchase',
 *   grantedAt: new Date('2024-01-01'),
 * };
 * ```
 */
export interface Entitlement {
    /** Unique entitlement identifier */
    readonly id: string;

    /** User who has this entitlement */
    readonly userId: string;

    /** Product the entitlement grants access to */
    readonly productId: string;

    /** When access becomes valid */
    readonly validFrom: Date;

    /** When access expires (null = perpetual/lifetime) */
    readonly validUntil: Date | null;

    /** How this entitlement was granted */
    readonly source: EntitlementSource;

    /** When the entitlement was created */
    readonly grantedAt: Date;

    /** Optional: Who/what granted this (admin ID, system ID, etc.) */
    readonly grantedBy?: string;

    /** Whether entitlement has been explicitly revoked */
    readonly revoked?: boolean;

    /** When entitlement was revoked (if applicable) */
    readonly revokedAt?: Date;

    /**
     * Extension point for entitlement-specific data.
     * 
     * USE FOR: Transaction reference, promo code used, custom limits
     * DO NOT USE FOR: Pricing details, payment method info
     */
    readonly metadata?: Record<string, unknown>;
}

/** Input for granting a new entitlement */
export type GrantEntitlementInput = Omit<Entitlement, 'id' | 'grantedAt' | 'revoked' | 'revokedAt'>;
