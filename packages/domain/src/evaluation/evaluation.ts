/**
 * Evaluation Entity
 * 
 * Interpretation of responses - separate, repeatable, never modifying originals.
 * Evaluations are independent records that can be added/replaced without data loss.
 * 
 * @invariant Evaluations never modify responses
 * @invariant Multiple evaluations per response are allowed
 * @invariant Evaluations can be re-run without losing history
 */

// ============================================================================
// Evaluation Methods
// ============================================================================

/** How the evaluation was performed */
export type EvaluationMethod = 'auto' | 'ai' | 'human' | 'hybrid';

/** Current status of evaluation */
export type EvaluationStatus = 'pending' | 'processing' | 'completed' | 'failed';

// ============================================================================
// Evaluation Results - Method-specific type-safe results
// ============================================================================

/** Auto-evaluated result (objective scoring) */
export interface AutoEvaluationResult {
    readonly correct: boolean;
    readonly score?: number;
    readonly maxScore?: number;
    readonly expectedAnswer?: unknown;
}

/** AI-evaluated result (subjective/complex scoring) */
export interface AiEvaluationResult {
    readonly score: number;
    readonly maxScore: number;
    readonly breakdown?: Record<string, number>;  // dimension -> score
    readonly feedback?: string;
    readonly modelId?: string;
    readonly confidence?: number;
}

/** Human-evaluated result (expert assessment) */
export interface HumanEvaluationResult {
    readonly score: number;
    readonly maxScore: number;
    readonly breakdown?: Record<string, number>;
    readonly feedback?: string;
    readonly evaluatorId: string;
}

/** Hybrid result (combined auto + AI/human) */
export interface HybridEvaluationResult {
    readonly autoResult?: AutoEvaluationResult;
    readonly aiResult?: AiEvaluationResult;
    readonly humanResult?: HumanEvaluationResult;
    readonly finalScore: number;
    readonly maxScore: number;
}

/** Union type for type-safe evaluation results */
export type EvaluationResult =
    | AutoEvaluationResult
    | AiEvaluationResult
    | HumanEvaluationResult
    | HybridEvaluationResult;

// ============================================================================
// Evaluation Entity
// ============================================================================

/**
 * Evaluation - judgment of a response.
 * 
 * @example
 * ```typescript
 * // Auto-evaluation for multiple choice
 * const autoEval: Evaluation<'auto'> = {
 *   id: 'eval_123',
 *   responseId: 'resp_456',
 *   method: 'auto',
 *   status: 'completed',
 *   result: { correct: true, score: 1, maxScore: 1 },
 *   evaluatedAt: new Date(),
 * };
 * 
 * // AI evaluation for essay
 * const aiEval: Evaluation<'ai'> = {
 *   id: 'eval_124',
 *   responseId: 'resp_457',
 *   method: 'ai',
 *   status: 'completed',
 *   result: {
 *     score: 7,
 *     maxScore: 9,
 *     breakdown: { coherence: 7, vocabulary: 8, grammar: 6 },
 *     feedback: 'Good essay with minor grammatical issues.',
 *     modelId: 'gpt-4',
 *   },
 *   evaluatedAt: new Date(),
 * };
 * ```
 */
export interface Evaluation<M extends EvaluationMethod = EvaluationMethod> {
    /** Unique evaluation identifier */
    readonly id: string;

    /** Response being evaluated */
    readonly responseId: string;

    /** How this evaluation was performed */
    readonly method: M;

    /** Current status */
    readonly status: EvaluationStatus;

    /** Method-specific result (null if pending/failed) */
    readonly result: M extends 'auto' ? AutoEvaluationResult | null
    : M extends 'ai' ? AiEvaluationResult | null
    : M extends 'human' ? HumanEvaluationResult | null
    : M extends 'hybrid' ? HybridEvaluationResult | null
    : EvaluationResult | null;

    /** When evaluation was created */
    readonly createdAt: Date;

    /** When evaluation completed (null if pending) */
    readonly evaluatedAt: Date | null;

    /** Error message if failed */
    readonly error?: string;

    /**
     * Extension point for evaluation metadata.
     * 
     * USE FOR: Processing time, model parameters, retry count
     * DO NOT USE FOR: Original response data
     */
    readonly metadata?: Record<string, unknown>;
}

/** Input for requesting a new evaluation */
export type RequestEvaluationInput = Pick<Evaluation, 'responseId' | 'method'>;
