import type { ProgressRecord, ProgressTargetType, RecordProgressInput } from './progress.js';

/**
 * Progress Repository Interface
 * 
 * Persistence operations for progress records.
 */
export interface ProgressRepository {
    /** Record a new progress event */
    record(input: RecordProgressInput): Promise<ProgressRecord>;

    /** Find all progress for a user */
    findByUser(userId: string): Promise<ProgressRecord[]>;

    /** Find progress for a specific target */
    findByTarget(targetType: ProgressTargetType, targetId: string): Promise<ProgressRecord[]>;

    /** Find progress for user + target combination */
    findByUserAndTarget(userId: string, targetType: ProgressTargetType, targetId: string): Promise<ProgressRecord[]>;

    /** Check if user has completed a target */
    hasCompleted(userId: string, targetType: ProgressTargetType, targetId: string): Promise<boolean>;

    /** Check if user has started a target */
    hasStarted(userId: string, targetType: ProgressTargetType, targetId: string): Promise<boolean>;

    /** Get latest progress record for user + target */
    getLatest(userId: string, targetType: ProgressTargetType, targetId: string): Promise<ProgressRecord | null>;
}

/**
 * Progress Service Interface
 * 
 * Business operations for progress tracking.
 */
export interface ProgressService {
    /** Record that user started something */
    recordStart(userId: string, targetType: ProgressTargetType, targetId: string, sessionId?: string): Promise<ProgressRecord>;

    /** Record that user attempted something */
    recordAttempt(userId: string, targetType: ProgressTargetType, targetId: string, sessionId?: string): Promise<ProgressRecord>;

    /** Record that user completed something */
    recordCompletion(userId: string, targetType: ProgressTargetType, targetId: string, sessionId?: string): Promise<ProgressRecord>;

    /** Get user's progress summary for an experience */
    getSummary(userId: string, experienceId: string): Promise<{
        started: string[];
        completed: string[];
        inProgress: string[];
    }>;
}
