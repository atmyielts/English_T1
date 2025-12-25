import type { Response, ResponseType, CreateResponseInput } from './response.js';

/**
 * Response Repository Interface
 * 
 * Persistence operations for response records.
 * Note: Responses are immutable - no update operations.
 */
export interface ResponseRepository {
    /** Find a single response by ID */
    findById(id: string): Promise<Response | null>;

    /** Find all responses for a session */
    findBySession(sessionId: string): Promise<Response[]>;

    /** Find all responses for a specific content unit within a session */
    findBySessionAndContent(sessionId: string, contentUnitId: string): Promise<Response[]>;

    /** Save a new response (immutable, no updates) */
    save<T extends ResponseType>(input: CreateResponseInput<T>): Promise<Response<T>>;

    /** Check if user has responded to a content unit in this session */
    hasResponded(sessionId: string, contentUnitId: string): Promise<boolean>;

    /** Get response count for a session */
    countBySession(sessionId: string): Promise<number>;
}
