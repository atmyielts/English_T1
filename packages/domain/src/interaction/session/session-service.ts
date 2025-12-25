import type { Session, SessionStatus, CreateSessionInput } from './session.js';

/**
 * Session Service Interface
 * 
 * Business operations for session lifecycle management.
 */
export interface SessionService {
    /** Create a new session (status: created) */
    create(input: CreateSessionInput): Promise<Session>;

    /** Start the session (transition: created → active) */
    start(sessionId: string): Promise<Session>;

    /** Pause an active session (transition: active → paused) */
    pause(sessionId: string): Promise<Session>;

    /** Resume a paused session (transition: paused → active) */
    resume(sessionId: string): Promise<Session>;

    /** Complete a session normally (transition: active → completed) */
    complete(sessionId: string): Promise<Session>;

    /** Mark session as abandoned (transition: active|paused → abandoned) */
    abandon(sessionId: string): Promise<Session>;

    /** Mark session as expired (transition: active|paused → expired) */
    expire(sessionId: string): Promise<Session>;

    /** Find a session by ID */
    findById(sessionId: string): Promise<Session | null>;

    /** Find all sessions for a user */
    findByUser(userId: string, filter?: { status?: SessionStatus }): Promise<Session[]>;

    /** Find active or paused sessions for a user/experience (for resume) */
    findResumable(userId: string, experienceId: string): Promise<Session | null>;
}

/**
 * Session Repository Interface
 * 
 * Persistence operations for session records.
 */
export interface SessionRepository {
    findById(id: string): Promise<Session | null>;
    findByUser(userId: string): Promise<Session[]>;
    findByExperience(experienceId: string): Promise<Session[]>;
    findByUserAndExperience(userId: string, experienceId: string): Promise<Session[]>;
    create(input: CreateSessionInput): Promise<Session>;
    updateStatus(id: string, status: SessionStatus, timestamps: Partial<Pick<Session, 'startedAt' | 'pausedAt' | 'resumedAt' | 'endedAt'>>): Promise<Session>;
}
