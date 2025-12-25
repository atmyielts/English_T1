import type { Entitlement, GrantEntitlementInput } from './entitlement.js';

/**
 * Entitlement Service Interface
 * 
 * Business operations for checking and managing access.
 * This is where access logic lives, but it's still fact-based.
 */
export interface EntitlementService {
    /**
     * Check if user currently has access to a product.
     * Considers validity dates and revocation status.
     */
    canAccess(userId: string, productId: string): Promise<boolean>;

    /**
     * Get all active (non-expired, non-revoked) entitlements for a user.
     */
    getActiveEntitlements(userId: string): Promise<Entitlement[]>;

    /**
     * Get all entitlements for a user (including expired/revoked).
     */
    getAllEntitlements(userId: string): Promise<Entitlement[]>;

    /**
     * Grant access to a user for a product.
     */
    grant(input: GrantEntitlementInput): Promise<Entitlement>;

    /**
     * Revoke an existing entitlement.
     * Does not delete - marks as revoked for audit trail.
     */
    revoke(entitlementId: string, revokedBy?: string): Promise<Entitlement>;
}

/**
 * Entitlement Repository Interface
 * 
 * Persistence operations for entitlement records.
 */
export interface EntitlementRepository {
    findById(id: string): Promise<Entitlement | null>;
    findByUser(userId: string): Promise<Entitlement[]>;
    findByProduct(productId: string): Promise<Entitlement[]>;
    findByUserAndProduct(userId: string, productId: string): Promise<Entitlement[]>;
    save(input: GrantEntitlementInput): Promise<Entitlement>;
    update(id: string, updates: Partial<Pick<Entitlement, 'revoked' | 'revokedAt'>>): Promise<Entitlement>;
}
