/**
 * Container Entities
 * 
 * Hierarchical organization of content WITHOUT behavior enforcement.
 * Containers define structure (what goes where) not rules (how it behaves).
 * 
 * Hierarchy: Product → Experience → Section → Part → ContentUnit
 * 
 * @invariant Containers are purely descriptive
 * @invariant No timers, navigation locks, or scoring
 * @invariant Same structure can behave differently under different rules
 */

// ============================================================================
// Base Container Interface
// ============================================================================

/**
 * Base Container - common properties for all structural elements.
 * All containers are ordered and nameable.
 */
export interface Container {
    /** Unique identifier */
    readonly id: string;

    /** Human-readable name */
    readonly name: string;

    /** Sort order within parent (0-indexed) */
    readonly order: number;

    /**
     * Extension point for container-specific display data.
     * 
     * USE FOR: Icons, descriptions, estimated duration, difficulty
     * DO NOT USE FOR: Rules, scores, user progress
     */
    readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Experience - Top-Level Container
// ============================================================================

/**
 * Experience - a complete user journey through structured content.
 * 
 * Examples:
 * - "IELTS Academic Full Test"
 * - "SAT Math Practice Set 1"
 * - "Typing Speed Challenge"
 * 
 * @example
 * ```typescript
 * const ieltsFullTest: Experience = {
 *   id: 'exp_ielts_full_1',
 *   productId: 'prod_ielts_academic',
 *   name: 'IELTS Academic Full Test 1',
 *   order: 0,
 *   sectionIds: ['sec_listening', 'sec_reading', 'sec_writing'],
 * };
 * ```
 */
export interface Experience extends Container {
    /** Parent product this experience belongs to */
    readonly productId: string;

    /** Ordered list of section IDs */
    readonly sectionIds: readonly string[];
}

// ============================================================================
// Section - Major Division
// ============================================================================

/**
 * Section - a major division within an experience.
 * 
 * Examples:
 * - "Listening" section in IELTS
 * - "Algebra" section in Math SAT
 * - "Easy" difficulty section
 */
export interface Section extends Container {
    /** Parent experience this section belongs to */
    readonly experienceId: string;

    /** Ordered list of part IDs */
    readonly partIds: readonly string[];
}

// ============================================================================
// Part - Sub-Section
// ============================================================================

/**
 * Part - a sub-division containing actual content.
 * 
 * Examples:
 * - "Part 1" in IELTS Listening
 * - "Passage A" in IELTS Reading
 * - "Word Problems" in Math SAT
 */
export interface Part extends Container {
    /** Parent section this part belongs to */
    readonly sectionId: string;

    /** Ordered list of content unit IDs */
    readonly contentUnitIds: readonly string[];
}

// ============================================================================
// Input Types
// ============================================================================

/** Input for creating a new experience */
export type CreateExperienceInput = Omit<Experience, 'id'>;

/** Input for creating a new section */
export type CreateSectionInput = Omit<Section, 'id'>;

/** Input for creating a new part */
export type CreatePartInput = Omit<Part, 'id'>;
