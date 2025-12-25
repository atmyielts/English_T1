import type { User, CreateUserInput } from './user.js';

/**
 * Identity Service Interface
 * 
 * Auth-provider-agnostic contract for identity operations.
 * Implementations live in the infrastructure layer (e.g., Supabase adapter).
 * 
 * @invariant This interface never imports from infrastructure
 * @invariant Implementations must handle provider-specific auth flows
 */
export interface IdentityService {
    /**
     * Get the currently authenticated user.
     * Returns null if no user is authenticated.
     */
    getCurrentUser(): Promise<User | null>;

    /**
     * Retrieve a user by their unique identifier.
     * Returns null if user does not exist.
     */
    getUserById(id: string): Promise<User | null>;

    /**
     * Retrieve a user by their email address.
     * Returns null if user does not exist.
     */
    getUserByEmail(email: string): Promise<User | null>;
}

/**
 * User Repository Interface
 * 
 * Persistence operations for user records.
 * Note: User creation typically happens through auth provider webhooks
 * or during first sign-in sync.
 */
export interface UserRepository {
    findById(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    save(input: CreateUserInput): Promise<User>;
    exists(id: string): Promise<boolean>;
}
