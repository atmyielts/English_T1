/**
 * Session Entity
 * 
 * Represents "a user interacting with structured content over time."
 * Sessions track lifecycle only - no scoring, no answers, no rules.
 * 
 * @invariant Sessions are lifecycle containers
 * @invariant No scoring logic here
 * @invariant No response storage here
 */

/** Session lifecycle states */
export type SessionStatus =
    | 'created'    // Session exists but not started
    | 'active'     // User is actively working
    | 'paused'     // User paused the session
    | 'completed'  // User finished normally
    | 'abandoned'  // User left without completing
    | 'expired';   // Time ran out (if rules enforce it)

/**
 * Session - interaction over time.
 * 
 * @example
 * ```typescript
 * const session: Session = {
 *   id: 'sess_123',
 *   userId: 'user_456',
 *   experienceId: 'exp_ielts_full_1',
 *   status: 'active',
 *   createdAt: new Date('2024-01-15T10:00:00'),
 *   startedAt: new Date('2024-01-15T10:01:00'),
 * };
 * ```
 */
export interface Session {
    /** Unique session identifier */
    readonly id: string;

    /** User who owns this session */
    readonly userId: string;

    /** Experience being attempted */
    readonly experienceId: string;

    /** Current lifecycle status */
    readonly status: SessionStatus;

    /** When session record was created */
    readonly createdAt: Date;

    /** When user actually started (first interaction) */
    readonly startedAt: Date | null;

    /** When session was last paused */
    readonly pausedAt: Date | null;

    /** When session was resumed from pause */
    readonly resumedAt: Date | null;

    /** When session was completed/abandoned/expired */
    readonly endedAt: Date | null;

    /**
     * Extension point for session-specific tracking.
     * 
     * USE FOR: Current position, time spent, browser info
     * DO NOT USE FOR: Scores, answers, evaluation results
     */
    readonly metadata?: Record<string, unknown>;
}

/** Input for creating a new session */
export type CreateSessionInput = Pick<Session, 'userId' | 'experienceId'>;

/** Allowed status transitions for validation */
export const SESSION_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
    created: ['active', 'abandoned'],
    active: ['paused', 'completed', 'abandoned', 'expired'],
    paused: ['active', 'abandoned', 'expired'],
    completed: [],
    abandoned: [],
    expired: [],
} as const;
