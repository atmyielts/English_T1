import type { ContentUnit, ContentType, CreateContentInput } from './content-unit.js';

/**
 * Content Repository Interface
 * 
 * Persistence operations for content units.
 * Content is typically created by admins and queried by the system.
 */
export interface ContentRepository {
    /** Find a single content unit by ID */
    findById(id: string): Promise<ContentUnit | null>;

    /** Find multiple content units by their IDs (batch operation) */
    findByIds(ids: string[]): Promise<ContentUnit[]>;

    /** Find all content units of a specific type */
    findByType(type: ContentType): Promise<ContentUnit[]>;

    /** Create a new content unit */
    create<T extends ContentType>(input: CreateContentInput<T>): Promise<ContentUnit<T>>;

    /** Check if content exists */
    exists(id: string): Promise<boolean>;
}
