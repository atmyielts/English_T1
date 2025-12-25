/**
 * Progress Entity
 * 
 * Facts about what happened - no interpretation or recommendations.
 * Progress tracks completion states, not learning outcomes.
 * 
 * @invariant Progress records are facts only
 * @invariant No recommendations or analytics
 * @invariant No learning theory or adaptive logic
 */

// ============================================================================
// Progress Types
// ============================================================================

/** What kind of progress this is */
export type ProgressType = 'started' | 'attempted' | 'completed' | 'scored';

/** What entity the progress is about */
export type ProgressTargetType = 'experience' | 'section' | 'part' | 'contentUnit';

// ============================================================================
// Progress Record Entity
// ============================================================================

/**
 * ProgressRecord - a fact about user activity.
 * 
 * @example
 * ```typescript
 * // User completed IELTS Listening section
 * const record: ProgressRecord = {
 *   id: 'prog_123',
 *   userId: 'user_456',
 *   targetType: 'section',
 *   targetId: 'sec_listening',
 *   progressType: 'completed',
 *   sessionId: 'sess_789',
 *   recordedAt: new Date(),
 * };
 * ```
 */
export interface ProgressRecord {
    /** Unique progress record identifier */
    readonly id: string;

    /** User this progress belongs to */
    readonly userId: string;

    /** Type of entity this progress is for */
    readonly targetType: ProgressTargetType;

    /** ID of the target entity */
    readonly targetId: string;

    /** Type of progress event */
    readonly progressType: ProgressType;

    /** When this progress was recorded */
    readonly recordedAt: Date;

    /** Optional: Session where this happened */
    readonly sessionId?: string;

    /**
     * Extension point for progress metadata.
     * 
     * USE FOR: Duration, attempt number, score achieved
     * DO NOT USE FOR: Recommendations, predictions, learning analytics
     */
    readonly metadata?: Record<string, unknown>;
}

/** Input for recording new progress */
export type RecordProgressInput = Omit<ProgressRecord, 'id' | 'recordedAt'>;
