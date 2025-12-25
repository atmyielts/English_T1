/**
 * Content Unit Entity
 * 
 * Represents atomic, reusable, context-free content.
 * Content doesn't know who sees it, where it appears, or how it's used.
 * 
 * @invariant Content is static and reusable
 * @invariant Same content can appear in multiple products/experiences
 * @invariant No timing, scoring, or progress tracking here
 */

// ============================================================================
// Content Types - What kind of content this is
// ============================================================================

/** Classification of content unit */
export type ContentType = 'text' | 'audio' | 'image' | 'video' | 'prompt' | 'instruction';

// ============================================================================
// Content Payloads - Type-safe data structures for each content type
// ============================================================================

/** Text content with optional formatting */
export interface TextPayload {
    readonly text: string;
    readonly format?: 'plain' | 'markdown' | 'html';
}

/** Audio content with URL and optional metadata */
export interface AudioPayload {
    readonly url: string;
    readonly duration?: number;  // seconds
    readonly transcript?: string;
}

/** Image content with URL and accessibility info */
export interface ImagePayload {
    readonly url: string;
    readonly alt?: string;
    readonly width?: number;
    readonly height?: number;
}

/** Video content with URL and metadata */
export interface VideoPayload {
    readonly url: string;
    readonly duration?: number;  // seconds
    readonly poster?: string;    // thumbnail URL
}

/** Prompt/question content for user input */
export interface PromptPayload {
    readonly prompt: string;
    readonly inputType?: 'text' | 'selection' | 'multiselect' | 'audio' | 'file';
    readonly options?: readonly PromptOption[];  // for selection types
}

/** Option for selection-type prompts */
export interface PromptOption {
    readonly id: string;
    readonly label: string;
    readonly value?: unknown;
}

/** Instruction/direction content */
export interface InstructionPayload {
    readonly instruction: string;
    readonly format?: 'plain' | 'markdown';
}

/** Union type for type-safe content payloads */
export type ContentPayload =
    | TextPayload
    | AudioPayload
    | ImagePayload
    | VideoPayload
    | PromptPayload
    | InstructionPayload;

// ============================================================================
// Content Unit Entity
// ============================================================================

/**
 * ContentUnit - atomic piece of content.
 * 
 * @example
 * ```typescript
 * // A reading passage
 * const passage: ContentUnit<'text'> = {
 *   id: 'content_passage_1',
 *   type: 'text',
 *   data: { text: 'The quick brown fox...', format: 'plain' },
 *   createdAt: new Date(),
 * };
 * 
 * // A listening audio
 * const audio: ContentUnit<'audio'> = {
 *   id: 'content_audio_1',
 *   type: 'audio',
 *   data: { url: '/audio/listening-1.mp3', duration: 180 },
 *   createdAt: new Date(),
 * };
 * ```
 */
export interface ContentUnit<T extends ContentType = ContentType> {
    /** Unique content identifier */
    readonly id: string;

    /** Type of content */
    readonly type: T;

    /** Type-specific content data */
    readonly data: T extends 'text' ? TextPayload
    : T extends 'audio' ? AudioPayload
    : T extends 'image' ? ImagePayload
    : T extends 'video' ? VideoPayload
    : T extends 'prompt' ? PromptPayload
    : T extends 'instruction' ? InstructionPayload
    : ContentPayload;

    /** Creation timestamp */
    readonly createdAt: Date;

    /**
     * Extension point for content-specific metadata.
     * 
     * USE FOR: Tags, categories, difficulty level, source attribution
     * DO NOT USE FOR: Answers, scores, user progress
     */
    readonly metadata?: Record<string, unknown>;
}

/** Input for creating new content */
export type CreateContentInput<T extends ContentType = ContentType> =
    Omit<ContentUnit<T>, 'id' | 'createdAt'>;
