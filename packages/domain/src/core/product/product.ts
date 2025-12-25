/**
 * Product Entity
 * 
 * Represents an abstract container for anything users interact with.
 * Products are generic - they could be IELTS exams, math quizzes, typing tools, etc.
 * 
 * @invariant Products contain NO content - they are pure metadata
 * @invariant Products contain NO pricing - that belongs in a payment integration
 * @invariant Products are identified, named, and classified - nothing more
 */

/** Classification of product purpose */
export type ProductType = 'exam' | 'practice' | 'tool' | 'course';

/** Lifecycle state of a product */
export type ProductStatus = 'draft' | 'active' | 'disabled' | 'archived';

/**
 * Product - the "WHAT" of the system.
 * 
 * @example
 * ```typescript
 * // An IELTS product
 * const ieltsAcademic: Product = {
 *   id: 'prod_ielts_academic',
 *   name: 'IELTS Academic',
 *   type: 'exam',
 *   status: 'active',
 * };
 * 
 * // A math practice product
 * const mathSat: Product = {
 *   id: 'prod_math_sat',
 *   name: 'SAT Mathematics',
 *   type: 'practice',
 *   status: 'active',
 * };
 * ```
 */
export interface Product {
    /** Unique product identifier (can be slug-like for readability) */
    readonly id: string;

    /** Human-readable product name */
    readonly name: string;

    /** Product classification */
    readonly type: ProductType;

    /** Current lifecycle status */
    readonly status: ProductStatus;

    /** Optional description for display purposes */
    readonly description?: string;

    /**
     * Extension point for product-specific display data.
     * 
     * USE FOR: Icons, theme colors, display order, featured flag
     * DO NOT USE FOR: Content, pricing, access rules
     */
    readonly metadata?: Record<string, unknown>;
}

/** Input for creating a new product */
export type CreateProductInput = Omit<Product, 'status'> & { status?: ProductStatus };

/** Input for updating product fields */
export type UpdateProductInput = Partial<Omit<Product, 'id'>>;
