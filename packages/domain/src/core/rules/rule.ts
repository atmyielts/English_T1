/**
 * Rule Entity
 * 
 * Rules control behavior through data, not code.
 * Same engine can behave differently under different rules.
 * 
 * @invariant Rules are pure configuration
 * @invariant No user data stored here
 * @invariant No domain-specific meaning enforced here
 */

// ============================================================================
// Rule Categories
// ============================================================================

/** Classification of rule purpose */
export type RuleCategory = 'timing' | 'navigation' | 'submission' | 'display' | 'retry';

// ============================================================================
// Rule Configurations - Type-safe config structures
// ============================================================================

/** Timing-related rules */
export interface TimingRuleConfig {
    /** Total duration in seconds */
    readonly durationSeconds: number;
    /** Auto-submit when time expires? */
    readonly autoSubmitOnExpire?: boolean;
    /** Warning thresholds (seconds remaining) */
    readonly warningThresholds?: readonly number[];
    /** Allow pausing? */
    readonly allowPause?: boolean;
    /** Per-item time limits */
    readonly perItemSeconds?: number;
}

/** Navigation-related rules */
export interface NavigationRuleConfig {
    /** Allow going back to previous items? */
    readonly allowBack?: boolean;
    /** Allow skipping items? */
    readonly allowSkip?: boolean;
    /** Force sequential navigation? */
    readonly sequentialOnly?: boolean;
    /** Allow review at end? */
    readonly allowReview?: boolean;
    /** Show progress indicator? */
    readonly showProgress?: boolean;
}

/** Submission-related rules */
export interface SubmissionRuleConfig {
    /** Allow editing after submission? */
    readonly allowEdit?: boolean;
    /** Require all items answered? */
    readonly requireAllItems?: boolean;
    /** Confirm before final submission? */
    readonly confirmSubmission?: boolean;
    /** Auto-save interval (seconds) */
    readonly autoSaveSeconds?: number;
}

/** Display-related rules */
export interface DisplayRuleConfig {
    /** Show correct answers after? */
    readonly showCorrectAnswers?: boolean;
    /** Show score immediately? */
    readonly showImmediateScore?: boolean;
    /** Display mode */
    readonly displayMode?: 'single' | 'all' | 'section';
}

/** Retry-related rules */
export interface RetryRuleConfig {
    /** Maximum attempts allowed */
    readonly maxAttempts?: number;
    /** Cooldown between attempts (seconds) */
    readonly cooldownSeconds?: number;
    /** Reset on retry? */
    readonly resetOnRetry?: boolean;
}

/** Union type for type-safe rule configs */
export type RuleConfig =
    | TimingRuleConfig
    | NavigationRuleConfig
    | SubmissionRuleConfig
    | DisplayRuleConfig
    | RetryRuleConfig;

// ============================================================================
// Rule Entity
// ============================================================================

/**
 * Rule - behavioral configuration.
 * 
 * @example
 * ```typescript
 * // IELTS Listening timing rule
 * const listeningTiming: Rule<'timing'> = {
 *   id: 'rule_ielts_listening_time',
 *   category: 'timing',
 *   name: 'IELTS Listening Time',
 *   config: {
 *     durationSeconds: 2400, // 40 minutes
 *     autoSubmitOnExpire: true,
 *     warningThresholds: [300, 60],
 *     allowPause: false,
 *   },
 * };
 * ```
 */
export interface Rule<C extends RuleCategory = RuleCategory> {
    /** Unique rule identifier */
    readonly id: string;

    /** Rule classification */
    readonly category: C;

    /** Human-readable rule name */
    readonly name: string;

    /** Type-specific configuration */
    readonly config: C extends 'timing' ? TimingRuleConfig
    : C extends 'navigation' ? NavigationRuleConfig
    : C extends 'submission' ? SubmissionRuleConfig
    : C extends 'display' ? DisplayRuleConfig
    : C extends 'retry' ? RetryRuleConfig
    : RuleConfig;

    /** Optional description */
    readonly description?: string;
}

/** Input for creating a new rule */
export type CreateRuleInput<C extends RuleCategory = RuleCategory> = Omit<Rule<C>, 'id'>;
