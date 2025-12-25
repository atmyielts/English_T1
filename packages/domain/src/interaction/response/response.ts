/**
 * Response Entity
 * 
 * Stores exactly what the user submitted, without judgment.
 * Responses are immutable - once submitted, they cannot be edited.
 * 
 * @invariant Responses are raw truth - no correctness checks
 * @invariant Responses are immutable - no editing
 * @invariant Same response can be evaluated multiple times
 */

// ============================================================================
// Response Types
// ============================================================================

/** Classification of response input */
export type ResponseType = 'text' | 'selection' | 'multiselect' | 'audio' | 'file';

// ============================================================================
// Response Payloads - Type-safe data structures
// ============================================================================

/** Text input response */
export interface TextResponsePayload {
    readonly text: string;
    readonly wordCount?: number;
}

/** Single selection response */
export interface SelectionResponsePayload {
    readonly selectedOptionId: string;
}

/** Multiple selection response */
export interface MultiselectResponsePayload {
    readonly selectedOptionIds: readonly string[];
}

/** Audio recording response */
export interface AudioResponsePayload {
    readonly url: string;
    readonly duration: number;  // seconds
    readonly mimeType?: string;
}

/** File upload response */
export interface FileResponsePayload {
    readonly url: string;
    readonly filename: string;
    readonly mimeType: string;
    readonly sizeBytes?: number;
}

/** Union type for type-safe response payloads */
export type ResponsePayload =
    | TextResponsePayload
    | SelectionResponsePayload
    | MultiselectResponsePayload
    | AudioResponsePayload
    | FileResponsePayload;

// ============================================================================
// Response Entity
// ============================================================================

/**
 * Response - what the user actually submitted.
 * 
 * @example
 * ```typescript
 * // Text answer
 * const textResponse: Response<'text'> = {
 *   id: 'resp_123',
 *   sessionId: 'sess_456',
 *   contentUnitId: 'content_prompt_1',
 *   type: 'text',
 *   data: { text: 'The answer is 42.', wordCount: 4 },
 *   submittedAt: new Date(),
 * };
 * 
 * // Multiple choice answer
 * const mcResponse: Response<'selection'> = {
 *   id: 'resp_124',
 *   sessionId: 'sess_456',
 *   contentUnitId: 'content_prompt_2',
 *   type: 'selection',
 *   data: { selectedOptionId: 'option_b' },
 *   submittedAt: new Date(),
 * };
 * ```
 */
export interface Response<T extends ResponseType = ResponseType> {
    /** Unique response identifier */
    readonly id: string;

    /** Session this response belongs to */
    readonly sessionId: string;

    /** Content unit (question/prompt) being responded to */
    readonly contentUnitId: string;

    /** Type of response */
    readonly type: T;

    /** Type-specific response data */
    readonly data: T extends 'text' ? TextResponsePayload
    : T extends 'selection' ? SelectionResponsePayload
    : T extends 'multiselect' ? MultiselectResponsePayload
    : T extends 'audio' ? AudioResponsePayload
    : T extends 'file' ? FileResponsePayload
    : ResponsePayload;

    /** When response was submitted (immutable) */
    readonly submittedAt: Date;

    /**
     * Extension point for response metadata.
     * 
     * USE FOR: Time taken, attempt number, device info
     * DO NOT USE FOR: Scores, correctness, evaluations
     */
    readonly metadata?: Record<string, unknown>;
}

/** Input for creating a new response (no id, no submittedAt) */
export type CreateResponseInput<T extends ResponseType = ResponseType> =
    Omit<Response<T>, 'id' | 'submittedAt'>;
